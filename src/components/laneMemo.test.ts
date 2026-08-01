// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createDemoPattern } from '../model/pattern'
import { NoteRow } from './NoteRow'
import { StepRow } from './StepRow'

/**
 * The lanes are where the deck's render cost lives: seven rows of sixteen
 * buttons. Rebuilding all of them because something elsewhere on the deck
 * moved is what puts a frame at risk while the transport runs, so a lane whose
 * own props are unchanged must not render at all.
 *
 * The probe reads through `lane.label`: React.memo compares the props object
 * shallowly and never looks inside `lane`, so a read can only come from the
 * component body actually running.
 */
function countingLane<T extends { label: string }>(lane: T): { lane: T; reads: () => number } {
  let reads = 0
  const probe = { ...lane }
  Object.defineProperty(probe, 'label', {
    get() {
      reads += 1
      return lane.label
    },
  })
  return { lane: probe, reads: () => reads }
}

afterEach(cleanup)

describe('lane rendering', () => {
  it('skips re-rendering a lane whose props did not change', () => {
    const pattern = createDemoPattern()
    const drum = countingLane(pattern.lanes[0])
    const note = countingLane(pattern.noteLanes[0])
    const noop = () => undefined

    function Harness({ tick }: { tick: number }): ReactElement {
      return createElement(
        'div',
        { 'data-tick': tick },
        createElement(StepRow, {
          lane: drum.lane,
          onCycleStep: noop,
          onToggleMute: noop,
          onToggleSolo: noop,
        }),
        createElement(NoteRow, {
          lane: note.lane,
          onToggleStep: noop,
          onTranspose: noop,
          onResize: noop,
        }),
      )
    }

    const { rerender } = render(createElement(Harness, { tick: 1 }))
    const drumReads = drum.reads()
    const noteReads = note.reads()
    expect(drumReads).toBeGreaterThan(0)
    expect(noteReads).toBeGreaterThan(0)

    rerender(createElement(Harness, { tick: 2 }))

    expect(drum.reads()).toBe(drumReads)
    expect(note.reads()).toBe(noteReads)
  })
})

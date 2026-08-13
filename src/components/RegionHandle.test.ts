// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SampleRegion } from '../model/sampler'
import { RegionHandle } from './RegionHandle'

afterEach(cleanup)

const SOURCE_DURATION = 8
const REGION: SampleRegion = { sourceId: 'src-1', start: 2, duration: 4 }

/** A track 400 px wide starting at x=100, so a time maps to a known pixel. */
function renderHandle(edge: 'start' | 'end' = 'start') {
  const moves: number[] = []
  const trackRef = createRef<HTMLDivElement>()
  const track = document.createElement('div')
  track.getBoundingClientRect = () =>
    ({ left: 100, width: 400, right: 500, top: 0, bottom: 40, height: 40, x: 100, y: 0 }) as DOMRect
  document.body.append(track)
  ;(trackRef as { current: HTMLDivElement | null }).current = track

  render(
    createElement(RegionHandle, {
      edge,
      region: REGION,
      sourceDuration: SOURCE_DURATION,
      onsets: [1, 3, 5, 7],
      trackRef,
      onMove: (_edge: 'start' | 'end', seconds: number) => moves.push(seconds),
      onJump: () => undefined,
      onAudition: () => undefined,
    }),
  )
  return { thumb: screen.getByRole('slider', { name: 'Region start' }), moves }
}

describe('RegionHandle dragging', () => {
  it('still drags when the pointer cannot be captured', () => {
    // Phase 9 found this bug twice, on the knob and on the stab keys: a
    // synthetic or already-released pointer throws NotFoundError. Capture only
    // keeps a drag alive outside the control; losing it must never cost the
    // whole gesture.
    const { thumb, moves } = renderHandle()
    thumb.setPointerCapture = () => {
      throw new DOMException('No active pointer with the given id is found.', 'NotFoundError')
    }

    fireEvent.pointerDown(thumb, { pointerId: 1, clientX: 200 })
    fireEvent.pointerMove(thumb, { pointerId: 1, clientX: 300 })

    // Half way along a 400 px track over an 8 s source is 4 s.
    expect(moves).toEqual([4])
  })

  it('does not move an edge on a pointer move that never started a drag', () => {
    const { thumb, moves } = renderHandle()

    fireEvent.pointerMove(thumb, { pointerId: 1, clientX: 300 })

    expect(moves).toEqual([])
  })
})

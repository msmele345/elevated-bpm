// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MASTER_PARAMS } from '../model/master'
import { Knob } from './Knob'

afterEach(cleanup)

const filterSpec = MASTER_PARAMS[0]

function renderKnob() {
  const changes: [string, number][] = []
  render(
    createElement(Knob, {
      spec: filterSpec,
      value: filterSpec.default,
      onChange: (id: string, value: number) => changes.push([id, value]),
    }),
  )
  return { dial: screen.getByRole('slider', { name: 'Filter' }), changes }
}

describe('Knob dragging', () => {
  it('still tracks a drag when the pointer cannot be captured', () => {
    const { dial, changes } = renderKnob()
    // Some pointers cannot be captured — a synthetic or already-released one
    // throws NotFoundError. Capture is an enhancement (it keeps a drag alive
    // outside the knob); losing it must not cost the user the whole gesture.
    dial.setPointerCapture = () => {
      throw new DOMException('No active pointer with the given id is found.', 'NotFoundError')
    }

    fireEvent.pointerDown(dial, { pointerId: 1, clientY: 200 })
    fireEvent.pointerMove(dial, { pointerId: 1, clientY: 120 })

    expect(changes).toHaveLength(1)
    expect(changes[0][0]).toBe('filter')
    expect(changes[0][1]).toBeGreaterThan(filterSpec.default * 0)
  })

  it('does not move the value on a pointer move that never started a drag', () => {
    const { dial, changes } = renderKnob()

    fireEvent.pointerMove(dial, { pointerId: 1, clientY: 40 })

    expect(changes).toEqual([])
  })
})

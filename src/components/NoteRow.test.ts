// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  resizeNoteStep,
  toggleNoteStep,
  transposeNoteStep,
} from '../model/note'
import { createDemoPattern } from '../model/pattern'
import type { NoteLaneId, Pattern } from '../model/types'
import { NoteRow } from './NoteRow'

afterEach(cleanup)

function BassRowHarness() {
  const [pattern, setPattern] = useState<Pattern>(createDemoPattern)
  const bass = pattern.noteLanes.find((lane) => lane.id === 'bass')!

  return createElement(NoteRow, {
    lane: bass,
    onToggleStep: (laneId: NoteLaneId, stepIndex: number) =>
      setPattern((current) => toggleNoteStep(current, laneId, stepIndex)),
    onTranspose: (laneId: NoteLaneId, stepIndex: number, semitones: number) =>
      setPattern((current) => transposeNoteStep(current, laneId, stepIndex, semitones)),
    onResize: (laneId: NoteLaneId, stepIndex: number, steps: number) =>
      setPattern((current) => resizeNoteStep(current, laneId, stepIndex, steps)),
  })
}

describe('note-step pointer and keyboard flow', () => {
  it('keeps a newly placed note focused so an arrow key visibly transposes it', () => {
    render(createElement(BassRowHarness))
    const step = screen.getByRole('button', { name: 'Bass step 1, empty' })

    fireEvent.pointerDown(step, { button: 0, pointerType: 'mouse' })
    fireEvent.click(step)

    expect(document.activeElement).toBe(step)

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })

    expect(
      screen.getByRole('button', { name: 'Bass step 1, C#2, 1 step long' }),
    ).toBe(step)
  })
})

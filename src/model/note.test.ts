import { describe, expect, it } from 'vitest'
import { STEP_COUNT, type Pattern } from './types'
import { createInitialPattern } from './pattern'
import {
  DEFAULT_PITCH,
  MAX_PITCH,
  MAX_NOTE_LENGTH,
  MIN_PITCH,
  MIN_NOTE_LENGTH,
  STAB_DEFAULT_PITCH,
  STAB_MAX_PITCH,
  STAB_MIN_PITCH,
  createNoteLanes,
  midiToFrequency,
  midiToNoteName,
  noteEventAtStep,
  noteEventsAtStep,
  resizeNoteStep,
  toggleNoteStep,
  transposeNoteStep,
  withNoteLanes,
} from './note'

function bassSteps(pattern: Pattern) {
  return pattern.noteLanes.find((lane) => lane.id === 'bass')!.steps
}

function stabSteps(pattern: Pattern) {
  return pattern.noteLanes.find((lane) => lane.id === 'stab')!.steps
}

describe('createNoteLanes', () => {
  it('creates bass and stab lanes parked at their instrument defaults', () => {
    const lanes = createNoteLanes()

    expect(lanes.map((lane) => lane.id)).toEqual(['bass', 'stab'])
    expect(bassSteps({ ...createInitialPattern(), noteLanes: lanes })).toHaveLength(STEP_COUNT)
    expect(stabSteps({ ...createInitialPattern(), noteLanes: lanes })).toHaveLength(STEP_COUNT)
    expect(
      bassSteps({ ...createInitialPattern(), noteLanes: lanes }).every(
        (step) =>
          step.on === false && step.pitch === DEFAULT_PITCH && step.length === MIN_NOTE_LENGTH,
      ),
    ).toBe(true)
    expect(
      stabSteps({ ...createInitialPattern(), noteLanes: lanes }).every(
        (step) =>
          step.on === false &&
          step.pitch === STAB_DEFAULT_PITCH &&
          step.length === MIN_NOTE_LENGTH,
      ),
    ).toBe(true)
  })
})

describe('withNoteLanes', () => {
  it('adds missing note lanes to a pattern saved before they existed', () => {
    const legacy = { ...createInitialPattern(), noteLanes: [] } as Pattern

    expect(withNoteLanes(legacy).noteLanes.map((lane) => lane.id)).toEqual(['bass', 'stab'])
  })

  it('keeps programmed notes on lanes the pattern already has', () => {
    const programmed = toggleNoteStep(createInitialPattern(), 'bass', 3)

    expect(bassSteps(withNoteLanes(programmed))[3].on).toBe(true)
  })

  it('adds an empty stab lane without disturbing a saved bassline', () => {
    const programmed = toggleNoteStep(createInitialPattern(), 'bass', 3)
    const bassOnly = {
      ...programmed,
      noteLanes: programmed.noteLanes.filter((lane) => lane.id === 'bass'),
    }

    const upgraded = withNoteLanes(bassOnly)

    expect(bassSteps(upgraded)[3].on).toBe(true)
    expect(stabSteps(upgraded).every((step) => !step.on)).toBe(true)
  })
})

describe('toggleNoteStep', () => {
  it('toggles a note on and off without mutating its input', () => {
    const initial = createInitialPattern()

    const on = toggleNoteStep(initial, 'bass', 0)
    expect(bassSteps(on)[0]).toEqual({ on: true, pitch: DEFAULT_PITCH, length: MIN_NOTE_LENGTH })

    const off = toggleNoteStep(on, 'bass', 0)
    expect(bassSteps(off)[0].on).toBe(false)
    expect(bassSteps(initial)[0].on).toBe(false)
  })

  it('keeps a step’s pitch and length when it is switched off and back on', () => {
    const shaped = resizeNoteStep(transposeNoteStep(toggleNoteStep(createInitialPattern(), 'bass', 2), 'bass', 2, 5), 'bass', 2, 1)
    const rearmed = toggleNoteStep(toggleNoteStep(shaped, 'bass', 2), 'bass', 2)

    expect(bassSteps(rearmed)[2]).toEqual({
      on: true,
      pitch: DEFAULT_PITCH + 5,
      length: MIN_NOTE_LENGTH + 1,
    })
  })

  it('leaves the drum lanes untouched', () => {
    const result = toggleNoteStep(createInitialPattern(), 'bass', 4)

    expect(result.lanes.every((lane) => lane.steps.every((step) => !step.on))).toBe(true)
  })
})

describe('transposeNoteStep', () => {
  it('shifts one step by semitones, leaving its neighbours alone', () => {
    const pattern = transposeNoteStep(createInitialPattern(), 'bass', 1, -3)

    expect(bassSteps(pattern)[1].pitch).toBe(DEFAULT_PITCH - 3)
    expect(bassSteps(pattern)[0].pitch).toBe(DEFAULT_PITCH)
  })

  it('clamps to the bass range instead of running off the keyboard', () => {
    const high = transposeNoteStep(createInitialPattern(), 'bass', 0, 500)
    const low = transposeNoteStep(createInitialPattern(), 'bass', 0, -500)

    expect(bassSteps(high)[0].pitch).toBe(MAX_PITCH)
    expect(bassSteps(low)[0].pitch).toBe(MIN_PITCH)
  })

  it('moves stab notes only across the visible C4–C5 keyboard', () => {
    const raised = transposeNoteStep(createInitialPattern(), 'stab', 0, 7)
    expect(stabSteps(raised)[0].pitch).toBe(STAB_DEFAULT_PITCH + 7)

    expect(stabSteps(transposeNoteStep(raised, 'stab', 0, 500))[0].pitch).toBe(STAB_MAX_PITCH)
    expect(stabSteps(transposeNoteStep(raised, 'stab', 0, -500))[0].pitch).toBe(STAB_MIN_PITCH)
  })
})

describe('resizeNoteStep', () => {
  it('lengthens and shortens a note in whole steps, clamped to the legal range', () => {
    const longer = resizeNoteStep(createInitialPattern(), 'bass', 0, 1)
    expect(bassSteps(longer)[0].length).toBe(MIN_NOTE_LENGTH + 1)

    expect(bassSteps(resizeNoteStep(longer, 'bass', 0, 99))[0].length).toBe(MAX_NOTE_LENGTH)
    expect(bassSteps(resizeNoteStep(longer, 'bass', 0, -99))[0].length).toBe(MIN_NOTE_LENGTH)
  })
})

describe('noteEventAtStep', () => {
  it('returns nothing for a step that is off', () => {
    expect(noteEventAtStep(createInitialPattern(), 'bass', 0)).toBeNull()
  })

  it('returns the pitch, frequency and length of a programmed note', () => {
    const pattern = resizeNoteStep(
      transposeNoteStep(toggleNoteStep(createInitialPattern(), 'bass', 6), 'bass', 6, 7),
      'bass',
      6,
      2,
    )

    expect(noteEventAtStep(pattern, 'bass', 6)).toEqual({
      midi: DEFAULT_PITCH + 7,
      frequency: midiToFrequency(DEFAULT_PITCH + 7),
      lengthSteps: MIN_NOTE_LENGTH + 2,
    })
  })

  it('returns a programmed stab event at the same step boundary as the drums and bass', () => {
    const pattern = toggleNoteStep(
      transposeNoteStep(createInitialPattern(), 'stab', 4, 7),
      'stab',
      4,
    )

    expect(noteEventAtStep(pattern, 'stab', 4)).toEqual({
      midi: STAB_DEFAULT_PITCH + 7,
      frequency: midiToFrequency(STAB_DEFAULT_PITCH + 7),
      lengthSteps: MIN_NOTE_LENGTH,
    })
  })

  it('clips a long note where the next note starts, so the lane stays monophonic', () => {
    const twoNotes = toggleNoteStep(
      resizeNoteStep(toggleNoteStep(createInitialPattern(), 'bass', 0), 'bass', 0, 3),
      'bass',
      2,
    )

    expect(noteEventAtStep(twoNotes, 'bass', 0)!.lengthSteps).toBe(2)
    expect(noteEventAtStep(twoNotes, 'bass', 2)!.lengthSteps).toBe(MIN_NOTE_LENGTH)
  })

  it('clips a note at the top of the loop, where the pattern repeats into itself', () => {
    const wrapping = toggleNoteStep(
      resizeNoteStep(toggleNoteStep(createInitialPattern(), 'bass', STEP_COUNT - 2), 'bass', STEP_COUNT - 2, 3),
      'bass',
      0,
    )

    expect(noteEventAtStep(wrapping, 'bass', STEP_COUNT - 2)!.lengthSteps).toBe(2)
  })

  it('returns nothing for a lane the pattern does not have', () => {
    const legacy = { ...createInitialPattern(), noteLanes: [] } as Pattern

    expect(noteEventAtStep(legacy, 'bass', 0)).toBeNull()
  })
})

describe('noteEventsAtStep', () => {
  it('returns bass and stab events from the same sequencer step', () => {
    const bassAndStab = toggleNoteStep(
      toggleNoteStep(createInitialPattern(), 'bass', 8),
      'stab',
      8,
    )

    expect(noteEventsAtStep(bassAndStab, 8)).toEqual([
      {
        laneId: 'bass',
        midi: DEFAULT_PITCH,
        frequency: midiToFrequency(DEFAULT_PITCH),
        lengthSteps: MIN_NOTE_LENGTH,
      },
      {
        laneId: 'stab',
        midi: STAB_DEFAULT_PITCH,
        frequency: midiToFrequency(STAB_DEFAULT_PITCH),
        lengthSteps: MIN_NOTE_LENGTH,
      },
    ])
  })
})

describe('pitch conversion', () => {
  it('names notes the way a keyboard does', () => {
    expect(midiToNoteName(36)).toBe('C2')
    expect(midiToNoteName(37)).toBe('C#2')
    expect(midiToNoteName(48)).toBe('C3')
    expect(midiToNoteName(69)).toBe('A4')
  })

  it('converts MIDI numbers to equal-tempered frequencies', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6)
    expect(midiToFrequency(57)).toBeCloseTo(220, 6)
    expect(midiToFrequency(36)).toBeCloseTo(65.406, 3)
  })
})

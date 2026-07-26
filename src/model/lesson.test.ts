import { describe, expect, it } from 'vitest'
import {
  isGoalMet,
  parseLesson,
  spotlitLaneIds,
  spotlitNoteLaneIds,
  spotlitParamIds,
  spotlightsTarget,
  type GoalContext,
} from './lesson'
import { toggleNoteStep, transposeNoteStep } from './note'
import { createInitialPattern, cycleStep, toggleStep } from './pattern'
import type { NoteLaneId, Pattern } from './types'

const validLesson = {
  id: 'four-on-the-floor',
  title: 'Four on the Floor',
  intro: 'Place a kick on beats 1, 2, 3, and 4.',
  spotlight: ['lane:kick'],
  goal: [{ type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12] }],
}

describe('parseLesson', () => {
  it('parses a valid lesson definition', () => {
    const lesson = parseLesson(validLesson)
    expect(lesson.id).toBe('four-on-the-floor')
    expect(lesson.title).toBe('Four on the Floor')
    expect(lesson.intro).toContain('kick')
    expect(lesson.spotlight).toEqual(['lane:kick'])
    expect(lesson.goal).toEqual([{ type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12] }])
  })

  it('rejects a definition missing required fields', () => {
    const { intro: _intro, ...withoutIntro } = validLesson
    expect(() => parseLesson(withoutIntro)).toThrow(/intro/)
    expect(() => parseLesson(null)).toThrow()
    expect(() => parseLesson('not a lesson')).toThrow()
  })

  it('rejects a goal assertion with an unknown type', () => {
    const badGoal = { ...validLesson, goal: [{ type: 'playChord', notes: ['C4'] }] }
    expect(() => parseLesson(badGoal)).toThrow(/playChord/)
  })

  it('parses a paramSwept goal', () => {
    const lesson = parseLesson({
      ...validLesson,
      goal: [{ type: 'paramSwept', param: 'cutoff', minTravel: 0.5 }],
    })
    expect(lesson.goal).toEqual([{ type: 'paramSwept', param: 'cutoff', minTravel: 0.5 }])
  })

  it('rejects a paramSwept goal without a param or with unreachable travel', () => {
    const noParam = { ...validLesson, goal: [{ type: 'paramSwept', minTravel: 0.5 }] }
    expect(() => parseLesson(noParam)).toThrow(/param/)

    for (const minTravel of [0, 1.5, -0.2, 'lots']) {
      const badTravel = { ...validLesson, goal: [{ type: 'paramSwept', param: 'cutoff', minTravel }] }
      expect(() => parseLesson(badTravel)).toThrow(/minTravel/)
    }
  })

  it('rejects out-of-range or non-numeric goal steps', () => {
    const badSteps = {
      ...validLesson,
      goal: [{ type: 'stepsActive', lane: 'kick', steps: [0, 16] }],
    }
    expect(() => parseLesson(badSteps)).toThrow(/steps/)
  })
})

function patternWithKicksOn(steps: number[]): GoalContext {
  const pattern = steps.reduce<Pattern>(
    (p, step) => toggleStep(p, 'kick', step),
    createInitialPattern(),
  )
  return { pattern }
}

describe('isGoalMet', () => {
  const lesson = parseLesson(validLesson)

  it('is met when exactly the goal steps are active', () => {
    expect(isGoalMet(lesson, patternWithKicksOn([0, 4, 8, 12]))).toBe(true)
  })

  it('is not met while only some goal steps are active', () => {
    expect(isGoalMet(lesson, patternWithKicksOn([]))).toBe(false)
    expect(isGoalMet(lesson, patternWithKicksOn([0, 4, 8]))).toBe(false)
  })

  it('is not met when extra steps are active alongside the goal steps', () => {
    expect(isGoalMet(lesson, patternWithKicksOn([0, 4, 8, 12, 15]))).toBe(false)
  })

  it('is not met when steps are on the wrong positions', () => {
    expect(isGoalMet(lesson, patternWithKicksOn([1, 5, 9, 13]))).toBe(false)
  })

  it('is not met when the goal lane does not exist in the pattern', () => {
    const snareLesson = parseLesson({
      ...validLesson,
      goal: [{ type: 'stepsActive', lane: 'snare', steps: [4, 12] }],
    })
    expect(isGoalMet(snareLesson, patternWithKicksOn([4, 12]))).toBe(false)
  })
})

describe('isGoalMet — paramSwept', () => {
  const sweepLesson = parseLesson({
    ...validLesson,
    id: 'filter-sweep',
    spotlight: ['knob:cutoff'],
    goal: [{ type: 'paramSwept', param: 'cutoff', minTravel: 0.5 }],
  })
  const pattern = createInitialPattern()

  it('is met once the knob has covered the required travel', () => {
    const motion = { cutoff: { min: 0.1, max: 0.9 } }
    expect(isGoalMet(sweepLesson, { pattern, motion })).toBe(true)
  })

  it('is not met by a knob nudged only a little', () => {
    const motion = { cutoff: { min: 0.4, max: 0.55 } }
    expect(isGoalMet(sweepLesson, { pattern, motion })).toBe(false)
  })

  it('is not met when nothing has been swept at all', () => {
    expect(isGoalMet(sweepLesson, { pattern })).toBe(false)
  })

  it('is not met by sweeping a different knob', () => {
    const motion = { resonance: { min: 0, max: 1 } }
    expect(isGoalMet(sweepLesson, { pattern, motion })).toBe(false)
  })
})

describe('spotlitLaneIds', () => {
  it('extracts lane ids from lane spotlight targets, ignoring other target kinds', () => {
    const lesson = parseLesson({
      ...validLesson,
      spotlight: ['lane:kick', 'transport:play'],
    })
    expect(spotlitLaneIds(lesson)).toEqual(['kick'])
  })

  it('spotlights nothing when no lesson is active', () => {
    expect(spotlitLaneIds(null)).toEqual([])
  })
})

describe('spotlitParamIds', () => {
  it('extracts knob ids from knob spotlight targets, ignoring lanes', () => {
    const lesson = parseLesson({
      ...validLesson,
      spotlight: ['knob:cutoff', 'lane:kick'],
    })
    expect(spotlitParamIds(lesson)).toEqual(['cutoff'])
  })

  it('spotlights nothing when no lesson is active', () => {
    expect(spotlitParamIds(null)).toEqual([])
  })
})

describe('spotlightsTarget', () => {
  it('answers for one-of-a-kind controls, and only for the target asked about', () => {
    const lesson = parseLesson({ ...validLesson, spotlight: ['transport:tempo'] })
    expect(spotlightsTarget(lesson, 'transport:tempo')).toBe(true)
    expect(spotlightsTarget(lesson, 'keyboard:stab')).toBe(false)
    expect(spotlightsTarget(null, 'transport:tempo')).toBe(false)
  })
})

describe('spotlitNoteLaneIds', () => {
  it('extracts note lane ids, keeping them apart from drum lanes', () => {
    const lesson = parseLesson({
      ...validLesson,
      spotlight: ['noteLane:bass', 'lane:kick', 'knob:cutoff'],
    })
    expect(spotlitNoteLaneIds(lesson)).toEqual(['bass'])
    expect(spotlitLaneIds(lesson)).toEqual(['kick'])
  })

  it('spotlights nothing when no lesson is active', () => {
    expect(spotlitNoteLaneIds(null)).toEqual([])
  })
})

/** A drum lane with `on` steps placed and `accented` ones cycled to accent. */
function drumPattern(lane: 'kick' | 'snare', on: number[], accented: number[] = []): Pattern {
  return on.reduce<Pattern>((pattern, step) => {
    const cycled = cycleStep(pattern, lane, step)
    return accented.includes(step) ? cycleStep(cycled, lane, step) : cycled
  }, createInitialPattern())
}

describe('isGoalMet — stepsAccented', () => {
  const lesson = parseLesson({
    ...validLesson,
    id: 'kick-accents',
    goal: [{ type: 'stepsAccented', lane: 'kick', steps: [0, 8] }],
  })

  it('is met when exactly the goal steps carry an accent', () => {
    const pattern = drumPattern('kick', [0, 4, 8, 12], [0, 8])
    expect(isGoalMet(lesson, { pattern })).toBe(true)
  })

  it('is not met by steps that are on but unaccented', () => {
    expect(isGoalMet(lesson, { pattern: drumPattern('kick', [0, 4, 8, 12]) })).toBe(false)
  })

  it('is not met when an extra step is accented', () => {
    const pattern = drumPattern('kick', [0, 4, 8, 12], [0, 4, 8])
    expect(isGoalMet(lesson, { pattern })).toBe(false)
  })

  it('reads accents on its own lane only', () => {
    const kicks = drumPattern('kick', [0, 4, 8, 12])
    const pattern = [0, 8].reduce(
      (p, step) => cycleStep(cycleStep(p, 'snare', step), 'snare', step),
      kicks,
    )
    expect(isGoalMet(lesson, { pattern })).toBe(false)
  })
})

/** A note lane with notes placed on `on` steps, transposed by `semitones`. */
function notePattern(
  laneId: NoteLaneId,
  on: number[],
  semitones: Record<number, number> = {},
): Pattern {
  return on.reduce<Pattern>((pattern, step) => {
    const placed = toggleNoteStep(pattern, laneId, step)
    const shift = semitones[step] ?? 0
    return shift ? transposeNoteStep(placed, laneId, step, shift) : placed
  }, createInitialPattern())
}

describe('isGoalMet — notesActive', () => {
  const lesson = parseLesson({
    ...validLesson,
    id: 'first-bassline',
    goal: [{ type: 'notesActive', lane: 'bass', steps: [2, 6, 10, 14] }],
  })

  it('is met when exactly the goal steps hold a note', () => {
    expect(isGoalMet(lesson, { pattern: notePattern('bass', [2, 6, 10, 14]) })).toBe(true)
  })

  it('stays met when those notes are transposed — pitch is not the goal', () => {
    const pattern = notePattern('bass', [2, 6, 10, 14], { 6: 5, 14: -3 })
    expect(isGoalMet(lesson, { pattern })).toBe(true)
  })

  it('is not met by a partial, extra, or wrong-lane line', () => {
    expect(isGoalMet(lesson, { pattern: notePattern('bass', [2, 6, 10]) })).toBe(false)
    expect(isGoalMet(lesson, { pattern: notePattern('bass', [2, 6, 10, 14, 15]) })).toBe(false)
    expect(isGoalMet(lesson, { pattern: notePattern('stab', [2, 6, 10, 14]) })).toBe(false)
  })
})

describe('isGoalMet — notesPlaced', () => {
  const lesson = parseLesson({
    ...validLesson,
    id: 'write-a-line',
    goal: [{ type: 'notesPlaced', lane: 'bass', min: 4 }],
  })

  it('is met by any line of at least the required length — the notes are the user’s own', () => {
    expect(isGoalMet(lesson, { pattern: notePattern('bass', [0, 3, 7, 11]) })).toBe(true)
    expect(isGoalMet(lesson, { pattern: notePattern('bass', [1, 2, 3, 4, 5]) })).toBe(true)
  })

  it('is not met while the line is still too short', () => {
    expect(isGoalMet(lesson, { pattern: notePattern('bass', [0, 4, 8]) })).toBe(false)
  })

  it('counts only its own lane', () => {
    expect(isGoalMet(lesson, { pattern: notePattern('stab', [0, 4, 8, 12]) })).toBe(false)
  })
})

describe('isGoalMet — pitchesVaried', () => {
  const lesson = parseLesson({
    ...validLesson,
    id: 'bass-movement',
    goal: [{ type: 'pitchesVaried', lane: 'bass', min: 3 }],
  })

  it('is met once enough notes sit on different pitches', () => {
    const pattern = notePattern('bass', [0, 4, 8, 12], { 4: 3, 8: 7 })
    expect(isGoalMet(lesson, { pattern })).toBe(true)
  })

  it('is not met by a line parked on one note, however long', () => {
    expect(isGoalMet(lesson, { pattern: notePattern('bass', [0, 2, 4, 6, 8]) })).toBe(false)
  })

  it('counts distinct pitches, not notes', () => {
    // Four notes, two pitches: the line moves, but not enough yet.
    const pattern = notePattern('bass', [0, 4, 8, 12], { 4: 5, 12: 5 })
    expect(isGoalMet(lesson, { pattern })).toBe(false)
  })

  it('ignores the pitch parked under a step that is switched off', () => {
    const placed = notePattern('bass', [0, 4, 8], { 4: 3, 8: 7 })
    const pattern = toggleNoteStep(placed, 'bass', 8)
    expect(isGoalMet(lesson, { pattern })).toBe(false)
  })
})

describe('isGoalMet — bpmInRange', () => {
  const lesson = parseLesson({
    ...validLesson,
    id: 'peak-time-tempo',
    goal: [{ type: 'bpmInRange', min: 138, max: 145 }],
  })
  const pattern = createInitialPattern()

  it('is met inside the range, inclusive of its ends', () => {
    expect(isGoalMet(lesson, { pattern, bpm: 140 })).toBe(true)
    expect(isGoalMet(lesson, { pattern, bpm: 138 })).toBe(true)
    expect(isGoalMet(lesson, { pattern, bpm: 145 })).toBe(true)
  })

  it('is not met outside it, or when no tempo is supplied', () => {
    expect(isGoalMet(lesson, { pattern, bpm: 130 })).toBe(false)
    expect(isGoalMet(lesson, { pattern, bpm: 150 })).toBe(false)
    expect(isGoalMet(lesson, { pattern })).toBe(false)
  })
})

describe('isGoalMet — chordPlayed', () => {
  const lesson = parseLesson({
    ...validLesson,
    id: 'stab-chord',
    goal: [{ type: 'chordPlayed', minNotes: 3 }],
  })
  const pattern = createInitialPattern()

  it('is met once enough notes have sounded together', () => {
    expect(isGoalMet(lesson, { pattern, chord: { held: {}, maxNotes: 3 } })).toBe(true)
  })

  it('is not met by notes played one at a time', () => {
    expect(isGoalMet(lesson, { pattern, chord: { held: {}, maxNotes: 1 } })).toBe(false)
    expect(isGoalMet(lesson, { pattern })).toBe(false)
  })
})

describe('parseLesson — arc goal vocabulary', () => {
  function withGoal(goal: unknown) {
    return () => parseLesson({ ...validLesson, goal: [goal] })
  }

  it('rejects a step goal naming a lane the deck does not have', () => {
    expect(withGoal({ type: 'stepsActive', lane: 'cowbell', steps: [0] })).toThrow(/cowbell/)
    expect(withGoal({ type: 'stepsAccented', lane: 'cowbell', steps: [0] })).toThrow(/cowbell/)
    expect(withGoal({ type: 'notesActive', lane: 'kick', steps: [0] })).toThrow(/kick/)
    expect(withGoal({ type: 'notesPlaced', lane: 'lead', min: 2 })).toThrow(/lead/)
    expect(withGoal({ type: 'pitchesVaried', lane: 'lead', min: 2 })).toThrow(/lead/)
  })

  it('rejects counts that no pattern could ever satisfy', () => {
    expect(withGoal({ type: 'notesPlaced', lane: 'bass', min: 0 })).toThrow(/min/)
    expect(withGoal({ type: 'notesPlaced', lane: 'bass', min: 17 })).toThrow(/min/)
    expect(withGoal({ type: 'pitchesVaried', lane: 'bass', min: 1 })).toThrow(/min/)
    expect(withGoal({ type: 'chordPlayed', minNotes: 1 })).toThrow(/minNotes/)
  })

  it('rejects a tempo goal outside the transport’s range or inverted', () => {
    expect(withGoal({ type: 'bpmInRange', min: 20, max: 140 })).toThrow(/bpm/i)
    expect(withGoal({ type: 'bpmInRange', min: 140, max: 260 })).toThrow(/bpm/i)
    expect(withGoal({ type: 'bpmInRange', min: 145, max: 138 })).toThrow(/bpm/i)
  })

  it('parses every arc goal type it accepts', () => {
    const lesson = parseLesson({
      ...validLesson,
      goal: [
        { type: 'stepsAccented', lane: 'kick', steps: [0, 8] },
        { type: 'notesActive', lane: 'stab', steps: [6, 14] },
        { type: 'notesPlaced', lane: 'bass', min: 4 },
        { type: 'pitchesVaried', lane: 'bass', min: 3 },
        { type: 'bpmInRange', min: 138, max: 145 },
        { type: 'chordPlayed', minNotes: 3 },
      ],
    })
    expect(lesson.goal).toHaveLength(6)
  })

  it('holds a lesson to every one of its assertions', () => {
    const lesson = parseLesson({
      ...validLesson,
      id: 'your-first-techno-groove',
      goal: [
        { type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12] },
        { type: 'notesPlaced', lane: 'bass', min: 4 },
      ],
    })
    const kicks = drumPattern('kick', [0, 4, 8, 12])
    const bassOnly = notePattern('bass', [2, 6, 10, 14])
    expect(isGoalMet(lesson, { pattern: kicks })).toBe(false)
    expect(isGoalMet(lesson, { pattern: bassOnly })).toBe(false)

    const both = [2, 6, 10, 14].reduce((p, step) => toggleNoteStep(p, 'bass', step), kicks)
    expect(isGoalMet(lesson, { pattern: both })).toBe(true)
  })
})

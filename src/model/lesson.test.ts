import { describe, expect, it } from 'vitest'
import {
  assertionProgress,
  isGoalMet,
  parseLesson,
  spotlitLaneIds,
  spotlitNoteLaneIds,
  spotlitParamIds,
  spotlightsTarget,
  type GoalAssertion,
  type GoalContext,
  type SamplerGoalContext,
} from './lesson'
import { toggleNoteStep, transposeNoteStep } from './note'
import { createInitialPattern, cycleStep, toggleStep } from './pattern'
import {
  CURATED_SAMPLE_SOURCE,
  PAD_LANES,
  createSamplerSettings,
  type SampleRegion,
  type SampleSource,
} from './sampler'
import type { NoteLaneId, PadLaneId, Pattern } from './types'

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

  it('parses a paramSwept goal naming any knob on the deck, not only the bass synth’s', () => {
    // The registry is deck-wide: a sound-design lesson can be written about the
    // master macros or the FX bus without the goal vocabulary growing a case.
    for (const param of ['filter', 'drive', 'stabSend', 'feedback']) {
      const lesson = parseLesson({
        ...validLesson,
        goal: [{ type: 'paramSwept', param, minTravel: 0.5 }],
      })
      expect(lesson.goal).toEqual([{ type: 'paramSwept', param, minTravel: 0.5 }])
    }
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

describe('isGoalMet — swingInRange', () => {
  const lesson = parseLesson({
    ...validLesson,
    id: 'shuffle',
    spotlight: ['knob:swing'],
    goal: [{ type: 'swingInRange', min: 56, max: 66 }],
  })
  const pattern = createInitialPattern()

  it('is met inside the range, inclusive of its ends', () => {
    expect(isGoalMet(lesson, { pattern, swing: 0.6 })).toBe(true)
    expect(isGoalMet(lesson, { pattern, swing: 0.56 })).toBe(true)
    expect(isGoalMet(lesson, { pattern, swing: 0.66 })).toBe(true)
  })

  it('judges the whole percentage the Swing knob reads out, so what the learner sees is what counts', () => {
    // 55.51% reads "56 %" and 66.49% reads "66 %": both inside.
    expect(isGoalMet(lesson, { pattern, swing: 0.5551 })).toBe(true)
    expect(isGoalMet(lesson, { pattern, swing: 0.6649 })).toBe(true)
    // 55.4% reads "55 %" and 66.6% reads "67 %": both outside.
    expect(isGoalMet(lesson, { pattern, swing: 0.554 })).toBe(false)
    expect(isGoalMet(lesson, { pattern, swing: 0.666 })).toBe(false)
  })

  it('is not met outside it, or when no swing is supplied', () => {
    expect(isGoalMet(lesson, { pattern, swing: 0.5 })).toBe(false)
    expect(isGoalMet(lesson, { pattern, swing: 0.75 })).toBe(false)
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

  it('rejects empty or repeated step goals that could auto-complete with less work', () => {
    expect(withGoal({ type: 'stepsActive', lane: 'kick', steps: [] })).toThrow(/steps/)
    expect(withGoal({ type: 'stepsAccented', lane: 'kick', steps: [0, 0] })).toThrow(/steps/)
    expect(withGoal({ type: 'notesActive', lane: 'bass', steps: [2, 2, 6] })).toThrow(/steps/)
  })

  it('rejects counts that no pattern could ever satisfy', () => {
    expect(withGoal({ type: 'notesPlaced', lane: 'bass', min: 0 })).toThrow(/min/)
    expect(withGoal({ type: 'notesPlaced', lane: 'bass', min: 17 })).toThrow(/min/)
    expect(withGoal({ type: 'pitchesVaried', lane: 'bass', min: 1 })).toThrow(/min/)
    expect(withGoal({ type: 'pitchesVaried', lane: 'stab', min: 14 })).toThrow(/min/)
    expect(withGoal({ type: 'chordPlayed', minNotes: 1 })).toThrow(/minNotes/)
  })

  it('rejects a tempo goal outside the transport’s range or inverted', () => {
    expect(withGoal({ type: 'bpmInRange', min: 20, max: 140 })).toThrow(/bpm/i)
    expect(withGoal({ type: 'bpmInRange', min: 140, max: 260 })).toThrow(/bpm/i)
    expect(withGoal({ type: 'bpmInRange', min: 145, max: 138 })).toThrow(/bpm/i)
  })

  it('rejects a swing goal outside 50–75% or inverted', () => {
    expect(withGoal({ type: 'swingInRange', min: 40, max: 60 })).toThrow(/swing/i)
    expect(withGoal({ type: 'swingInRange', min: 60, max: 80 })).toThrow(/swing/i)
    expect(withGoal({ type: 'swingInRange', min: 66, max: 56 })).toThrow(/swing/i)
    // Percent, not the stored fraction: a lesson author writes what the knob reads.
    expect(withGoal({ type: 'swingInRange', min: 0.56, max: 0.66 })).toThrow(/swing/i)
    expect(withGoal({ type: 'swingInRange', min: '56', max: 66 })).toThrow(/swing/i)
    expect(withGoal({ type: 'swingInRange', max: 66 })).toThrow(/swing/i)
  })

  it('accepts a swing goal anywhere on the knob, ends included', () => {
    expect(parseLesson({ ...validLesson, goal: [{ type: 'swingInRange', min: 50, max: 75 }] }).goal).toEqual([
      { type: 'swingInRange', min: 50, max: 75 },
    ])
    expect(parseLesson({ ...validLesson, goal: [{ type: 'swingInRange', min: 62, max: 62 }] }).goal).toEqual([
      { type: 'swingInRange', min: 62, max: 62 },
    ])
  })

  it('lets a lesson spotlight the Swing knob', () => {
    const lesson = parseLesson({ ...validLesson, spotlight: ['knob:swing'] })
    expect(spotlitParamIds(lesson)).toEqual(['swing'])
  })

  it('lets a lesson spotlight and ask for a sweep of any voice’s Level in JSON alone', () => {
    const lesson = parseLesson({
      ...validLesson,
      spotlight: ['knob:closedHatLevel', 'knob:bassLevel'],
      goal: [
        { type: 'paramSwept', param: 'pad1Level', minTravel: 0.5 },
        { type: 'paramSwept', param: 'stabLevel', minTravel: 0.25 },
      ],
    })
    expect(spotlitParamIds(lesson)).toEqual(['closedHatLevel', 'bassLevel'])
    expect(lesson.goal.map((goal) => (goal as { param: string }).param)).toEqual([
      'pad1Level',
      'stabLevel',
    ])
  })

  it('rejects a sweep for a knob the deck does not have', () => {
    expect(withGoal({ type: 'paramSwept', param: 'cuttof', minTravel: 0.5 })).toThrow(
      /cuttof/,
    )
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

describe('isGoalMet — the sampling vocabulary', () => {
  const pattern = createInitialPattern()

  function sampler(overrides: Partial<SamplerGoalContext> = {}): SamplerGoalContext {
    return { pads: createSamplerSettings(), sources: [CURATED_SAMPLE_SOURCE], ...overrides }
  }

  const myUpload: SampleSource = {
    id: 'mine',
    name: 'My Break',
    origin: 'upload',
    duration: 4,
    channels: 2,
  }

  function goalFor(goal: unknown) {
    return parseLesson({ ...validLesson, goal: [goal] })
  }

  describe('sourceLoaded', () => {
    const lesson = goalFor({ type: 'sourceLoaded', origin: 'user', min: 1 })

    it('is not met by the source the app installed itself', () => {
      // The opening deck ships the curated source so a first chop is one click
      // away — it must never also hand the learner the first lesson.
      expect(isGoalMet(lesson, { pattern, sampler: sampler() })).toBe(false)
    })

    it('is met once the learner has brought a sound in themselves', () => {
      expect(
        isGoalMet(lesson, {
          pattern,
          sampler: sampler({ sources: [CURATED_SAMPLE_SOURCE, myUpload] }),
        }),
      ).toBe(true)
    })

    it('counts a recording as a sound brought in, and a named origin only itself', () => {
      const take: SampleSource = { ...myUpload, id: 'take', origin: 'recording' }
      expect(
        isGoalMet(lesson, { pattern, sampler: sampler({ sources: [take] }) }),
      ).toBe(true)
      expect(
        isGoalMet(goalFor({ type: 'sourceLoaded', origin: 'recording', min: 1 }), {
          pattern,
          sampler: sampler({ sources: [myUpload] }),
        }),
      ).toBe(false)
    })

    it('is not met when nothing knows about the sampler at all', () => {
      expect(isGoalMet(lesson, { pattern })).toBe(false)
    })
  })

  describe('regionStartsWithin', () => {
    const lesson = goalFor({
      type: 'regionStartsWithin',
      pad: 'pad1',
      source: CURATED_SAMPLE_SOURCE.id,
      from: 0.42,
      to: 0.51,
    })

    function padWithRegion(sourceId: string, start: number) {
      return sampler({
        pads: {
          ...createSamplerSettings(),
          pad1: {
            region: { sourceId, start, duration: 0.3 },
            tune: 0,
            fit: null,
            name: 'Pad 1',
          },
        },
        sources: [CURATED_SAMPLE_SOURCE, myUpload],
      })
    }

    it('is met by a chop that starts inside the window of the source it names', () => {
      expect(isGoalMet(lesson, { pattern, sampler: padWithRegion(CURATED_SAMPLE_SOURCE.id, 0.4615) }))
        .toBe(true)
    })

    it('is not met by the same window cut from a different source', () => {
      // A window alone is a false positive waiting to happen: a learner who
      // chops their own break near the same offset would otherwise complete a
      // lesson about a file they never opened.
      expect(isGoalMet(lesson, { pattern, sampler: padWithRegion(myUpload.id, 0.4615) })).toBe(
        false,
      )
    })

    it('is not met by a chop outside the window, or by an empty pad', () => {
      expect(isGoalMet(lesson, { pattern, sampler: padWithRegion(CURATED_SAMPLE_SOURCE.id, 0.9) }))
        .toBe(false)
      expect(isGoalMet(lesson, { pattern, sampler: sampler() })).toBe(false)
    })
  })

  describe('regionShorterThan, fitTargetSet, padTuned', () => {
    function pad1(region: SampleRegion | null, tune = 0, fit: number | null = null) {
      return sampler({
        pads: { ...createSamplerSettings(), pad1: { region, tune, fit, name: 'Pad 1' } },
      })
    }
    const chop: SampleRegion = { sourceId: CURATED_SAMPLE_SOURCE.id, start: 0.46, duration: 0.3 }

    it('recognizes a chop trimmed under the length the lesson asks for', () => {
      const lesson = goalFor({ type: 'regionShorterThan', pad: 'pad1', seconds: 0.4 })
      expect(isGoalMet(lesson, { pattern, sampler: pad1(chop) })).toBe(true)
      expect(isGoalMet(lesson, { pattern, sampler: pad1({ ...chop, duration: 1.2 }) })).toBe(false)
      expect(isGoalMet(lesson, { pattern, sampler: pad1(null) })).toBe(false)
    })

    it('needs a fit target on a pad that actually holds a chop', () => {
      const lesson = goalFor({ type: 'fitTargetSet', pad: 'pad1', minSteps: 8 })
      expect(isGoalMet(lesson, { pattern, sampler: pad1(chop, 0, 16) })).toBe(true)
      expect(isGoalMet(lesson, { pattern, sampler: pad1(chop, 0, 4) })).toBe(false)
      expect(isGoalMet(lesson, { pattern, sampler: pad1(chop, 0, null) })).toBe(false)
      // Declaring a fit for a pad with nothing on it is not fitting anything.
      expect(isGoalMet(lesson, { pattern, sampler: pad1(null, 0, 16) })).toBe(false)
    })

    it('reads tune as distance from neutral, in either direction', () => {
      const lesson = goalFor({ type: 'padTuned', pad: 'pad1', minSemitones: 5 })
      expect(isGoalMet(lesson, { pattern, sampler: pad1(chop, 7) })).toBe(true)
      expect(isGoalMet(lesson, { pattern, sampler: pad1(chop, -7) })).toBe(true)
      expect(isGoalMet(lesson, { pattern, sampler: pad1(chop, 3) })).toBe(false)
      expect(isGoalMet(lesson, { pattern, sampler: pad1(chop, 0) })).toBe(false)
    })
  })

  describe('padAssigned and padStepsPlaced', () => {
    function padsFrom(sourceIds: string[]) {
      const pads = createSamplerSettings()
      sourceIds.forEach((sourceId, index) => {
        const padId = PAD_LANES[index].id
        pads[padId] = {
          ...pads[padId],
          region: { sourceId, start: 0, duration: 0.4 },
        }
      })
      return pads
    }

    it('counts pads that hold a chop', () => {
      const lesson = goalFor({ type: 'padAssigned', min: 3 })
      const three = [CURATED_SAMPLE_SOURCE.id, myUpload.id, myUpload.id]
      expect(
        isGoalMet(lesson, {
          pattern,
          sampler: sampler({ pads: padsFrom(three), sources: [CURATED_SAMPLE_SOURCE, myUpload] }),
        }),
      ).toBe(true)
      expect(
        isGoalMet(lesson, { pattern, sampler: sampler({ pads: padsFrom(three.slice(0, 2)) }) }),
      ).toBe(false)
    })

    it('counts only pads cut from the learner’s own audio when the goal says so', () => {
      const lesson = goalFor({ type: 'padAssigned', min: 2, origin: 'user' })
      const context = (ids: string[]) => ({
        pattern,
        sampler: sampler({ pads: padsFrom(ids), sources: [CURATED_SAMPLE_SOURCE, myUpload] }),
      })
      expect(isGoalMet(lesson, context([myUpload.id, myUpload.id]))).toBe(true)
      // Two pads, but one of them is the app's own sound.
      expect(isGoalMet(lesson, context([CURATED_SAMPLE_SOURCE.id, myUpload.id]))).toBe(false)
    })

    it('counts pad steps switched on across the whole sampler', () => {
      const lesson = goalFor({ type: 'padStepsPlaced', min: 4 })
      const programmed = ['pad1', 'pad1', 'pad2', 'pad3'].reduce(
        (built, padId, index) => toggleStep(built, padId as PadLaneId, index * 4),
        pattern,
      )
      expect(isGoalMet(lesson, { pattern: programmed, sampler: sampler() })).toBe(true)
      expect(
        isGoalMet(lesson, { pattern: toggleStep(pattern, 'pad1', 0), sampler: sampler() }),
      ).toBe(false)
    })
  })
})

describe('parseLesson — the sampling goal vocabulary', () => {
  function withGoal(goal: unknown) {
    return () => parseLesson({ ...validLesson, goal: [goal] })
  }

  it('rejects a goal naming a pad the deck does not have', () => {
    expect(withGoal({ type: 'regionShorterThan', pad: 'pad9', seconds: 0.4 })).toThrow(/pad9/)
    expect(withGoal({ type: 'fitTargetSet', pad: 'kick', minSteps: 4 })).toThrow(/kick/)
    expect(withGoal({ type: 'padTuned', pad: '', minSemitones: 5 })).toThrow(/pad/i)
  })

  it('rejects a region window naming a source the app does not ship', () => {
    // Only a shipped source has a duration knowable when a lesson is parsed, so
    // it is the only thing a window can be checked against.
    expect(
      withGoal({
        type: 'regionStartsWithin',
        pad: 'pad1',
        source: 'a-file-the-learner-brought',
        from: 0.1,
        to: 0.2,
      }),
    ).toThrow(/a-file-the-learner-brought/)
  })

  it('rejects a window that falls outside the source’s duration, or runs backwards', () => {
    const window = (from: number, to: number) =>
      withGoal({
        type: 'regionStartsWithin',
        pad: 'pad1',
        source: CURATED_SAMPLE_SOURCE.id,
        from,
        to,
      })
    expect(window(-0.1, 0.5)).toThrow(/window/i)
    expect(window(0.5, CURATED_SAMPLE_SOURCE.duration + 1)).toThrow(/window/i)
    expect(window(0.9, 0.4)).toThrow(/window/i)
  })

  it('rejects a "load a sound" goal the shipped source would satisfy on its own', () => {
    expect(withGoal({ type: 'sourceLoaded', origin: 'shipped', min: 1 })).toThrow(/origin/)
    expect(withGoal({ type: 'sourceLoaded', origin: 'user', min: 0 })).toThrow(/min/)
  })

  it('rejects counts and lengths no sampler could reach', () => {
    expect(withGoal({ type: 'padAssigned', min: 5 })).toThrow(/min/)
    expect(withGoal({ type: 'padAssigned', min: 0 })).toThrow(/min/)
    expect(withGoal({ type: 'fitTargetSet', pad: 'pad1', minSteps: 17 })).toThrow(/minSteps/)
    expect(withGoal({ type: 'padTuned', pad: 'pad1', minSemitones: 40 })).toThrow(/minSemitones/)
    expect(withGoal({ type: 'padTuned', pad: 'pad1', minSemitones: 0 })).toThrow(/minSemitones/)
    expect(withGoal({ type: 'regionShorterThan', pad: 'pad1', seconds: 0 })).toThrow(/seconds/)
    expect(withGoal({ type: 'padStepsPlaced', min: 65 })).toThrow(/min/)
  })

  it('parses every sampling goal it accepts', () => {
    const lesson = parseLesson({
      ...validLesson,
      goal: [
        { type: 'sourceLoaded', origin: 'user', min: 1 },
        { type: 'padAssigned', min: 3, origin: 'user' },
        {
          type: 'regionStartsWithin',
          pad: 'pad1',
          source: CURATED_SAMPLE_SOURCE.id,
          from: 0.42,
          to: 0.51,
        },
        { type: 'regionShorterThan', pad: 'pad1', seconds: 0.4 },
        { type: 'fitTargetSet', pad: 'pad2', minSteps: 8 },
        { type: 'padTuned', pad: 'pad1', minSemitones: 5 },
        { type: 'padStepsPlaced', min: 4 },
      ],
    })
    expect(lesson.goal.map((goal) => goal.type)).toEqual([
      'sourceLoaded',
      'padAssigned',
      'regionStartsWithin',
      'regionShorterThan',
      'fitTargetSet',
      'padTuned',
      'padStepsPlaced',
    ])
  })
})

describe('assertionProgress — how close a goal is, never which steps are wrong', () => {
  const kicks = { type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12] } satisfies GoalAssertion

  it('counts wanted steps placed and extras for an exact-placement goal', () => {
    expect(assertionProgress(kicks, patternWithKicksOn([0, 4, 5]))).toEqual({
      met: false,
      done: 2,
      total: 4,
      extra: 1,
    })
  })

  it('is met only with every wanted step and zero extras', () => {
    expect(assertionProgress(kicks, patternWithKicksOn([0, 4, 8, 12])).met).toBe(true)
    const crowded = assertionProgress(kicks, patternWithKicksOn([0, 4, 8, 12, 15]))
    expect(crowded).toMatchObject({ met: false, done: 4, total: 4, extra: 1 })
  })

  it('reports nothing done on a lane the pattern does not have', () => {
    const pattern = { ...createInitialPattern(), lanes: [] }
    expect(assertionProgress(kicks, { pattern })).toMatchObject({ met: false, done: 0, extra: 0 })
  })

  it('counts accents, not plain hits, for stepsAccented', () => {
    const goal = { type: 'stepsAccented', lane: 'kick', steps: [0, 8] } satisfies GoalAssertion
    const pattern = drumPattern('kick', [0, 4, 8, 12], [0, 4])
    expect(assertionProgress(goal, { pattern })).toEqual({ met: false, done: 1, total: 2, extra: 1 })
  })

  it('counts notes placed and extras for notesActive', () => {
    const goal = { type: 'notesActive', lane: 'bass', steps: [2, 6, 10, 14] } satisfies GoalAssertion
    const pattern = notePattern('bass', [2, 6, 7])
    expect(assertionProgress(goal, { pattern })).toEqual({ met: false, done: 2, total: 4, extra: 1 })
  })

  it('caps a minimum count at the minimum', () => {
    const goal = { type: 'notesPlaced', lane: 'bass', min: 4 } satisfies GoalAssertion
    expect(assertionProgress(goal, { pattern: notePattern('bass', [0, 1]) })).toEqual({
      met: false,
      done: 2,
      total: 4,
      extra: 0,
    })
    expect(assertionProgress(goal, { pattern: notePattern('bass', [0, 1, 2, 3, 4, 5]) })).toEqual({
      met: true,
      done: 4,
      total: 4,
      extra: 0,
    })
  })

  it('counts distinct pitches for pitchesVaried', () => {
    const goal = { type: 'pitchesVaried', lane: 'bass', min: 3 } satisfies GoalAssertion
    const pattern = notePattern('bass', [0, 4, 8], { 4: 3 })
    expect(assertionProgress(goal, { pattern })).toMatchObject({ met: false, done: 2, total: 3 })
  })

  it('measures a sweep as travel against minTravel', () => {
    const goal = { type: 'paramSwept', param: 'cutoff', minTravel: 0.5 } satisfies GoalAssertion
    const motion = { cutoff: { min: 0.2, max: 0.5 } }
    expect(assertionProgress(goal, { pattern: createInitialPattern(), motion })).toMatchObject({
      met: false,
      total: 0.5,
    })
    expect(assertionProgress(goal, { pattern: createInitialPattern(), motion }).done).toBeCloseTo(0.3)
    expect(assertionProgress(goal, { pattern: createInitialPattern() })).toMatchObject({
      met: false,
      done: 0,
    })
  })

  it('counts notes held together against minNotes for chordPlayed', () => {
    const goal = { type: 'chordPlayed', minNotes: 3 } satisfies GoalAssertion
    expect(
      assertionProgress(goal, { pattern: createInitialPattern(), chord: { held: {}, maxNotes: 2 } }),
    ).toEqual({ met: false, done: 2, total: 3, extra: 0 })
    expect(
      assertionProgress(goal, { pattern: createInitialPattern(), chord: { held: {}, maxNotes: 5 } }),
    ).toMatchObject({ met: true, done: 3 })
  })

  it('reports the current tempo against a bpm range', () => {
    const goal = { type: 'bpmInRange', min: 138, max: 145 } satisfies GoalAssertion
    expect(assertionProgress(goal, { pattern: createInitialPattern(), bpm: 130 })).toMatchObject({
      met: false,
      current: 130,
    })
    expect(assertionProgress(goal, { pattern: createInitialPattern(), bpm: 140 }).met).toBe(true)
    expect(assertionProgress(goal, { pattern: createInitialPattern() })).toMatchObject({
      met: false,
      current: undefined,
    })
  })

  it('reports the current swing in whole percent against a swing range', () => {
    const goal = { type: 'swingInRange', min: 54, max: 70 } satisfies GoalAssertion
    expect(assertionProgress(goal, { pattern: createInitialPattern(), swing: 0.5 })).toMatchObject({
      met: false,
      current: 50,
    })
    expect(assertionProgress(goal, { pattern: createInitialPattern(), swing: 0.6 })).toMatchObject({
      met: true,
      current: 60,
    })
  })

  describe('sampler goals', () => {
    const pattern = createInitialPattern()
    const upload: SampleSource = { id: 'mine', name: 'Mine', origin: 'upload', duration: 4, channels: 2 }
    const chop = (start: number, duration: number): SampleRegion => ({
      sourceId: CURATED_SAMPLE_SOURCE.id,
      start,
      duration,
    })
    function withPad(pad: PadLaneId, settings: Record<string, unknown>, sources = [CURATED_SAMPLE_SOURCE]) {
      const pads = createSamplerSettings()
      return { pattern, sampler: { pads: { ...pads, [pad]: { ...pads[pad], ...settings } }, sources } }
    }

    it('counts sources the learner brought in, capped at the minimum', () => {
      const goal = { type: 'sourceLoaded', origin: 'user', min: 1 } satisfies GoalAssertion
      expect(assertionProgress(goal, withPad('pad1', {}))).toMatchObject({ met: false, done: 0, total: 1 })
      expect(
        assertionProgress(goal, withPad('pad1', {}, [CURATED_SAMPLE_SOURCE, upload, { ...upload, id: 'b' }])),
      ).toMatchObject({ met: true, done: 1, total: 1 })
    })

    it('counts pads holding a chop', () => {
      const goal = { type: 'padAssigned', min: 3 } satisfies GoalAssertion
      expect(assertionProgress(goal, withPad('pad2', { region: chop(0, 0.3) }))).toMatchObject({
        met: false,
        done: 1,
        total: 3,
      })
    })

    it('counts pad steps placed across the sampler', () => {
      const goal = { type: 'padStepsPlaced', min: 4 } satisfies GoalAssertion
      const placed = { ...pattern, padLanes: pattern.padLanes.map((lane, i) => i === 0
        ? { ...lane, steps: lane.steps.map((step, s) => ({ ...step, on: s < 2 })) }
        : lane) }
      expect(assertionProgress(goal, { pattern: placed })).toMatchObject({ met: false, done: 2, total: 4 })
    })

    it('reports a chop start only when it is cut from the goal source', () => {
      const goal = {
        type: 'regionStartsWithin',
        pad: 'pad1',
        source: CURATED_SAMPLE_SOURCE.id,
        from: 0.4,
        to: 0.53,
      } satisfies GoalAssertion
      expect(assertionProgress(goal, withPad('pad1', { region: chop(0.7, 0.3) }))).toMatchObject({
        met: false,
        current: 0.7,
      })
      expect(assertionProgress(goal, withPad('pad1', { region: chop(0.45, 0.3) })).met).toBe(true)
      const elsewhere = withPad('pad1', { region: { sourceId: 'mine', start: 0.45, duration: 0.3 } }, [upload])
      expect(assertionProgress(goal, elsewhere)).toMatchObject({ met: false, current: undefined })
    })

    it('reports a chop length against regionShorterThan', () => {
      const goal = { type: 'regionShorterThan', pad: 'pad1', seconds: 0.4 } satisfies GoalAssertion
      expect(assertionProgress(goal, withPad('pad1', { region: chop(0.45, 0.6) }))).toMatchObject({
        met: false,
        current: 0.6,
      })
      expect(assertionProgress(goal, withPad('pad1', {}))).toMatchObject({ met: false, current: undefined })
    })

    it('reports a pad fit against fitTargetSet', () => {
      const goal = { type: 'fitTargetSet', pad: 'pad2', minSteps: 16 } satisfies GoalAssertion
      expect(assertionProgress(goal, withPad('pad2', { region: chop(0, 2), fit: 8 }))).toMatchObject({
        met: false,
        current: 8,
      })
      expect(assertionProgress(goal, withPad('pad2', { region: chop(0, 2), fit: null }))).toMatchObject({
        met: false,
        current: undefined,
      })
    })

    it('reports a pad tune against padTuned', () => {
      const goal = { type: 'padTuned', pad: 'pad1', minSemitones: 5 } satisfies GoalAssertion
      expect(assertionProgress(goal, withPad('pad1', { tune: -3 }))).toMatchObject({ met: false, current: -3 })
      expect(assertionProgress(goal, withPad('pad1', { tune: -5 })).met).toBe(true)
    })
  })
})

describe('isGoalMet — derived from progress', () => {
  it('is met exactly when every assertion reports met', () => {
    const lesson = parseLesson({
      ...validLesson,
      goal: [
        { type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12] },
        { type: 'bpmInRange', min: 138, max: 145 },
      ],
    })
    const context = { ...patternWithKicksOn([0, 4, 8, 12]), bpm: 130 }
    expect(lesson.goal.map((goal) => assertionProgress(goal, context).met)).toEqual([true, false])
    expect(isGoalMet(lesson, context)).toBe(false)
    expect(isGoalMet(lesson, { ...context, bpm: 140 })).toBe(true)
  })
})

describe('parseLesson — goal label', () => {
  it('keeps a non-empty label that overrides the chip noun', () => {
    const lesson = parseLesson({
      ...validLesson,
      goal: [{ type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12], label: 'Downbeats' }],
    })
    expect(lesson.goal[0].label).toBe('Downbeats')
  })

  it('omits the label when the goal has none', () => {
    expect('label' in parseLesson(validLesson).goal[0]).toBe(false)
  })

  it('rejects an empty or non-string label', () => {
    for (const label of ['', '   ', 4]) {
      expect(() =>
        parseLesson({
          ...validLesson,
          goal: [{ type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12], label }],
        }),
      ).toThrow(/label/)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { parseLesson, type GoalAssertion, type GoalContext } from './lesson'
import { toggleNoteStep } from './note'
import { createInitialPattern, cycleStep, toggleStep } from './pattern'
import {
  chipMetAnnouncement,
  chipsNewlyMet,
  lessonCompleteAnnouncement,
  progressChip,
  progressChips,
  sameChips,
} from './progressChip'
import { CURATED_SAMPLE_SOURCE, createSamplerSettings, type SampleSource } from './sampler'
import type { Pattern } from './types'

const empty: GoalContext = { pattern: createInitialPattern() }

function kicksOn(steps: number[]): Pattern {
  return steps.reduce<Pattern>((p, step) => toggleStep(p, 'kick', step), createInitialPattern())
}

function text(goal: GoalAssertion, context: GoalContext = empty): string {
  return progressChip(goal, context).text
}

describe('progressChip — exact placement', () => {
  const kicks: GoalAssertion = { type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12] }

  it('reads wanted steps placed out of the total, named by the lane', () => {
    expect(progressChip(kicks, { pattern: kicksOn([0, 4, 8]) })).toEqual({
      text: 'Kick 3/4',
      met: false,
    })
  })

  it('counts extras without saying which steps they are', () => {
    expect(text(kicks, { pattern: kicksOn([0, 4, 8, 3]) })).toBe('Kick 3/4 · 1 extra')
    expect(text(kicks, { pattern: kicksOn([0, 4, 8, 12, 1, 2]) })).toBe('Kick 4/4 · 2 extra')
  })

  it('is met only with every wanted step and no extras', () => {
    expect(progressChip(kicks, { pattern: kicksOn([0, 4, 8, 12]) }).met).toBe(true)
    expect(progressChip(kicks, { pattern: kicksOn([0, 4, 8, 12, 3]) }).met).toBe(false)
  })

  it('uses the lane display label, not its id', () => {
    expect(text({ type: 'stepsActive', lane: 'snare', steps: [4, 12] })).toBe('Clap 0/2')
    expect(text({ type: 'stepsActive', lane: 'closedHat', steps: [2] })).toBe('Closed Hat 0/1')
  })

  it('names accents and notes', () => {
    const accented = cycleStep(cycleStep(createInitialPattern(), 'kick', 0), 'kick', 0)
    expect(
      text({ type: 'stepsAccented', lane: 'kick', steps: [0, 8] }, { pattern: accented }),
    ).toBe('Kick accents 1/2')
    const bass = toggleNoteStep(createInitialPattern(), 'bass', 3)
    expect(text({ type: 'notesActive', lane: 'bass', steps: [2, 6] }, { pattern: bass })).toBe(
      'Bass 0/2 · 1 extra',
    )
  })
})

describe('progressChip — counts, sweeps and chords', () => {
  it('reads a minimum count capped at the minimum', () => {
    const pattern = [0, 1, 2, 3, 4].reduce<Pattern>(
      (p, step) => toggleNoteStep(p, 'stab', step),
      createInitialPattern(),
    )
    expect(text({ type: 'notesPlaced', lane: 'stab', min: 2 }, { pattern })).toBe('Stab notes 2/2')
    expect(text({ type: 'pitchesVaried', lane: 'bass', min: 3 })).toBe('Bass pitches 0/3')
    expect(text({ type: 'padStepsPlaced', min: 4 })).toBe('Pad steps 0/4')
  })

  it('reads a sweep as a percentage of the travel it asks for, named by the knob', () => {
    const goal: GoalAssertion = { type: 'paramSwept', param: 'cutoff', minTravel: 0.5 }
    expect(text(goal, { ...empty, motion: { cutoff: { min: 0.2, max: 0.5 } } })).toBe(
      'Cutoff sweep 60%',
    )
    expect(text(goal)).toBe('Cutoff sweep 0%')
    // Never reads full until the goal is met.
    expect(text(goal, { ...empty, motion: { cutoff: { min: 0, max: 0.4999 } } })).toBe(
      'Cutoff sweep 99%',
    )
    expect(progressChip(goal, { ...empty, motion: { cutoff: { min: 0, max: 0.9 } } })).toEqual({
      text: 'Cutoff sweep 100%',
      met: true,
    })
  })

  it('reads notes held together for a chord', () => {
    expect(
      text({ type: 'chordPlayed', minNotes: 3 }, { ...empty, chord: { held: {}, maxNotes: 2 } }),
    ).toBe('Chord 2/3')
  })
})

describe('progressChip — ranges', () => {
  it('reads the current tempo against the range', () => {
    const goal: GoalAssertion = { type: 'bpmInRange', min: 138, max: 145 }
    expect(text(goal, { ...empty, bpm: 130 })).toBe('Tempo 130 → 138–145')
    // Never rounded into the range while the goal still says no.
    expect(progressChip(goal, { ...empty, bpm: 137.6 })).toEqual({
      text: 'Tempo 137.6 → 138–145',
      met: false,
    })
    expect(progressChip(goal, { ...empty, bpm: 140 })).toEqual({
      text: 'Tempo 140 → 138–145',
      met: true,
    })
  })

  it('reads the current swing in whole percent against the range', () => {
    expect(text({ type: 'swingInRange', min: 54, max: 70 }, { ...empty, swing: 0.5 })).toBe(
      'Swing 50% → 54–70%',
    )
  })
})

describe('progressChip — the sampler', () => {
  const upload: SampleSource = { id: 'mine', name: 'Mine', origin: 'upload', duration: 4, channels: 2 }
  const pads = createSamplerSettings()
  function sampler(padSettings: Partial<typeof pads> = {}, sources = [CURATED_SAMPLE_SOURCE]) {
    return { ...empty, sampler: { pads: { ...pads, ...padSettings }, sources } }
  }
  const chop = (start: number, duration: number) => ({
    ...pads.pad1,
    region: { sourceId: CURATED_SAMPLE_SOURCE.id, start, duration },
  })

  it('counts sounds brought in and pads chopped', () => {
    expect(text({ type: 'sourceLoaded', origin: 'user', min: 1 }, sampler())).toBe('Your sounds 0/1')
    expect(text({ type: 'sourceLoaded', origin: 'recording', min: 1 }, sampler())).toBe(
      'Recordings 0/1',
    )
    expect(text({ type: 'padAssigned', min: 3 }, sampler({ pad1: chop(0, 0.3) }))).toBe(
      'Pads chopped 1/3',
    )
    expect(
      text({ type: 'padAssigned', min: 1, origin: 'user' }, sampler({}, [CURATED_SAMPLE_SOURCE, upload])),
    ).toBe('Your chops 0/1')
  })

  it('reads a chop start, without the window it is aiming for', () => {
    const goal: GoalAssertion = {
      type: 'regionStartsWithin',
      pad: 'pad1',
      source: CURATED_SAMPLE_SOURCE.id,
      from: 0.4,
      to: 0.53,
    }
    expect(text(goal, sampler({ pad1: chop(0.7, 0.3) }))).toBe('Pad 1 start 0.70 s')
    expect(text(goal, sampler())).toBe('Pad 1 start —')
  })

  it('reads a chop length, a fit and a tune against their targets', () => {
    expect(
      text({ type: 'regionShorterThan', pad: 'pad1', seconds: 0.4 }, sampler({ pad1: chop(0.45, 0.6) })),
    ).toBe('Pad 1 length 0.60 s → ≤0.40 s')
    expect(text({ type: 'regionShorterThan', pad: 'pad1', seconds: 0.4 }, sampler())).toBe(
      'Pad 1 length — → ≤0.40 s',
    )
    expect(
      text({ type: 'fitTargetSet', pad: 'pad2', minSteps: 16 }, sampler({ pad2: { ...chop(0, 2), fit: 8 } })),
    ).toBe('Pad 2 fit 8 → 16 steps')
    expect(text({ type: 'fitTargetSet', pad: 'pad2', minSteps: 8 }, sampler())).toBe(
      'Pad 2 fit off → 8+ steps',
    )
    expect(
      text({ type: 'padTuned', pad: 'pad1', minSemitones: 5 }, sampler({ pad1: { ...pads.pad1, tune: 3 } })),
    ).toBe('Pad 1 tune +3 → ±5 st')
    expect(
      text({ type: 'padTuned', pad: 'pad1', minSemitones: 5 }, sampler({ pad1: { ...pads.pad1, tune: -7 } })),
    ).toBe('Pad 1 tune −7 → ±5 st')
  })
})

describe('progressChip — label override', () => {
  it('replaces the generated noun and keeps the progress', () => {
    expect(
      text(
        { type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12], label: 'Downbeats' },
        { pattern: kicksOn([0, 3]) },
      ),
    ).toBe('Downbeats 1/4 · 1 extra')
    expect(
      text({ type: 'bpmInRange', min: 138, max: 145, label: 'Peak time' }, { ...empty, bpm: 130 }),
    ).toBe('Peak time 130 → 138–145')
  })
})

describe('progressChips', () => {
  it('gives one chip per assertion, in goal order', () => {
    const lesson = parseLesson({
      id: 'two',
      title: 'Two',
      intro: 'Both.',
      spotlight: [],
      goal: [
        { type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12] },
        { type: 'bpmInRange', min: 138, max: 145 },
      ],
    })
    expect(progressChips(lesson, { pattern: kicksOn([0, 4, 8, 12]), bpm: 130 })).toEqual([
      { text: 'Kick 4/4', met: true },
      { text: 'Tempo 130 → 138–145', met: false },
    ])
  })
})

describe('announcements', () => {
  const kick = { text: 'Kick 3/4', met: false }
  const kickDone = { text: 'Kick 4/4', met: true }
  const clap = { text: 'Clap 1/2', met: false }

  it('names only chips that just became met', () => {
    expect(chipsNewlyMet([kick, clap], [kickDone, { text: 'Clap 2/2', met: false }])).toEqual([
      kickDone,
    ])
  })

  it('stays quiet on count changes and on a chip that was already met', () => {
    expect(chipsNewlyMet([kick, clap], [{ text: 'Kick 2/4', met: false }, clap])).toEqual([])
    expect(chipsNewlyMet([kickDone], [kickDone])).toEqual([])
  })

  it('stays quiet with no baseline, or a baseline from a different goal list', () => {
    expect(chipsNewlyMet(null, [kickDone])).toEqual([])
    expect(chipsNewlyMet([kick], [kickDone, clap])).toEqual([])
  })

  it('says a chip is done, and a lesson is complete', () => {
    expect(chipMetAnnouncement([kickDone])).toBe('Kick 4/4 done')
    expect(chipMetAnnouncement([kickDone, { text: 'Clap 2/2', met: true }])).toBe(
      'Kick 4/4 done. Clap 2/2 done',
    )
    expect(
      lessonCompleteAnnouncement(
        parseLesson({ id: 'x', title: 'Four on the Floor', intro: 'i', spotlight: [], goal: [{ type: 'bpmInRange', min: 60, max: 200 }] }),
      ),
    ).toBe('Lesson complete: Four on the Floor')
  })
})

describe('sameChips', () => {
  it('compares chips by what they show', () => {
    expect(sameChips([{ text: 'Kick 3/4', met: false }], [{ text: 'Kick 3/4', met: false }])).toBe(true)
    expect(sameChips([{ text: 'Kick 3/4', met: false }], [{ text: 'Kick 4/4', met: false }])).toBe(false)
    expect(sameChips([], [{ text: 'Kick 4/4', met: true }])).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { detectLessonCompletion, goalContextFor, lessonsAlreadyMet } from '../model/arc'
import { DECK_PARAM_IDS } from '../model/deckParams'
import {
  isGoalMet,
  spotlitParamIds,
  type GoalAssertion,
  type GoalContext,
  type GoalOrigin,
  type Lesson,
  type SamplerGoalContext,
} from '../model/lesson'
import { NOTE_LANES } from '../model/note'
import { createDemoPattern, createInitialPattern } from '../model/pattern'
import { createDemoProjectState } from '../model/projectState'
import { MAX_SLICE_SECONDS } from '../model/region'
import {
  CURATED_SAMPLE_SOURCE,
  PAD_LANES,
  createSamplerSettings,
  type SampleSource,
} from '../model/sampler'
import { DEFAULT_BPM } from '../model/transport'
import type { DrumLaneId, NoteLaneId, PadLaneId, Pattern } from '../model/types'
import { ALL_LESSONS, ARCS, arcById } from './index'

const TECHNO = arcById('techno')
const SAMPLING = arcById('sampling')

/**
 * The deck exactly as a first-time user finds it: demo groove, default tempo,
 * the curated source installed and every pad empty.
 */
function openingContext(): GoalContext {
  return goalContextFor(createDemoProjectState())
}

function goalTypes(arc: Lesson[]): Set<GoalAssertion['type']> {
  return new Set(arc.flatMap((lesson) => lesson.goal.map((goal) => goal.type)))
}

/** Every lane id any assertion of the arc points at, by kind. */
function goalLanes(arc: Lesson[], kind: 'drum' | 'note'): Set<string> {
  const drumTypes = ['stepsActive', 'stepsAccented']
  return new Set(
    arc.flatMap((lesson) =>
      lesson.goal.flatMap((goal) => {
        if (!('lane' in goal)) return []
        const isDrum = drumTypes.includes(goal.type)
        return (kind === 'drum') === isDrum ? [goal.lane as string] : []
      }),
    ),
  )
}

function setDrumSteps(
  pattern: Pattern,
  laneId: DrumLaneId,
  on: Set<number>,
  accented?: Set<number>,
): Pattern {
  return {
    ...pattern,
    lanes: pattern.lanes.map((lane) =>
      lane.id === laneId
        ? {
            ...lane,
            steps: lane.steps.map((step, index) => ({
              on: on.has(index),
              accent: accented ? accented.has(index) : step.accent && on.has(index),
            })),
          }
        : lane,
    ),
  }
}

function setNoteSteps(pattern: Pattern, laneId: NoteLaneId, on: Set<number>): Pattern {
  return {
    ...pattern,
    noteLanes: pattern.noteLanes.map((lane) =>
      lane.id === laneId
        ? {
            ...lane,
            steps: lane.steps.map((step, index) => ({ ...step, on: on.has(index) })),
          }
        : lane,
    ),
  }
}

function activeDrumStepIndexes(pattern: Pattern, laneId: DrumLaneId): Set<number> {
  const lane = pattern.lanes.find((candidate) => candidate.id === laneId)!
  return new Set(lane.steps.flatMap((step, index) => (step.on ? [index] : [])))
}

function activeNoteStepIndexes(pattern: Pattern, laneId: NoteLaneId): Set<number> {
  const lane = pattern.noteLanes.find((candidate) => candidate.id === laneId)!
  return new Set(lane.steps.flatMap((step, index) => (step.on ? [index] : [])))
}

/** Pad steps switched on, counted the way the evaluator counts them. */
function placedPadSteps(pattern: Pattern): number {
  return pattern.padLanes.reduce(
    (placed, lane) => placed + lane.steps.filter((step) => step.on).length,
    0,
  )
}

/** Exactly `count` pad steps on, spread across the pads, and nothing else. */
function setPadSteps(pattern: Pattern, count: number): Pattern {
  let placed = 0
  return {
    ...pattern,
    padLanes: pattern.padLanes.map((lane) => ({
      ...lane,
      steps: lane.steps.map(() => {
        const on = placed < count
        if (on) placed += 1
        return { on, accent: false }
      }),
    })),
  }
}

/** A source of whatever origin a goal asked for, distinct from the shipped one. */
function sourceOfOrigin(origin: GoalOrigin, index: number): SampleSource {
  return {
    id: `learner-source-${index}`,
    name: `Learner Source ${index}`,
    origin: origin === 'user' ? 'upload' : origin,
    duration: 4,
    channels: 2,
  }
}

const EMPTY_SAMPLER: SamplerGoalContext = {
  pads: createSamplerSettings(),
  sources: [CURATED_SAMPLE_SOURCE],
}

function withSampler(
  context: GoalContext,
  edit: (sampler: SamplerGoalContext) => SamplerGoalContext,
): GoalContext {
  return { ...context, sampler: edit(context.sampler ?? EMPTY_SAMPLER) }
}

/** A chop on one pad, keeping whatever edges are already there. */
function withPadRegion(
  sampler: SamplerGoalContext,
  padId: PadLaneId,
  region: { sourceId?: string; start?: number; duration?: number },
): SamplerGoalContext {
  const pad = sampler.pads[padId]
  const current = pad.region ?? {
    sourceId: CURATED_SAMPLE_SOURCE.id,
    start: 0,
    duration: 0.25,
  }
  return {
    ...sampler,
    pads: { ...sampler.pads, [padId]: { ...pad, region: { ...current, ...region } } },
  }
}

/**
 * Build one worked, known-good example directly from a shipped lesson's JSON.
 * This is deliberately independent of isGoalMet: it edits the public Pattern,
 * sampler and session-observation shapes, then lets the evaluator prove it
 * recognizes the result.
 */
function satisfyingContext(lesson: Lesson): GoalContext {
  let context: GoalContext = {
    pattern: createInitialPattern(),
    bpm: DEFAULT_BPM,
    sampler: EMPTY_SAMPLER,
  }

  for (const goal of lesson.goal) {
    switch (goal.type) {
      case 'stepsActive':
        context = {
          ...context,
          pattern: setDrumSteps(context.pattern, goal.lane, new Set(goal.steps)),
        }
        break
      case 'stepsAccented': {
        const on = activeDrumStepIndexes(context.pattern, goal.lane)
        goal.steps.forEach((step) => on.add(step))
        context = {
          ...context,
          pattern: setDrumSteps(context.pattern, goal.lane, on, new Set(goal.steps)),
        }
        break
      }
      case 'notesActive':
        context = {
          ...context,
          pattern: setNoteSteps(context.pattern, goal.lane, new Set(goal.steps)),
        }
        break
      case 'notesPlaced': {
        const on = activeNoteStepIndexes(context.pattern, goal.lane)
        for (let step = 0; on.size < goal.min; step += 1) on.add(step)
        context = { ...context, pattern: setNoteSteps(context.pattern, goal.lane, on) }
        break
      }
      case 'pitchesVaried': {
        const spec = NOTE_LANES.find((candidate) => candidate.id === goal.lane)!
        const on = activeNoteStepIndexes(context.pattern, goal.lane)
        for (let step = 0; on.size < goal.min; step += 1) on.add(step)
        const active = [...on].sort((a, b) => a - b)
        context = {
          ...context,
          pattern: {
            ...setNoteSteps(context.pattern, goal.lane, on),
            noteLanes: context.pattern.noteLanes.map((noteLane) =>
              noteLane.id === goal.lane
                ? {
                    ...noteLane,
                    steps: noteLane.steps.map((step, index) => {
                      const activeIndex = active.indexOf(index)
                      return activeIndex < 0
                        ? step
                        : { ...step, on: true, pitch: spec.minPitch + activeIndex }
                    }),
                  }
                : noteLane,
            ),
          },
        }
        break
      }
      case 'bpmInRange':
        context = { ...context, bpm: goal.min }
        break
      case 'paramSwept':
        context = {
          ...context,
          motion: {
            ...context.motion,
            [goal.param]: { min: 0, max: goal.minTravel },
          },
        }
        break
      case 'chordPlayed':
        context = { ...context, chord: { held: {}, maxNotes: goal.minNotes } }
        break
      case 'sourceLoaded':
        context = withSampler(context, (sampler) => ({
          ...sampler,
          sources: [
            CURATED_SAMPLE_SOURCE,
            ...Array.from({ length: goal.min }, (_, index) =>
              sourceOfOrigin(goal.origin, index),
            ),
          ],
        }))
        break
      case 'padAssigned':
        context = withSampler(context, (sampler) => {
          const brought = goal.origin ? sourceOfOrigin(goal.origin, 0) : CURATED_SAMPLE_SOURCE
          const sources = sampler.sources.some((source) => source.id === brought.id)
            ? sampler.sources
            : [...sampler.sources, brought]
          return PAD_LANES.slice(0, goal.min).reduce(
            (built, pad) => withPadRegion(built, pad.id, { sourceId: brought.id }),
            { ...sampler, sources },
          )
        })
        break
      case 'regionStartsWithin':
        // The existing duration is kept, so a lesson that also asks for a tight
        // trim is not quietly undone by the order these are applied in.
        context = withSampler(context, (sampler) =>
          withPadRegion(sampler, goal.pad, {
            sourceId: goal.source,
            start: (goal.from + goal.to) / 2,
          }),
        )
        break
      case 'regionShorterThan':
        context = withSampler(context, (sampler) =>
          withPadRegion(sampler, goal.pad, { duration: goal.seconds }),
        )
        break
      case 'fitTargetSet':
        context = withSampler(context, (sampler) => {
          const withRegion = withPadRegion(sampler, goal.pad, {})
          return {
            ...withRegion,
            pads: {
              ...withRegion.pads,
              [goal.pad]: { ...withRegion.pads[goal.pad], fit: goal.minSteps },
            },
          }
        })
        break
      case 'padTuned':
        context = withSampler(context, (sampler) => ({
          ...sampler,
          pads: {
            ...sampler.pads,
            [goal.pad]: { ...sampler.pads[goal.pad], tune: goal.minSemitones },
          },
        }))
        break
      case 'padStepsPlaced':
        context = { ...context, pattern: setPadSteps(context.pattern, goal.min) }
        break
    }
  }

  return context
}

/** Break one assertion in an otherwise satisfying context. */
function nearMiss(context: GoalContext, goal: GoalAssertion): GoalContext {
  switch (goal.type) {
    case 'stepsActive': {
      const on = activeDrumStepIndexes(context.pattern, goal.lane)
      on.delete(goal.steps[0])
      return { ...context, pattern: setDrumSteps(context.pattern, goal.lane, on) }
    }
    case 'stepsAccented': {
      const lane = context.pattern.lanes.find((candidate) => candidate.id === goal.lane)!
      const on = activeDrumStepIndexes(context.pattern, goal.lane)
      const accented = new Set(
        lane.steps.flatMap((step, index) => (step.accent ? [index] : [])),
      )
      accented.delete(goal.steps[0])
      return {
        ...context,
        pattern: setDrumSteps(context.pattern, goal.lane, on, accented),
      }
    }
    case 'notesActive': {
      const on = activeNoteStepIndexes(context.pattern, goal.lane)
      on.delete(goal.steps[0])
      return { ...context, pattern: setNoteSteps(context.pattern, goal.lane, on) }
    }
    case 'notesPlaced':
      return {
        ...context,
        pattern: setNoteSteps(
          context.pattern,
          goal.lane,
          new Set(Array.from({ length: goal.min - 1 }, (_, index) => index)),
        ),
      }
    case 'pitchesVaried': {
      const lane = context.pattern.noteLanes.find((candidate) => candidate.id === goal.lane)!
      const pitch = lane.steps.find((step) => step.on)!.pitch
      return {
        ...context,
        pattern: {
          ...context.pattern,
          noteLanes: context.pattern.noteLanes.map((noteLane) =>
            noteLane.id === goal.lane
              ? {
                  ...noteLane,
                  steps: noteLane.steps.map((step) =>
                    step.on ? { ...step, pitch } : step,
                  ),
                }
              : noteLane,
          ),
        },
      }
    }
    case 'bpmInRange':
      return { ...context, bpm: goal.min - 1 }
    case 'paramSwept':
      return {
        ...context,
        motion: {
          ...context.motion,
          [goal.param]: { min: 0, max: goal.minTravel / 2 },
        },
      }
    case 'chordPlayed':
      return { ...context, chord: { held: {}, maxNotes: goal.minNotes - 1 } }
    case 'sourceLoaded':
      return withSampler(context, (sampler) => ({
        ...sampler,
        sources: sampler.sources.filter(
          (source) =>
            source.origin === 'shipped' ||
            !(goal.origin === 'user' || source.origin === goal.origin),
        ),
      }))
    case 'padAssigned':
      // Emptied from the far end, so a pad another assertion of the same lesson
      // names — always the low-numbered one — is left exactly as it was.
      return withSampler(context, (sampler) => {
        const last = [...PAD_LANES]
          .reverse()
          .find((pad) => sampler.pads[pad.id].region !== null)!
        return {
          ...sampler,
          pads: { ...sampler.pads, [last.id]: { ...sampler.pads[last.id], region: null } },
        }
      })
    case 'regionStartsWithin':
      return withSampler(context, (sampler) =>
        withPadRegion(sampler, goal.pad, { start: goal.to + 0.05 }),
      )
    case 'regionShorterThan':
      return withSampler(context, (sampler) =>
        withPadRegion(sampler, goal.pad, {
          duration: Math.min(goal.seconds * 2, MAX_SLICE_SECONDS),
        }),
      )
    case 'fitTargetSet':
      return withSampler(context, (sampler) => ({
        ...sampler,
        pads: { ...sampler.pads, [goal.pad]: { ...sampler.pads[goal.pad], fit: null } },
      }))
    case 'padTuned':
      return withSampler(context, (sampler) => ({
        ...sampler,
        pads: { ...sampler.pads, [goal.pad]: { ...sampler.pads[goal.pad], tune: 0 } },
      }))
    case 'padStepsPlaced':
      return { ...context, pattern: setPadSteps(context.pattern, goal.min - 1) }
  }
}

describe('the curriculum', () => {
  it('registers more than one track, each with a title, a blurb and an ending', () => {
    expect(ARCS.length).toBeGreaterThanOrEqual(2)
    for (const arc of ARCS) {
      expect(arc.id.length).toBeGreaterThan(0)
      expect(arc.title.length).toBeGreaterThan(0)
      expect(arc.blurb.length).toBeGreaterThan(10)
      expect(arc.lessons.length).toBeGreaterThan(0)
      expect(arc.finale.headline.length).toBeGreaterThan(0)
    }
    expect(new Set(ARCS.map((arc) => arc.id)).size).toBe(ARCS.length)
  })

  it('gives every lesson on every track a unique id, a title, and intro text', () => {
    // Ids are unique across tracks, not only within one: progress is a single
    // flat map, so a collision would let one track's work earn another's lesson.
    const ids = ALL_LESSONS.map((lesson) => lesson.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const lesson of ALL_LESSONS) {
      expect(lesson.title.length).toBeGreaterThan(0)
      expect(lesson.intro.length).toBeGreaterThan(20)
      expect(lesson.goal.length).toBeGreaterThan(0)
    }
  })

  it('opens with none of its lessons already earned, on either track', () => {
    // The deck ships grooving and ships a source to chop, but every arc must
    // stay unearned: a lesson already complete the moment it is opened is a
    // false positive, and the celebration for it would be hollow.
    for (const lesson of ALL_LESSONS) {
      expect([lesson.id, isGoalMet(lesson, openingContext())]).toEqual([lesson.id, false])
    }
  })

  it('names only knobs the deck actually has, on every track', () => {
    for (const lesson of ALL_LESSONS) {
      for (const paramId of spotlitParamIds(lesson)) expect(DECK_PARAM_IDS).toContain(paramId)
      for (const goal of lesson.goal) {
        if (goal.type === 'paramSwept') expect(DECK_PARAM_IDS).toContain(goal.param)
      }
    }
  })

  it('recognizes a known-good completion example for every shipped lesson', () => {
    for (const arc of ARCS) {
      for (const lesson of arc.lessons) {
        const completion = detectLessonCompletion(
          arc.lessons,
          lesson,
          false,
          satisfyingContext(lesson),
        )
        expect([arc.id, lesson.id, completion.justCompleted, completion.showFinale]).toEqual([
          arc.id,
          lesson.id,
          true,
          lesson === arc.lessons[arc.lessons.length - 1],
        ])
      }
    }
  })

  it('keeps every assertion necessary, so one near miss cannot complete a lesson', () => {
    for (const arc of ARCS) {
      for (const lesson of arc.lessons) {
        const complete = satisfyingContext(lesson)
        for (const goal of lesson.goal) {
          const completion = detectLessonCompletion(
            arc.lessons,
            lesson,
            false,
            nearMiss(complete, goal),
          )
          expect([lesson.id, goal.type, completion]).toEqual([
            lesson.id,
            goal.type,
            { justCompleted: false, showFinale: false },
          ])
        }
      }
    }
  })

  it('spotlights something for all but the free-play lessons of each track', () => {
    for (const arc of ARCS) {
      const withSpotlight = arc.lessons.filter((lesson) => lesson.spotlight.length > 0)
      expect(withSpotlight.length).toBeGreaterThanOrEqual(arc.lessons.length - 2)
    }
  })
})

describe('the techno arc', () => {
  it('is one ordered path of 10–15 lessons, silence → groove', () => {
    expect(TECHNO.lessons.length).toBeGreaterThanOrEqual(10)
    expect(TECHNO.lessons.length).toBeLessThanOrEqual(15)
    expect(TECHNO.lessons[0].id).toBe('four-on-the-floor')
    expect(TECHNO.lessons[TECHNO.lessons.length - 1].id).toBe('your-first-techno-groove')
  })

  it('covers rhythm, bass, sound design, and stabs', () => {
    // Rhythm: more than one drum lane, and dynamics as well as placement.
    expect(goalLanes(TECHNO.lessons, 'drum').size).toBeGreaterThanOrEqual(3)
    expect(goalTypes(TECHNO.lessons)).toContain('stepsAccented')
    // Bass and stabs both get programmed.
    expect(goalLanes(TECHNO.lessons, 'note')).toContain('bass')
    expect(goalLanes(TECHNO.lessons, 'note')).toContain('stab')
    // Sound design: the synth's own knobs, moved on a running loop.
    expect(goalTypes(TECHNO.lessons)).toContain('paramSwept')
    // And the keyboard is played live, not only programmed.
    expect(goalTypes(TECHNO.lessons)).toContain('chordPlayed')
  })

  it('finishes with a capstone that asks for the whole groove at once', () => {
    expect(TECHNO.lessons[TECHNO.lessons.length - 1].goal.length).toBeGreaterThanOrEqual(4)
  })

  it('ships a demo that stays inside the arc, so a lesson is always "add", never "delete"', () => {
    // The rule that keeps the demo and the curriculum out of each other's way:
    // on any lane a lesson asserts exactly, the demo may only place steps that
    // lesson also wants. Then every lesson is a missing piece to drop in, and
    // none of them opens already won.
    const demo = createDemoPattern()
    const wanted = (laneId: string) =>
      new Set(
        ALL_LESSONS.flatMap((lesson) =>
          lesson.goal.flatMap((goal) =>
            goal.type === 'stepsActive' && goal.lane === laneId ? goal.steps : [],
          ),
        ),
      )

    const strays = demo.lanes
      .filter((lane) => wanted(lane.id).size > 0)
      .filter((lane) => lane.steps.some((step, i) => step.on && !wanted(lane.id).has(i)))
      .map((lane) => lane.id)

    // The open hat is the one deliberate exception: its lesson teaches the 909
    // choke by making the user hear it cut off and move it.
    expect(strays).toEqual(['openHat'])
  })

  it('leaves the perc lane free — the one place the demo can be busy', () => {
    // Nothing in the curriculum asserts perc, which is what lets the demo carry
    // its groove there without ever doing a lesson's work.
    expect(
      ALL_LESSONS.flatMap((lesson) =>
        lesson.goal.filter((goal) => 'lane' in goal && goal.lane === 'perc'),
      ),
    ).toEqual([])
  })
})

describe('the sampling arc', () => {
  it('is six lessons covering loading, chopping, trimming, fitting, tuning and a kit', () => {
    expect(SAMPLING.lessons.map((lesson) => lesson.id)).toEqual([
      'load-a-sound',
      'find-the-chop',
      'trim-it-tight',
      'fit-the-break',
      'tune-a-pad',
      'build-your-own-kit',
    ])
    const types = goalTypes(SAMPLING.lessons)
    expect(types).toContain('sourceLoaded')
    expect(types).toContain('regionStartsWithin')
    expect(types).toContain('regionShorterThan')
    expect(types).toContain('fitTargetSet')
    expect(types).toContain('padTuned')
    expect(types).toContain('padAssigned')
  })

  it('opens unearned with the curated source installed and the pads empty', () => {
    // The pre-installed source is what makes a first chop one click away. It
    // must not also be what earns "load a sound" — hence the origin qualifier.
    const opening = createDemoProjectState()
    expect(opening.sources).toEqual([CURATED_SAMPLE_SOURCE])
    expect(PAD_LANES.every((pad) => opening.instrumentSettings.sampler[pad.id].region === null))
      .toBe(true)
    expect(placedPadSteps(createDemoPattern())).toBe(0)

    for (const lesson of SAMPLING.lessons) {
      expect([lesson.id, isGoalMet(lesson, goalContextFor(opening))]).toEqual([lesson.id, false])
    }
  })

  it('is not earned by chopping the shipped source — "load a sound" means your own', () => {
    const loadASound = SAMPLING.lessons[0]
    const chopped = goalContextFor(createDemoProjectState())
    const usingShipped: GoalContext = withSampler(chopped, (sampler) =>
      PAD_LANES.reduce(
        (built, pad) =>
          withPadRegion(built, pad.id, { sourceId: CURATED_SAMPLE_SOURCE.id, start: 0.46 }),
        sampler,
      ),
    )

    expect(isGoalMet(loadASound, usingShipped)).toBe(false)
  })

  it('teaches against a source the app knows, and never against one it does not', () => {
    // A window is only specific because the app ships the file it names; every
    // one of them is checked against that file's real duration at parse time.
    for (const lesson of SAMPLING.lessons) {
      for (const goal of lesson.goal) {
        if (goal.type !== 'regionStartsWithin') continue
        expect(goal.source).toBe(CURATED_SAMPLE_SOURCE.id)
        expect(goal.from).toBeGreaterThanOrEqual(0)
        expect(goal.to).toBeLessThanOrEqual(CURATED_SAMPLE_SOURCE.duration)
      }
    }
  })

  it('never asks for a chop of a source that does not carry one', () => {
    // The window the arc teaches has a real transient in it: the first backbeat
    // of the generated break, two bars at 130 BPM.
    const firstBackbeat = (60 / 130 / 4) * 4
    const chopWindow = SAMPLING.lessons
      .flatMap((lesson) => lesson.goal)
      .find((goal) => goal.type === 'regionStartsWithin')!
    if (chopWindow.type !== 'regionStartsWithin') throw new Error('expected a window goal')
    expect(firstBackbeat).toBeGreaterThan(chopWindow.from)
    expect(firstBackbeat).toBeLessThan(chopWindow.to)
  })
})

describe('inheritance across every registered track', () => {
  it('names sampling work that arrived already done, not only techno work', () => {
    // A bundle carries real audio, so a recipient could otherwise arrive with
    // "build your own kit" already earned — the most obviously unearned
    // completion the product could hand out.
    const arrived = withSampler(
      {
        pattern: setPadSteps(
          setDrumSteps(createInitialPattern(), 'kick', new Set([0, 4, 8, 12])),
          4,
        ),
        bpm: DEFAULT_BPM,
      },
      (sampler) => {
        const theirs: SamplerGoalContext = {
          sources: [
            CURATED_SAMPLE_SOURCE,
            {
              id: 'someone-elses',
              name: 'Their Break',
              origin: 'upload',
              duration: 4,
              channels: 2,
            },
          ],
          pads: { ...sampler.pads, pad1: { ...sampler.pads.pad1, tune: 7 } },
        }
        return PAD_LANES.slice(0, 3).reduce<SamplerGoalContext>(
          (built, pad) => withPadRegion(built, pad.id, { sourceId: 'someone-elses' }),
          theirs,
        )
      },
    )

    const inherited = lessonsAlreadyMet(ALL_LESSONS, arrived)

    // Both tracks are swept, so neither hands out an unearned completion.
    expect(inherited).toContain('build-your-own-kit')
    expect(inherited).toContain('load-a-sound')
    expect(inherited).toContain('four-on-the-floor')
  })
})

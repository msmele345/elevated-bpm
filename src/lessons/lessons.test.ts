import { describe, expect, it } from 'vitest'
import { detectLessonCompletion } from '../model/arc'
import { DECK_PARAM_IDS } from '../model/deckParams'
import {
  isGoalMet,
  spotlitParamIds,
  type GoalAssertion,
  type GoalContext,
  type Lesson,
} from '../model/lesson'
import { NOTE_LANES } from '../model/note'
import { createDemoPattern, createInitialPattern } from '../model/pattern'
import { DEFAULT_BPM } from '../model/transport'
import type { DrumLaneId, NoteLaneId, Pattern } from '../model/types'
import { ARC } from './index'

/** The deck exactly as a first-time user finds it: demo groove, default tempo. */
function openingContext() {
  return { pattern: createDemoPattern(), bpm: DEFAULT_BPM }
}

function goalTypes(): Set<GoalAssertion['type']> {
  return new Set(ARC.flatMap((lesson) => lesson.goal.map((goal) => goal.type)))
}

/** Every lane id any assertion of the arc points at, by kind. */
function goalLanes(kind: 'drum' | 'note'): Set<string> {
  const drumTypes = ['stepsActive', 'stepsAccented']
  return new Set(
    ARC.flatMap((lesson) =>
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

/**
 * Build one worked, known-good example directly from a shipped lesson's JSON.
 * This is deliberately independent of isGoalMet: it edits the public Pattern
 * and session-observation shapes, then lets the evaluator prove it recognizes
 * the result.
 */
function satisfyingContext(lesson: Lesson): GoalContext {
  let context: GoalContext = { pattern: createInitialPattern(), bpm: DEFAULT_BPM }

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
  }
}

describe('the curriculum arc', () => {
  it('is one ordered path of 10–15 lessons, silence → groove', () => {
    expect(ARC.length).toBeGreaterThanOrEqual(10)
    expect(ARC.length).toBeLessThanOrEqual(15)
    expect(ARC[0].id).toBe('four-on-the-floor')
    expect(ARC[ARC.length - 1].id).toBe('your-first-techno-groove')
  })

  it('gives every lesson a unique id, a title, and intro text', () => {
    const ids = ARC.map((lesson) => lesson.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const lesson of ARC) {
      expect(lesson.title.length).toBeGreaterThan(0)
      expect(lesson.intro.length).toBeGreaterThan(20)
      expect(lesson.goal.length).toBeGreaterThan(0)
    }
  })

  it('covers rhythm, bass, sound design, and stabs', () => {
    // Rhythm: more than one drum lane, and dynamics as well as placement.
    expect(goalLanes('drum').size).toBeGreaterThanOrEqual(3)
    expect(goalTypes()).toContain('stepsAccented')
    // Bass and stabs both get programmed.
    expect(goalLanes('note')).toContain('bass')
    expect(goalLanes('note')).toContain('stab')
    // Sound design: the synth's own knobs, moved on a running loop.
    expect(goalTypes()).toContain('paramSwept')
    // And the keyboard is played live, not only programmed.
    expect(goalTypes()).toContain('chordPlayed')
  })

  it('spotlights something for all but the free-play lessons', () => {
    const withSpotlight = ARC.filter((lesson) => lesson.spotlight.length > 0)
    expect(withSpotlight.length).toBeGreaterThanOrEqual(ARC.length - 2)
  })

  it('opens with none of its lessons already earned', () => {
    // The deck ships grooving, but the arc must stay unearned: a lesson that is
    // already complete the moment it is opened is a false positive, and the
    // celebration for it would be hollow.
    for (const lesson of ARC) {
      expect([lesson.id, isGoalMet(lesson, openingContext())]).toEqual([lesson.id, false])
    }
  })

  it('ships a demo that stays inside the arc, so a lesson is always "add", never "delete"', () => {
    // The rule that keeps the demo and the curriculum out of each other's way:
    // on any lane a lesson asserts exactly, the demo may only place steps that
    // lesson also wants. Then every lesson is a missing piece to drop in, and
    // none of them opens already won.
    const demo = createDemoPattern()
    const wanted = (laneId: string) =>
      new Set(
        ARC.flatMap((lesson) =>
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
    // Nothing in the arc asserts perc, which is what lets the demo carry its
    // groove there without ever doing a lesson's work.
    expect(
      ARC.flatMap((lesson) =>
        lesson.goal.filter((goal) => 'lane' in goal && goal.lane === 'perc'),
      ),
    ).toEqual([])
  })

  it('names only knobs the deck actually has', () => {
    // A spotlight or goal pointing at a knob that does not exist would be a
    // lesson the user can never complete and never see highlighted.
    const knobIds = DECK_PARAM_IDS
    for (const lesson of ARC) {
      for (const paramId of spotlitParamIds(lesson)) expect(knobIds).toContain(paramId)
      for (const goal of lesson.goal) {
        if (goal.type === 'paramSwept') expect(knobIds).toContain(goal.param)
      }
    }
  })

  it('finishes with a capstone that asks for the whole groove at once', () => {
    const finale = ARC[ARC.length - 1]
    expect(finale.goal.length).toBeGreaterThanOrEqual(4)
  })

  it('recognizes a known-good completion example for every shipped lesson', () => {
    for (const lesson of ARC) {
      const completion = detectLessonCompletion(ARC, lesson, false, satisfyingContext(lesson))
      expect([lesson.id, completion.justCompleted, completion.showFinale]).toEqual([
        lesson.id,
        true,
        lesson === ARC[ARC.length - 1],
      ])
    }
  })

  it('keeps every assertion necessary, so one near miss cannot complete a lesson', () => {
    for (const lesson of ARC) {
      const complete = satisfyingContext(lesson)
      for (const goal of lesson.goal) {
        const completion = detectLessonCompletion(
          ARC,
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
  })
})

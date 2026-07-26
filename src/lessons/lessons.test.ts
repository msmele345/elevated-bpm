import { describe, expect, it } from 'vitest'
import { BASS_PARAMS } from '../model/bass'
import { isGoalMet, spotlitParamIds, type GoalAssertion } from '../model/lesson'
import { createDemoPattern } from '../model/pattern'
import { DEFAULT_BPM } from '../model/transport'
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

  it('names only knobs the deck actually has', () => {
    // A spotlight or goal pointing at a knob that does not exist would be a
    // lesson the user can never complete and never see highlighted.
    const knobIds = new Set(BASS_PARAMS.map((param) => param.id as string))
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
})

import { describe, expect, it } from 'vitest'
import {
  isGoalMet,
  parseLesson,
  spotlitLaneIds,
  spotlitParamIds,
  type GoalContext,
} from './lesson'
import { createInitialPattern, toggleStep } from './pattern'
import type { Pattern } from './types'

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

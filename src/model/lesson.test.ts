import { describe, expect, it } from 'vitest'
import { isGoalMet, parseLesson, spotlitLaneIds } from './lesson'
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

  it('rejects out-of-range or non-numeric goal steps', () => {
    const badSteps = {
      ...validLesson,
      goal: [{ type: 'stepsActive', lane: 'kick', steps: [0, 16] }],
    }
    expect(() => parseLesson(badSteps)).toThrow(/steps/)
  })
})

function patternWithKicksOn(steps: number[]): Pattern {
  return steps.reduce((p, step) => toggleStep(p, 'kick', step), createInitialPattern())
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

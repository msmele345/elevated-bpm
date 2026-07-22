import { describe, expect, it } from 'vitest'
import { isGoalMet, parseLesson } from '../model/lesson'
import { createDemoPattern } from '../model/pattern'
import fourOnTheFloor from './four-on-the-floor.json'

describe('shipped lesson definitions', () => {
  it('four-on-the-floor loads from its JSON definition', () => {
    const lesson = parseLesson(fourOnTheFloor)
    expect(lesson.id).toBe('four-on-the-floor')
    expect(lesson.spotlight).toContain('lane:kick')
    expect(lesson.goal).toEqual([{ type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12] }])
  })

  it('the shipped demo pattern leaves four-on-the-floor unearned', () => {
    // The demo must sound like techno without doing the lesson's work for the
    // user: it programs everything but the kick, so opening the app never
    // fires the completion celebration before a single step is tapped.
    expect(isGoalMet(parseLesson(fourOnTheFloor), createDemoPattern())).toBe(false)
  })
})

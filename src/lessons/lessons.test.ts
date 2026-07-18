import { describe, expect, it } from 'vitest'
import { parseLesson } from '../model/lesson'
import fourOnTheFloor from './four-on-the-floor.json'

describe('shipped lesson definitions', () => {
  it('four-on-the-floor loads from its JSON definition', () => {
    const lesson = parseLesson(fourOnTheFloor)
    expect(lesson.id).toBe('four-on-the-floor')
    expect(lesson.spotlight).toContain('lane:kick')
    expect(lesson.goal).toEqual([{ type: 'stepsActive', lane: 'kick', steps: [0, 4, 8, 12] }])
  })
})

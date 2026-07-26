import { describe, expect, it } from 'vitest'
import { activeArcLesson, arcCompletion, arcEntries, nextUnfinishedLessonId } from './arc'
import { parseLesson, type Lesson } from './lesson'
import type { LessonProgress } from './projectState'

function lesson(id: string): Lesson {
  return parseLesson({
    id,
    title: id,
    intro: `Do ${id}.`,
    spotlight: [],
    goal: [{ type: 'stepsActive', lane: 'kick', steps: [0] }],
  })
}

const ARC = ['one', 'two', 'three'].map(lesson)

function progressOf(...completedIds: string[]): Record<string, LessonProgress> {
  return Object.fromEntries(completedIds.map((id) => [id, { completed: true, dismissed: true }]))
}

describe('activeArcLesson', () => {
  it('follows the path when nothing is selected: the first lesson still unfinished', () => {
    expect(activeArcLesson(ARC, {}, null).id).toBe('one')
    expect(activeArcLesson(ARC, progressOf('one'), null).id).toBe('two')
    expect(activeArcLesson(ARC, progressOf('one', 'two'), null).id).toBe('three')
  })

  it('honours an explicit selection, forwards or back over finished work', () => {
    expect(activeArcLesson(ARC, {}, 'three').id).toBe('three')
    expect(activeArcLesson(ARC, progressOf('one', 'two'), 'one').id).toBe('one')
  })

  it('stays on a lesson just earned until it is put away, so the celebration lands', () => {
    const justEarned = { one: { completed: true, dismissed: false } }
    expect(activeArcLesson(ARC, justEarned, null).id).toBe('one')
  })

  it('moves on once the earned lesson has been put away', () => {
    const putAway = { one: { completed: true, dismissed: true } }
    expect(activeArcLesson(ARC, putAway, null).id).toBe('two')
  })

  it('rests on the last lesson once the whole arc is complete', () => {
    expect(activeArcLesson(ARC, progressOf('one', 'two', 'three'), null).id).toBe('three')
  })

  it('falls back to the path when the selection names a lesson the arc no longer has', () => {
    expect(activeArcLesson(ARC, progressOf('one'), 'retired-lesson').id).toBe('two')
  })
})

describe('nextUnfinishedLessonId', () => {
  it('is the next lesson down the path that is still unearned', () => {
    expect(nextUnfinishedLessonId(ARC, progressOf('one'), 'one')).toBe('two')
  })

  it('skips lessons already completed out of order', () => {
    expect(nextUnfinishedLessonId(ARC, progressOf('one', 'two'), 'one')).toBe('three')
  })

  it('wraps back to unfinished work left behind', () => {
    expect(nextUnfinishedLessonId(ARC, progressOf('two', 'three'), 'three')).toBe('one')
  })

  it('is null when there is nothing left to earn', () => {
    expect(nextUnfinishedLessonId(ARC, progressOf('one', 'two', 'three'), 'two')).toBeNull()
  })
})

describe('arcCompletion', () => {
  it('counts completed lessons against the whole arc', () => {
    expect(arcCompletion(ARC, {})).toEqual({ completed: 0, total: 3 })
    expect(arcCompletion(ARC, progressOf('one', 'three'))).toEqual({ completed: 2, total: 3 })
  })

  it('ignores progress for lessons that are not in the arc', () => {
    expect(arcCompletion(ARC, progressOf('one', 'retired-lesson'))).toEqual({
      completed: 1,
      total: 3,
    })
  })
})

describe('arcEntries', () => {
  it('is the whole path in order, marking what is done and where the user is', () => {
    const entries = arcEntries(ARC, progressOf('one'), 'two')
    expect(entries.map((entry) => entry.lesson.id)).toEqual(['one', 'two', 'three'])
    expect(entries.map((entry) => entry.position)).toEqual([1, 2, 3])
    expect(entries.map((entry) => entry.completed)).toEqual([true, false, false])
    expect(entries.map((entry) => entry.current)).toEqual([false, true, false])
  })
})

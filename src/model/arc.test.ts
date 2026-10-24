import { describe, expect, it } from 'vitest'
import {
  activeArcLesson,
  arcCompletion,
  arcEntries,
  detectLessonCompletion,
  goalContextFor,
  isFinalArcLesson,
  lessonsAlreadyMet,
  slotsAlreadyMeeting,
  heldAfterCopy,
  nextUnfinishedLessonId,
} from './arc'
import { parseLesson, type Lesson } from './lesson'
import { createInitialPattern, toggleStep } from './pattern'
import {
  activePattern,
  createInitialProjectState,
  cycleActivePatternStep,
  selectSlot,
  setTransportBpm,
  setTransportSwing,
  type LessonProgress,
} from './projectState'

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

describe('isFinalArcLesson', () => {
  it('derives the graduation lesson from the end of the JSON arc', () => {
    expect(isFinalArcLesson(ARC, 'three')).toBe(true)
    expect(isFinalArcLesson(ARC, 'two')).toBe(false)
    expect(isFinalArcLesson([], 'three')).toBe(false)
  })
})

describe('lessonsAlreadyMet', () => {
  const otherGoal = parseLesson({
    id: 'four',
    title: 'four',
    intro: 'Do four.',
    spotlight: [],
    goal: [{ type: 'stepsActive', lane: 'snare', steps: [4] }],
  })
  const mixedArc = [...ARC, otherGoal]

  it('names the lessons a beat satisfies the moment it lands on the deck', () => {
    const arrived = { pattern: toggleStep(createInitialPattern(), 'kick', 0) }

    expect(lessonsAlreadyMet(mixedArc, arrived)).toEqual(new Set(['one', 'two', 'three']))
  })

  it('names nothing for a beat that carries none of the arc work', () => {
    expect(lessonsAlreadyMet(mixedArc, { pattern: createInitialPattern() })).toEqual(new Set())
  })
})

describe('goals and the pattern bank', () => {
  /** A fresh bank with a kick on step 1 of slot B only, and slot `selected` selected. */
  function kickInB(selected: number) {
    const fresh = createInitialProjectState()
    const inB = cycleActivePatternStep(selectSlot(fresh, fresh.patterns[1].id), 'kick', 0)
    return selectSlot(inB, inB.patterns[selected].id)
  }

  it('evaluates goals against the selected slot', () => {
    expect(activePattern(kickInB(1)).name).toBe('B')
    expect(lessonsAlreadyMet(ARC, goalContextFor(kickInB(1)))).toEqual(new Set(['one', 'two', 'three']))
    expect(lessonsAlreadyMet(ARC, goalContextFor(kickInB(0)))).toEqual(new Set())
  })

  it('names, per lesson, every slot of an arriving bank that already satisfies it', () => {
    const bank = kickInB(0)
    expect(slotsAlreadyMeeting(ARC, bank)).toEqual(
      new Map(ARC.map((lesson) => [lesson.id, new Set([bank.patterns[1].id])])),
    )
    expect(slotsAlreadyMeeting(ARC, createInitialProjectState())).toEqual(new Map())
  })

  it("carries a held slot's hold to the slot it is copied onto", () => {
    const held = new Map([
      ['one', new Set(['b'])],
      ['two', new Set(['b', 'd'])],
    ])

    const after = heldAfterCopy(held, 'b', 'c')

    // A copy of the sender's work is still the sender's work.
    expect(after).toEqual(
      new Map([
        ['one', new Set(['b', 'c'])],
        ['two', new Set(['b', 'c', 'd'])],
      ]),
    )
    // The hold being read is never edited in place.
    expect(held.get('one')).toEqual(new Set(['b']))
  })

  it("releases a held slot overwritten by a copy of the learner's own slot", () => {
    const held = new Map([
      ['one', new Set(['b'])],
      ['two', new Set(['b', 'd'])],
    ])

    // Copying the learner's own A over the shared B replaces the sender's work there.
    expect(heldAfterCopy(held, 'a', 'b')).toEqual(new Map([['two', new Set(['d'])]]))
  })
})

describe('detectLessonCompletion', () => {
  const metContext = { pattern: toggleStep(createInitialPattern(), 'kick', 0) }
  const nearMiss = { pattern: createInitialPattern() }

  it('signals a newly met lesson and reserves the finale signal for the capstone', () => {
    expect(detectLessonCompletion(ARC, ARC[0], false, metContext)).toEqual({
      justCompleted: true,
      showFinale: false,
    })
    expect(detectLessonCompletion(ARC, ARC[2], false, metContext)).toEqual({
      justCompleted: true,
      showFinale: true,
    })
  })

  it('does not repeat completion after dismissal, re-entry, or hydration', () => {
    expect(detectLessonCompletion(ARC, ARC[2], true, metContext)).toEqual({
      justCompleted: false,
      showFinale: false,
    })
  })

  it('keeps a near miss incomplete', () => {
    expect(detectLessonCompletion(ARC, ARC[2], false, nearMiss)).toEqual({
      justCompleted: false,
      showFinale: false,
    })
  })
})

describe('goalContextFor', () => {
  it('hands goals the transport as the document holds it — tempo and swing', () => {
    const state = setTransportSwing(setTransportBpm(createInitialProjectState(), 126), 0.62)
    const context = goalContextFor(state)
    expect(context.bpm).toBe(126)
    expect(context.swing).toBe(0.62)
  })
})

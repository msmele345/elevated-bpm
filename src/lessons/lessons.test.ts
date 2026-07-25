import { describe, expect, it } from 'vitest'
import { BASS_PARAMS } from '../model/bass'
import { isGoalMet, parseLesson, spotlitParamIds } from '../model/lesson'
import { createDemoPattern } from '../model/pattern'
import filterSweep from './filter-sweep.json'
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
    expect(isGoalMet(parseLesson(fourOnTheFloor), { pattern: createDemoPattern() })).toBe(false)
  })

  it('filter-sweep loads from its JSON definition and spotlights the cutoff knob', () => {
    const lesson = parseLesson(filterSweep)
    expect(lesson.id).toBe('filter-sweep')
    expect(spotlitParamIds(lesson)).toEqual(['cutoff'])
    expect(lesson.goal).toEqual([{ type: 'paramSwept', param: 'cutoff', minTravel: 0.5 }])
  })

  it('filter-sweep is earned by sweeping the cutoff, not by opening the app', () => {
    const lesson = parseLesson(filterSweep)
    const pattern = createDemoPattern()
    expect(isGoalMet(lesson, { pattern })).toBe(false)
    expect(isGoalMet(lesson, { pattern, motion: { cutoff: { min: 0.05, max: 0.95 } } })).toBe(true)
  })

  it('every shipped lesson names a knob that exists on an instrument', () => {
    // A spotlight or goal pointing at a knob the deck does not have would be a
    // lesson the user can never complete and never see highlighted.
    const knobIds = new Set(BASS_PARAMS.map((param) => param.id as string))
    for (const raw of [fourOnTheFloor, filterSweep]) {
      const lesson = parseLesson(raw)
      for (const paramId of spotlitParamIds(lesson)) expect(knobIds).toContain(paramId)
      for (const goal of lesson.goal) {
        if (goal.type === 'paramSwept') expect(knobIds).toContain(goal.param)
      }
    }
  })
})

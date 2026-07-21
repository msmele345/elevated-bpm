import { describe, expect, it } from 'vitest'
import { createInitialPattern, cycleStep } from '../model/pattern'
import type { Pattern } from '../model/types'
import { ACCENT_GAIN, UNACCENTED_GAIN, hitsAtStep, voiceStep } from './hits'

/** Turn steps on (one click) or on+accented (two clicks). */
function program(
  pattern: Pattern,
  edits: Array<[laneId: Parameters<typeof cycleStep>[1], step: number, accented?: boolean]>,
): Pattern {
  return edits.reduce((p, [laneId, step, accented]) => {
    const on = cycleStep(p, laneId, step)
    return accented ? cycleStep(on, laneId, step) : on
  }, pattern)
}

describe('hitsAtStep', () => {
  it('fires every lane that has that step on, and only those lanes', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0],
      ['closedHat', 0],
      ['snare', 4],
    ])

    expect(hitsAtStep(pattern, 0).map((hit) => hit.laneId)).toEqual(['kick', 'closedHat'])
    expect(hitsAtStep(pattern, 4).map((hit) => hit.laneId)).toEqual(['snare'])
    expect(hitsAtStep(pattern, 1)).toEqual([])
  })

  it('gives accented steps more gain than unaccented ones', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0, true],
      ['kick', 8],
    ])

    expect(hitsAtStep(pattern, 0)[0].gain).toBe(ACCENT_GAIN)
    expect(hitsAtStep(pattern, 8)[0].gain).toBe(UNACCENTED_GAIN)
    expect(ACCENT_GAIN).toBeGreaterThan(UNACCENTED_GAIN)
  })

  it('accents one lane without affecting another lane on the same step', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0, true],
      ['closedHat', 0],
    ])

    const hits = hitsAtStep(pattern, 0)
    expect(hits).toEqual([
      { laneId: 'kick', gain: ACCENT_GAIN },
      { laneId: 'closedHat', gain: UNACCENTED_GAIN },
    ])
  })

  it('does not fire a muted lane', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0],
      ['closedHat', 0],
    ])

    const hits = hitsAtStep(pattern, 0, { closedHat: { muted: true, soloed: false } })
    expect(hits.map((h) => h.laneId)).toEqual(['kick'])
  })

  it('with a lane soloed, only the soloed lane fires', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0],
      ['closedHat', 0],
    ])

    const hits = hitsAtStep(pattern, 0, { closedHat: { muted: false, soloed: true } })
    expect(hits.map((h) => h.laneId)).toEqual(['closedHat'])
  })
})

describe('voiceStep — open-hat choke (909 behavior)', () => {
  it('cuts a ringing open hat when the closed hat fires on a later step', () => {
    // open hat on step 0, closed hat on step 2 — at step 2 the still-ringing
    // open hat must be choked even though it is not firing then.
    const pattern = program(createInitialPattern(), [
      ['openHat', 0],
      ['closedHat', 2],
    ])

    expect(voiceStep(pattern, 2).chokes).toContain('openHat')
    expect(voiceStep(pattern, 2).starts.map((h) => h.laneId)).toEqual(['closedHat'])
  })

  it('when closed and open hat share a step, the closed hat wins and the open hat does not sound', () => {
    const pattern = program(createInitialPattern(), [
      ['closedHat', 4],
      ['openHat', 4],
    ])

    const { starts, chokes } = voiceStep(pattern, 4)
    expect(starts.map((h) => h.laneId)).toEqual(['closedHat'])
    expect(chokes).toContain('openHat')
  })

  it('lets the open hat ring when no closed hat fires', () => {
    const pattern = program(createInitialPattern(), [['openHat', 0]])

    const { starts, chokes } = voiceStep(pattern, 0)
    expect(starts.map((h) => h.laneId)).toEqual(['openHat'])
    expect(chokes).toEqual([])
  })

  it('does not choke the open hat when the closed hat is muted', () => {
    const pattern = program(createInitialPattern(), [
      ['closedHat', 4],
      ['openHat', 4],
    ])

    const { starts, chokes } = voiceStep(pattern, 4, {
      closedHat: { muted: true, soloed: false },
    })
    expect(starts.map((h) => h.laneId)).toEqual(['openHat'])
    expect(chokes).toEqual([])
  })
})

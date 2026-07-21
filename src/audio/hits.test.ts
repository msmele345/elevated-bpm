import { describe, expect, it } from 'vitest'
import { createInitialPattern, cycleStep } from '../model/pattern'
import type { Pattern } from '../model/types'
import { ACCENT_GAIN, UNACCENTED_GAIN, hitsAtStep } from './hits'

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
})

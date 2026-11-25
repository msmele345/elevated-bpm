import { describe, expect, it } from 'vitest'
import { formatParam, normalizeParam } from './knob'
import {
  DEFAULT_SWING,
  MAX_SWING,
  MIN_SWING,
  SWING_PARAM,
  clampSwing,
  secondsPerStep,
  swingFromPercent,
  swingOffsetSeconds,
  swingToPercent,
  wholeSwingPercent,
} from './transport'

describe('swing range', () => {
  it('runs from straight (0.50) to heavy (0.75) and rests straight', () => {
    expect([MIN_SWING, MAX_SWING, DEFAULT_SWING]).toEqual([0.5, 0.75, 0.5])
  })

  it('clamps out-of-range swing and repairs junk to straight', () => {
    expect(clampSwing(0.4)).toBe(0.5)
    expect(clampSwing(0.9)).toBe(0.75)
    expect(clampSwing(0.62)).toBe(0.62)
    expect(clampSwing(Number.NaN)).toBe(DEFAULT_SWING)
    expect(clampSwing(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SWING)
  })
})

describe('swingOffsetSeconds — how late a 16th lands', () => {
  const step = secondsPerStep(130)

  it('never moves an even 16th, at any swing', () => {
    for (const swing of [0.5, 0.66, 0.75]) {
      for (const stepIndex of [0, 2, 4, 6, 8, 10, 12, 14]) {
        expect(swingOffsetSeconds(stepIndex, 130, swing)).toBe(0)
      }
    }
  })

  it('leaves odd 16ths on the grid when straight', () => {
    for (const stepIndex of [1, 3, 5, 7, 9, 11, 13, 15]) {
      expect(swingOffsetSeconds(stepIndex, 130, 0.5)).toBe(0)
    }
  })

  it('delays odd 16ths by (swing − 0.5) × 2 × one step', () => {
    expect(swingOffsetSeconds(1, 130, 0.66)).toBeCloseTo(0.32 * step, 12)
    expect(swingOffsetSeconds(15, 130, 0.66)).toBeCloseTo(0.32 * step, 12)
    // 75% is dotted: the off-beat lands half a 16th late — 57.69 ms at 130 BPM.
    expect(swingOffsetSeconds(3, 130, 0.75)).toBeCloseTo(0.5 * step, 12)
    expect(swingOffsetSeconds(3, 130, 0.75) * 1000).toBeCloseTo(57.69, 2)
  })

  it('follows the tempo, so the shuffle keeps its feel when BPM moves', () => {
    expect(swingOffsetSeconds(1, 60, 0.75)).toBeCloseTo(0.5 * secondsPerStep(60), 12)
    expect(swingOffsetSeconds(1, 200, 0.75)).toBeCloseTo(0.5 * secondsPerStep(200), 12)
  })

  it('never delays a step by more than half a 16th, whatever it is handed', () => {
    expect(swingOffsetSeconds(1, 130, 0.99)).toBeCloseTo(0.5 * step, 12)
    expect(swingOffsetSeconds(1, 130, 0.2)).toBe(0)
  })
})

describe('the Swing knob', () => {
  it('speaks percent, 50–75, resting at 50', () => {
    expect(SWING_PARAM).toMatchObject({ id: 'swing', label: 'Swing', min: 50, max: 75, default: 50 })
  })

  it('reads out as a whole percentage', () => {
    expect(formatParam(SWING_PARAM, swingToPercent(0.54))).toBe('54 %')
    expect(formatParam(SWING_PARAM, swingToPercent(0.75))).toBe('75 %')
  })

  it('converts between the stored fraction and the knob’s percent', () => {
    expect(swingToPercent(0.5)).toBe(50)
    expect(swingFromPercent(75)).toBe(0.75)
    for (const swing of [0.5, 0.54, 0.66, 0.75]) {
      expect(swingFromPercent(swingToPercent(swing))).toBeCloseTo(swing, 12)
    }
  })

  it('names the whole percentage its readout shows, so goals judge what the learner sees', () => {
    expect(wholeSwingPercent(0.66)).toBe(66)
    expect(wholeSwingPercent(0.5551)).toBe(56)
    expect(wholeSwingPercent(0.554)).toBe(55)
    for (const swing of [0.5, 0.5551, 0.6249, 0.666, 0.75]) {
      expect(formatParam(SWING_PARAM, swingToPercent(swing))).toBe(`${wholeSwingPercent(swing)} %`)
    }
  })

  it('spans its whole travel across the stored range', () => {
    expect(normalizeParam(SWING_PARAM, swingToPercent(MIN_SWING))).toBe(0)
    expect(normalizeParam(SWING_PARAM, swingToPercent(MAX_SWING))).toBe(1)
  })
})

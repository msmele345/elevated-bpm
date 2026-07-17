import { describe, expect, it } from 'vitest'
import { stepIndexAtTicks } from './stepIndex'

const TICKS_PER_16TH = 48 // 192 PPQ / 4, matching the app's transport resolution
const STEP_COUNT = 16

describe('stepIndexAtTicks', () => {
  it('is step 0 at tick 0', () => {
    expect(stepIndexAtTicks(0, TICKS_PER_16TH, STEP_COUNT)).toBe(0)
  })

  it('stays on the current step until the next 16th boundary', () => {
    expect(stepIndexAtTicks(TICKS_PER_16TH - 1, TICKS_PER_16TH, STEP_COUNT)).toBe(0)
    expect(stepIndexAtTicks(TICKS_PER_16TH, TICKS_PER_16TH, STEP_COUNT)).toBe(1)
  })

  it('advances one step per 16th', () => {
    expect(stepIndexAtTicks(TICKS_PER_16TH * 5, TICKS_PER_16TH, STEP_COUNT)).toBe(5)
  })

  it('wraps around after the last step of the pattern', () => {
    expect(stepIndexAtTicks(TICKS_PER_16TH * STEP_COUNT, TICKS_PER_16TH, STEP_COUNT)).toBe(0)
    expect(stepIndexAtTicks(TICKS_PER_16TH * (STEP_COUNT + 3), TICKS_PER_16TH, STEP_COUNT)).toBe(3)
  })
})

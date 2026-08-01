import { describe, expect, it } from 'vitest'
import { barBinRanges, barLevels, decayLevels, SCOPE_SPEC } from './scope'

// A spec small enough to reason about by hand: 64 bins over 0–11025 Hz
// (22050 Hz sample rate), grouped into 8 bars between 40 Hz and 8 kHz.
const spec = {
  barCount: 8,
  binCount: 64,
  sampleRate: 22050,
  minHz: 40,
  maxHz: 8000,
}

describe('barBinRanges', () => {
  it('produces one range per bar', () => {
    expect(barBinRanges(spec)).toHaveLength(spec.barCount)
  })

  it('gives every bar at least one bin, in ascending order, inside the analyser', () => {
    const ranges = barBinRanges(spec)
    let previousStart = 0
    for (const range of ranges) {
      expect(range.end).toBeGreaterThan(range.start)
      expect(range.start).toBeGreaterThanOrEqual(previousStart)
      expect(range.end).toBeLessThanOrEqual(spec.binCount)
      previousStart = range.start
    }
  })

  it('spaces bars logarithmically: the top bar spans more bins than the bottom bar', () => {
    const ranges = barBinRanges(spec)
    const width = (r: { start: number; end: number }) => r.end - r.start
    expect(width(ranges[ranges.length - 1])).toBeGreaterThan(width(ranges[0]))
  })

  it('never reads the DC bin', () => {
    expect(barBinRanges(spec)[0].start).toBeGreaterThanOrEqual(1)
  })

  it('holds for the shipped scope spec', () => {
    const ranges = barBinRanges(SCOPE_SPEC)
    expect(ranges).toHaveLength(SCOPE_SPEC.barCount)
    for (const range of ranges) {
      expect(range.end).toBeGreaterThan(range.start)
      expect(range.end).toBeLessThanOrEqual(SCOPE_SPEC.binCount)
    }
  })
})

describe('barLevels', () => {
  const ranges = barBinRanges(spec)
  const floorDb = -80
  const ceilDb = -10
  const silent = new Array<number>(spec.binCount).fill(-Infinity)

  it('maps silence to a flat floor of zeros', () => {
    expect(barLevels(silent, ranges, floorDb, ceilDb)).toEqual(
      new Array(spec.barCount).fill(0),
    )
  })

  it('maps a full-scale bin to 1 on its own bar and leaves the rest at 0', () => {
    const fft = [...silent]
    fft[ranges[2].start] = ceilDb
    const levels = barLevels(fft, ranges, floorDb, ceilDb)
    expect(levels[2]).toBe(1)
    levels.forEach((level, bar) => {
      if (bar !== 2) expect(level).toBe(0)
    })
  })

  it('maps a level halfway between floor and ceiling to 0.5', () => {
    const fft = [...silent]
    fft[ranges[0].start] = (floorDb + ceilDb) / 2
    expect(barLevels(fft, ranges, floorDb, ceilDb)[0]).toBeCloseTo(0.5)
  })

  it('clamps a bin hotter than the ceiling to 1', () => {
    const fft = [...silent]
    fft[ranges[5].start] = ceilDb + 30
    expect(barLevels(fft, ranges, floorDb, ceilDb)[5]).toBe(1)
  })

  it('takes the loudest bin in a bar, not an average washed out by quiet neighbours', () => {
    const fft = [...silent]
    const top = ranges[ranges.length - 1]
    fft[top.end - 1] = ceilDb
    expect(barLevels(fft, ranges, floorDb, ceilDb)[spec.barCount - 1]).toBe(1)
  })
})

describe('decayLevels', () => {
  it('rises instantly when the new level is higher', () => {
    expect(decayLevels([0.1, 0.2], [0.9, 0.2], 0.05)).toEqual([0.9, 0.2])
  })

  it('falls by at most the fall rate per frame when the new level is lower', () => {
    expect(decayLevels([0.8, 0.5], [0, 0.48], 0.05)).toEqual([0.75, 0.48])
  })

  it('settles exactly on the target instead of oscillating past it', () => {
    expect(decayLevels([0.03], [0], 0.05)).toEqual([0])
  })
})

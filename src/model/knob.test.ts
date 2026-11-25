import { describe, expect, it } from 'vitest'
import {
  clampParam,
  denormalizeParam,
  formatParam,
  nudgeParam,
  normalizeParam,
  type ParamSpec,
} from './knob'

const LINEAR: ParamSpec = {
  id: 'resonance',
  label: 'Resonance',
  min: 0,
  max: 20,
  default: 6,
  unit: 'Q',
}

const FADER: ParamSpec = {
  id: 'kickLevel',
  label: 'Kick Level',
  min: 0,
  max: 10 ** (6 / 20),
  default: 1,
  unit: 'dB',
  taper: 'fader',
}

/** Linear gain → dB, the way an engineer reads a fader. */
const db = (gain: number) => 20 * Math.log10(gain)

const LOG: ParamSpec = {
  id: 'cutoff',
  label: 'Cutoff',
  min: 100,
  max: 10_000,
  default: 900,
  unit: 'Hz',
  taper: 'log',
}

describe('clampParam', () => {
  it('holds a value inside the spec range', () => {
    expect(clampParam(LINEAR, 50)).toBe(20)
    expect(clampParam(LINEAR, -5)).toBe(0)
    expect(clampParam(LINEAR, 7.5)).toBe(7.5)
  })

  it('falls back to the default for values that are not finite numbers', () => {
    expect(clampParam(LINEAR, Number.NaN)).toBe(LINEAR.default)
    expect(clampParam(LINEAR, Number.POSITIVE_INFINITY)).toBe(LINEAR.default)
  })
})

describe('normalize/denormalize', () => {
  it('maps a linear param straight onto 0..1', () => {
    expect(normalizeParam(LINEAR, 0)).toBeCloseTo(0, 6)
    expect(normalizeParam(LINEAR, 10)).toBeCloseTo(0.5, 6)
    expect(normalizeParam(LINEAR, 20)).toBeCloseTo(1, 6)
  })

  it('puts a log param’s midpoint at the geometric mean, where the ear hears it', () => {
    expect(normalizeParam(LOG, 1000)).toBeCloseTo(0.5, 6)
    expect(denormalizeParam(LOG, 0.5)).toBeCloseTo(1000, 6)
  })

  it('round-trips both tapers', () => {
    for (const spec of [LINEAR, LOG]) {
      for (const t of [0, 0.13, 0.5, 0.77, 1]) {
        expect(normalizeParam(spec, denormalizeParam(spec, t))).toBeCloseTo(t, 6)
      }
    }
  })

  it('clamps the knob position to the ends of its travel', () => {
    expect(denormalizeParam(LOG, -2)).toBe(LOG.min)
    expect(denormalizeParam(LOG, 3)).toBe(LOG.max)
  })
})

describe('nudgeParam', () => {
  it('moves by a fraction of the knob’s travel, not of the raw value', () => {
    expect(nudgeParam(LINEAR, 10, 0.05)).toBeCloseTo(11, 6)
    expect(nudgeParam(LINEAR, 10, -0.05)).toBeCloseTo(9, 6)
  })

  it('nudges a log param multiplicatively, so low frequencies stay controllable', () => {
    const up = nudgeParam(LOG, 1000, 0.05)
    const down = nudgeParam(LOG, 1000, -0.05)

    expect(up).toBeGreaterThan(1000)
    expect(up).toBeLessThan(1300)
    expect(normalizeParam(LOG, up) - 0.5).toBeCloseTo(0.05, 6)
    expect(normalizeParam(LOG, down) - 0.5).toBeCloseTo(-0.05, 6)
  })

  it('stops at the ends of the range', () => {
    expect(nudgeParam(LINEAR, 20, 0.5)).toBe(20)
    expect(nudgeParam(LINEAR, 0, -0.5)).toBe(0)
  })
})

describe('formatParam', () => {
  it('reads out frequencies the way a synth panel does', () => {
    expect(formatParam(LOG, 640)).toBe('640 Hz')
    expect(formatParam(LOG, 1240)).toBe('1.24 kHz')
  })

  it('reads out plain params with their unit', () => {
    expect(formatParam(LINEAR, 6.25)).toBe('6.3 Q')
  })
})

describe('the fader taper (Level)', () => {
  it('parks silence at the bottom and +6 dB at the top', () => {
    expect(normalizeParam(FADER, 0)).toBe(0)
    expect(denormalizeParam(FADER, 0)).toBe(0)
    expect(normalizeParam(FADER, FADER.max)).toBeCloseTo(1, 12)
    expect(db(denormalizeParam(FADER, 1))).toBeCloseTo(6, 9)
  })

  it('spends most of its travel between −24 and +6 dB', () => {
    const bottomOfRange = normalizeParam(FADER, 10 ** (-24 / 20))
    expect(1 - bottomOfRange).toBeGreaterThanOrEqual(0.75)
    // Inside that range a step of travel is a step of dB, wherever you are.
    const a = db(denormalizeParam(FADER, 0.5))
    const b = db(denormalizeParam(FADER, 0.6))
    const c = db(denormalizeParam(FADER, 0.9))
    const d = db(denormalizeParam(FADER, 1))
    expect(b - a).toBeCloseTo(d - c, 9)
  })

  it('rises continuously out of silence, with no jump at −24 dB', () => {
    const knee = normalizeParam(FADER, 10 ** (-24 / 20))
    const below = denormalizeParam(FADER, knee - 1e-9)
    const above = denormalizeParam(FADER, knee + 1e-9)
    expect(above - below).toBeLessThan(1e-6)
    expect(denormalizeParam(FADER, knee / 2)).toBeGreaterThan(0)
  })

  it('round-trips gain through travel', () => {
    for (const gain of [0, 0.01, 0.0631, 0.25, 0.5, 1, 1.5, FADER.max]) {
      expect(denormalizeParam(FADER, normalizeParam(FADER, gain))).toBeCloseTo(gain, 9)
    }
  })

  it('nudges in even dB steps across the main range', () => {
    const up = nudgeParam(FADER, 1, 0.02)
    const down = nudgeParam(FADER, 1, -0.02)
    expect(db(up)).toBeGreaterThan(0)
    expect(db(up)).toBeCloseTo(-db(down), 9)
  })

  it('reads out in dB, with −∞ for silence and 0 dB at unity', () => {
    expect(formatParam(FADER, 0)).toBe('−∞ dB')
    expect(formatParam(FADER, 1)).toBe('0.0 dB')
    expect(formatParam(FADER, 1.0000001)).toBe('0.0 dB')
    expect(formatParam(FADER, 0.9999999)).toBe('0.0 dB')
    expect(formatParam(FADER, 0.5)).toBe('−6.0 dB')
    expect(formatParam(FADER, FADER.max)).toBe('+6.0 dB')
  })
})

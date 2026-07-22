import { describe, expect, it } from 'vitest'
import {
  BASS_PARAMS,
  DEFAULT_BASS_SETTINGS,
  createBassSettings,
  setBassParam,
  type BassParamId,
} from './bass'
import { clampParam, formatParam, normalizeParam } from './knob'

describe('BASS_PARAMS', () => {
  it('describes the cutoff, resonance and envelope knobs the panel renders', () => {
    expect(BASS_PARAMS.map((param) => param.id)).toEqual(['cutoff', 'resonance', 'decay'])
  })

  it('gives every knob a labelled, sane range containing its default', () => {
    for (const param of BASS_PARAMS) {
      expect(param.label.length).toBeGreaterThan(0)
      expect(param.min).toBeLessThan(param.max)
      expect(param.default).toBeGreaterThanOrEqual(param.min)
      expect(param.default).toBeLessThanOrEqual(param.max)
      expect(DEFAULT_BASS_SETTINGS[param.id as BassParamId]).toBe(param.default)
    }
  })

  it('sweeps cutoff logarithmically, so the knob tracks how the ear hears filter motion', () => {
    const cutoff = BASS_PARAMS.find((param) => param.id === 'cutoff')!

    expect(cutoff.taper).toBe('log')
    expect(cutoff.min).toBeGreaterThan(0)
    expect(normalizeParam(cutoff, cutoff.default)).toBeGreaterThan(0)
    expect(normalizeParam(cutoff, cutoff.default)).toBeLessThan(1)
  })

  it('formats an envelope time in milliseconds', () => {
    const decay = BASS_PARAMS.find((param) => param.id === 'decay')!

    expect(formatParam(decay, 0.22)).toBe('220 ms')
  })
})

describe('setBassParam', () => {
  it('sets one knob and leaves the rest of the patch alone', () => {
    const settings = setBassParam(DEFAULT_BASS_SETTINGS, 'cutoff', 2400)

    expect(settings.cutoff).toBe(2400)
    expect(settings.resonance).toBe(DEFAULT_BASS_SETTINGS.resonance)
    expect(settings.decay).toBe(DEFAULT_BASS_SETTINGS.decay)
    expect(DEFAULT_BASS_SETTINGS.cutoff).not.toBe(2400)
  })

  it('clamps to the knob’s range so no value can drive the synth out of bounds', () => {
    const resonance = BASS_PARAMS.find((param) => param.id === 'resonance')!

    expect(setBassParam(DEFAULT_BASS_SETTINGS, 'resonance', 1e6).resonance).toBe(resonance.max)
    expect(setBassParam(DEFAULT_BASS_SETTINGS, 'resonance', -1).resonance).toBe(resonance.min)
  })
})

describe('createBassSettings', () => {
  it('defaults every knob when nothing was saved', () => {
    expect(createBassSettings(undefined)).toEqual(DEFAULT_BASS_SETTINGS)
    expect(createBassSettings({ nonsense: true })).toEqual(DEFAULT_BASS_SETTINGS)
  })

  it('keeps saved knob values, repairing any that are missing or out of range', () => {
    const restored = createBassSettings({ cutoff: 2400, resonance: 1e6 })

    expect(restored.cutoff).toBe(2400)
    expect(restored.resonance).toBe(clampParam(BASS_PARAMS[1], 1e6))
    expect(restored.decay).toBe(DEFAULT_BASS_SETTINGS.decay)
  })
})

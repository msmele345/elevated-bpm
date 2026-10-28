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
  it('describes the cutoff, resonance, envelope and Env Mod knobs the panel renders', () => {
    expect(BASS_PARAMS.map((param) => param.id)).toEqual(['cutoff', 'resonance', 'decay', 'envMod'])
  })

  it('rests Env Mod at 0 % — neutral, so an untouched bass sounds as it did before the knob', () => {
    const envMod = BASS_PARAMS.find((param) => param.id === 'envMod')!

    expect(envMod).toMatchObject({ label: 'Env Mod', min: 0, max: 100, default: 0, unit: '%' })
    expect(DEFAULT_BASS_SETTINGS.envMod).toBe(0)
    expect(formatParam(envMod, 50)).toBe('50 %')
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

  it('gives a patch saved before Env Mod existed Env Mod 0, and clamps an out-of-range one', () => {
    expect(createBassSettings({ cutoff: 2400, resonance: 9, decay: 0.3 }).envMod).toBe(0)
    expect(createBassSettings({ envMod: 250 }).envMod).toBe(100)
    expect(createBassSettings({ envMod: -5 }).envMod).toBe(0)
    expect(createBassSettings({ envMod: 40 }).envMod).toBe(40)
  })
})

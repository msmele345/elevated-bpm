import { createPatch, setPatchParam, specOf, type ParamSpec } from './knob'

/**
 * The bass instrument's patch: the 303 vocabulary the curriculum teaches —
 * filter cutoff, resonance, envelope decay and Env Mod. The specs are data so
 * the panel can render a knob per parameter and lessons can spotlight one by id.
 */

export type BassParamId = 'cutoff' | 'resonance' | 'decay' | 'envMod'

export interface BassSettings {
  /** Lowpass filter cutoff in Hz. */
  cutoff: number
  /** Filter resonance (Q) — the acid squelch. */
  resonance: number
  /** Amplitude and filter envelope decay in seconds: plucky to sustained. */
  decay: number
  /**
   * Env Mod, 0–100 %: how far every note opens the filter above Cutoff before
   * Decay closes it again. At 0 the filter sits on Cutoff, as it always did.
   */
  envMod: number
}

export const BASS_PARAMS: ReadonlyArray<ParamSpec & { id: BassParamId }> = [
  {
    id: 'cutoff',
    label: 'Cutoff',
    min: 120,
    max: 12_000,
    default: 900,
    unit: 'Hz',
    taper: 'log',
  },
  { id: 'resonance', label: 'Resonance', min: 0.5, max: 18, default: 6, unit: 'Q' },
  { id: 'decay', label: 'Decay', min: 0.05, max: 0.8, default: 0.22, unit: 's' },
  { id: 'envMod', label: 'Env Mod', min: 0, max: 100, default: 0, unit: '%' },
]

/** The spec behind one bass knob — its range, default, and taper. */
export function bassParamSpec(id: BassParamId): ParamSpec {
  return specOf(BASS_PARAMS, id)
}

export const DEFAULT_BASS_SETTINGS: BassSettings = {
  cutoff: bassParamSpec('cutoff').default,
  resonance: bassParamSpec('resonance').default,
  decay: bassParamSpec('decay').default,
  envMod: bassParamSpec('envMod').default,
}

/** Immutably set one knob, clamped to its range. */
export function setBassParam(
  settings: BassSettings,
  id: BassParamId,
  value: number,
): BassSettings {
  return setPatchParam(BASS_PARAMS, settings, id, value)
}

/** Build a patch from whatever was persisted (or nothing), repairing it. */
export function createBassSettings(saved: unknown): BassSettings {
  return createPatch(BASS_PARAMS, DEFAULT_BASS_SETTINGS, saved)
}

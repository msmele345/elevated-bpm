import { clampParam, type ParamSpec } from './knob'

/**
 * The bass instrument's patch: the 303 vocabulary this phase teaches — filter
 * cutoff, resonance, and envelope decay. The specs are data so the panel can
 * render a knob per parameter and lessons can spotlight one by id.
 */

export type BassParamId = 'cutoff' | 'resonance' | 'decay'

export interface BassSettings {
  /** Lowpass filter cutoff in Hz. */
  cutoff: number
  /** Filter resonance (Q) — the acid squelch. */
  resonance: number
  /** Amplitude envelope decay in seconds: plucky to sustained. */
  decay: number
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
]

/** The spec behind one bass knob — its range, default, and taper. */
export function bassParamSpec(id: BassParamId): ParamSpec {
  return BASS_PARAMS.find((param) => param.id === id)!
}

export const DEFAULT_BASS_SETTINGS: BassSettings = {
  cutoff: bassParamSpec('cutoff').default,
  resonance: bassParamSpec('resonance').default,
  decay: bassParamSpec('decay').default,
}

/** Immutably set one knob, clamped to its range. */
export function setBassParam(
  settings: BassSettings,
  id: BassParamId,
  value: number,
): BassSettings {
  return { ...settings, [id]: clampParam(bassParamSpec(id), value) }
}

/**
 * Build a patch from whatever was persisted (or nothing). Every knob is
 * clamped or defaulted, so a document written by an older build — or a
 * hand-edited one — can never hand the synth an out-of-range value.
 */
export function createBassSettings(saved: unknown): BassSettings {
  const raw = (saved ?? {}) as Partial<Record<BassParamId, unknown>>
  return BASS_PARAMS.reduce<BassSettings>((settings, param) => {
    const value = raw[param.id]
    return typeof value === 'number' ? setBassParam(settings, param.id, value) : settings
  }, DEFAULT_BASS_SETTINGS)
}

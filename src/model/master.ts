import { clampParam, type ParamSpec } from './knob'

/**
 * The master strip's macros: one filter and one drive across the whole mix —
 * the performance moves of a live techno set (kill the top end, lean into
 * saturation) applied at the main out rather than per instrument. Both rest
 * neutral, so an untouched deck sounds exactly as it did before the bus.
 */

export type MasterParamId = 'filter' | 'drive'

export interface MasterSettings {
  /** Master lowpass cutoff in Hz; fully open at the top of its range. */
  filter: number
  /** Saturation amount across the mix, 0 (clean) to 100 (%). */
  drive: number
}

export const MASTER_PARAMS: ReadonlyArray<ParamSpec & { id: MasterParamId }> = [
  {
    id: 'filter',
    label: 'Filter',
    min: 120,
    max: 18_000,
    default: 18_000,
    unit: 'Hz',
    taper: 'log',
  },
  { id: 'drive', label: 'Drive', min: 0, max: 100, default: 0, unit: '%' },
]

export const DEFAULT_MASTER_SETTINGS: MasterSettings = {
  filter: 18_000,
  drive: 0,
}

/** The spec behind one master knob — its range, default, and taper. */
export function masterParamSpec(id: MasterParamId): ParamSpec {
  return MASTER_PARAMS.find((param) => param.id === id)!
}

/**
 * Build the macros from whatever was persisted (or nothing). Every knob is
 * clamped or defaulted, so a document written by an older build — or a
 * hand-edited one — can never hand the bus an out-of-range value.
 */
export function createMasterSettings(saved: unknown): MasterSettings {
  const raw = (saved ?? {}) as Partial<Record<MasterParamId, unknown>>
  return MASTER_PARAMS.reduce<MasterSettings>((settings, param) => {
    const value = raw[param.id]
    return typeof value === 'number' ? setMasterParam(settings, param.id, value) : settings
  }, DEFAULT_MASTER_SETTINGS)
}

/** What the audio engine sets on the bus nodes for one MasterSettings. */
export interface MasterBusParams {
  /** Lowpass cutoff in Hz, straight off the filter knob. */
  cutoff: number
  /** Waveshaper curve amount for Tone.Distortion, 0..1. */
  distortion: number
  /** Dry/wet of the drive stage: 0 keeps the bus bit-transparent when clean. */
  wet: number
}

/** Hardest curve the drive knob reaches — saturated, not destroyed. */
const MAX_DISTORTION = 0.9

/**
 * Map the macros onto the bus nodes. Drive fades its wet mix in with the knob
 * while the curve hardens, so 0 is genuinely clean (fully dry) and the top of
 * the travel is both fully wet and hard-driven.
 */
export function masterBusParams(settings: MasterSettings): MasterBusParams {
  const amount = settings.drive / masterParamSpec('drive').max
  return {
    cutoff: settings.filter,
    distortion: amount * MAX_DISTORTION,
    wet: amount,
  }
}

/** Immutably set one macro, clamped to its range. */
export function setMasterParam(
  settings: MasterSettings,
  id: MasterParamId,
  value: number,
): MasterSettings {
  return { ...settings, [id]: clampParam(masterParamSpec(id), value) }
}

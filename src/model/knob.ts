/**
 * The math behind a knob: how a continuous synth parameter maps onto the 0..1
 * of a knob's travel, and back. Kept pure and UI-agnostic so the taper is
 * testable without rendering an SVG or opening an audio context — the Knob
 * component and the audio engine both read the same spec.
 */

/** A knob-able parameter: its range, its resting value, and how it tapers. */
export interface ParamSpec {
  id: string
  label: string
  min: number
  max: number
  default: number
  unit: string
  /**
   * 'log' for frequency-like parameters, where the ear hears ratios rather
   * than differences — an octave should cost the same knob travel everywhere.
   * 'fader' for a linear gain read in dB: silence at the bottom, then even dB
   * steps from −24 dB to the top — see `faderTravel`.
   */
  taper?: 'linear' | 'log' | 'fader'
}

/** Linear gain to dB. Silence is −∞. */
export function gainToDb(gain: number): number {
  return 20 * Math.log10(gain)
}

/** dB to linear gain. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20)
}

/**
 * The fader taper's knee: the quietest level that still gets even dB steps.
 * Below it a fader stops caring about dB and simply runs out to silence.
 */
const FADER_KNEE_DB = -24
/** How much of the travel the run from silence up to the knee gets. */
const FADER_KNEE_TRAVEL = 0.15

/**
 * Where a gain sits along a fader's travel. A mixer fader spends its travel
 * where mixing happens: from the knee (−24 dB) to the top every step of travel
 * is the same number of dB, and the short bottom stretch fades linearly in gain
 * out of silence, so there is no jump into −24 dB and 0 is a real −∞.
 */
function faderTravel(spec: ParamSpec, gain: number): number {
  const knee = dbToGain(FADER_KNEE_DB)
  if (gain <= knee) return (gain / knee) * FADER_KNEE_TRAVEL
  const span = gainToDb(spec.max) - FADER_KNEE_DB
  return FADER_KNEE_TRAVEL + ((gainToDb(gain) - FADER_KNEE_DB) / span) * (1 - FADER_KNEE_TRAVEL)
}

/** The gain at a position along a fader's travel; the inverse of `faderTravel`. */
function faderGain(spec: ParamSpec, position: number): number {
  const knee = dbToGain(FADER_KNEE_DB)
  if (position <= FADER_KNEE_TRAVEL) return (position / FADER_KNEE_TRAVEL) * knee
  const span = gainToDb(spec.max) - FADER_KNEE_DB
  return dbToGain(FADER_KNEE_DB + ((position - FADER_KNEE_TRAVEL) / (1 - FADER_KNEE_TRAVEL)) * span)
}

/** Hold a value inside the spec, falling back to the default for junk input. */
export function clampParam(spec: ParamSpec, value: number): number {
  if (!Number.isFinite(value)) return spec.default
  return Math.min(spec.max, Math.max(spec.min, value))
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

/** Where a value sits along the knob's travel, 0 (min) to 1 (max). */
export function normalizeParam(spec: ParamSpec, value: number): number {
  const clamped = clampParam(spec, value)
  if (spec.taper === 'fader') return faderTravel(spec, clamped)
  if (spec.taper === 'log') {
    return Math.log(clamped / spec.min) / Math.log(spec.max / spec.min)
  }
  return (clamped - spec.min) / (spec.max - spec.min)
}

/** The value at a position along the knob's travel; positions outside 0..1 clamp. */
export function denormalizeParam(spec: ParamSpec, t: number): number {
  const position = clamp01(t)
  if (spec.taper === 'fader') return faderGain(spec, position)
  if (spec.taper === 'log') {
    return spec.min * (spec.max / spec.min) ** position
  }
  return spec.min + position * (spec.max - spec.min)
}

/**
 * Move a value by a fraction of the knob's travel — the unit both dragging and
 * arrow keys speak, so a keyboard nudge feels the same as a small drag.
 */
export function nudgeParam(spec: ParamSpec, value: number, deltaNormalized: number): number {
  return denormalizeParam(spec, normalizeParam(spec, value) + deltaNormalized)
}

/**
 * A patch: one number per knob of a param list. Bass, master and FX are all
 * this shape, which is what lets the three below be written once.
 */
export type Patch<Id extends string> = Record<Id, number>

/** The spec behind one knob of a param list. */
export function specOf<Id extends string>(
  params: ReadonlyArray<ParamSpec & { id: Id }>,
  id: Id,
): ParamSpec {
  return params.find((param) => param.id === id)!
}

/** Immutably set one knob of a patch, clamped to its range. */
export function setPatchParam<Id extends string, P extends Patch<Id>>(
  params: ReadonlyArray<ParamSpec & { id: Id }>,
  patch: P,
  id: Id,
  value: number,
): P {
  return { ...patch, [id]: clampParam(specOf(params, id), value) }
}

/**
 * Build a patch from whatever was persisted (or nothing). Every knob is clamped
 * or defaulted, so a document written by an older build — or a hand-edited one —
 * can never hand an instrument an out-of-range value.
 */
export function createPatch<Id extends string, P extends Patch<Id>>(
  params: ReadonlyArray<ParamSpec & { id: Id }>,
  defaults: P,
  saved: unknown,
): P {
  const raw = (saved ?? {}) as Partial<Record<Id, unknown>>
  return params.reduce<P>((patch, param) => {
    const value = raw[param.id]
    return typeof value === 'number' ? setPatchParam(params, patch, param.id, value) : patch
  }, defaults)
}

/** Panel/screen-reader readout for a value, in the units an engineer expects. */
export function formatParam(spec: ParamSpec, value: number): string {
  if (spec.taper === 'fader') return formatLevel(value)
  if (spec.unit === 'Hz' && value >= 1000) return `${(value / 1000).toFixed(2)} kHz`
  if (spec.unit === 'Hz') return `${Math.round(value)} Hz`
  if (spec.unit === 's') return `${Math.round(value * 1000)} ms`
  if (spec.unit === '%') return `${Math.round(value)} %`
  return `${value.toFixed(1)} ${spec.unit}`
}

/**
 * A gain read in dB, the way a mixer prints it: signed, one decimal, −∞ at
 * silence. Rounded before signing, so a hair either side of unity reads 0.0 dB
 * rather than "−0.0".
 */
function formatLevel(gain: number): string {
  if (gain <= 0) return '−∞ dB'
  const db = Math.round(gainToDb(gain) * 10) / 10
  if (db === 0) return '0.0 dB'
  return db > 0 ? `+${db.toFixed(1)} dB` : `−${(-db).toFixed(1)} dB`
}

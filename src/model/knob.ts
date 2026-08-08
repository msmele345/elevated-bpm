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
   */
  taper?: 'linear' | 'log'
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
  if (spec.taper === 'log') {
    return Math.log(clamped / spec.min) / Math.log(spec.max / spec.min)
  }
  return (clamped - spec.min) / (spec.max - spec.min)
}

/** The value at a position along the knob's travel; positions outside 0..1 clamp. */
export function denormalizeParam(spec: ParamSpec, t: number): number {
  const position = clamp01(t)
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
  if (spec.unit === 'Hz' && value >= 1000) return `${(value / 1000).toFixed(2)} kHz`
  if (spec.unit === 'Hz') return `${Math.round(value)} Hz`
  if (spec.unit === 's') return `${Math.round(value * 1000)} ms`
  if (spec.unit === '%') return `${Math.round(value)} %`
  return `${value.toFixed(1)} ${spec.unit}`
}

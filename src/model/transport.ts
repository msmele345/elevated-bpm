import type { ParamSpec } from './knob'

/**
 * Transport is a key domain model (BPM, swing, play state). The musical
 * constants live here — model code and the audio engine both read them, and
 * the model must never import the engine (which drags in Tone/Web Audio).
 */

export const DEFAULT_BPM = 130
export const MIN_BPM = 60
export const MAX_BPM = 200

/**
 * Swing as a fraction of an 8th-note pair given to its first 16th: 0.50 is
 * straight, 0.75 is the heavy, dotted end of an MPC's range. Straight is the
 * rest position, so a deck nobody has shuffled sounds exactly as it did
 * before swing existed.
 */
export const DEFAULT_SWING = 0.5
export const MIN_SWING = 0.5
export const MAX_SWING = 0.75

/** Persisted transport settings. Play state is deliberately not persisted. */
export interface TransportSettings {
  bpm: number
  /** 0.50 (straight) to 0.75 (heavy), on 16ths. */
  swing: number
}

export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, bpm))
}

/** Hold swing inside its range; anything that is not a number reads as straight. */
export function clampSwing(swing: number): number {
  if (!Number.isFinite(swing)) return DEFAULT_SWING
  return Math.min(MAX_SWING, Math.max(MIN_SWING, swing))
}

/**
 * The Swing knob. It speaks the percentage an MPC or a TR-8 shows, while the
 * Transport stores the fraction — the two meet only through `swingToPercent`
 * and `swingFromPercent`, so a knob reading and a document value can never be
 * mistaken for each other. Its value lives in the Transport, not in an
 * instrument patch, but it is a knob like any other: lessons can spotlight it
 * and its motion is observed like any other.
 */
export type TransportParamId = 'swing'

export const SWING_PARAM: ParamSpec & { id: TransportParamId } = {
  id: 'swing',
  label: 'Swing',
  min: swingToPercent(MIN_SWING),
  max: swingToPercent(MAX_SWING),
  default: swingToPercent(DEFAULT_SWING),
  unit: '%',
}

export const TRANSPORT_PARAMS: ReadonlyArray<ParamSpec & { id: TransportParamId }> = [SWING_PARAM]

export function swingToPercent(swing: number): number {
  return swing * 100
}

export function swingFromPercent(percent: number): number {
  return percent / 100
}

/**
 * The whole percentage the Swing knob reads out. Goals judge this rather than
 * the raw fraction, so a learner whose knob says "56 %" is never told they are
 * short of a 56–66% range by a hundredth of a percent they cannot see.
 */
export function wholeSwingPercent(swing: number): number {
  return Math.round(swingToPercent(swing))
}

/**
 * How late one 16th lands under swing, in seconds.
 *
 * Even 16ths — the downbeats and the 8ths — never move; each odd 16th is pushed
 * toward the next by (swing − 0.5) × 2 of a step, so 66% puts it at roughly the
 * triplet position and 75% at the dotted one, half a step late. The Deck adds
 * this to the scheduled time itself rather than using Tone's transport swing:
 * Tone delays the time the step callback receives, and the step index is found
 * by rounding transport ticks at that time, so at 75% an off-beat would sit on
 * the rounding boundary and resolve as the next step.
 */
export function swingOffsetSeconds(stepIndex: number, bpm: number, swing: number): number {
  if (stepIndex % 2 === 0) return 0
  return (clampSwing(swing) - 0.5) * 2 * secondsPerStep(bpm)
}

/**
 * One 16th note in seconds — the deck's step. A quarter note is 60/bpm and a
 * step is a quarter of that, so 15/bpm. Everything that has to think in steps
 * rather than beats measures against this: the sequencer's note lengths, a
 * sampler pad's fit-to-steps rate, and the longest a chop may be.
 */
export function secondsPerStep(bpm: number): number {
  return 15 / bpm
}

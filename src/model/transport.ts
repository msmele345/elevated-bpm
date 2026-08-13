/**
 * Transport is a key domain model (BPM, swing, play state). The musical
 * constants live here — model code and the audio engine both read them, and
 * the model must never import the engine (which drags in Tone/Web Audio).
 */

export const DEFAULT_BPM = 130
export const MIN_BPM = 60
export const MAX_BPM = 200

/** Persisted transport settings. Play state is deliberately not persisted. */
export interface TransportSettings {
  bpm: number
}

export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, bpm))
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

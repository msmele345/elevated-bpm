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

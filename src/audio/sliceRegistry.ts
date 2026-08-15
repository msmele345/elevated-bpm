import type { PadLaneId } from '../model/types'

/**
 * The audio a slice becomes. Structural rather than a Tone type so the
 * registry and the pad voice stay testable without an AudioContext — the same
 * boundary trick the stab synth pool already uses.
 */
export interface SampleBuffer {
  readonly duration: number
}

/**
 * Playable slices, one per pad. A **slice** is the rendered audio for a
 * committed region, and it is the only thing playback ever touches: sources
 * are decoded at commit and released, never held resident.
 *
 * That is the whole reason the sampler does not break the deck's first-click
 * promise. Rebuilding slices from sources at startup would put a full-length
 * decode on the load path; committing renders once, and from then on the pad
 * has audio that is already the right length.
 *
 * Keyed by pad rather than by source or region, because a pad is what has a
 * slice — two pads chopped from one break hold two different slices, and
 * re-chopping a pad replaces its slice rather than adding one.
 */
export interface SliceRegistry {
  set(padId: PadLaneId, buffer: SampleBuffer): void
  get(padId: PadLaneId): SampleBuffer | undefined
  /**
   * Take a pad's audio away. The registry — not the document — is what decides
   * whether a pad sounds, so a deck that swaps one document for another must be
   * able to make a pad silent again, or a bundle preview leaves the recipient's
   * own sound playing underneath the sender's programming.
   */
  clear(padId: PadLaneId): void
}

export function createSliceRegistry(): SliceRegistry {
  const slices = new Map<PadLaneId, SampleBuffer>()
  return {
    set(padId, buffer) {
      slices.set(padId, buffer)
    },

    get(padId) {
      return slices.get(padId)
    },

    clear(padId) {
      slices.delete(padId)
    },
  }
}

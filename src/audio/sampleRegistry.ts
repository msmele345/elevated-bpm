/**
 * The audio a source becomes. Structural rather than a Tone type so the
 * registry and the pad voice stay testable without an AudioContext — the same
 * boundary trick the pad player and the stab synth pool already use.
 */
export interface SampleBuffer {
  readonly duration: number
}

/**
 * Decoded audio, keyed by source id. A buffer belongs to a *source*, never to
 * a pad: several pads may hold regions into one source and must share its
 * audio rather than each owning a copy.
 *
 * This is the only way a source becomes something audible. The shipped curated
 * source is registered like any other, so a later intake path adds a producer
 * here rather than a second mechanism beside it.
 */
export interface SampleRegistry {
  register(sourceId: string, buffer: SampleBuffer): void
  has(sourceId: string): boolean
  get(sourceId: string): SampleBuffer | undefined
}

export function createSampleRegistry(): SampleRegistry {
  const buffers = new Map<string, SampleBuffer>()
  return {
    register(sourceId, buffer) {
      buffers.set(sourceId, buffer)
    },

    has(sourceId) {
      return buffers.has(sourceId)
    },

    get(sourceId) {
      return buffers.get(sourceId)
    },
  }
}

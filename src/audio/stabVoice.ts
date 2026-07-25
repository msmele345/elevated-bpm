/**
 * The minimal Tone-style boundary the stab engine needs. Keeping this
 * structural lets the note-routing rule stay testable without an AudioContext.
 */
export interface StabSynthPool {
  triggerAttack(note: number, time: number, velocity: number): unknown
  triggerRelease(note: number, time: number): unknown
  triggerAttackRelease(
    note: number,
    duration: number,
    time: number,
    velocity: number,
  ): unknown
  dispose(): unknown
}

export interface StabVoices {
  attackLive(note: number, time: number, velocity: number): void
  releaseLive(note: number, time: number): void
  triggerSequenced(note: number, duration: number, time: number, velocity: number): void
  stopSequenced(): void
}

/**
 * Live holds and sequenced hits need distinct pools: Tone releases the first
 * active voice matching a pitch, so sharing a pool would let a scheduled C4
 * release cut a still-held live C4.
 */
export function createStabVoices(createSynth: () => StabSynthPool): StabVoices {
  const liveSynth = createSynth()
  let sequencedSynth = createSynth()

  return {
    attackLive(note, time, velocity) {
      liveSynth.triggerAttack(note, time, velocity)
    },

    releaseLive(note, time) {
      liveSynth.triggerRelease(note, time)
    },

    triggerSequenced(note, duration, time, velocity) {
      sequencedSynth.triggerAttackRelease(note, duration, time, velocity)
    },

    stopSequenced() {
      // Tone.PolySynth queues look-ahead attacks on the audio context, outside
      // Transport. Disposing cancels those callbacks as well as active voices;
      // a fresh sequence pool is ready for the next play.
      sequencedSynth.dispose()
      sequencedSynth = createSynth()
    },
  }
}

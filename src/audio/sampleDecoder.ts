import * as Tone from 'tone'
import type { DecodedSample } from './sampleIntake'

/**
 * The browser half of intake: the two pieces of real I/O the intake pipeline
 * is constructed with. Everything decision-shaped lives behind them in pure
 * code, so this module stays small enough to read and is verified in a browser
 * rather than in tests — the deliberate gap SP-04 records.
 */

/**
 * Duration from an audio element's metadata, which the browser reads without
 * decoding the file. This is the gate that actually matters, and it has to be
 * cheap enough to run before the user waits on anything.
 */
export function probeDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const probe = new Audio()
    const finish = (settle: () => void) => {
      probe.removeAttribute('src')
      URL.revokeObjectURL(url)
      settle()
    }
    probe.preload = 'metadata'
    probe.addEventListener(
      'loadedmetadata',
      () => {
        const seconds = probe.duration
        finish(() => resolve(seconds))
      },
      { once: true },
    )
    probe.addEventListener(
      'error',
      () => finish(() => reject(new Error('The browser could not read this file as audio.'))),
      { once: true },
    )
    probe.src = url
  })
}

/**
 * Decode at the audio context's own rate — `decodeAudioData` resamples to it
 * rather than keeping the file's — through the same ToneAudioBuffer the
 * shipped source arrives as, so the registry holds one kind of thing.
 *
 * Only the context is started, not the full unlock: waiting on the kit's
 * downloads here would make loading a sound slower than it has any reason to
 * be, and intake always runs inside a user gesture anyway.
 */
export async function decodeSample(file: Blob): Promise<DecodedSample> {
  await Tone.start()
  const url = URL.createObjectURL(file)
  try {
    return await new Tone.ToneAudioBuffer().load(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** A source id that will not collide with another session's. */
export function newSourceId(): string {
  return `upload-${crypto.randomUUID()}`
}

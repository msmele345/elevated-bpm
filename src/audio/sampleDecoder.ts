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

/**
 * The rate the editor analyses at. Decoding into an offline context at a
 * reduced rate is what makes a full-length source workable at all: a
 * six-minute track costs roughly 32 MB here rather than 127 MB, and neither a
 * waveform nor an onset detector needs the bandwidth it gives up.
 *
 * 22.05 kHz rather than something lower because this buffer is also what an
 * audition plays. Its ~11 kHz of bandwidth is dull against the real thing but
 * still enough to judge a chop by ear, which is the whole point of auditioning
 * before committing. The editor is where a user spends their time; the
 * renderer is where they spend a moment, so each is sized for what it needs.
 *
 * The EB2-04 spike confirmed both engines honour an offline context's rate,
 * and that they preserve channel count — which is why the mix to mono below is
 * ours to do rather than something the decode can be asked for.
 */
export const ANALYSIS_SAMPLE_RATE = 22050

/**
 * Decode a source cheaply, for looking at rather than for playing. Mono,
 * because the waveform and the onset detector both read one channel and
 * holding a second would double the residency for nothing.
 */
export async function decodeForAnalysis(blob: Blob): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE)
  const decoded = await offline.decodeAudioData(await blob.arrayBuffer())
  if (decoded.numberOfChannels === 1) return decoded

  // Channels survive the decode, so the downmix is ours. The stereo buffer
  // becomes garbage the moment this returns, leaving one mono buffer resident.
  const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate)
  const mixed = mono.getChannelData(0)
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const data = decoded.getChannelData(channel)
    for (let frame = 0; frame < decoded.length; frame += 1) {
      mixed[frame] += data[frame] / decoded.numberOfChannels
    }
  }
  return mono
}

/**
 * Decode a source at full quality, solely to render a committed region out of.
 * This is the feature's peak memory moment and it is deliberately transient:
 * the caller renders its slice and lets the buffer go immediately.
 */
export async function decodeForRender(blob: Blob): Promise<AudioBuffer> {
  await Tone.start()
  // A fresh ArrayBuffer each time: decodeAudioData detaches the one it is
  // given, so a source rendered twice would otherwise fail the second time.
  return Tone.getContext().rawContext.decodeAudioData(await blob.arrayBuffer())
}

/** A source id that will not collide with another session's. */
export function newSourceId(): string {
  return `upload-${crypto.randomUUID()}`
}

import type { SampleRegion } from './sampler'

/**
 * A **slice** is the rendered audio for a committed region — the value the
 * sampler actually plays, and the thing EB2-06 persists and EB2-08 ships in a
 * bundle. Rendering at commit rather than deferring is what keeps the deck's
 * first-click promise: startup wraps stored PCM straight into an audio buffer
 * with no decode at all.
 *
 * ## Storage format
 *
 * **16-bit PCM, interleaved, the source's channel count, at the render
 * context's sample rate.** Stated here once so EB2-06 and EB2-08 read it from
 * one place:
 *
 * - **16-bit rather than Float32.** Half the storage and half the bundle for a
 *   difference nobody will hear on a drum chop, and it is the arithmetic the
 *   spec's own size budget assumes — four one-second stereo slices land at
 *   ~750–850 KB in a bundle, where Float32 would be near double.
 * - **Raw PCM rather than an encoded file.** An encoded slice would be smaller
 *   still and would put a decode back on the startup path, which is the wrong
 *   trade for this product.
 * - **The source's channel count is preserved.** Rendering in mono would save
 *   storage but not memory: decoding preserves channel count, so the render
 *   decode's peak — the reason EB2-04 caps duration — is unaffected either way.
 *
 * Everything here is pure arithmetic over buffer-shaped data, so the format
 * and the normalization are testable without a browser or a real decoder.
 */

/**
 * Every slice is peak-normalized to here on the way in. The number is not
 * arbitrary: it is the peak the shipped 909 kit is generated at, so an
 * arbitrary upload sits sensibly against the kit on the user's first hit.
 *
 * This is why the sampler needs no per-pad level control to be usable. A
 * control the user has to find first still means their first hit is 12 dB too
 * loud; normalizing is pure arithmetic over the rendered buffer and needs no UI
 * at all. Tune and fit change playback rate and are unaffected by it.
 */
export const SLICE_PEAK = 0.95

/**
 * Below this a region is silence, not quiet audio. Normalizing it would only
 * amplify a noise floor into a hiss.
 */
const SILENCE_PEAK = 1e-4

/** Structurally what a real `AudioBuffer` is, so tests can supply a fake. */
export interface RenderableAudio {
  readonly sampleRate: number
  readonly length: number
  readonly numberOfChannels: number
  getChannelData(channel: number): Float32Array
}

/** The rendered audio for one committed region. */
export interface Slice {
  sampleRate: number
  /** Channel count, preserved from the source. */
  channels: number
  /** Frames per channel. */
  frames: number
  /** Interleaved 16-bit PCM: frame 0 channel 0, frame 0 channel 1, frame 1 … */
  pcm: Int16Array
}

/**
 * What identifies a stored slice: the region it was rendered from.
 *
 * Storage keys by region rather than by pad, where the playing registry keys by
 * pad. Both are right about different things — a pad is what *has* a slice, but
 * a region is what a slice *is*. Keying storage by pad would mean a chop
 * committed while a shared beat is being previewed overwrites the recipient's
 * own audio for that pad, and "Back to my project" could not give it back.
 *
 * It also makes the orphan sweep honest: re-chopping a pad writes a new key and
 * leaves the old slice referenced by nothing, which is exactly the condition
 * the sweep looks for. And two pads chopped identically out of one break share
 * one stored slice rather than two copies.
 */
export function sliceKey(region: SampleRegion): string {
  return `${region.sourceId}|${region.start}|${region.duration}`
}

/** Where a region lands in a source's frames. */
export function sliceFrames(
  region: SampleRegion,
  sampleRate: number,
  sourceFrames: number,
): { offset: number; length: number } {
  const offset = Math.min(sourceFrames, Math.max(0, Math.round(region.start * sampleRate)))
  const length = Math.max(
    0,
    Math.min(sourceFrames - offset, Math.round(region.duration * sampleRate)),
  )
  return { offset, length }
}

/** Loudest sample in a span of one channel. */
export function peakBetween(
  samples: ArrayLike<number>,
  offset: number,
  length: number,
): number {
  let peak = 0
  for (let frame = 0; frame < length; frame += 1) {
    const magnitude = Math.abs(samples[offset + frame])
    if (magnitude > peak) peak = magnitude
  }
  return peak
}

/**
 * The gain that brings a peak to `SLICE_PEAK`, or unity for what is really
 * silence — normalizing that would only amplify a noise floor into a hiss.
 *
 * Exported because auditioning has to apply the same gain the render will: a
 * chop judged at one level and committed at another is not judged.
 */
export function normalizingGain(peak: number): number {
  return peak < SILENCE_PEAK ? 1 : SLICE_PEAK / peak
}

/**
 * The one gain that brings a rendered region to `SLICE_PEAK`. Measured over
 * the region rather than the whole source — trimming past a loud transient
 * must not leave the chop that follows it quiet — and applied identically to
 * every channel, since per-channel gains would re-pan the audio rather than
 * level it.
 */
function regionGain(source: RenderableAudio, offset: number, length: number): number {
  let peak = 0
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    peak = Math.max(peak, peakBetween(source.getChannelData(channel), offset, length))
  }
  return normalizingGain(peak)
}

/** Render a region of a decoded source into the slice the pad will play. */
export function renderSlice(source: RenderableAudio, region: SampleRegion): Slice {
  const { offset, length } = sliceFrames(region, source.sampleRate, source.length)
  const channels = source.numberOfChannels
  const gain = regionGain(source, offset, length)
  const pcm = new Int16Array(length * channels)
  for (let channel = 0; channel < channels; channel += 1) {
    const data = source.getChannelData(channel)
    for (let frame = 0; frame < length; frame += 1) {
      pcm[frame * channels + channel] = toPcm16(data[offset + frame] * gain)
    }
  }
  return { sampleRate: source.sampleRate, channels, frames: length, pcm }
}

/** One float sample as 16-bit PCM, clamped so an over-unity sample cannot wrap. */
function toPcm16(sample: number): number {
  const clamped = Math.min(1, Math.max(-1, sample))
  return Math.round(clamped * 32767)
}

/**
 * A slice unpacked into per-channel audio: the one step between stored PCM and
 * a playable buffer. Playback always comes through here, so what the user
 * hears after committing is byte-identical to what a reload will give back.
 */
export function sliceChannelData(slice: Slice): Float32Array[] {
  return Array.from({ length: slice.channels }, (_, channel) => {
    const data = new Float32Array(slice.frames)
    for (let frame = 0; frame < slice.frames; frame += 1) {
      data[frame] = slice.pcm[frame * slice.channels + channel] / 32767
    }
    return data
  })
}

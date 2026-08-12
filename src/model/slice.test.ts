import { describe, expect, it } from 'vitest'
import type { SampleRegion } from './sampler'
import {
  SLICE_PEAK,
  renderSlice,
  sliceChannelData,
  sliceDuration,
  type RenderableAudio,
} from './slice'

/**
 * A buffer-shaped fake, structurally what a real `AudioBuffer` is. Real
 * decoding is never exercised — the decoder is injected and the tests supply
 * these, which is the trade SP-04 records.
 */
function audio(sampleRate: number, channels: readonly number[][]): RenderableAudio {
  const data = channels.map((channel) => Float32Array.from(channel))
  return {
    sampleRate,
    length: data[0].length,
    numberOfChannels: data.length,
    getChannelData: (channel: number) => data[channel],
  }
}

/** A ramp is easy to read back: sample n has value n, so position is visible. */
function ramp(length: number, scale = 1): number[] {
  return Array.from({ length }, (_, i) => (i / length) * scale)
}

function region(start: number, duration: number): SampleRegion {
  return { sourceId: 'src-1', start, duration }
}

describe('renderSlice', () => {
  it('takes exactly the frames the region names, at the source rate', () => {
    const source = audio(100, [ramp(100)])

    const slice = renderSlice(source, region(0.2, 0.5))

    expect(slice.sampleRate).toBe(100)
    expect(slice.channels).toBe(1)
    expect(slice.frames).toBe(50)
  })

  it('takes them from where the region starts, not from the top of the source', () => {
    // One spike in silence: whichever frame it lands on in the slice is proof
    // of where the render actually read from.
    const spiked = ramp(100, 0).map((_, i) => (i === 30 ? 0.5 : 0))

    const slice = renderSlice(audio(100, [spiked]), region(0.2, 0.5))

    const loudest = slice.pcm.indexOf(
      slice.pcm.reduce((peak, value) => Math.max(peak, value), 0),
    )
    expect(loudest).toBe(10)
    expect(slice.pcm.filter((value) => value !== 0)).toHaveLength(1)
  })
})

/** Loudest sample of a slice, back in the 0..1 the source spoke in. */
function peakOf(pcm: Int16Array): number {
  return pcm.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) / 32767
}

describe('renderSlice normalization', () => {
  it('brings a quiet chop and a hot one to the same peak', () => {
    // The shipped 909 kit is level-matched by us at this same peak; a user's
    // chop is not. A hit lifted from a mastered track would otherwise sit
    // around 12 dB above the kit and both bury the groove and slam the master
    // drive — on the user's very first hit, before they can find a control.
    const quiet = renderSlice(audio(100, [ramp(100, 0.02)]), region(0, 1))
    const hot = renderSlice(audio(100, [ramp(100, 1)]), region(0, 1))

    expect(peakOf(quiet.pcm)).toBeCloseTo(SLICE_PEAK, 2)
    expect(peakOf(hot.pcm)).toBeCloseTo(SLICE_PEAK, 2)
  })

  it('normalizes against the region it rendered, not the whole source', () => {
    // Trimming past a loud transient must not leave the chop that follows it
    // quiet — the loud part is not in the slice, so it cannot set its level.
    const source = audio(100, [ramp(100, 0).map((_, i) => (i < 10 ? 1 : 0.1))])

    const afterTheBang = renderSlice(source, region(0.5, 0.5))

    expect(peakOf(afterTheBang.pcm)).toBeCloseTo(SLICE_PEAK, 2)
  })

  it('leaves a silent region silent rather than amplifying its noise floor', () => {
    const silence = renderSlice(audio(100, [new Array(100).fill(0)]), region(0, 1))

    expect(peakOf(silence.pcm)).toBe(0)
  })

  it('holds the balance between channels while it normalizes', () => {
    // Normalization is one gain over the whole slice. Per-channel gains would
    // re-pan the audio, which is a change to the sound rather than its level.
    const slice = renderSlice(
      audio(100, [new Array(4).fill(0.4), new Array(4).fill(0.2)]),
      region(0, 0.04),
    )

    expect(slice.channels).toBe(2)
    // Interleaved: left, right, left, right — left is twice right throughout.
    expect(slice.pcm[0] / slice.pcm[1]).toBeCloseTo(2, 2)
    expect(peakOf(slice.pcm)).toBeCloseTo(SLICE_PEAK, 2)
  })
})

describe('sliceChannelData', () => {
  it('unpacks a slice back into per-channel audio, which is what plays it', () => {
    // This is the path a stored slice takes on reload in EB2-06: PCM wraps
    // straight into an audio buffer with no decode at all, which is how the
    // deck's first-click promise survives the sampler. Playing through it now
    // means what the user hears is what a reload will give them back.
    const source = audio(100, [
      [0.5, -0.5, 0.25, 0],
      [0.1, -0.1, 0.05, 0],
    ])

    const channels = sliceChannelData(renderSlice(source, region(0, 0.04)))

    expect(channels).toHaveLength(2)
    // Peak-normalized on the way in: 0.5 became SLICE_PEAK, and everything
    // else moved with it.
    expect(Array.from(channels[0])).toEqual([
      expect.closeTo(SLICE_PEAK, 3),
      expect.closeTo(-SLICE_PEAK, 3),
      expect.closeTo(SLICE_PEAK / 2, 3),
      0,
    ])
    expect(channels[1][0]).toBeCloseTo(SLICE_PEAK / 5, 3)
  })

  it('knows how long it is, which is what the fit and light windows measure', () => {
    const slice = renderSlice(audio(100, [ramp(100)]), region(0.2, 0.5))

    expect(sliceDuration(slice)).toBeCloseTo(0.5)
  })
})

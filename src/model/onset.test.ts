import { describe, expect, it } from 'vitest'
import { detectOnsets } from './onset'

/**
 * A drum-hit-shaped burst: a low sine under a fast exponential decay. Buffers
 * are synthesized rather than decoded, which is the trade SP-04 records — the
 * detector is pure math over samples and never meets a real file here.
 */
function hits(
  sampleRate: number,
  seconds: number,
  at: readonly { time: number; amplitude?: number }[],
): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * seconds))
  for (const { time, amplitude = 0.9 } of at) {
    const start = Math.round(time * sampleRate)
    const length = Math.round(sampleRate * 0.1)
    for (let i = 0; i < length && start + i < samples.length; i += 1) {
      const decay = Math.exp(-24 * (i / sampleRate))
      samples[start + i] += amplitude * decay * Math.sin((2 * Math.PI * 180 * i) / sampleRate)
    }
  }
  return samples
}

describe('detectOnsets', () => {
  it('finds the moment a hit starts in silence', () => {
    const onsets = detectOnsets(hits(22050, 2, [{ time: 1 }]), 22050)

    expect(onsets).toHaveLength(1)
    expect(onsets[0]).toBeCloseTo(1, 1)
  })

  it('finds every hit of a run once each, in order', () => {
    const at = [{ time: 0.5 }, { time: 1 }, { time: 1.5 }, { time: 2 }]

    const onsets = detectOnsets(hits(22050, 2.5, at), 22050)

    expect(onsets).toHaveLength(4)
    onsets.forEach((onset, index) => expect(onset).toBeCloseTo(at[index].time, 1))
  })

  it('finds a ghost note as readily as the loud hit beside it', () => {
    // Level independence is the whole reason the detector reads a *rise*: a
    // chop is often the quiet hit, and a fixed loudness gate would hide it.
    const at = [{ time: 0.5 }, { time: 0.8, amplitude: 0.05 }, { time: 1.1 }]

    const onsets = detectOnsets(hits(22050, 1.5, at), 22050)

    expect(onsets).toHaveLength(3)
    expect(onsets[1]).toBeCloseTo(0.8, 1)
  })

  it('finds a hit the source opens on', () => {
    // A one-shot that was already trimmed starts on its attack. Missing it
    // would leave the editor claiming a sample has no structure at all.
    const onsets = detectOnsets(hits(22050, 0.5, [{ time: 0 }]), 22050)

    expect(onsets).toHaveLength(1)
    expect(onsets[0]).toBe(0)
  })

  it('hears nothing in silence', () => {
    expect(detectOnsets(new Float32Array(22050), 22050)).toEqual([])
  })

  it('marks where a sustained tone begins and finds no structure inside it', () => {
    // A drone is one event, not hundreds. Reporting its steady middle as
    // onsets would make navigating by structure meaningless.
    const sampleRate = 22050
    const steady = Float32Array.from(
      { length: sampleRate },
      (_, i) => 0.7 * Math.sin((2 * Math.PI * 180 * i) / sampleRate),
    )

    expect(detectOnsets(steady, sampleRate)).toEqual([0])
  })
})

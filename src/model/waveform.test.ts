import { describe, expect, it } from 'vitest'
import { waveformColumns } from './waveform'

describe('waveformColumns', () => {
  it('gives one column per pixel of the display, whatever the source length', () => {
    const samples = Float32Array.from({ length: 1000 }, () => 0.5)

    expect(waveformColumns(samples, 64)).toHaveLength(64)
    expect(waveformColumns(samples.subarray(0, 7), 64)).toHaveLength(64)
  })

  it('keeps the loudest and quietest sample of each column, so a transient survives', () => {
    // One spike inside a column of silence has to reach the display. Averaging
    // would hide exactly the hits the user is looking for.
    const samples = new Float32Array(400)
    samples[210] = 0.8
    samples[220] = -0.6

    const columns = waveformColumns(samples, 4)

    expect(columns[2]).toEqual({ min: expect.closeTo(-0.6, 5), max: expect.closeTo(0.8, 5) })
    expect(columns[0]).toEqual({ min: 0, max: 0 })
  })

  it('rests flat on silence rather than drawing noise', () => {
    expect(waveformColumns(new Float32Array(100), 2)).toEqual([
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ])
  })
})

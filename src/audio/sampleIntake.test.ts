import { describe, expect, it, vi } from 'vitest'
import { MAX_SOURCE_BYTES, MAX_SOURCE_SECONDS } from '../model/intake'
import { createSampleIntake, type DecodedSample } from './sampleIntake'

/** A file is only ever a name and a size to the intake path. */
function file(name: string, size = 1_000) {
  return { name, size }
}

/** Buffer-shaped, because a decode is what a region is later rendered out of. */
function decoded(duration: number, channels: number): DecodedSample {
  const sampleRate = 100
  return {
    duration,
    sampleRate,
    numberOfChannels: channels,
    length: Math.round(duration * sampleRate),
    getChannelData: () => new Float32Array(Math.round(duration * sampleRate)),
  }
}

function intake(overrides: {
  probeDuration?: () => Promise<number>
  decode?: () => Promise<DecodedSample>
} = {}) {
  const deps = {
    probeDuration: vi.fn(overrides.probeDuration ?? (() => Promise.resolve(2))),
    decode: vi.fn(overrides.decode ?? (() => Promise.resolve(decoded(2, 2)))),
    newSourceId: () => 'source-1',
  }
  return { deps, load: createSampleIntake<ReturnType<typeof file>>(deps).load }
}

describe('loading a file as a source', () => {
  it('describes the source by what was decoded, not by what the probe guessed', async () => {
    const { load } = intake({
      probeDuration: () => Promise.resolve(3.9),
      decode: () => Promise.resolve(decoded(4.02, 2)),
    })

    const outcome = await load(file('Warehouse Break.wav'))

    expect(outcome.status).toBe('loaded')
    if (outcome.status !== 'loaded') return
    expect(outcome.source).toEqual({
      id: 'source-1',
      name: 'Warehouse Break',
      origin: 'upload',
      duration: 4.02,
      channels: 2,
    })
    expect(outcome.buffer.duration).toBe(4.02)
  })
})

describe('audio that was recorded rather than chosen', () => {
  it('is a source like any other, marked by what made it', async () => {
    const { load } = intake()

    const outcome = await load(file('Recording 1.webm'), { origin: 'recording' })

    expect(outcome.status).toBe('loaded')
    if (outcome.status !== 'loaded') return
    // Identical in every term the audio path reads. The origin is carried for
    // the curriculum's benefit, not the audio path's.
    expect(outcome.source).toEqual({
      id: 'source-1',
      name: 'Recording 1',
      origin: 'recording',
      duration: 2,
      channels: 2,
    })
  })

  it('is gated on the length the clock that made it measured, never probed', async () => {
    // A MediaRecorder container commonly declares no duration at all, so
    // probing one would refuse every recording as over-length. The recorder's
    // own clock is exact, free, and known before any decode.
    const { deps, load } = intake()

    const outcome = await load(file('Recording 1.webm'), {
      origin: 'recording',
      knownDuration: 12,
    })

    expect(outcome.status).toBe('loaded')
    expect(deps.probeDuration).not.toHaveBeenCalled()
  })

  it('hits the same gate an over-length file hits, and is not decoded either', async () => {
    const { deps, load } = intake()

    const outcome = await load(file('Recording 1.webm'), {
      origin: 'recording',
      knownDuration: MAX_SOURCE_SECONDS + 1,
    })

    expect(outcome.status).toBe('rejected')
    if (outcome.status !== 'rejected') return
    expect(outcome.rejection.code).toBe('too-long')
    expect(deps.decode).not.toHaveBeenCalled()
  })
})

describe('the gate, before any decode', () => {
  it('refuses an oversized file having neither probed nor decoded it', async () => {
    const { deps, load } = intake()

    const outcome = await load(file('long-mix.wav', MAX_SOURCE_BYTES + 1))

    expect(outcome.status).toBe('rejected')
    if (outcome.status !== 'rejected') return
    expect(outcome.rejection.code).toBe('too-large')
    expect(deps.probeDuration).not.toHaveBeenCalled()
    expect(deps.decode).not.toHaveBeenCalled()
  })

  it('refuses an over-long file on the probe alone, never decoding it', async () => {
    const { deps, load } = intake({
      probeDuration: () => Promise.resolve(MAX_SOURCE_SECONDS + 1),
    })

    const outcome = await load(file('warehouse-set.mp3'))

    expect(outcome.status).toBe('rejected')
    if (outcome.status !== 'rejected') return
    expect(outcome.rejection.code).toBe('too-long')
    expect(deps.probeDuration).toHaveBeenCalledOnce()
    expect(deps.decode).not.toHaveBeenCalled()
  })
})

describe('audio this browser cannot read', () => {
  it('reports a refused decode as the file being the problem', async () => {
    const { load } = intake({ decode: () => Promise.reject(new Error('EncodingError')) })

    const outcome = await load(file('mystery.xyz'))

    expect(outcome.status).toBe('rejected')
    if (outcome.status !== 'rejected') return
    expect(outcome.rejection.code).toBe('undecodable')
    expect(outcome.rejection.message).toContain('mystery.xyz')
  })

  it('reports a file the probe itself could not open, rather than throwing', async () => {
    const { deps, load } = intake({
      probeDuration: () => Promise.reject(new Error('media error')),
    })

    const outcome = await load(file('not-audio.pdf'))

    expect(outcome.status).toBe('rejected')
    if (outcome.status !== 'rejected') return
    expect(outcome.rejection.code).toBe('undecodable')
    expect(deps.decode).not.toHaveBeenCalled()
  })
})

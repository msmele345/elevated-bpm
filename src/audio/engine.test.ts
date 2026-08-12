// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  CURATED_SAMPLE_SOURCE,
  assignSourceToPad,
  createSamplerSettings,
} from '../model/sampler'
import { createInitialPattern, cycleStep } from '../model/pattern'

const tone = vi.hoisted(() => {
  let resolveLoaded!: () => void
  const loadedPromise = new Promise<void>((resolve) => {
    resolveLoaded = resolve
  })
  return {
    /** The fake context's rate; slices in these tests are rendered at it. */
    sampleRate: 100,
    players: [] as Array<{
      playbackRate: number
      buffer: { duration: number }
      start: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
    }>,
    loadedPromise,
    resolveLoaded: () => resolveLoaded(),
    repeatCallbacks: [] as Array<(time: number) => void>,
  }
})

vi.mock('tone', () => {
  class AudioParam {
    value = 0
    rampTo = vi.fn((value: number) => {
      this.value = value
    })
    setValueAtTime = vi.fn()
    cancelScheduledValues = vi.fn()
  }

  class Node {
    connect() {
      return this
    }
    toDestination() {
      return this
    }
  }

  class Gain extends Node {
    gain = new AudioParam()
    constructor(value = 0) {
      super()
      this.gain.value = value
    }
  }

  class Player extends Node {
    playbackRate = 1
    // Stands in for the decoded audio a URL-constructed player holds; the
    // engine registers a pad's under its source id.
    buffer = { duration: 0.25 }
    start = vi.fn()
    stop = vi.fn()
    constructor(_url: string) {
      super()
      tone.players.push(this)
    }
  }

  class Filter extends Node {
    frequency = new AudioParam()
    Q = new AudioParam()
  }

  class Distortion extends Node {
    wet = new AudioParam()
    distortion = 0
  }

  class FeedbackDelay extends Node {
    feedback = new AudioParam()
    delayTime = new AudioParam()
  }

  class Reverb extends Node {
    wet = new AudioParam()
  }

  class Synth extends Node {
    envelope = { decay: 0 }
    triggerAttackRelease = vi.fn()
  }

  class PolySynth extends Node {
    triggerAttack = vi.fn()
    triggerRelease = vi.fn()
    triggerAttackRelease = vi.fn()
    dispose = vi.fn()
  }

  class Analyser extends Node {
    smoothing = 0
    getValue() {
      return new Float32Array()
    }
  }

  class Meter extends Node {}

  class ToneAudioBuffer {
    duration = 0.25
    constructor(source?: { duration: number }) {
      if (source) this.duration = source.duration
    }
    async load(_url: string) {
      return this
    }
    /**
     * Real Tone builds the buffer at the global context's rate. The fake
     * context runs at `tone.sampleRate`, and slices here are rendered from the
     * same rate, so frames divide back out to the duration the region named.
     */
    static fromArray(channels: Float32Array[]) {
      const buffer = new ToneAudioBuffer()
      buffer.duration = channels[0].length / tone.sampleRate
      return buffer
    }
  }

  const transport = {
    PPQ: 192,
    bpm: new AudioParam(),
    state: 'stopped',
    ticks: 0,
    scheduleRepeat: vi.fn((callback: (time: number) => void) => {
      tone.repeatCallbacks.push(callback)
    }),
    getTicksAtTime: vi.fn(() => 0),
    start: vi.fn(),
    stop: vi.fn(),
  }
  transport.bpm.value = 130

  return {
    Gain,
    Player,
    Filter,
    Distortion,
    FeedbackDelay,
    Reverb,
    Synth,
    PolySynth,
    Analyser,
    Meter,
    ToneAudioBuffer,
    getTransport: () => transport,
    getDestination: () => new Node(),
    gainToDb: (value: number) => value,
    immediate: () => 10,
    start: vi.fn().mockResolvedValue(undefined),
    loaded: vi.fn(() => tone.loadedPromise),
  }
})

async function flushPromises(): Promise<void> {
  for (let tick = 0; tick < 12; tick += 1) await Promise.resolve()
}

/**
 * Commit a region the way the app does at the synchronous seam — from an
 * already-decoded source, which the caller then drops. Real decoding is never
 * exercised here; the buffer is a fake of the shape one has.
 */
function commitSlice(
  engine: typeof import('./engine'),
  padId: 'pad1' | 'pad2' | 'pad3' | 'pad4',
  duration: number,
  level = 0.5,
): void {
  const length = Math.round(duration * tone.sampleRate)
  engine.renderPadSlice(
    padId,
    {
      sampleRate: tone.sampleRate,
      length,
      numberOfChannels: 1,
      getChannelData: () => Float32Array.from({ length }, () => level),
    },
    { sourceId: 'source-1', start: 0, duration },
  )
}

describe('live sampler audio', () => {
  it('queues the first hit behind the audio graph, applies the mixer, and schedules pads with kit timestamps', async () => {
    const engine = await import('./engine')
    engine.setSamplerSettings(
      assignSourceToPad(createSamplerSettings(), 'pad1', CURATED_SAMPLE_SOURCE),
    )
    commitSlice(engine, 'pad1', CURATED_SAMPLE_SOURCE.duration)

    engine.attackPad('computer:Digit1', 'pad1')
    await flushPromises()

    const pad1 = tone.players[5]
    expect(pad1).toBeDefined()
    // The kit is still downloading, so the first gesture waits rather than
    // being thrown away.
    expect(pad1.start).not.toHaveBeenCalled()

    tone.resolveLoaded()
    await flushPromises()
    expect(pad1.start).toHaveBeenCalledTimes(1)

    engine.releasePad('computer:Digit1')
    engine.setMixer({ kick: { muted: false, soloed: true } })
    engine.attackPad('pointer:7', 'pad1')
    await flushPromises()

    // Soloing the kick silences every other lane, pads included.
    expect(pad1.start).toHaveBeenCalledTimes(1)

    let pattern = cycleStep(createInitialPattern(), 'kick', 0)
    pattern = cycleStep(pattern, 'pad1', 0)
    engine.setPattern(pattern)
    engine.setMixer({})
    await engine.play()
    tone.repeatCallbacks[0](42)
    tone.repeatCallbacks[0](43)

    const kick = tone.players[0]
    expect(kick.start.mock.calls.slice(-2)).toEqual([[42], [43]])
    // A slice is already exactly the audio its region named, so the pad is
    // started plainly — on the same timestamps the kit lane fires on.
    expect(pad1.start.mock.calls.slice(-2)).toEqual([[42], [43]])
  })

  it('stop clears sequenced pad lights without darkening a live pad', async () => {
    const engine = await import('./engine')
    engine.setSamplerSettings(
      assignSourceToPad(
        assignSourceToPad(createSamplerSettings(), 'pad1', CURATED_SAMPLE_SOURCE),
        'pad2',
        CURATED_SAMPLE_SOURCE,
      ),
    )
    commitSlice(engine, 'pad1', CURATED_SAMPLE_SOURCE.duration)
    commitSlice(engine, 'pad2', CURATED_SAMPLE_SOURCE.duration)
    engine.setMixer({})

    engine.setPattern(cycleStep(createInitialPattern(), 'pad2', 0))
    await engine.play()

    // A lookahead-scheduled hit whose window is still open at the audio clock's
    // current time (the mock's Tone.immediate is 10).
    tone.repeatCallbacks[0](9.9)
    engine.attackPad('pointer:9', 'pad1')
    await flushPromises()

    expect(engine.getSoundingPadIds()).toEqual(['pad1', 'pad2'])

    engine.stop()

    expect(engine.getSoundingPadIds()).toEqual(['pad1'])
  })

  it('leaves a pad silent until a region has been committed to it', async () => {
    // A pad can hold a region and still have no sound — its slice is what
    // makes it audible, and that is the state a share link arrives in.
    const engine = await import('./engine')
    engine.setSamplerSettings(
      assignSourceToPad(createSamplerSettings(), 'pad3', {
        ...CURATED_SAMPLE_SOURCE,
        id: 'upload-not-rendered-yet',
        name: 'Not rendered',
      }),
    )
    engine.setMixer({})

    engine.attackPad('pointer:33', 'pad3')
    await flushPromises()
    expect(tone.players[7].start).not.toHaveBeenCalled()

    commitSlice(engine, 'pad3', 1.5)
    engine.attackPad('pointer:34', 'pad3')
    await flushPromises()

    expect(tone.players[7].start).toHaveBeenCalledWith(10)
    expect(tone.players[7].buffer.duration).toBeCloseTo(1.5)
  })

  it('plays the re-chopped slice on the next hit, without a restart', async () => {
    const engine = await import('./engine')
    engine.setSamplerSettings(
      assignSourceToPad(createSamplerSettings(), 'pad4', CURATED_SAMPLE_SOURCE),
    )
    engine.setMixer({})
    const pad4 = tone.players[8]

    commitSlice(engine, 'pad4', 1.5)
    engine.attackPad('pointer:44', 'pad4')
    await flushPromises()
    expect(pad4.buffer.duration).toBeCloseTo(1.5)

    // Reopening a region and moving an edge is a correction, not a redo: the
    // pad keeps playing, and simply plays the shorter chop from now on.
    commitSlice(engine, 'pad4', 0.4)
    engine.releasePad('pointer:44')
    engine.attackPad('pointer:45', 'pad4')
    await flushPromises()

    expect(pad4.buffer.duration).toBeCloseTo(0.4)
    expect(pad4.start).toHaveBeenCalledTimes(2)
  })
})

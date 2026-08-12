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
  // A second, independent lever: the curated asset reaching the sample
  // registry is a step *after* its download, so first-click readiness cannot
  // ride on the players' loaded promise alone.
  let resolveCuratedLoad!: () => void
  const curatedLoadPromise = new Promise<void>((resolve) => {
    resolveCuratedLoad = resolve
  })
  return {
    curatedLoadPromise,
    resolveCuratedLoad: () => resolveCuratedLoad(),
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
    async load(_url: string) {
      await tone.curatedLoadPromise
      return this
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
  // Readiness is a chain now — the players' loads and the curated registry
  // fill are awaited together — so drain generously rather than counting ticks.
  for (let tick = 0; tick < 12; tick += 1) await Promise.resolve()
}

describe('live sampler audio', () => {
  it('queues the first hit, applies the global mixer, and schedules pads with kit timestamps', async () => {
    const engine = await import('./engine')
    const settings = assignSourceToPad(
      createSamplerSettings(),
      'pad1',
      CURATED_SAMPLE_SOURCE,
    )
    engine.setSamplerSettings(settings)

    engine.attackPad('computer:Digit1', 'pad1')
    await flushPromises()

    const pad1 = tone.players[5]
    expect(pad1).toBeDefined()
    expect(pad1.start).not.toHaveBeenCalled()

    tone.resolveLoaded()
    await flushPromises()
    // The players have loaded, but the curated source has not reached the
    // registry — a pad with nothing to play must not claim to be ready.
    expect(pad1.start).not.toHaveBeenCalled()

    tone.resolveCuratedLoad()
    await flushPromises()
    expect(pad1.start).toHaveBeenCalledTimes(1)

    engine.releasePad('computer:Digit1')
    engine.setMixer({ kick: { muted: false, soloed: true } })
    engine.attackPad('pointer:7', 'pad1')
    await flushPromises()

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
    expect(pad1.start.mock.calls.slice(-2)).toEqual([
      [42, 0, CURATED_SAMPLE_SOURCE.duration],
      [43, 0, CURATED_SAMPLE_SOURCE.duration],
    ])
  })

  it('stop clears sequenced pad lights without darkening a live pad', async () => {
    const engine = await import('./engine')
    const settings = assignSourceToPad(
      assignSourceToPad(createSamplerSettings(), 'pad1', CURATED_SAMPLE_SOURCE),
      'pad2',
      CURATED_SAMPLE_SOURCE,
    )
    engine.setSamplerSettings(settings)
    engine.setMixer({})

    let pattern = cycleStep(createInitialPattern(), 'pad2', 0)
    engine.setPattern(pattern)
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

  it('leaves a pad silent while no audio is registered for its source', async () => {
    const engine = await import('./engine')
    engine.setSamplerSettings(
      assignSourceToPad(createSamplerSettings(), 'pad3', {
        ...CURATED_SAMPLE_SOURCE,
        id: 'upload-nothing-decoded-yet',
        name: 'Not loaded',
      }),
    )
    engine.setMixer({})

    engine.attackPad('pointer:33', 'pad3')
    await flushPromises()

    expect(tone.players[7].start).not.toHaveBeenCalled()
  })

  it('sounds a pad once intake registers audio under its source id', async () => {
    const engine = await import('./engine')
    const uploaded = {
      ...CURATED_SAMPLE_SOURCE,
      id: 'upload-warehouse-break',
      name: 'Warehouse Break',
      origin: 'upload' as const,
      duration: 1.5,
    }
    engine.setSamplerSettings(assignSourceToPad(createSamplerSettings(), 'pad4', uploaded))
    engine.setMixer({})
    const pad4 = tone.players[8]

    engine.attackPad('pointer:44', 'pad4')
    await flushPromises()
    expect(pad4.start).not.toHaveBeenCalled()

    // Intake's whole job in the audio layer: put a decoded buffer where the
    // pad already knows to look for it.
    engine.registerSampleSource(uploaded.id, { duration: 1.5 })
    engine.attackPad('pointer:45', 'pad4')
    await flushPromises()

    expect(pad4.start).toHaveBeenCalledWith(10, 0, 1.5)
    expect(pad4.buffer.duration).toBe(1.5)
  })
})

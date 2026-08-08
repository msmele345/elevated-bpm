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
    players: [] as Array<{
      playbackRate: number
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
    getTransport: () => transport,
    getDestination: () => new Node(),
    gainToDb: (value: number) => value,
    immediate: () => 10,
    start: vi.fn().mockResolvedValue(undefined),
    loaded: vi.fn(() => tone.loadedPromise),
  }
})

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
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
})

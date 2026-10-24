// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  CURATED_SAMPLE_SOURCE,
  assignSourceToPad,
  createSamplerSettings,
} from '../model/sampler'
import { createInitialPattern, cycleStep } from '../model/pattern'
import { midiToFrequency, resizeNoteStep, toggleNoteStep } from '../model/note'
import { createBank } from '../model/bank'
import type { Pattern } from '../model/types'
import { ACCENT_GAIN, UNACCENTED_GAIN } from './stepResolution'

/** Hand the engine a bank of one slot, selected — the deck before the bank. */
function playSoleSlot(engine: typeof import('./engine'), pattern: Pattern): void {
  engine.setBank([pattern], pattern.id)
}

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
      volume: { value: number }
      start: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
    }>,
    loadedPromise,
    resolveLoaded: () => resolveLoaded(),
    repeatCallbacks: [] as Array<(time: number) => void>,
    synths: [] as Array<{ triggerAttackRelease: ReturnType<typeof vi.fn> }>,
    polySynths: [] as Array<{
      triggerAttack: ReturnType<typeof vi.fn>
      triggerAttackRelease: ReturnType<typeof vi.fn>
    }>,
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
    /** Where this node was last connected, so a test can find a player's gain. */
    destination: unknown = null
    connect(destination?: unknown) {
      this.destination = destination
      return this
    }
    toDestination() {
      return this
    }
  }

  class Gain extends Node {
    gain = new AudioParam()
    /**
     * The value the node was built at. Real Tone ramps start a look-ahead from
     * now, so this — not the last ramp target — is what the first note hears.
     */
    built: number
    constructor(value = 0) {
      super()
      this.gain.value = value
      this.built = value
    }
  }

  class Player extends Node {
    playbackRate = 1
    volume = new AudioParam()
    // Stands in for the decoded audio a URL-constructed player holds; the
    // engine registers a pad's under its source id.
    buffer = { duration: 0.25 }
    start = vi.fn()
    stop = vi.fn()
    dispose = vi.fn()
    constructor(_url?: string) {
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
    constructor() {
      super()
      tone.synths.push(this)
    }
  }

  class PolySynth extends Node {
    triggerAttack = vi.fn()
    triggerRelease = vi.fn()
    triggerAttackRelease = vi.fn()
    dispose = vi.fn()
    constructor() {
      super()
      tone.polySynths.push(this)
    }
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
    /** Tone's own transport swing, which the Deck must leave at 0. */
    swing: 0,
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

/**
 * The analysis decode is real I/O, so it is injected and faked here — the same
 * trade the intake path makes. Quiet first half, loud second half, so an
 * audition of either has a peak worth normalizing.
 */
const analysisFake = vi.hoisted(() => {
  const sampleRate = 100
  const data = new Float32Array(200)
  for (let i = 0; i < 100; i += 1) data[i] = 0.1
  for (let i = 100; i < 200; i += 1) data[i] = 0.95
  return {
    sampleRate,
    duration: 2,
    length: 200,
    numberOfChannels: 1,
    getChannelData: () => data,
  }
})

vi.mock('./sampleDecoder', () => ({
  decodeForAnalysis: vi.fn(() => Promise.resolve(analysisFake)),
  decodeForRender: vi.fn(() => Promise.resolve(analysisFake)),
  probeDuration: vi.fn(),
  decodeSample: vi.fn(),
  newSourceId: vi.fn(),
  ANALYSIS_SAMPLE_RATE: 22050,
}))

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
    engine.setMixer({ kick: { muted: false, soloed: true, level: 1 } })
    engine.attackPad('pointer:7', 'pad1')
    await flushPromises()

    // Soloing the kick silences every other lane, pads included.
    expect(pad1.start).toHaveBeenCalledTimes(1)

    let pattern = cycleStep(createInitialPattern(), 'kick', 0)
    pattern = cycleStep(pattern, 'pad1', 0)
    playSoleSlot(engine, pattern)
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

    playSoleSlot(engine, cycleStep(createInitialPattern(), 'pad2', 0))
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

describe('committing a region', () => {
  it('reports a region that renders nothing, so no pad claims a sound it cannot make', async () => {
    // A region can land outside the decoded audio — a source that turned out
    // shorter than the editor's analysis suggested. Saying so is what lets the
    // caller leave the document alone.
    const engine = await import('./engine')
    const empty = {
      sampleRate: tone.sampleRate,
      length: 0,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(0),
    }

    const rendered = engine.renderPadSlice('pad3', empty, {
      sourceId: 'source-1',
      start: 0,
      duration: 1,
    })

    expect(rendered).toBeNull()
  })

  it('hands back the audio it rendered, so the deck can keep it', async () => {
    // A slice the engine kept to itself could be played and never stored, so
    // the render has to leave with a value: this is what reaches IndexedDB.
    const engine = await import('./engine')
    const length = 200

    const rendered = engine.renderPadSlice(
      'pad2',
      {
        sampleRate: tone.sampleRate,
        length,
        numberOfChannels: 2,
        getChannelData: () => Float32Array.from({ length }, () => 0.5),
      },
      { sourceId: 'source-1', start: 0, duration: length / tone.sampleRate },
    )

    expect(rendered?.channels).toBe(2)
    expect(rendered?.frames).toBe(length)
    expect(rendered?.pcm).toHaveLength(length * 2)
  })

  it('plays a slice given straight back from storage, with nothing decoded', async () => {
    // The startup path: stored PCM wraps into a playable buffer, so a deck with
    // four pads loaded is as quick to first sound as an empty one.
    const engine = await import('./engine')
    const { decodeForRender } = await import('./sampleDecoder')
    const decodesBefore = vi.mocked(decodeForRender).mock.calls.length
    engine.setSamplerSettings(
      assignSourceToPad(createSamplerSettings(), 'pad2', CURATED_SAMPLE_SOURCE),
    )
    engine.setMixer({})

    engine.registerSlice('pad2', {
      sampleRate: tone.sampleRate,
      channels: 1,
      frames: tone.sampleRate,
      pcm: new Int16Array(tone.sampleRate),
    })
    engine.attackPad('pointer:22', 'pad2')
    await flushPromises()

    expect(tone.players[6].buffer.duration).toBeCloseTo(1)
    expect(vi.mocked(decodeForRender).mock.calls).toHaveLength(decodesBefore)
  })

  it('reports a real render, which is what lets the document move', async () => {
    const engine = await import('./engine')
    const length = 100
    const rendered = engine.renderPadSlice(
      'pad3',
      {
        sampleRate: tone.sampleRate,
        length,
        numberOfChannels: 1,
        getChannelData: () => Float32Array.from({ length }, () => 0.5),
      },
      { sourceId: 'source-1', start: 0, duration: 1 },
    )

    expect(rendered).not.toBeNull()
  })
})

describe('reaching a stored source', () => {
  it('opens a source whose bytes only survived in storage', async () => {
    // After a reload nothing is in memory. A chop stays re-editable because the
    // original can still be reached — the deck says how, the engine asks.
    const engine = await import('./engine')
    const stored = new Blob([Uint8Array.of(1, 2, 3)])
    engine.setStoredSourceLoader(async (id) => (id === 'upload-stored' ? stored : undefined))

    await expect(engine.openSourceAnalysis('upload-stored')).resolves.toMatchObject({
      duration: 2,
    })
    // Nothing kept it, so there is nothing to open.
    await expect(engine.openSourceAnalysis('upload-reclaimed')).resolves.toBeNull()
  })
})

describe('auditioning a region', () => {
  /** The audition player is the last one built; it is created on first use. */
  const auditionPlayer = () => tone.players[tone.players.length - 1]

  it('auditions at the level the commit will render at', async () => {
    // A chop judged at one level and committed at another is not judged. The
    // mock's gainToDb is identity, so the volume *is* the gain.
    const engine = await import('./engine')
    engine.registerSourceBytes('src-audition', new Blob())
    await engine.openSourceAnalysis('src-audition')

    engine.auditionRegion({ sourceId: 'src-audition', start: 0, duration: 1 })
    await flushPromises()

    // The quiet half peaks at 0.1 and has to be lifted to the 0.95 every slice
    // is normalized to.
    expect(auditionPlayer().volume.value).toBeCloseTo(0.95 / 0.1, 4)
  })

  it('leaves a chop that is already at level alone', async () => {
    const engine = await import('./engine')
    engine.registerSourceBytes('src-audition', new Blob())
    await engine.openSourceAnalysis('src-audition')

    engine.auditionRegion({ sourceId: 'src-audition', start: 1, duration: 1 })
    await flushPromises()

    expect(auditionPlayer().volume.value).toBeCloseTo(1, 4)
  })

  it('says nothing for a source whose editor is not the one open', async () => {
    const engine = await import('./engine')
    engine.registerSourceBytes('src-audition', new Blob())
    await engine.openSourceAnalysis('src-audition')
    const player = auditionPlayer()
    const startsBefore = player.start.mock.calls.length

    engine.auditionRegion({ sourceId: 'some-other-source', start: 0, duration: 1 })

    expect(player.start.mock.calls.length).toBe(startsBefore)
  })
})

describe('the sequencer step callback', () => {
  it('applies one resolved 16th as given: chokes, drum starts at their gains, bass and stab notes', async () => {
    const engine = await import('./engine')
    const Tone = await import('tone')
    // Step 3 (index 2): an accented kick, a closed hat choking a same-step open
    // hat, a two-step bass note and a stab — every kind of sound in one 16th.
    let pattern = cycleStep(cycleStep(createInitialPattern(), 'kick', 2), 'kick', 2)
    pattern = cycleStep(pattern, 'closedHat', 2)
    pattern = cycleStep(pattern, 'openHat', 2)
    pattern = resizeNoteStep(toggleNoteStep(pattern, 'bass', 2), 'bass', 2, 1)
    pattern = toggleNoteStep(pattern, 'stab', 2)
    playSoleSlot(engine, pattern)
    engine.setMixer({})
    await engine.play()

    const [kick, , closedHat, openHat] = tone.players
    const gainOf = (player: (typeof tone.players)[number]) =>
      (player as unknown as { destination: { gain: { setValueAtTime: ReturnType<typeof vi.fn> } } })
        .destination.gain
    const bass = tone.synths[0]
    const stab = tone.polySynths.at(-1)!
    for (const mock of [kick.start, closedHat.start, openHat.start, openHat.stop]) mock.mockClear()
    gainOf(kick).setValueAtTime.mockClear()
    bass.triggerAttackRelease.mockClear()
    stab.triggerAttackRelease.mockClear()

    vi.mocked(Tone.getTransport().getTicksAtTime).mockReturnValueOnce(2 * engine.TICKS_PER_16TH)
    tone.repeatCallbacks[0](50)

    const step = 15 / 130
    expect(openHat.stop.mock.calls).toEqual([[50]])
    expect(openHat.start).not.toHaveBeenCalled()
    expect(kick.start.mock.calls).toEqual([[50]])
    expect(gainOf(kick).setValueAtTime.mock.calls).toEqual([[ACCENT_GAIN, 50]])
    expect(closedHat.start.mock.calls).toEqual([[50]])
    expect(gainOf(closedHat).setValueAtTime).toHaveBeenLastCalledWith(UNACCENTED_GAIN, 50)
    expect(bass.triggerAttackRelease.mock.calls).toEqual([[midiToFrequency(36), 2 * step, 50]])
    expect(stab.triggerAttackRelease.mock.calls).toEqual([[midiToFrequency(60), step, 50, 0.72]])
    engine.stop()
  })
})

describe('swing', () => {
  /** The gain node a kit player fires through, where accent velocity is set. */
  const gainOf = (player: (typeof tone.players)[number]) =>
    (player as unknown as { destination: { gain: { setValueAtTime: ReturnType<typeof vi.fn> } } })
      .destination.gain

  it('lands every sequenced voice on an odd 16th late by the swing offset, with Tone’s swing left at 0', async () => {
    const engine = await import('./engine')
    const Tone = await import('tone')
    // Step 2 (index 1), an odd 16th: an accented kick, a closed hat choking
    // the open hat, a pad, a bass note and a stab — every sequenced voice.
    let pattern = cycleStep(cycleStep(createInitialPattern(), 'kick', 1), 'kick', 1)
    pattern = cycleStep(pattern, 'closedHat', 1)
    pattern = cycleStep(pattern, 'openHat', 1)
    pattern = cycleStep(pattern, 'pad1', 1)
    pattern = toggleNoteStep(toggleNoteStep(pattern, 'bass', 1), 'stab', 1)
    engine.setSamplerSettings(
      assignSourceToPad(createSamplerSettings(), 'pad1', CURATED_SAMPLE_SOURCE),
    )
    commitSlice(engine, 'pad1', CURATED_SAMPLE_SOURCE.duration)
    playSoleSlot(engine, pattern)
    engine.setMixer({})
    engine.setSwing(0.75)
    await engine.play()

    const [kick, , closedHat, openHat, , pad1] = tone.players
    const bass = tone.synths[0]
    const stab = tone.polySynths.at(-1)!
    for (const mock of [kick.start, closedHat.start, openHat.stop, pad1.start]) mock.mockClear()
    gainOf(kick).setValueAtTime.mockClear()
    bass.triggerAttackRelease.mockClear()
    stab.triggerAttackRelease.mockClear()

    vi.mocked(Tone.getTransport().getTicksAtTime).mockReturnValueOnce(1 * engine.TICKS_PER_16TH)
    tone.repeatCallbacks[0](50)

    const step = 15 / 130
    // 75% is dotted: the off-beat lands half a 16th late.
    const late = 50 + 0.5 * step
    expect(openHat.stop.mock.calls).toEqual([[late]])
    expect(kick.start.mock.calls).toEqual([[late]])
    expect(gainOf(kick).setValueAtTime.mock.calls).toEqual([[ACCENT_GAIN, late]])
    expect(closedHat.start.mock.calls).toEqual([[late]])
    expect(pad1.start.mock.calls).toEqual([[late]])
    // Note lengths stay whole steps, measured from the delayed start.
    expect(bass.triggerAttackRelease.mock.calls).toEqual([[midiToFrequency(36), step, late]])
    expect(stab.triggerAttackRelease.mock.calls).toEqual([[midiToFrequency(60), step, late, 0.72]])
    // The Deck swings; Tone's transport never does.
    expect(Tone.getTransport().swing).toBe(0)
    engine.stop()
    engine.setSwing(0.5)
  })

  it('leaves an even 16th on the grid at any swing', async () => {
    const engine = await import('./engine')
    const Tone = await import('tone')
    let pattern = cycleStep(createInitialPattern(), 'kick', 4)
    pattern = toggleNoteStep(pattern, 'bass', 4)
    playSoleSlot(engine, pattern)
    engine.setMixer({})
    engine.setSwing(0.75)
    await engine.play()

    const kick = tone.players[0]
    const bass = tone.synths[0]
    kick.start.mockClear()
    bass.triggerAttackRelease.mockClear()

    vi.mocked(Tone.getTransport().getTicksAtTime).mockReturnValueOnce(4 * engine.TICKS_PER_16TH)
    tone.repeatCallbacks[0](60)

    expect(kick.start.mock.calls).toEqual([[60]])
    expect(bass.triggerAttackRelease.mock.calls).toEqual([[midiToFrequency(36), 15 / 130, 60]])
    engine.stop()
    engine.setSwing(0.5)
  })

  it('reads swing live, so a knob moved mid-loop is heard on the next odd 16th', async () => {
    const engine = await import('./engine')
    const Tone = await import('tone')
    playSoleSlot(engine, cycleStep(createInitialPattern(), 'kick', 3))
    engine.setMixer({})
    engine.setSwing(0.5)
    await engine.play()

    const kick = tone.players[0]
    kick.start.mockClear()
    vi.mocked(Tone.getTransport().getTicksAtTime).mockReturnValueOnce(3 * engine.TICKS_PER_16TH)
    tone.repeatCallbacks[0](70)
    engine.setSwing(0.66)
    vi.mocked(Tone.getTransport().getTicksAtTime).mockReturnValueOnce(19 * engine.TICKS_PER_16TH)
    tone.repeatCallbacks[0](80)

    expect(kick.start.mock.calls[0]).toEqual([70])
    expect(kick.start.mock.calls[1][0]).toBeCloseTo(80 + 0.32 * (15 / 130), 12)
    engine.stop()
    engine.setSwing(0.5)
  })

  it('never offsets live stab keys or pad hits', async () => {
    const engine = await import('./engine')
    engine.setSamplerSettings(
      assignSourceToPad(createSamplerSettings(), 'pad1', CURATED_SAMPLE_SOURCE),
    )
    commitSlice(engine, 'pad1', CURATED_SAMPLE_SOURCE.duration)
    engine.setMixer({})
    engine.setSwing(0.75)

    const pad1 = tone.players[5]
    const liveStab = tone.polySynths[0]
    pad1.start.mockClear()
    liveStab.triggerAttack.mockClear()

    engine.attackPad('pointer:swing', 'pad1')
    engine.attackStabNote('computer:KeyA', 60)
    await flushPromises()

    // Tone.immediate() in the mock is 10: live input sounds exactly then. (A
    // live pad hit also replays the pad's still-pending sequenced hits after
    // it, which is the pad voice's own rebuild — not part of this claim.)
    expect(pad1.start.mock.calls[0]).toEqual([10])
    expect(liveStab.triggerAttack.mock.calls).toEqual([[midiToFrequency(60), 10, 0.82]])
    engine.releasePad('pointer:swing')
    engine.releaseStabNote('computer:KeyA')
    engine.setSwing(0.5)
  })
})

describe('voice Level and the mixer', () => {
  type Ramp = ReturnType<typeof vi.fn>
  interface Chained {
    destination: { gain?: { rampTo: Ramp; value: number }; destination?: unknown } | null
  }
  /** The node a voice's output feeds — for a kit player, its accent gain. */
  const next = (node: unknown) => (node as Chained).destination as Chained & {
    gain: { rampTo: Ramp; value: number; setValueAtTime: Ramp }
  }
  const strip = (fields: Partial<{ muted: boolean; soloed: boolean; level: number }>) => ({
    muted: false,
    soloed: false,
    level: 1,
    ...fields,
  })

  it('gives every voice a channel gain after its accent gain, ramped to its Level', async () => {
    const engine = await import('./engine')
    await engine.unlockAudio()
    const [kick, , closedHat, , , pad1] = tone.players
    const bass = tone.synths[0]
    const stabLive = tone.polySynths[0]

    // Kit and pads: player → accent gain → channel gain.
    const kickChannel = next(next(kick))
    const hatChannel = next(next(closedHat))
    const padChannel = next(next(pad1))
    // Bass: synth → filter → channel gain. Stab: both pools → one channel gain.
    const bassChannel = next(next(bass))
    const stabChannel = next(stabLive)
    for (const channel of [kickChannel, hatChannel, padChannel, bassChannel, stabChannel]) {
      channel.gain.rampTo.mockClear()
    }

    engine.setMixer({
      closedHat: strip({ level: 0.25 }),
      pad1: strip({ level: 1.5 }),
      bass: strip({ level: 0.5, soloed: true }),
      stab: strip({ level: 0, muted: true }),
    })

    expect(hatChannel.gain.rampTo.mock.calls).toEqual([[0.25, 0.02]])
    expect(padChannel.gain.rampTo.mock.calls).toEqual([[1.5, 0.02]])
    expect(bassChannel.gain.rampTo.mock.calls).toEqual([[0.5, 0.02]])
    expect(stabChannel.gain.rampTo.mock.calls).toEqual([[0, 0.02]])
    // A voice with no strip rides at unity.
    expect(kickChannel.gain.rampTo.mock.calls).toEqual([[1, 0.02]])
    // Every channel is its own node: Level never shares a gain with accent.
    expect(new Set([kickChannel, hatChannel, padChannel, bassChannel, stabChannel]).size).toBe(5)
    expect(next(kick)).not.toBe(kickChannel)
    engine.setMixer({})
  })

  it('routes the recreated sequenced stab pool through the same channel after a stop', async () => {
    const engine = await import('./engine')
    await engine.play()
    engine.stop()
    const liveChannel = next(tone.polySynths[0])
    expect(next(tone.polySynths.at(-1)!)).toBe(liveChannel)
  })

  it('keeps live stab keys silent and unlit while the stab is muted or another voice solos', async () => {
    const engine = await import('./engine')
    await engine.unlockAudio()
    const liveStab = tone.polySynths[0]

    for (const mixer of [{ stab: strip({ muted: true }) }, { bass: strip({ soloed: true }) }]) {
      liveStab.triggerAttack.mockClear()
      engine.setMixer(mixer)
      engine.attackStabNote('computer:KeyA', 60)
      await flushPromises()

      expect(liveStab.triggerAttack).not.toHaveBeenCalled()
      expect(engine.getSoundingStabNotes()).toEqual([])
      engine.releaseStabNote('computer:KeyA')
    }

    // Solo overrides mute here too, and an unmuted stab plays at once.
    liveStab.triggerAttack.mockClear()
    engine.setMixer({ stab: strip({ muted: true, soloed: true }) })
    engine.attackStabNote('computer:KeyA', 60)
    await flushPromises()
    expect(liveStab.triggerAttack.mock.calls).toEqual([[midiToFrequency(60), 10, 0.82]])
    engine.releaseStabNote('computer:KeyA')
    engine.setMixer({})
  })

  it('skips sequenced bass and stab notes the mixer silences', async () => {
    const engine = await import('./engine')
    const Tone = await import('tone')
    playSoleSlot(engine, toggleNoteStep(toggleNoteStep(createInitialPattern(), 'bass', 6), 'stab', 6))
    engine.setMixer({ bass: strip({ muted: true }) })
    await engine.play()
    const bass = tone.synths[0]
    const stab = tone.polySynths.at(-1)!
    bass.triggerAttackRelease.mockClear()
    stab.triggerAttackRelease.mockClear()

    vi.mocked(Tone.getTransport().getTicksAtTime).mockReturnValueOnce(6 * engine.TICKS_PER_16TH)
    tone.repeatCallbacks[0](90)

    expect(bass.triggerAttackRelease).not.toHaveBeenCalled()
    expect(stab.triggerAttackRelease).toHaveBeenCalledTimes(1)
    engine.stop()
    engine.setMixer({})
  })
})

describe('the queued bank switch', () => {
  /** Slot A kicks on every 16th, slot B claps on every 16th. */
  function kickAndClapBank() {
    const a = Array.from({ length: 16 }, (_, i) => i).reduce(
      (p, i) => cycleStep(p, 'kick', i),
      createInitialPattern(),
    )
    const bank = createBank(a)
    bank[1] = Array.from({ length: 16 }, (_, i) => i).reduce(
      (p, i) => cycleStep(p, 'snare', i),
      bank[1],
    )
    return bank
  }

  async function startedWith(bank: Pattern[], selectedId: string) {
    const engine = await import('./engine')
    const Tone = await import('tone')
    const transport = Tone.getTransport() as unknown as { state: string }
    engine.setMixer({})
    engine.setBank(bank, selectedId)
    await engine.play()
    transport.state = 'started'
    const [kick, snare] = tone.players
    kick.start.mockClear()
    snare.start.mockClear()
    const fire = (stepIndex: number, time: number) => {
      vi.mocked(Tone.getTransport().getTicksAtTime).mockReturnValueOnce(
        stepIndex * engine.TICKS_PER_16TH,
      )
      tone.repeatCallbacks[0](time)
    }
    const stopAll = () => {
      engine.stop()
      transport.state = 'stopped'
    }
    return { engine, kick, snare, fire, stopAll }
  }

  it('keeps sounding the playing slot after another is pressed, until step 0', async () => {
    const bank = kickAndClapBank()
    const { engine, kick, snare, fire, stopAll } = await startedWith(bank, bank[0].id)

    engine.setBank(bank, bank[1].id)
    fire(5, 20)
    expect(kick.start.mock.calls).toEqual([[20]])
    expect(snare.start).not.toHaveBeenCalled()

    fire(0, 40)
    expect(snare.start.mock.calls).toEqual([[40]])
    expect(kick.start.mock.calls).toEqual([[20]])
    stopAll()
  })

  it('lights the playing slot by what is heard: the switch shows when its bar sounds', async () => {
    const bank = kickAndClapBank()
    const { engine, fire, stopAll } = await startedWith(bank, bank[0].id)

    expect(engine.getSlotLights()).toEqual({ playing: bank[0].id, queued: null })
    engine.setBank(bank, bank[1].id)
    expect(engine.getSlotLights()).toEqual({ playing: bank[0].id, queued: bank[1].id })

    // Step 0 is scheduled ahead, for t=50; the audio clock (the mock's
    // Tone.immediate) is still at 10, so A is what is heard and lit.
    fire(0, 50)
    expect(engine.getSlotLights()).toEqual({ playing: bank[0].id, queued: bank[1].id })
    stopAll()
  })

  it('lights the new slot once the audio clock reaches its bar', async () => {
    const bank = kickAndClapBank()
    const { engine, fire, stopAll } = await startedWith(bank, bank[0].id)

    engine.setBank(bank, bank[1].id)
    // Step 0 for t=5, which the audio clock (10) has already passed.
    fire(0, 5)
    expect(engine.getSlotLights()).toEqual({ playing: bank[1].id, queued: null })
    stopAll()
  })

  it('cancels the queue when the playing slot is pressed again', async () => {
    const bank = kickAndClapBank()
    const { engine, kick, snare, fire, stopAll } = await startedWith(bank, bank[0].id)

    engine.setBank(bank, bank[1].id)
    engine.setBank(bank, bank[0].id)
    expect(engine.getSlotLights()).toEqual({ playing: bank[0].id, queued: null })
    fire(0, 20)
    expect(kick.start.mock.calls).toEqual([[20]])
    expect(snare.start).not.toHaveBeenCalled()
    stopAll()
  })

  it('owns up to a switch already scheduled: pressed in the look-ahead, the old slot is queued again', async () => {
    const bank = kickAndClapBank()
    const { engine, fire, stopAll } = await startedWith(bank, bank[0].id)

    engine.setBank(bank, bank[1].id)
    // B's bar is scheduled for t=50 but not heard yet (the audio clock is at 10).
    fire(0, 50)
    // Too late to cancel: B comes in at the bar, so A is shown queued behind it.
    engine.setBank(bank, bank[0].id)
    expect(engine.getSlotLights()).toEqual({ playing: bank[0].id, queued: bank[0].id })
    stopAll()
  })

  it('switches at once while stopped, and stop clears a pending switch', async () => {
    const bank = kickAndClapBank()
    const { engine, kick, snare, fire, stopAll } = await startedWith(bank, bank[0].id)

    engine.setBank(bank, bank[1].id)
    stopAll()
    expect(engine.getSlotLights()).toEqual({ playing: null, queued: null })

    // Restarting mid-bar (the mock's tick says step 5) plays the selected slot.
    await engine.play()
    ;((await import('tone')).getTransport() as unknown as { state: string }).state = 'started'
    fire(5, 30)
    expect(snare.start.mock.calls).toEqual([[30]])
    expect(kick.start).not.toHaveBeenCalled()
    stopAll()
  })
})

describe('a Level set before the first gesture', () => {
  it('is in force the moment the voices exist, not one look-ahead later', async () => {
    // A saved project hands the engine its mixer before any gesture builds the
    // audio graph. A channel built at unity and ramped down afterwards would
    // play a first live note at full level for Tone's whole look-ahead.
    vi.resetModules()
    const engine = await import('./engine')
    engine.setMixer({ stab: { muted: false, soloed: false, level: 0.25 } })
    tone.resolveLoaded()
    await engine.unlockAudio()

    const stabChannel = (tone.polySynths.at(-1) as unknown as {
      destination: { built: number }
    }).destination
    expect(stabChannel.built).toBe(0.25)
  })
})

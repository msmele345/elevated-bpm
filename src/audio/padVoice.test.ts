import { describe, expect, it, vi } from 'vitest'
import { CURATED_SAMPLE_SOURCE, createSamplerSettings } from '../model/sampler'
import { ACCENT_GAIN, UNACCENTED_GAIN } from './hits'
import { createSampleRegistry } from './sampleRegistry'
import { createPadVoice } from './padVoice'

/** Stand-ins for decoded audio; the voice only ever hands them to its player. */
const CURATED_BUFFER = { duration: 0.25 }
const UPLOAD_BUFFER = { duration: 1.8 }

function registryWithCurated() {
  const registry = createSampleRegistry()
  registry.register(CURATED_SAMPLE_SOURCE.id, CURATED_BUFFER)
  return registry
}

function assignedPad(tune = 0) {
  return {
    ...createSamplerSettings().pad1,
    region: {
      sourceId: CURATED_SAMPLE_SOURCE.id,
      start: 0.025,
      duration: 0.2,
    },
    tune,
  }
}

function fakeVoice() {
  // `loaded` records every buffer handed to the player, in order — a swap is
  // only observable at this boundary, the same way a hit is.
  const loaded: Array<{ duration: number }> = []
  let held = CURATED_BUFFER
  return {
    player: {
      playbackRate: 1,
      start: vi.fn(),
      stop: vi.fn(),
      get buffer() {
        return held
      },
      set buffer(next: { duration: number }) {
        held = next
        loaded.push(next)
      },
    },
    gain: {
      gain: {
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
    },
    loaded,
  }
}

function uploadedPad() {
  return { ...assignedPad(), region: { sourceId: 'upload-1', start: 0, duration: 1.8 } }
}

function registryWithUpload() {
  const registry = registryWithCurated()
  registry.register('upload-1', UPLOAD_BUFFER)
  return registry
}

describe('pad voice', () => {
  it('starts the selected region at the scheduler timestamp with accent gain and Tune rate', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithCurated())

    const windows = voice.trigger(assignedPad(12), ACCENT_GAIN, 4.5, 4.4)

    expect(nodes.gain.gain.setValueAtTime).toHaveBeenCalledWith(ACCENT_GAIN, 4.5)
    expect(nodes.player.playbackRate).toBeCloseTo(2)
    expect(nodes.player.start).toHaveBeenCalledWith(4.5, 0.025, 0.2)
    expect(windows).toEqual([{ startsAt: 4.5, endsAt: 4.6 }])
  })

  it('restarts the same player on consecutive hits, making the pad monophonic', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithCurated())
    const pad = assignedPad()

    voice.trigger(pad, UNACCENTED_GAIN, 1, 0.9)
    voice.trigger(pad, UNACCENTED_GAIN, 1.1, 0.95)

    expect(nodes.player.start.mock.calls).toEqual([
      [1, 0.025, 0.2],
      [1.1, 0.025, 0.2],
    ])
  })

  it('does nothing while a pad is empty', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithCurated())

    expect(voice.trigger(createSamplerSettings().pad1, ACCENT_GAIN, 2, 1.9)).toEqual([])
    expect(nodes.player.start).not.toHaveBeenCalled()
    expect(nodes.gain.gain.setValueAtTime).not.toHaveBeenCalled()
  })

  it('rebuilds future transport hits after an immediate live hit is inserted ahead of them', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithCurated())
    const pad = assignedPad()

    voice.trigger(pad, UNACCENTED_GAIN, 1, 0.9)
    const rebuilt = voice.trigger(pad, ACCENT_GAIN, 0.95, 0.95)

    expect(nodes.player.stop).toHaveBeenCalledWith(0.95)
    expect(nodes.gain.gain.cancelScheduledValues).toHaveBeenCalledWith(0.95)
    expect(nodes.player.start.mock.calls).toEqual([
      [1, 0.025, 0.2],
      [0.95, 0.025, 0.2],
      [1, 0.025, 0.2],
    ])
    expect(rebuilt).toEqual([
      { startsAt: 0.95, endsAt: 1.15 },
      { startsAt: 1, endsAt: 1.2 },
    ])
  })

  it('rebuilds lookahead hits with the current Tune instead of retuning a live hit stale', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithCurated())

    voice.trigger(assignedPad(-12), UNACCENTED_GAIN, 1, 0.9)
    const rebuilt = voice.trigger(assignedPad(12), ACCENT_GAIN, 0.95, 0.95)

    expect(nodes.player.playbackRate).toBeCloseTo(2)
    expect(rebuilt).toEqual([
      { startsAt: 0.95, endsAt: 1.05 },
      { startsAt: 1, endsAt: 1.1 },
    ])
  })

  it('stays silent while the registry has no audio for the pad\'s source', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, createSampleRegistry())

    expect(voice.trigger(assignedPad(), ACCENT_GAIN, 2, 1.9)).toEqual([])
    expect(nodes.player.start).not.toHaveBeenCalled()
    expect(nodes.gain.gain.setValueAtTime).not.toHaveBeenCalled()
  })

  it("loads the resolved source's audio into its player before starting", () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithUpload())

    voice.trigger(uploadedPad(), ACCENT_GAIN, 2, 1.9)

    expect(nodes.player.buffer).toBe(UPLOAD_BUFFER)
    expect(nodes.player.start).toHaveBeenCalledWith(2, 0, 1.8)
  })

  it('does not reload the same audio on every hit', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithUpload())
    const pad = uploadedPad()

    voice.trigger(pad, UNACCENTED_GAIN, 1, 0.9)
    voice.trigger(pad, UNACCENTED_GAIN, 1.5, 1.4)
    voice.trigger(pad, UNACCENTED_GAIN, 2, 1.9)

    expect(nodes.loaded).toEqual([UPLOAD_BUFFER])
  })

  it('replays lookahead hits on the new source when a live hit swaps audio mid-rebuild', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithUpload())

    voice.trigger(assignedPad(), UNACCENTED_GAIN, 1, 0.9)
    voice.trigger(uploadedPad(), ACCENT_GAIN, 0.95, 0.95)

    // The replayed future hit reads the *new* region, not its lookahead
    // snapshot — the same rule the rebuild already applies to Tune.
    expect(nodes.player.buffer).toBe(UPLOAD_BUFFER)
    expect(nodes.player.start.mock.calls).toEqual([
      [1, 0.025, 0.2],
      [0.95, 0, 1.8],
      [1, 0, 1.8],
    ])
  })

  it('keeps each pad voice on its own queue, so one pad never rebuilds another', () => {
    const first = fakeVoice()
    const second = fakeVoice()
    const padOne = createPadVoice(first.player, first.gain, registryWithCurated())
    const padTwo = createPadVoice(second.player, second.gain, registryWithCurated())
    const pad = assignedPad()

    padOne.trigger(pad, UNACCENTED_GAIN, 1, 0.9)
    padTwo.trigger(pad, ACCENT_GAIN, 0.95, 0.95)

    expect(second.player.stop).not.toHaveBeenCalled()
    expect(second.player.start.mock.calls).toEqual([[0.95, 0.025, 0.2]])
  })
})

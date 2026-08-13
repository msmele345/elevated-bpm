import { describe, expect, it, vi } from 'vitest'
import { CURATED_SAMPLE_SOURCE, createSamplerSettings } from '../model/sampler'
import { ACCENT_GAIN, UNACCENTED_GAIN } from './hits'
import { createSliceRegistry } from './sliceRegistry'
import { createPadVoice } from './padVoice'

/** Stand-ins for rendered slices; the voice only ever hands them to its player. */
const CHOP = { duration: 0.2 }
const RECHOPPED = { duration: 1.8 }

/** One 16th at 120 BPM, so an eight-step fit target is exactly one second. */
const SECONDS_PER_STEP = 0.125

function registryWithChop(buffer = CHOP) {
  const slices = createSliceRegistry()
  slices.set('pad1', buffer)
  return slices
}

function assignedPad(tune = 0, fit: number | null = null) {
  return {
    ...createSamplerSettings().pad1,
    region: { sourceId: CURATED_SAMPLE_SOURCE.id, start: 0.025, duration: 0.2 },
    tune,
    fit,
  }
}

function fakeVoice() {
  // `loaded` records every buffer handed to the player, in order — a swap is
  // only observable at this boundary, the same way a hit is.
  const loaded: Array<{ duration: number }> = []
  let held = { duration: 0 }
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

describe('pad voice', () => {
  it('plays the whole slice at the scheduler timestamp with accent gain and Tune rate', () => {
    // A slice is already exactly the audio the region named, so playback is a
    // plain start rather than an offset into a source it no longer holds.
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithChop(), 'pad1')

    const windows = voice.trigger(assignedPad(12), ACCENT_GAIN, 4.5, 4.4, SECONDS_PER_STEP)

    expect(nodes.gain.gain.setValueAtTime).toHaveBeenCalledWith(ACCENT_GAIN, 4.5)
    expect(nodes.player.playbackRate).toBeCloseTo(2)
    expect(nodes.player.start).toHaveBeenCalledWith(4.5)
    expect(windows).toEqual([{ startsAt: 4.5, endsAt: 4.6 }])
  })

  it('locks a fitted chop to its steps, and lights the pad for exactly that long', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithChop(RECHOPPED), 'pad1')

    const windows = voice.trigger(
      assignedPad(0, 8),
      ACCENT_GAIN,
      2,
      1.9,
      SECONDS_PER_STEP,
    )

    // 1.8 s of audio into an eight-step (1 s) target: 1.8x speed, and the hit
    // lasts the one second it was told to fill.
    expect(nodes.player.playbackRate).toBeCloseTo(1.8)
    expect(windows).toEqual([{ startsAt: 2, endsAt: 3 }])
  })

  it('restarts the same player on consecutive hits, making the pad monophonic', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithChop(), 'pad1')
    const pad = assignedPad()

    voice.trigger(pad, UNACCENTED_GAIN, 1, 0.9, SECONDS_PER_STEP)
    voice.trigger(pad, UNACCENTED_GAIN, 1.1, 0.95, SECONDS_PER_STEP)

    expect(nodes.player.start.mock.calls).toEqual([[1], [1.1]])
  })

  it('is silent when nothing has been committed to the pad', () => {
    // The slice is the authority on whether a pad makes sound. A pad whose
    // audio is gone keeps its name, its Tune and its programming, and says
    // nothing — the modelled missing state, not an error.
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, createSliceRegistry(), 'pad1')

    expect(voice.trigger(assignedPad(), ACCENT_GAIN, 2, 1.9, SECONDS_PER_STEP)).toEqual([])
    expect(nodes.player.start).not.toHaveBeenCalled()
    expect(nodes.gain.gain.setValueAtTime).not.toHaveBeenCalled()
  })

  it('rebuilds future transport hits after an immediate live hit is inserted ahead of them', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithChop(), 'pad1')
    const pad = assignedPad()

    voice.trigger(pad, UNACCENTED_GAIN, 1, 0.9, SECONDS_PER_STEP)
    const rebuilt = voice.trigger(pad, ACCENT_GAIN, 0.95, 0.95, SECONDS_PER_STEP)

    expect(nodes.player.stop).toHaveBeenCalledWith(0.95)
    expect(nodes.gain.gain.cancelScheduledValues).toHaveBeenCalledWith(0.95)
    expect(nodes.player.start.mock.calls).toEqual([[1], [0.95], [1]])
    expect(rebuilt).toEqual([
      { startsAt: 0.95, endsAt: 1.15 },
      { startsAt: 1, endsAt: 1.2 },
    ])
  })

  it('rebuilds lookahead hits with the current Tune instead of retuning a live hit stale', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithChop(), 'pad1')

    voice.trigger(assignedPad(-12), UNACCENTED_GAIN, 1, 0.9, SECONDS_PER_STEP)
    const rebuilt = voice.trigger(assignedPad(12), ACCENT_GAIN, 0.95, 0.95, SECONDS_PER_STEP)

    expect(nodes.player.playbackRate).toBeCloseTo(2)
    expect(rebuilt).toEqual([
      { startsAt: 0.95, endsAt: 1.05 },
      { startsAt: 1, endsAt: 1.1 },
    ])
  })

  it('loads the pad’s slice into its player before starting, and not again on every hit', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain, registryWithChop(), 'pad1')
    const pad = assignedPad()

    voice.trigger(pad, UNACCENTED_GAIN, 1, 0.9, SECONDS_PER_STEP)
    voice.trigger(pad, UNACCENTED_GAIN, 1.5, 1.4, SECONDS_PER_STEP)
    voice.trigger(pad, UNACCENTED_GAIN, 2, 1.9, SECONDS_PER_STEP)

    expect(nodes.player.buffer).toBe(CHOP)
    expect(nodes.loaded).toEqual([CHOP])
  })

  it('picks up a re-chopped slice on the very next hit', () => {
    // Re-chopping is a document edit plus a render; nothing pushes the new
    // audio at the player, so the hit asks the registry what it should sound.
    const nodes = fakeVoice()
    const slices = registryWithChop()
    const voice = createPadVoice(nodes.player, nodes.gain, slices, 'pad1')
    const pad = assignedPad()

    voice.trigger(pad, UNACCENTED_GAIN, 1, 0.9, SECONDS_PER_STEP)
    slices.set('pad1', RECHOPPED)
    const windows = voice.trigger(pad, UNACCENTED_GAIN, 2, 1.9, SECONDS_PER_STEP)

    expect(nodes.player.buffer).toBe(RECHOPPED)
    expect(windows).toEqual([{ startsAt: 2, endsAt: 3.8 }])
  })

  it('replays lookahead hits on the new slice when a live hit swaps audio mid-rebuild', () => {
    const nodes = fakeVoice()
    const slices = registryWithChop()
    const voice = createPadVoice(nodes.player, nodes.gain, slices, 'pad1')

    voice.trigger(assignedPad(), UNACCENTED_GAIN, 1, 0.9, SECONDS_PER_STEP)
    slices.set('pad1', RECHOPPED)
    const rebuilt = voice.trigger(assignedPad(), ACCENT_GAIN, 0.95, 0.95, SECONDS_PER_STEP)

    // The replayed future hit reads the *new* slice, not its lookahead
    // snapshot — the same rule the rebuild already applies to Tune.
    expect(nodes.player.buffer).toBe(RECHOPPED)
    expect(rebuilt).toEqual([
      { startsAt: 0.95, endsAt: 2.75 },
      { startsAt: 1, endsAt: 2.8 },
    ])
  })

  it('keeps each pad voice on its own queue, so one pad never rebuilds another', () => {
    const first = fakeVoice()
    const second = fakeVoice()
    const slices = createSliceRegistry()
    slices.set('pad1', CHOP)
    slices.set('pad2', CHOP)
    const padOne = createPadVoice(first.player, first.gain, slices, 'pad1')
    const padTwo = createPadVoice(second.player, second.gain, slices, 'pad2')
    const pad = assignedPad()

    padOne.trigger(pad, UNACCENTED_GAIN, 1, 0.9, SECONDS_PER_STEP)
    padTwo.trigger(pad, ACCENT_GAIN, 0.95, 0.95, SECONDS_PER_STEP)

    expect(second.player.stop).not.toHaveBeenCalled()
    expect(second.player.start.mock.calls).toEqual([[0.95]])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { CURATED_SAMPLE_SOURCE, createSamplerSettings } from '../model/sampler'
import { ACCENT_GAIN, UNACCENTED_GAIN } from './hits'
import { createPadVoice, triggerPadVoice } from './padVoice'

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
  return {
    player: { playbackRate: 1, start: vi.fn(), stop: vi.fn() },
    gain: {
      gain: {
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
    },
  }
}

describe('triggerPadVoice', () => {
  it('starts the selected region at the scheduler timestamp with accent gain and Tune rate', () => {
    const voice = fakeVoice()

    const windows = triggerPadVoice(voice, assignedPad(12), ACCENT_GAIN, 4.5, 4.4)

    expect(voice.gain.gain.setValueAtTime).toHaveBeenCalledWith(ACCENT_GAIN, 4.5)
    expect(voice.player.playbackRate).toBeCloseTo(2)
    expect(voice.player.start).toHaveBeenCalledWith(4.5, 0.025, 0.2)
    expect(windows).toEqual([{ startsAt: 4.5, endsAt: 4.6 }])
  })

  it('restarts the same player on consecutive hits, making the pad monophonic', () => {
    const voice = fakeVoice()
    const pad = assignedPad()

    triggerPadVoice(voice, pad, UNACCENTED_GAIN, 1, 0.9)
    triggerPadVoice(voice, pad, UNACCENTED_GAIN, 1.1, 0.95)

    expect(voice.player.start.mock.calls).toEqual([
      [1, 0.025, 0.2],
      [1.1, 0.025, 0.2],
    ])
  })

  it('does nothing while a pad is empty', () => {
    const voice = fakeVoice()

    expect(triggerPadVoice(voice, createSamplerSettings().pad1, ACCENT_GAIN, 2, 1.9)).toEqual([])
    expect(voice.player.start).not.toHaveBeenCalled()
    expect(voice.gain.gain.setValueAtTime).not.toHaveBeenCalled()
  })

  it('rebuilds future transport hits after an immediate live hit is inserted ahead of them', () => {
    const voice = fakeVoice()
    const pad = assignedPad()

    triggerPadVoice(voice, pad, UNACCENTED_GAIN, 1, 0.9)
    const rebuilt = triggerPadVoice(voice, pad, ACCENT_GAIN, 0.95, 0.95)

    expect(voice.player.stop).toHaveBeenCalledWith(0.95)
    expect(voice.gain.gain.cancelScheduledValues).toHaveBeenCalledWith(0.95)
    expect(voice.player.start.mock.calls).toEqual([
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
    const voice = fakeVoice()

    triggerPadVoice(voice, assignedPad(-12), UNACCENTED_GAIN, 1, 0.9)
    const rebuilt = triggerPadVoice(voice, assignedPad(12), ACCENT_GAIN, 0.95, 0.95)

    expect(voice.player.playbackRate).toBeCloseTo(2)
    expect(rebuilt).toEqual([
      { startsAt: 0.95, endsAt: 1.05 },
      { startsAt: 1, endsAt: 1.1 },
    ])
  })
})

describe('pad voice', () => {
  it('starts the selected region at the scheduler timestamp with accent gain and Tune rate', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain)

    const windows = voice.trigger(assignedPad(12), ACCENT_GAIN, 4.5, 4.4)

    expect(nodes.gain.gain.setValueAtTime).toHaveBeenCalledWith(ACCENT_GAIN, 4.5)
    expect(nodes.player.playbackRate).toBeCloseTo(2)
    expect(nodes.player.start).toHaveBeenCalledWith(4.5, 0.025, 0.2)
    expect(windows).toEqual([{ startsAt: 4.5, endsAt: 4.6 }])
  })

  it('restarts the same player on consecutive hits, making the pad monophonic', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain)
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
    const voice = createPadVoice(nodes.player, nodes.gain)

    expect(voice.trigger(createSamplerSettings().pad1, ACCENT_GAIN, 2, 1.9)).toEqual([])
    expect(nodes.player.start).not.toHaveBeenCalled()
    expect(nodes.gain.gain.setValueAtTime).not.toHaveBeenCalled()
  })

  it('rebuilds future transport hits after an immediate live hit is inserted ahead of them', () => {
    const nodes = fakeVoice()
    const voice = createPadVoice(nodes.player, nodes.gain)
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
    const voice = createPadVoice(nodes.player, nodes.gain)

    voice.trigger(assignedPad(-12), UNACCENTED_GAIN, 1, 0.9)
    const rebuilt = voice.trigger(assignedPad(12), ACCENT_GAIN, 0.95, 0.95)

    expect(nodes.player.playbackRate).toBeCloseTo(2)
    expect(rebuilt).toEqual([
      { startsAt: 0.95, endsAt: 1.05 },
      { startsAt: 1, endsAt: 1.1 },
    ])
  })

  it('keeps each pad voice on its own queue, so one pad never rebuilds another', () => {
    const first = fakeVoice()
    const second = fakeVoice()
    const padOne = createPadVoice(first.player, first.gain)
    const padTwo = createPadVoice(second.player, second.gain)
    const pad = assignedPad()

    padOne.trigger(pad, UNACCENTED_GAIN, 1, 0.9)
    padTwo.trigger(pad, ACCENT_GAIN, 0.95, 0.95)

    expect(second.player.stop).not.toHaveBeenCalled()
    expect(second.player.start.mock.calls).toEqual([[0.95, 0.025, 0.2]])
  })
})

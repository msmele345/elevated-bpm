import { describe, expect, it } from 'vitest'
import {
  CURATED_SAMPLE_SOURCE,
  PAD_LANES,
  assignSourceToPad,
  createPadSoundingLanes,
  createSamplerSettings,
  padForKeyboardInput,
  setPadTune,
  tunePlaybackRate,
} from './sampler'

describe('sampler settings', () => {
  it('starts with four empty pads and the curated source ready to assign', () => {
    const sampler = createSamplerSettings()

    expect(PAD_LANES.map((lane) => lane.id)).toEqual(['pad1', 'pad2', 'pad3', 'pad4'])
    expect(Object.values(sampler)).toEqual([
      { region: null, tune: 0, fit: null, name: 'Pad 1' },
      { region: null, tune: 0, fit: null, name: 'Pad 2' },
      { region: null, tune: 0, fit: null, name: 'Pad 3' },
      { region: null, tune: 0, fit: null, name: 'Pad 4' },
    ])
    expect(CURATED_SAMPLE_SOURCE.origin).toBe('shipped')
  })

  it('assigns the whole source to one pad without changing its siblings', () => {
    const sampler = createSamplerSettings()
    const assigned = assignSourceToPad(sampler, 'pad2', CURATED_SAMPLE_SOURCE)

    expect(assigned.pad2).toEqual({
      region: {
        sourceId: CURATED_SAMPLE_SOURCE.id,
        start: 0,
        duration: CURATED_SAMPLE_SOURCE.duration,
      },
      tune: 0,
      fit: null,
      name: CURATED_SAMPLE_SOURCE.name,
    })
    expect(assigned.pad1).toBe(sampler.pad1)
    expect(sampler.pad2.region).toBeNull()
  })

  it('repairs saved pad settings and clamps tune to two octaves', () => {
    const restored = createSamplerSettings({
      pad1: {
        region: { sourceId: CURATED_SAMPLE_SOURCE.id, start: 0, duration: 0.2 },
        tune: 200,
        fit: 4,
        name: 'Vocal chop',
      },
      pad2: {
        region: { sourceId: '', start: -1, duration: 0 },
        tune: Number.NaN,
        fit: 999,
        name: '',
      },
    })

    expect(restored.pad1).toEqual({
      region: { sourceId: CURATED_SAMPLE_SOURCE.id, start: 0, duration: 0.2 },
      tune: 24,
      fit: 4,
      name: 'Vocal chop',
    })
    expect(restored.pad2).toEqual({ region: null, tune: 0, fit: null, name: 'Pad 2' })
  })

  it('pitches a pad by semitones without changing any other pad', () => {
    const sampler = createSamplerSettings()
    const tuned = setPadTune(sampler, 'pad3', -12)

    expect(tuned.pad3.tune).toBe(-12)
    expect(tuned.pad2).toBe(sampler.pad2)
    expect(setPadTune(sampler, 'pad1', -100).pad1.tune).toBe(-24)
  })
})

describe('tunePlaybackRate', () => {
  it('maps semitones to record-style playback speed', () => {
    expect(tunePlaybackRate(-12)).toBeCloseTo(0.5)
    expect(tunePlaybackRate(0)).toBe(1)
    expect(tunePlaybackRate(12)).toBeCloseTo(2)
  })
})

describe('padForKeyboardInput', () => {
  it('maps the printed digit keys to pads and leaves shortcuts alone', () => {
    expect(padForKeyboardInput({ code: 'Digit1', target: null })?.id).toBe('pad1')
    expect(padForKeyboardInput({ code: 'Digit4', target: null })?.id).toBe('pad4')
    expect(padForKeyboardInput({ code: 'Digit1', target: null, ctrlKey: true })).toBeUndefined()
    expect(padForKeyboardInput({ code: 'Digit5', target: null })).toBeUndefined()
  })

  it('does not steal digits from text entry, but a focused tempo fader keeps pads playable', () => {
    expect(padForKeyboardInput({ code: 'Digit2', target: { tagName: 'INPUT', type: 'text' } }))
      .toBeUndefined()
    expect(padForKeyboardInput({ code: 'Digit2', target: { tagName: 'TEXTAREA' } }))
      .toBeUndefined()
    expect(padForKeyboardInput({ code: 'Digit2', target: { isContentEditable: true } }))
      .toBeUndefined()
    expect(
      padForKeyboardInput({ code: 'Digit2', target: { tagName: 'INPUT', type: 'range' } })?.id,
    ).toBe('pad2')
  })
})

describe('createPadSoundingLanes', () => {
  it('reports live and sequenced pad light windows from audio time', () => {
    const sounding = createPadSoundingLanes()
    sounding.schedule('pad1', 1, 1.25, 'live')
    sounding.schedule('pad3', 1.1, 1.4, 'sequenced')

    expect(sounding.atTime(0.99)).toEqual([])
    expect(sounding.atTime(1.2)).toEqual(['pad1', 'pad3'])
    expect(sounding.atTime(1.3)).toEqual(['pad3'])
    expect(sounding.atTime(1.41)).toEqual([])
  })

  it('retriggering one monophonic pad replaces its prior light window', () => {
    const sounding = createPadSoundingLanes()
    sounding.schedule('pad2', 2, 3, 'sequenced')
    sounding.schedule('pad2', 2.25, 2.5, 'sequenced')

    expect(sounding.atTime(2.4)).toEqual(['pad2'])
    expect(sounding.atTime(2.6)).toEqual([])
  })

  it('clips a live window with a sequenced retrigger, because one pad is one player', () => {
    const sounding = createPadSoundingLanes()
    sounding.schedule('pad2', 2, 3, 'live')
    sounding.schedule('pad2', 2.25, 2.5, 'sequenced')

    expect(sounding.atTime(2.4)).toEqual(['pad2'])
    expect(sounding.atTime(2.6)).toEqual([])
  })

  it('clears sequenced windows on transport stop without darkening a live hit', () => {
    const sounding = createPadSoundingLanes()
    sounding.schedule('pad1', 1, 2, 'live')
    sounding.schedule('pad2', 1, 2, 'sequenced')

    sounding.clearSequenced()

    expect(sounding.atTime(1.5)).toEqual(['pad1'])
  })
})

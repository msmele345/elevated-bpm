import { describe, expect, it } from 'vitest'
import curatedBreak from './curatedBreak.json'
import {
  CURATED_SAMPLE_SOURCE,
  SHIPPED_SOURCES,
  shippedSource,
  withShippedSources,
  DEFAULT_PAD_REGION_SECONDS,
  PAD_LANES,
  assignSourceToPad,
  commitRegionToPad,
  createPadSoundingLanes,
  createSamplerSettings,
  formatPadRate,
  padAudioState,
  padForKeyboardInput,
  padPlaybackRate,
  padsUsingSource,
  setPadFit,
  setPadTune,
  tunePlaybackRate,
  type SampleRegion,
  type SampleSource,
} from './sampler'
import { sliceKey } from './slice'

const REGION: SampleRegion = { sourceId: 'upload-1', start: 0.2, duration: 0.5 }

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

describe('padAudioState', () => {
  const chopped = commitRegionToPad(createSamplerSettings(), 'pad1', REGION, 'Break').pad1
  const key = sliceKey(REGION)

  it('is fully functional with both its slice and its source', () => {
    expect(padAudioState(chopped, { slices: new Set([key]), sources: new Set(['upload-1']) })).toBe(
      'ready',
    )
  })

  it('still sounds when only the original is gone, having lost re-editability', () => {
    // The browser reclaiming space, or the user deleting a source, must never
    // be audible. The pad loses the ability to be re-chopped and nothing else.
    expect(padAudioState(chopped, { slices: new Set([key]), sources: new Set() })).toBe(
      'sourceMissing',
    )
  })

  it('goes silent but keeps its programming when the slice is gone', () => {
    // Share links produce this by design, so it is a state the deck holds
    // rather than an error — and relinking is what gets the sound back.
    expect(padAudioState(chopped, { slices: new Set(), sources: new Set(['upload-1']) })).toBe(
      'silent',
    )
  })

  it('is empty, not missing, when nothing was ever chopped onto it', () => {
    expect(
      padAudioState(createSamplerSettings().pad1, { slices: new Set(), sources: new Set() }),
    ).toBe('empty')
  })
})

describe('padsUsingSource', () => {
  it('names every pad a source is under, so deleting it can warn first', () => {
    // One source legitimately backs several pads: the warning, and the sweep,
    // both have to see all of them.
    const settings = commitRegionToPad(
      commitRegionToPad(createSamplerSettings(), 'pad1', REGION, 'Break'),
      'pad3',
      { sourceId: 'upload-1', start: 1.5, duration: 0.25 },
      'Break tail',
    )

    expect(padsUsingSource(settings, 'upload-1')).toEqual(['Break', 'Break tail'])
    expect(padsUsingSource(settings, 'upload-2')).toEqual([])
  })
})

describe('tunePlaybackRate', () => {
  it('maps semitones to record-style playback speed', () => {
    expect(tunePlaybackRate(-12)).toBeCloseTo(0.5)
    expect(tunePlaybackRate(0)).toBe(1)
    expect(tunePlaybackRate(12)).toBeCloseTo(2)
  })
})

describe('assignSourceToPad', () => {
  it('opens a long source on its first seconds rather than all of it', () => {
    // A pad's region is rendered into a slice, so assignment has a cost that
    // the old reference-into-a-source model did not: an untrimmed six-minute
    // track would render a six-minute slice. A pad is a one-shot in a
    // sixteen-step loop, so a few seconds is a starting point to trim from
    // rather than a limit on what can be chopped.
    const track = { ...CURATED_SAMPLE_SOURCE, id: 'upload-track', duration: 360 }

    const assigned = assignSourceToPad(createSamplerSettings(), 'pad1', track)

    expect(assigned.pad1.region).toEqual({
      sourceId: 'upload-track',
      start: 0,
      duration: DEFAULT_PAD_REGION_SECONDS,
    })
  })

  it('takes a short source whole, so a one-shot arrives complete', () => {
    const assigned = assignSourceToPad(
      createSamplerSettings(),
      'pad1',
      CURATED_SAMPLE_SOURCE,
    )

    expect(assigned.pad1.region?.duration).toBe(CURATED_SAMPLE_SOURCE.duration)
  })
})

describe('commitRegionToPad', () => {
  const region = { sourceId: CURATED_SAMPLE_SOURCE.id, start: 0.4, duration: 0.2 }

  it('lands a trimmed region on the chosen pad, keeping how that pad sounds', () => {
    const tuned = setPadFit(setPadTune(createSamplerSettings(), 'pad2', 5), 'pad2', 4)

    const committed = commitRegionToPad(tuned, 'pad2', region, 'Break')

    expect(committed.pad2.region).toEqual(region)
    expect(committed.pad2.name).toBe('Break')
    // Committing is a chop, not a reset: how the pad plays is the user's.
    expect(committed.pad2.tune).toBe(5)
    expect(committed.pad2.fit).toBe(4)
  })

  it('lets one source supply several pads without disturbing the others', () => {
    // Story 14: build a kit out of a single break without loading it again.
    const first = commitRegionToPad(createSamplerSettings(), 'pad1', region, 'Kick')
    const second = commitRegionToPad(
      first,
      'pad3',
      { ...region, start: 1.2 },
      'Snare',
    )

    expect(second.pad1).toBe(first.pad1)
    expect(second.pad1.region?.start).toBe(0.4)
    expect(second.pad3.region?.start).toBe(1.2)
    expect(second.pad1.region?.sourceId).toBe(second.pad3.region?.sourceId)
  })
})

describe('setPadFit', () => {
  it('takes a step target inside the bar, and nothing else', () => {
    const sampler = createSamplerSettings()

    expect(setPadFit(sampler, 'pad1', 4).pad1.fit).toBe(4)
    expect(setPadFit(sampler, 'pad1', null).pad1.fit).toBeNull()
    // A target longer than the loop, or a fraction of a step, is not a target.
    expect(setPadFit(sampler, 'pad1', 32).pad1.fit).toBeNull()
    expect(setPadFit(sampler, 'pad1', 2.5).pad1.fit).toBeNull()
  })
})

describe('padPlaybackRate', () => {
  /** One 16th at 120 BPM: an eight-step fit target is exactly one second. */
  const SECONDS_PER_STEP = 0.125

  it('plays an untargeted pad at its Tune rate, as a plain one-shot', () => {
    const pad = { ...createSamplerSettings().pad1, tune: 12 }

    expect(padPlaybackRate(pad, 1.4, SECONDS_PER_STEP)).toBeCloseTo(2)
  })

  it('locks a chop to the steps it was told to fill', () => {
    // A two-second loop asked to fill one second has to run at double speed —
    // and its pitch goes with it, the way pitching a record does. There is no
    // time-stretching anywhere in this feature.
    const pad = { ...createSamplerSettings().pad1, fit: 8 }

    expect(padPlaybackRate(pad, 2, SECONDS_PER_STEP)).toBeCloseTo(2)
    expect(padPlaybackRate(pad, 0.5, SECONDS_PER_STEP)).toBeCloseTo(0.5)
  })

  it('composes Tune and fit into one effective rate', () => {
    const pad = { ...createSamplerSettings().pad1, tune: 12, fit: 8 }

    // Fit alone would double it; an octave of Tune doubles it again.
    expect(padPlaybackRate(pad, 2, SECONDS_PER_STEP)).toBeCloseTo(4)
  })

  it('follows the tempo, so a fitted chop stays locked when the BPM moves', () => {
    const pad = { ...createSamplerSettings().pad1, fit: 8 }

    // The same chop at half the tempo: twice as long a target, half the rate.
    expect(padPlaybackRate(pad, 2, SECONDS_PER_STEP * 2)).toBeCloseTo(1)
  })
})

describe('formatPadRate', () => {
  it('says what fitting did to the chop, in speed and in pitch', () => {
    // Story 21: the tradeoff has to be visible rather than mysterious. Pitch
    // is not a side effect to hide — it is the sound of the technique.
    expect(formatPadRate(2)).toBe('200 % speed, +12.0 st')
    expect(formatPadRate(0.5)).toBe('50 % speed, -12.0 st')
    expect(formatPadRate(1)).toBe('100 % speed, +0.0 st')
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

describe('the shipped sources', () => {
  it('carries the curated break the Sampling Arc is authored against', () => {
    // A region-window lesson can only mean something musical if the app knows
    // the file, so the curated source's duration is part of the contract the
    // lesson parser validates windows against.
    expect(SHIPPED_SOURCES).toContain(CURATED_SAMPLE_SOURCE)
    expect(CURATED_SAMPLE_SOURCE.origin).toBe('shipped')
    expect(CURATED_SAMPLE_SOURCE.duration).toBeGreaterThan(3)
  })

  it('resolves a shipped source by id, and nothing else', () => {
    expect(shippedSource(CURATED_SAMPLE_SOURCE.id)).toEqual(CURATED_SAMPLE_SOURCE)
    expect(shippedSource('a-file-the-user-brought')).toBeUndefined()
  })

  it('keeps a bank the user built while retiring a shipped source the app no longer has', () => {
    // A shipped source is the app's to change; a user's own is not. Pads that
    // pointed at a retired one keep their regions and so keep sounding — they
    // lose only re-editability, which is the modelled sourceMissing state.
    const mine: SampleSource = {
      id: 'mine',
      name: 'My Break',
      origin: 'upload',
      duration: 2,
      channels: 2,
    }
    const retired: SampleSource = {
      id: 'curated-gone',
      name: 'Old Perc',
      origin: 'shipped',
      duration: 0.25,
      channels: 1,
    }

    expect(withShippedSources([retired, mine])).toEqual([mine, CURATED_SAMPLE_SOURCE])
  })

  it('never installs the curated source twice', () => {
    expect(withShippedSources([CURATED_SAMPLE_SOURCE])).toEqual([CURATED_SAMPLE_SOURCE])
  })
})

describe('the shipped break asset', () => {
  it('takes its measured shape from the generator rather than from a hand-copied number', () => {
    // The generator writes the audio and this manifest together, so the two
    // cannot drift. A window past the end of the real file would otherwise be
    // validated against a stale duration and pass.
    expect(CURATED_SAMPLE_SOURCE.duration).toBe(curatedBreak.durationSeconds)
    expect(CURATED_SAMPLE_SOURCE.channels).toBe(curatedBreak.channels)
    // Two bars at its own tempo — what "fit the break to the grid" relies on.
    const bars = (CURATED_SAMPLE_SOURCE.duration * curatedBreak.bpm) / 60 / 4
    expect(bars).toBeCloseTo(curatedBreak.bars, 3)
  })
})

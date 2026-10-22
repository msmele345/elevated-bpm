import { describe, expect, it } from 'vitest'
import { normalizeParam, formatParam } from './knob'
import {
  audibleVoiceIds,
  LEVEL_PARAMS,
  levelParamForVoice,
  MAX_LEVEL,
  VOICES,
  voiceIsAudible,
  voiceLevel,
  voiceOfLevelParam,
  type Mixer,
} from './mixer'
import type { DrumLaneId } from './types'

const ALL: DrumLaneId[] = ['kick', 'snare', 'closedHat', 'openHat', 'perc']

/** A mixer strip as v12 writes it, with only the fields under test changed. */
const mix = (fields: Partial<{ muted: boolean; soloed: boolean; level: number }>) => ({
  muted: false,
  soloed: false,
  level: 1,
  ...fields,
})

describe('audibleVoiceIds', () => {
  it('with no mutes or solos, every lane is audible', () => {
    expect(audibleVoiceIds(ALL, {})).toEqual(ALL)
  })

  it('a muted lane is silenced; the rest still sound', () => {
    const mixer: Mixer = { closedHat: mix({ muted: true }) }
    expect(audibleVoiceIds(ALL, mixer)).toEqual(['kick', 'snare', 'openHat', 'perc'])
  })

  it('when any lane is soloed, only soloed lanes sound (multiple solos allowed)', () => {
    const mixer: Mixer = { kick: mix({ soloed: true }), perc: mix({ soloed: true }) }
    expect(audibleVoiceIds(ALL, mixer)).toEqual(['kick', 'perc'])
  })

  it('solo overrides mute: a lane that is both muted and soloed still sounds', () => {
    const mixer: Mixer = { kick: mix({ muted: true, soloed: true }) }
    expect(audibleVoiceIds(ALL, mixer)).toEqual(['kick'])
  })

  it('resolves all eleven voices against one global solo rule', () => {
    const voices = VOICES.map((voice) => voice.id)

    expect(audibleVoiceIds(voices, { kick: mix({ soloed: true }) })).toEqual(['kick'])
    expect(audibleVoiceIds(voices, { pad3: mix({ soloed: true }) })).toEqual(['pad3'])
    expect(audibleVoiceIds(voices, { bass: mix({ soloed: true }) })).toEqual(['bass'])
    expect(
      audibleVoiceIds(voices, { bass: mix({ soloed: true }), kick: mix({ soloed: true }) }),
    ).toEqual(['kick', 'bass'])
    expect(audibleVoiceIds(voices, { stab: mix({ muted: true }) })).toEqual(
      voices.filter((id) => id !== 'stab'),
    )
  })
})

describe('voiceIsAudible', () => {
  it('applies the global mixer rule to a live pad before it reaches its voice', () => {
    expect(voiceIsAudible('pad1', { pad1: mix({ muted: true }) })).toBe(false)
    expect(voiceIsAudible('pad1', { kick: mix({ soloed: true }) })).toBe(false)
    expect(voiceIsAudible('pad1', { pad1: mix({ muted: true, soloed: true }) })).toBe(true)
  })

  it('applies the same rule to the stab, so live keys obey mute and solo', () => {
    expect(voiceIsAudible('stab', {})).toBe(true)
    expect(voiceIsAudible('stab', { stab: mix({ muted: true }) })).toBe(false)
    expect(voiceIsAudible('stab', { bass: mix({ soloed: true }) })).toBe(false)
    expect(voiceIsAudible('stab', { stab: mix({ muted: true, soloed: true }) })).toBe(true)
  })
})

describe('voiceLevel', () => {
  it('reads unity for a voice with no strip, or a strip written before Level existed', () => {
    expect(voiceLevel({}, 'kick')).toBe(1)
    const legacy = { kick: { muted: true, soloed: false } } as unknown as Mixer
    expect(voiceLevel(legacy, 'kick')).toBe(1)
  })

  it('reads the level a strip carries, independent of mute and solo', () => {
    expect(voiceLevel({ bass: mix({ level: 0.5, muted: true }) }, 'bass')).toBe(0.5)
    expect(voiceLevel({ bass: mix({ level: 0 }) }, 'bass')).toBe(0)
  })
})

describe('the Level knobs', () => {
  it('names eleven voices: five drums, four pads, bass and stab', () => {
    expect(VOICES.map((voice) => voice.id)).toEqual([
      'kick',
      'snare',
      'closedHat',
      'openHat',
      'perc',
      'pad1',
      'pad2',
      'pad3',
      'pad4',
      'bass',
      'stab',
    ])
  })

  it('gives every voice its own uniquely named Level knob', () => {
    expect(LEVEL_PARAMS).toHaveLength(VOICES.length)
    expect(new Set(LEVEL_PARAMS.map((param) => param.id)).size).toBe(VOICES.length)
    expect(levelParamForVoice('kick')).toMatchObject({ id: 'kickLevel', label: 'Kick Level' })
    expect(levelParamForVoice('pad1')).toMatchObject({ id: 'pad1Level', label: 'Pad 1 Level' })
    expect(levelParamForVoice('bass')).toMatchObject({ id: 'bassLevel', label: 'Bass Level' })
    for (const voice of VOICES) {
      expect(voiceOfLevelParam(levelParamForVoice(voice.id).id)).toBe(voice.id)
    }
  })

  it('runs from silence to +6 dB on the fader taper, resting at 0 dB', () => {
    const spec = levelParamForVoice('stab')
    expect(spec).toMatchObject({ min: 0, max: MAX_LEVEL, default: 1, taper: 'fader' })
    expect(20 * Math.log10(MAX_LEVEL)).toBeCloseTo(6, 9)
    expect(formatParam(spec, spec.default)).toBe('0.0 dB')
    expect(formatParam(spec, spec.min)).toBe('−∞ dB')
    expect(formatParam(spec, spec.max)).toBe('+6.0 dB')
    expect(normalizeParam(spec, spec.default)).toBeGreaterThan(0.5)
  })
})

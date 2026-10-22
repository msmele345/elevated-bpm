import { describe, expect, it } from 'vitest'
import { BASS_PARAMS } from './bass'
import { DECK_PARAMS, DECK_PARAM_IDS, deckParamSpec, isDeckParamId } from './deckParams'
import { FX_PARAMS } from './fx'
import { MASTER_PARAMS } from './master'
import { SAMPLER_PARAMS } from './sampler'
import { TRANSPORT_PARAMS } from './transport'

describe('the deck param registry', () => {
  it('holds every knob on the deck — bass, master, FX, sampler Tune, and transport Swing', () => {
    for (const param of [
      ...BASS_PARAMS,
      ...MASTER_PARAMS,
      ...FX_PARAMS,
      ...SAMPLER_PARAMS,
      ...TRANSPORT_PARAMS,
    ]) {
      expect([param.id, deckParamSpec(param.id)]).toEqual([param.id, param])
    }
    expect(DECK_PARAMS.length).toBe(
      BASS_PARAMS.length +
        MASTER_PARAMS.length +
        FX_PARAMS.length +
        SAMPLER_PARAMS.length +
        TRANSPORT_PARAMS.length,
    )
  })

  it('makes Swing a knob a lesson can name, though its value lives in the Transport', () => {
    expect(isDeckParamId('swing')).toBe(true)
    expect(deckParamSpec('swing')).toMatchObject({ min: 50, max: 75, unit: '%' })
  })

  it('gives every knob a unique id across instruments', () => {
    // Knob motion is recorded against a bare param id, so two knobs sharing one
    // would silently merge their travel and satisfy each other's sweep goals.
    expect(DECK_PARAM_IDS.size).toBe(DECK_PARAMS.length)
  })

  it('does not resolve a knob the deck does not have', () => {
    expect(isDeckParamId('cutoff')).toBe(true)
    expect(isDeckParamId('reverb')).toBe(true)
    expect(isDeckParamId('cuttof')).toBe(false)
    expect(isDeckParamId('')).toBe(false)
    expect(deckParamSpec('cuttof')).toBeUndefined()
  })
})

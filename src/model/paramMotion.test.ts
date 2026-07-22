import { describe, expect, it } from 'vitest'
import { BASS_PARAMS } from './bass'
import { NO_PARAM_MOTION, observeParamMotion, paramTravel } from './paramMotion'

const cutoff = BASS_PARAMS.find((param) => param.id === 'cutoff')!
const resonance = BASS_PARAMS.find((param) => param.id === 'resonance')!

describe('observeParamMotion', () => {
  it('records the span a knob has covered while the transport runs', () => {
    const motion = [cutoff.min, 3000, cutoff.max].reduce(
      (m, value) => observeParamMotion(m, cutoff, value, true),
      NO_PARAM_MOTION,
    )
    expect(paramTravel(motion, 'cutoff')).toBeCloseTo(1)
  })

  it('ignores a knob turned while the transport is stopped', () => {
    const motion = [cutoff.min, cutoff.max].reduce(
      (m, value) => observeParamMotion(m, cutoff, value, false),
      NO_PARAM_MOTION,
    )
    expect(paramTravel(motion, 'cutoff')).toBe(0)
  })

  it('tracks each parameter separately', () => {
    let motion = observeParamMotion(NO_PARAM_MOTION, cutoff, cutoff.min, true)
    motion = observeParamMotion(motion, cutoff, cutoff.max, true)
    motion = observeParamMotion(motion, resonance, resonance.default, true)

    expect(paramTravel(motion, 'cutoff')).toBeCloseTo(1)
    // Resonance was only ever read at one position — that is not a sweep.
    expect(paramTravel(motion, 'resonance')).toBe(0)
  })

  it('measures the span covered, so a return trip still counts as a sweep', () => {
    const swept = [900, cutoff.max, 900].reduce(
      (m, value) => observeParamMotion(m, cutoff, value, true),
      NO_PARAM_MOTION,
    )
    const jiggled = [900, 1000, 900].reduce(
      (m, value) => observeParamMotion(m, cutoff, value, true),
      NO_PARAM_MOTION,
    )
    expect(paramTravel(swept, 'cutoff')).toBeGreaterThan(0.5)
    expect(paramTravel(jiggled, 'cutoff')).toBeLessThan(0.1)
  })
})

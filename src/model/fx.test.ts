import { describe, expect, it } from 'vitest'
import {
  createFxSettings,
  DEFAULT_FX_SETTINGS,
  delaySeconds,
  FX_PARAMS,
  fxBusParams,
  MAX_DELAY_SECONDS,
  setFxParam,
} from './fx'
import { MAX_BPM, MIN_BPM } from './transport'

describe('FX_PARAMS', () => {
  it('describes one send per instrument plus the delay and reverb controls', () => {
    expect(FX_PARAMS.map((param) => param.id)).toEqual([
      'drumSend',
      'bassSend',
      'stabSend',
      'feedback',
      'reverb',
    ])
  })

  it('rests with every send at zero, so an untouched deck sounds exactly as it did before the bus', () => {
    for (const id of ['drumSend', 'bassSend', 'stabSend'] as const) {
      const spec = FX_PARAMS.find((param) => param.id === id)!
      expect([id, DEFAULT_FX_SETTINGS[id]]).toEqual([id, spec.min])
      expect([id, spec.min]).toEqual([id, 0])
    }
  })

  it('rests the delay and reverb somewhere musical, since nothing reaches them until a send opens', () => {
    expect(DEFAULT_FX_SETTINGS.feedback).toBeGreaterThan(0)
    expect(DEFAULT_FX_SETTINGS.reverb).toBeGreaterThan(0)
  })
})

describe('setFxParam', () => {
  it('sets one control and leaves the others alone', () => {
    const settings = setFxParam(DEFAULT_FX_SETTINGS, 'stabSend', 60)

    expect(settings.stabSend).toBe(60)
    expect(settings.drumSend).toBe(DEFAULT_FX_SETTINGS.drumSend)
    expect(settings.feedback).toBe(DEFAULT_FX_SETTINGS.feedback)
    expect(DEFAULT_FX_SETTINGS.stabSend).not.toBe(60)
  })

  it('clamps to the knob’s range so no value can drive the bus out of bounds', () => {
    expect(setFxParam(DEFAULT_FX_SETTINGS, 'feedback', 1e6).feedback).toBe(100)
    expect(setFxParam(DEFAULT_FX_SETTINGS, 'drumSend', -5).drumSend).toBe(0)
  })
})

describe('createFxSettings', () => {
  it('defaults the whole patch when nothing was saved', () => {
    expect(createFxSettings(undefined)).toEqual(DEFAULT_FX_SETTINGS)
    expect(createFxSettings({ nonsense: true })).toEqual(DEFAULT_FX_SETTINGS)
  })

  it('keeps saved values, repairing any that are missing or out of range', () => {
    const restored = createFxSettings({ bassSend: 35, reverb: 1e6 })

    expect(restored.bassSend).toBe(35)
    expect(restored.reverb).toBe(100)
    expect(restored.drumSend).toBe(DEFAULT_FX_SETTINGS.drumSend)
  })
})

describe('fxBusParams', () => {
  it('is silent at rest: every send closed, so nothing reaches the delay or the reverb', () => {
    const bus = fxBusParams(DEFAULT_FX_SETTINGS)

    expect(bus.drumSend).toBe(0)
    expect(bus.bassSend).toBe(0)
    expect(bus.stabSend).toBe(0)
  })

  it('opens each send independently, so one instrument can be washed and another dry', () => {
    const bus = fxBusParams({ ...DEFAULT_FX_SETTINGS, stabSend: 100 })

    expect(bus.stabSend).toBeGreaterThan(0)
    expect(bus.drumSend).toBe(0)
    expect(bus.bassSend).toBe(0)
  })

  it('keeps a fully open send below unity, so a hot echo cannot outrun the dry mix', () => {
    const bus = fxBusParams({ ...DEFAULT_FX_SETTINGS, drumSend: 100 })

    expect(bus.drumSend).toBeGreaterThan(0.5)
    expect(bus.drumSend).toBeLessThan(1)
  })

  it('holds feedback short of unity at the top of the knob, so the delay can never run away', () => {
    const full = fxBusParams({ ...DEFAULT_FX_SETTINGS, feedback: 100 })
    const half = fxBusParams({ ...DEFAULT_FX_SETTINGS, feedback: 50 })

    expect(full.feedback).toBeGreaterThan(half.feedback)
    expect(full.feedback).toBeLessThan(1)
  })

  it('never sends the reverb fully wet, so the repeats stay audible through the smear', () => {
    const full = fxBusParams({ ...DEFAULT_FX_SETTINGS, reverb: 100 })
    const none = fxBusParams({ ...DEFAULT_FX_SETTINGS, reverb: 0 })

    expect(none.reverbWet).toBe(0)
    expect(full.reverbWet).toBeGreaterThan(0)
    expect(full.reverbWet).toBeLessThan(1)
  })
})

describe('delaySeconds', () => {
  it('is the dotted eighth — three sixteenths of the bar, the techno delay', () => {
    // A 16th at 130 BPM is 15/130 s; the dotted eighth is exactly three of them.
    expect(delaySeconds(130)).toBeCloseTo((3 * 15) / 130, 10)
  })

  it('moves with the tempo, so the repeats stay on the grid rather than in milliseconds', () => {
    // Twice the tempo, half the delay: the division is musical, not absolute.
    expect(delaySeconds(140)).toBeCloseTo(delaySeconds(70) / 2, 10)
    expect(delaySeconds(MAX_BPM)).toBeLessThan(delaySeconds(MIN_BPM))
  })

  it('fits inside the delay line at the slowest tempo the transport allows', () => {
    // maxDelay is fixed when the node is built, so the longest division the
    // tempo range can ask for has to fit or the repeats clip to the ceiling.
    expect(delaySeconds(MIN_BPM)).toBeLessThanOrEqual(MAX_DELAY_SECONDS)
  })
})

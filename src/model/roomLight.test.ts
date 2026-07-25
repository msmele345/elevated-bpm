import { describe, expect, it } from 'vitest'
import {
  BREATHE_PERIOD_S,
  accentAtBeatInBar,
  beatsPerPulseForBpm,
  breatheAtTime,
  COOL_PERIOD_S,
  coolMixAtTime,
  MAX_FLASH_HZ,
  roomLightAt,
  strobeAtPhase,
} from './roomLight'

describe('strobeAtPhase', () => {
  it('swells on the beat and carries light through it instead of snapping off', () => {
    expect(strobeAtPhase(0)).toBe(1)
    // a swell, not a strobe hit: clearly still lit mid-beat
    expect(strobeAtPhase(0.5)).toBeGreaterThan(0.2)
    // but back to near-dark by the next beat, so the pulse still reads
    expect(strobeAtPhase(1)).toBeLessThan(0.1)
  })

  it('decays monotonically through the beat — a flash, not a flicker', () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.99].map(strobeAtPhase)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThan(samples[i - 1])
    }
  })
})

describe('breatheAtTime', () => {
  it('starts dark, swells to full at half period, and returns to dark', () => {
    expect(breatheAtTime(0)).toBe(0)
    expect(breatheAtTime(BREATHE_PERIOD_S / 2)).toBeCloseTo(1, 5)
    expect(breatheAtTime(BREATHE_PERIOD_S)).toBeCloseTo(0, 5)
  })

  it('stays within 0..1 at every sampled moment', () => {
    for (let t = 0; t < BREATHE_PERIOD_S * 3; t += 0.137) {
      const v = breatheAtTime(t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('beatsPerPulseForBpm', () => {
  it('pulses on every quarter note at club tempos', () => {
    expect(beatsPerPulseForBpm(60)).toBe(1)
    expect(beatsPerPulseForBpm(130)).toBe(1)
    expect(beatsPerPulseForBpm(180)).toBe(1)
  })

  it('drops to half notes above the flash threshold', () => {
    expect(beatsPerPulseForBpm(181)).toBe(2)
    expect(beatsPerPulseForBpm(200)).toBe(2)
  })

  it('never flashes faster than the photosafety cap across the whole BPM range', () => {
    for (let bpm = 60; bpm <= 200; bpm++) {
      expect(bpm / 60 / beatsPerPulseForBpm(bpm)).toBeLessThanOrEqual(MAX_FLASH_HZ)
    }
  })
})

describe('accentAtBeatInBar', () => {
  it('swells hardest on the 1, nods on the other beats', () => {
    expect(accentAtBeatInBar(0)).toBe(1)
    expect(accentAtBeatInBar(1)).toBeLessThan(1)
    expect(accentAtBeatInBar(3)).toBeLessThan(1)
    // the 3 gets a secondary lift over the 2 and 4 — ONE two THREE four
    expect(accentAtBeatInBar(2)).toBeGreaterThan(accentAtBeatInBar(1))
    expect(accentAtBeatInBar(2)).toBeGreaterThan(accentAtBeatInBar(3))
  })

  it('wraps every four beats', () => {
    expect(accentAtBeatInBar(4)).toBe(accentAtBeatInBar(0))
    expect(accentAtBeatInBar(9)).toBe(accentAtBeatInBar(1))
  })
})

describe('coolMixAtTime', () => {
  it('drifts from warm to full club color and back over one period', () => {
    expect(coolMixAtTime(0)).toBe(0)
    expect(coolMixAtTime(COOL_PERIOD_S / 2)).toBeCloseTo(1, 5)
    expect(coolMixAtTime(COOL_PERIOD_S)).toBeCloseTo(0, 5)
  })

  it('never jumps at the wrap — samples either side of the period boundary stay warm', () => {
    expect(coolMixAtTime(COOL_PERIOD_S - 0.05)).toBeLessThan(0.01)
    expect(coolMixAtTime(COOL_PERIOD_S + 0.05)).toBeLessThan(0.01)
  })
})

describe('roomLightAt', () => {
  // 480 PPQ like Tone.js: one quarter note is 480 ticks.
  const TICKS_PER_BEAT = 480

  it('never strobes a stopped transport — the room only breathes and drifts', () => {
    const light = roomLightAt({ ticks: -1, ticksPerBeat: TICKS_PER_BEAT, bpm: 130, nowSeconds: 1.5 })
    expect(light.pulse).toBe(0)
    expect(light.breathe).toBeCloseTo(breatheAtTime(1.5), 10)
    expect(light.cool).toBeCloseTo(coolMixAtTime(1.5), 10)
  })

  it('swells full exactly on the 1 and carries through it', () => {
    const onBeat = roomLightAt({ ticks: 4 * TICKS_PER_BEAT, ticksPerBeat: TICKS_PER_BEAT, bpm: 130, nowSeconds: 0 })
    expect(onBeat.pulse).toBe(1)
    const quarterThrough = roomLightAt({
      ticks: 4.25 * TICKS_PER_BEAT,
      ticksPerBeat: TICKS_PER_BEAT,
      bpm: 130,
      nowSeconds: 0,
    })
    expect(quarterThrough.pulse).toBeCloseTo(strobeAtPhase(0.25), 10)
  })

  it('swells the 1 harder than the other beats', () => {
    const at = (beats: number) =>
      roomLightAt({ ticks: beats * TICKS_PER_BEAT, ticksPerBeat: TICKS_PER_BEAT, bpm: 130, nowSeconds: 0 }).pulse
    expect(at(4)).toBe(1) // the 1
    expect(at(5)).toBeCloseTo(0.4, 10) // the 2 nods
    expect(at(6)).toBeCloseTo(0.6, 10) // the 3 lifts
    expect(at(7)).toBeCloseTo(0.4, 10) // the 4 nods
  })

  it('holds one accent across a multi-beat pulse period past the flash threshold', () => {
    // At 200 BPM the pulse spans two beats; mid-period the accent of the
    // period's starting beat holds, so the swell never dips mid-swell.
    const midPeriod = roomLightAt({
      ticks: 3.5 * TICKS_PER_BEAT,
      ticksPerBeat: TICKS_PER_BEAT,
      bpm: 200,
      nowSeconds: 0,
    })
    expect(midPeriod.pulse).toBeCloseTo(0.6 * strobeAtPhase(0.75), 10)
  })

  it('spans the pulse over two beats past the flash threshold', () => {
    // At 200 BPM the pulse period is two quarter notes, so one beat after a
    // pulse the room is mid-decay instead of flashing again.
    const oneBeatAfter = roomLightAt({
      ticks: 5 * TICKS_PER_BEAT,
      ticksPerBeat: TICKS_PER_BEAT,
      bpm: 200,
      nowSeconds: 0,
    })
    expect(oneBeatAfter.pulse).toBeCloseTo(strobeAtPhase(0.5), 10)
  })

  it('keeps breathing and drifting underneath the swell while playing', () => {
    const light = roomLightAt({ ticks: 0, ticksPerBeat: TICKS_PER_BEAT, bpm: 130, nowSeconds: 3 })
    expect(light.pulse).toBe(1)
    expect(light.breathe).toBeCloseTo(breatheAtTime(3), 10)
    expect(light.cool).toBeCloseTo(coolMixAtTime(3), 10)
  })
})

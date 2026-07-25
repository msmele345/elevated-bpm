import { describe, expect, it } from 'vitest'
import {
  BREATHE_PERIOD_S,
  beatsPerPulseForBpm,
  breatheAtTime,
  MAX_FLASH_HZ,
  roomLightAt,
  strobeAtPhase,
} from './roomLight'

describe('strobeAtPhase', () => {
  it('flashes at full brightness on the beat and decays to near zero by the next', () => {
    expect(strobeAtPhase(0)).toBe(1)
    expect(strobeAtPhase(1)).toBeLessThan(0.05)
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

describe('roomLightAt', () => {
  // 480 PPQ like Tone.js: one quarter note is 480 ticks.
  const TICKS_PER_BEAT = 480

  it('never strobes a stopped transport — the room only breathes', () => {
    const light = roomLightAt({ ticks: -1, ticksPerBeat: TICKS_PER_BEAT, bpm: 130, nowSeconds: 1.5 })
    expect(light.pulse).toBe(0)
    expect(light.breathe).toBeCloseTo(breatheAtTime(1.5), 10)
  })

  it('flashes full exactly on the beat and decays through it', () => {
    const onBeat = roomLightAt({ ticks: 3 * TICKS_PER_BEAT, ticksPerBeat: TICKS_PER_BEAT, bpm: 130, nowSeconds: 0 })
    expect(onBeat.pulse).toBe(1)
    const quarterThrough = roomLightAt({
      ticks: 3.25 * TICKS_PER_BEAT,
      ticksPerBeat: TICKS_PER_BEAT,
      bpm: 130,
      nowSeconds: 0,
    })
    expect(quarterThrough.pulse).toBeCloseTo(strobeAtPhase(0.25), 10)
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

  it('keeps breathing underneath the strobe while playing', () => {
    const light = roomLightAt({ ticks: 0, ticksPerBeat: TICKS_PER_BEAT, bpm: 130, nowSeconds: 3 })
    expect(light.pulse).toBe(1)
    expect(light.breathe).toBeCloseTo(breatheAtTime(3), 10)
  })
})

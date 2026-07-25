import { useEffect } from 'react'
import * as engine from '../audio/engine'
import { roomLightAt } from '../model/roomLight'

/**
 * Drives the club-room backdrop. Runs on requestAnimationFrame reading the
 * transport directly and writes two CSS variables on <body> — --pulse (the
 * beat strobe) and --breathe (the idle swell) — never React state, so the
 * room strobes in sync with the audio without per-frame re-renders (the
 * performance rule in plans/elevated-bpm-v1.md, same pattern as usePlayhead).
 *
 * The loop also runs while stopped: --pulse rests at 0 and --breathe keeps
 * the room dimly alive. Values are quantized to centi-units so style writes
 * only happen when a value actually changes.
 */
export function useRoomLight(isPlaying: boolean, bpm: number): void {
  useEffect(() => {
    let rafId = 0
    let lastPulse = -1
    let lastBreathe = -1
    const ticksPerBeat = engine.TICKS_PER_16TH * 4

    const tick = (nowMs: number) => {
      // Absolute wall clock (not effect-relative) so re-running this effect
      // on a BPM edit doesn't visibly restart the breathe mid-swell.
      const light = roomLightAt({
        ticks: engine.getTransportTicks(),
        ticksPerBeat,
        bpm,
        nowSeconds: nowMs / 1000,
      })
      const pulse = Math.round(light.pulse * 100) / 100
      const breathe = Math.round(light.breathe * 100) / 100
      if (pulse !== lastPulse) {
        document.body.style.setProperty('--pulse', String(pulse))
        lastPulse = pulse
      }
      if (breathe !== lastBreathe) {
        document.body.style.setProperty('--breathe', String(breathe))
        lastBreathe = breathe
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, bpm])
}

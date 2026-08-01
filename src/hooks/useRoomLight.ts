import { useEffect, useRef } from 'react'
import * as engine from '../audio/engine'
import { roomLightAt } from '../model/roomLight'

/**
 * Drives the club-room backdrop. Runs on requestAnimationFrame reading the
 * transport directly and writes three CSS variables on <body> — --pulse (the
 * bar-accented swell), --breathe (the idle swell), and --cool (the warm ↔
 * club-color drift) — never React state, so the room moves in sync with the
 * audio without per-frame re-renders (the performance rule in
 * plans/elevated-bpm-v1.md, same pattern as usePlayhead).
 *
 * The loop also runs while stopped: --pulse rests at 0 while --breathe and
 * --cool keep the room dimly alive. Values are quantized to centi-units so
 * style writes only happen when a value actually changes.
 *
 * Tempo is read through a ref rather than taken as a dependency: dragging the
 * fader emits a BPM per input event, and rebuilding this effect that often
 * would cancel and re-request the frame — and forget the last written values,
 * forcing three style writes — dozens of times a second, during the one
 * interaction most likely to be happening while the loop runs.
 */
export function useRoomLight(isPlaying: boolean, bpm: number): void {
  const bpmRef = useRef(bpm)
  bpmRef.current = bpm

  useEffect(() => {
    let rafId = 0
    let lastPulse = -1
    let lastBreathe = -1
    let lastCool = -1
    const ticksPerBeat = engine.TICKS_PER_16TH * 4

    const tick = (nowMs: number) => {
      // Absolute wall clock (not effect-relative) so re-running this effect
      // on a BPM edit doesn't visibly restart the breathe mid-swell.
      const light = roomLightAt({
        ticks: engine.getTransportTicks(),
        ticksPerBeat,
        bpm: bpmRef.current,
        nowSeconds: nowMs / 1000,
      })
      const pulse = Math.round(light.pulse * 100) / 100
      const breathe = Math.round(light.breathe * 100) / 100
      const cool = Math.round(light.cool * 100) / 100
      if (pulse !== lastPulse) {
        document.body.style.setProperty('--pulse', String(pulse))
        lastPulse = pulse
      }
      if (breathe !== lastBreathe) {
        document.body.style.setProperty('--breathe', String(breathe))
        lastBreathe = breathe
      }
      if (cool !== lastCool) {
        document.body.style.setProperty('--cool', String(cool))
        lastCool = cool
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying])
}

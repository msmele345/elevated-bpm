import { useEffect, type RefObject } from 'react'
import * as engine from '../audio/engine'

const PLAYHEAD_CLASS = 'is-playhead'

/**
 * Sweeps the playhead across the step grid while playing. Runs on
 * requestAnimationFrame reading the transport directly and toggles a CSS
 * class on the step buttons via the DOM — never React state — so the
 * playhead stays visually locked to the audio without per-16th re-renders
 * (the performance rule in plans/elevated-bpm-v1.md).
 */
export function usePlayhead(rootRef: RefObject<HTMLElement | null>, isPlaying: boolean): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !isPlaying) return

    let rafId = 0
    let lastStep = -1

    const clear = () => {
      root
        .querySelectorAll(`.${PLAYHEAD_CLASS}`)
        .forEach((el) => el.classList.remove(PLAYHEAD_CLASS))
    }

    const tick = () => {
      const step = engine.getCurrentStep()
      if (step !== lastStep) {
        clear()
        if (step >= 0) {
          root
            .querySelectorAll(`[data-step-index="${step}"]`)
            .forEach((el) => el.classList.add(PLAYHEAD_CLASS))
        }
        lastStep = step
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      clear()
    }
  }, [rootRef, isPlaying])
}

import { useEffect, type RefObject } from 'react'
import * as engine from '../audio/engine'

/**
 * Lights the pattern bank while playing: the playing slot's LED, the queued
 * slot's blink, each slot's spoken state, and the deck-wide "editing ≠
 * hearing" indication. Runs on requestAnimationFrame reading the engine and
 * writes the DOM directly — never React state — because a queued slot takes
 * over on the audio clock, at the bar line (the performance rule in
 * plans/elevated-bpm-v1.md). Stopped, nothing is playing and nothing is
 * queued, so everything is cleared.
 */
export function useSlotLights(rootRef: RefObject<HTMLElement | null>, isPlaying: boolean): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !isPlaying) return

    let rafId = 0
    let last = ''

    const show = (playing: string | null, queued: string | null) => {
      let editing: string | null = null
      let hearing: string | null = null
      root.querySelectorAll<HTMLElement>('[data-slot-id]').forEach((slot) => {
        const id = slot.dataset.slotId!
        if (id === playing) hearing = slot.dataset.slotLetter ?? null
        if (id === queued) editing = slot.dataset.slotLetter ?? null
        slot.toggleAttribute('data-playing', id === playing)
        slot.toggleAttribute('data-queued', id === queued)
        const state = slot.querySelector('[data-slot-state]')
        if (state) state.textContent = id === playing ? ', playing' : id === queued ? ', queued' : ''
      })
      const notice = root.querySelector<HTMLElement>('[data-bank-notice]')
      if (editing && hearing) {
        root.setAttribute('data-bank-queued', '')
        if (notice) {
          notice.textContent = `Editing ${editing} · hearing ${hearing} until the bar ends`
          notice.hidden = false
        }
      } else {
        root.removeAttribute('data-bank-queued')
        if (notice) {
          notice.textContent = ''
          notice.hidden = true
        }
      }
    }

    const tick = () => {
      const { playing, queued } = engine.getSlotLights()
      // The slots' own ids are part of what was drawn: a bank swapped in by a
      // shared beat brings new buttons that have never been lit.
      const slotIds = Array.from(root.querySelectorAll<HTMLElement>('[data-slot-id]'), (slot) =>
        slot.dataset.slotId,
      ).join()
      const key = `${playing}|${queued}|${slotIds}`
      if (key !== last) {
        show(playing, queued)
        last = key
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      show(null, null)
    }
  }, [rootRef, isPlaying])
}

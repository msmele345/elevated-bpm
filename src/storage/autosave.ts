import type { ProjectState } from '../model/projectState'

/**
 * Trailing-edge debounced autosave. Rapid edits (step taps, BPM nudges)
 * coalesce into one IndexedDB write of the latest state, so persistence
 * never competes with the audio clock during a burst of interaction.
 */

export interface Autosaver {
  /** Note the latest state; the save fires delayMs after the last call. */
  schedule(state: ProjectState): void
  /** Save any pending state now (e.g. on pagehide, before the timer fires). */
  flush(): void
  /**
   * Drop any pending save without writing it. For teardown: a debounced write
   * must not outlive the deck that scheduled it and fire into a torn-down
   * world. Durability on the paths that matter — refresh, tab close — is
   * already covered by `flush`.
   */
  cancel(): void
}

export function createAutosaver(
  save: (state: ProjectState) => Promise<void>,
  delayMs: number,
): Autosaver {
  let pending: ProjectState | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const fire = () => {
    timer = null
    if (pending === null) return
    const state = pending
    pending = null
    void save(state)
  }

  return {
    schedule(state) {
      pending = state
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(fire, delayMs)
    },
    flush() {
      if (timer !== null) clearTimeout(timer)
      fire()
    },
    cancel() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      pending = null
    },
  }
}

import { padPlaybackRate, type PadSettings } from '../model/sampler'
import type { PadLaneId } from '../model/types'
import type { SampleBuffer, SliceRegistry } from './sliceRegistry'

/** The small part of Tone.Player the sampler's one-shot contract needs. */
export interface PadPlayer {
  playbackRate: number
  buffer: SampleBuffer
  start(time: number): unknown
  stop(time: number): unknown
}

/** The small part of Tone.Gain a pad's per-hit velocity needs. */
export interface PadGain {
  gain: {
    setValueAtTime(value: number, time: number): unknown
    cancelScheduledValues(time: number): unknown
  }
}

export interface PadSoundWindow {
  startsAt: number
  endsAt: number
}

interface PendingPadHit extends PadSoundWindow {
  gain: number
}

/**
 * One pad's playing surface: its player, its gain, and the future hits the
 * transport lookahead has already handed to that player.
 *
 * A pad is an owning object rather than a free function over shared state
 * because the queue is genuinely per-pad — the same reason the stab pool is a
 * factory. Callers see one verb and never the bookkeeping behind it.
 */
export interface PadVoice {
  /**
   * Fire one pad, returning the light windows it opened. `time` is when the
   * hit should sound; `currentTime` is where the audio clock is now, which is
   * what separates a hit still in the lookahead from one already gone.
   * `secondsPerStep` is the transport's current 16th, so a fit-to-steps target
   * stays locked when the tempo moves.
   */
  trigger(
    pad: PadSettings,
    gain: number,
    time: number,
    currentTime: number,
    secondsPerStep: number,
  ): PadSoundWindow[]
}

export function createPadVoice(
  player: PadPlayer,
  gain: PadGain,
  slices: SliceRegistry,
  padId: PadLaneId,
): PadVoice {
  let pending: PendingPadHit[] = []
  /** The slice the player is currently holding. */
  let heldSlice: SampleBuffer | null = null

  return {
    trigger(pad, hitGain, time, currentTime, secondsPerStep) {
      // The slice is the authority on whether a pad makes sound — not its
      // region, which is only what a re-chop reopens. A pad whose audio is
      // gone keeps its name, Tune, fit and programming and stays quiet.
      const slice = slices.get(padId)
      if (!slice) return []

      // Resolve at trigger time, and swap only on a real change. A pad can be
      // re-chopped mid-playback, so the hit asks what it should sound rather
      // than trusting something to have pushed it here first.
      //
      // This runs before every start below — including the rebuild's replayed
      // ones. A player's buffer is pad-global and live, exactly like its
      // playbackRate, so a swap has to be part of the rebuild rather than a
      // separate mutation racing it.
      if (slice !== heldSlice) {
        player.buffer = slice
        heldSlice = slice
      }

      // Rate and length are read from the *current* pad and the *current*
      // slice on every start, which is what keeps a live hit and the grid
      // behind it speaking about the same sound.
      const rate = padPlaybackRate(pad, slice.duration, secondsPerStep)
      const plan = (at: number, atGain: number): PendingPadHit => ({
        gain: atGain,
        startsAt: at,
        endsAt: at + slice.duration / rate,
      })
      const startHit = (hit: PendingPadHit) => {
        gain.gain.setValueAtTime(hit.gain, hit.startsAt)
        player.playbackRate = rate
        // A slice is already exactly the audio its region named, so this is a
        // plain start rather than an offset into a source no longer held.
        player.start(hit.startsAt)
      }

      const future = pending.filter((hit) => hit.startsAt > currentTime)
      const next = plan(time, hitGain)
      const insertedBeforeFuture = future.some((hit) => hit.startsAt >= time)

      if (insertedBeforeFuture) {
        // Tone.Player is monophonic only when starts are handed to it in time
        // order. A live hit can arrive after transport lookahead already
        // created a future source, so cancel that timeline, insert the live
        // hit, then replay the future starts. That preserves both the live
        // choke and the upcoming grid.
        player.stop(time)
        gain.gain.cancelScheduledValues(time)
        // Settings and slices are pad-global and live. Rebuild future starts
        // from the current pad rather than their lookahead snapshot: a stale
        // Tune replayed here would retune the live hit we just inserted.
        const replayedFuture = future
          .filter((hit) => hit.startsAt > time)
          .map((hit) => plan(hit.startsAt, hit.gain))
        const rebuilt = [next, ...replayedFuture].sort(
          (left, right) => left.startsAt - right.startsAt,
        )
        rebuilt.forEach(startHit)
        pending = rebuilt.filter((hit) => hit.startsAt > currentTime)
        return rebuilt.map(({ startsAt, endsAt }) => ({ startsAt, endsAt }))
      }

      startHit(next)
      pending = [...future, next]
        .filter((hit) => hit.startsAt > currentTime)
        .sort((left, right) => left.startsAt - right.startsAt)
      return [{ startsAt: next.startsAt, endsAt: next.endsAt }]
    },
  }
}

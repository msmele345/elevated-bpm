import { tunePlaybackRate, type PadSettings } from '../model/sampler'
import type { SampleBuffer, SampleRegistry } from './sampleRegistry'

/** The small part of Tone.Player the sampler's one-shot contract needs. */
export interface PadPlayer {
  playbackRate: number
  buffer: SampleBuffer
  start(time: number, offset?: number, duration?: number): unknown
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
  pad: PadSettings
  gain: number
}

function plannedHit(pad: PadSettings, gain: number, time: number): PendingPadHit {
  const rate = tunePlaybackRate(pad.tune)
  return {
    pad,
    gain,
    startsAt: time,
    endsAt: time + (pad.region?.duration ?? 0) / rate,
  }
}

function startHit(player: PadPlayer, gain: PadGain, hit: PendingPadHit): void {
  const region = hit.pad.region!
  gain.gain.setValueAtTime(hit.gain, hit.startsAt)
  player.playbackRate = tunePlaybackRate(hit.pad.tune)
  player.start(hit.startsAt, region.start, region.duration)
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
   */
  trigger(
    pad: PadSettings,
    gain: number,
    time: number,
    currentTime: number,
  ): PadSoundWindow[]
}

export function createPadVoice(
  player: PadPlayer,
  gain: PadGain,
  registry: SampleRegistry,
): PadVoice {
  let pending: PendingPadHit[] = []
  /** The source whose audio the player is currently holding. */
  let heldSourceId: string | null = null

  return {
    trigger(pad, hitGain, time, currentTime) {
      if (!pad.region) return []
      // A source the registry cannot make audio for is metadata without sound.
      // This is the whole membership rule: not "is it the shipped one", just
      // "do we hold its audio" — which stays true however many sources arrive.
      const buffer = registry.get(pad.region.sourceId)
      if (!buffer) return []

      // Resolve at trigger time, and swap only on a real change. A pad can be
      // reassigned mid-playback, so the hit asks what it should sound rather
      // than trusting something to have pushed it here first.
      //
      // This runs before every start below — including the rebuild's replayed
      // ones. A player's buffer is pad-global and live, exactly like its
      // playbackRate, so a swap has to be part of the rebuild rather than a
      // separate mutation racing it.
      if (pad.region.sourceId !== heldSourceId) {
        player.buffer = buffer
        heldSourceId = pad.region.sourceId
      }

      const future = pending.filter((hit) => hit.startsAt > currentTime)
      const next = plannedHit(pad, hitGain, time)
      const insertedBeforeFuture = future.some((hit) => hit.startsAt >= time)

      if (insertedBeforeFuture) {
        // Tone.Player is monophonic only when starts are handed to it in time
        // order. A live hit can arrive after transport lookahead already
        // created a future source, so cancel that timeline, insert the live
        // hit, then replay the future starts. That preserves both the live
        // choke and the upcoming grid.
        player.stop(time)
        gain.gain.cancelScheduledValues(time)
        // Settings are pad-global and live. Rebuild future starts from the
        // current pad rather than their lookahead snapshot: Tone.Player's
        // playbackRate setter affects every active source immediately, so
        // replaying a stale Tune here would retune the live hit we just
        // inserted.
        const replayedFuture = future
          .filter((hit) => hit.startsAt > time)
          .map((hit) => plannedHit(pad, hit.gain, hit.startsAt))
        const rebuilt = [next, ...replayedFuture].sort(
          (left, right) => left.startsAt - right.startsAt,
        )
        rebuilt.forEach((hit) => startHit(player, gain, hit))
        pending = rebuilt.filter((hit) => hit.startsAt > currentTime)
        return rebuilt.map(({ startsAt, endsAt }) => ({ startsAt, endsAt }))
      }

      startHit(player, gain, next)
      pending = [...future, next]
        .filter((hit) => hit.startsAt > currentTime)
        .sort((left, right) => left.startsAt - right.startsAt)
      return [{ startsAt: next.startsAt, endsAt: next.endsAt }]
    },
  }
}

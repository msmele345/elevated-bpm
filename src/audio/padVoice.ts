import { tunePlaybackRate, type PadSettings } from '../model/sampler'

/** The small part of Tone.Player the sampler's one-shot contract needs. */
export interface PadPlayer {
  playbackRate: number
  start(time: number, offset?: number, duration?: number): unknown
  stop(time: number): unknown
}

export interface PadVoice {
  player: PadPlayer
  gain: {
    gain: {
      setValueAtTime(value: number, time: number): unknown
      cancelScheduledValues(time: number): unknown
    }
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

/** Future hits already handed to each Tone.Player by transport lookahead. */
const pendingHits = new WeakMap<PadVoice, PendingPadHit[]>()

function plannedHit(pad: PadSettings, gain: number, time: number): PendingPadHit {
  const rate = tunePlaybackRate(pad.tune)
  return {
    pad,
    gain,
    startsAt: time,
    endsAt: time + (pad.region?.duration ?? 0) / rate,
  }
}

function startHit(voice: PadVoice, hit: PendingPadHit): void {
  const region = hit.pad.region!
  voice.gain.gain.setValueAtTime(hit.gain, hit.startsAt)
  voice.player.playbackRate = tunePlaybackRate(hit.pad.tune)
  voice.player.start(hit.startsAt, region.start, region.duration)
}

/**
 * Fire one pad through its existing player. Tone.Player turns a `start` while
 * the same player is active into a restart, so one player is monophonic while
 * the first hit still starts from its stopped state.
 */
export function triggerPadVoice(
  voice: PadVoice,
  pad: PadSettings,
  gain: number,
  time: number,
  currentTime: number,
): PadSoundWindow[] {
  if (!pad.region) return []

  const future = (pendingHits.get(voice) ?? []).filter((hit) => hit.startsAt > currentTime)
  const next = plannedHit(pad, gain, time)
  const insertedBeforeFuture = future.some((hit) => hit.startsAt >= time)

  if (insertedBeforeFuture) {
    // Tone.Player is monophonic only when starts are handed to it in time order.
    // A live hit can arrive after transport lookahead already created a future
    // source, so cancel that timeline, insert the live hit, then replay the
    // future starts. That preserves both the live choke and the upcoming grid.
    voice.player.stop(time)
    voice.gain.gain.cancelScheduledValues(time)
    // Settings are pad-global and live. Rebuild future starts from the current
    // pad rather than their lookahead snapshot: Tone.Player's playbackRate
    // setter affects every active source immediately, so replaying a stale Tune
    // here would retune the live hit we just inserted.
    const replayedFuture = future
      .filter((hit) => hit.startsAt > time)
      .map((hit) => plannedHit(pad, hit.gain, hit.startsAt))
    const rebuilt = [next, ...replayedFuture].sort(
      (left, right) => left.startsAt - right.startsAt,
    )
    rebuilt.forEach((hit) => startHit(voice, hit))
    pendingHits.set(
      voice,
      rebuilt.filter((hit) => hit.startsAt > currentTime),
    )
    return rebuilt.map(({ startsAt, endsAt }) => ({ startsAt, endsAt }))
  }

  startHit(voice, next)
  pendingHits.set(
    voice,
    [...future, next]
      .filter((hit) => hit.startsAt > currentTime)
      .sort((left, right) => left.startsAt - right.startsAt),
  )
  return [{ startsAt: next.startsAt, endsAt: next.endsAt }]
}

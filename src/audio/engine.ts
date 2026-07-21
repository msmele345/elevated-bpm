import * as Tone from 'tone'
import { clampBpm, DEFAULT_BPM } from '../model/transport'
import { STEP_COUNT, type DrumLaneId, type Pattern } from '../model/types'
import { hitsAtStep } from './hits'
import { KIT_SAMPLES } from './kit'
import { stepIndexAtTicks } from './stepIndex'

/**
 * The audio engine owns all Tone.js objects and lives outside React.
 * Tone.Transport is the only musical clock: the step callback is scheduled
 * on the transport lookahead and reads the *live* pattern reference, so
 * step edits are heard on the very next 16th without rescheduling.
 */

// The BPM range/default live in the model (model/transport.ts) — the state
// document clamps with the same rule — and are re-exported for UI convenience.
export { DEFAULT_BPM, MAX_BPM, MIN_BPM } from '../model/transport'
const TICKS_PER_16TH = Tone.getTransport().PPQ / 4

let bpm = DEFAULT_BPM
let currentPattern: Pattern | null = null
let repeatScheduled = false

/**
 * One voice per lane: a Player through its own Gain so each 16th can be fired
 * at its step's velocity (accent vs. not). Created lazily on unlock.
 */
interface Voice {
  player: Tone.Player
  gain: Tone.Gain
}
let voices: Record<DrumLaneId, Voice> | null = null
let samplesLoaded: Promise<void> | null = null

/** Point the scheduler at the latest pattern state. Cheap; call on every edit. */
export function setPattern(pattern: Pattern): void {
  currentPattern = pattern
}

export function setBpm(next: number): void {
  bpm = clampBpm(next)
  // Ramp instead of jumping so mid-playback tempo changes are click-free;
  // step scheduling derives from transport ticks, so the sequence position
  // is unaffected by the tempo curve.
  Tone.getTransport().bpm.rampTo(bpm, 0.1)
}

/** Step the transport is currently on (for the rAF playhead in AC4). */
export function getCurrentStep(): number {
  const transport = Tone.getTransport()
  if (transport.state !== 'started') return -1
  return stepIndexAtTicks(transport.ticks, TICKS_PER_16TH, STEP_COUNT)
}

/**
 * Unlock the audio context (must be called from a user gesture — browser
 * autoplay policy) and lazily create + load the kick player. Idempotent, so
 * the app calls it eagerly on the first gesture anywhere (pointer or key)
 * and play() awaits it again as a safety net — by the time the user reaches
 * Play, the context is running and the sample is loaded.
 */
export async function unlockAudio(): Promise<void> {
  await Tone.start()
  if (!samplesLoaded) {
    voices = Object.fromEntries(
      (Object.entries(KIT_SAMPLES) as [DrumLaneId, string][]).map(([laneId, url]) => {
        const gain = new Tone.Gain(1).toDestination()
        const player = new Tone.Player(url).connect(gain)
        return [laneId, { player, gain }]
      }),
    ) as Record<DrumLaneId, Voice>
    samplesLoaded = Tone.loaded()
    Tone.getTransport().bpm.value = bpm
    if (import.meta.env.DEV) {
      // Debug handle for tooling/tests; never used by app code.
      const meter = new Tone.Meter()
      Tone.getDestination().connect(meter)
      ;(window as unknown as Record<string, unknown>).__ebpm = {
        transport: Tone.getTransport(),
        meter,
      }
    }
  }
  await samplesLoaded
}

export async function play(): Promise<void> {
  await unlockAudio()
  const transport = Tone.getTransport()
  if (!repeatScheduled) {
    transport.scheduleRepeat((time) => {
      // Derive the step from transport ticks at the scheduled time so the
      // sequence stays locked across stop/start and BPM changes.
      const ticks = transport.getTicksAtTime(time)
      const stepIndex = Math.round(ticks / TICKS_PER_16TH) % STEP_COUNT
      if (!currentPattern || !voices) return
      // Every lane's hits on this 16th, each at its own velocity — all voices
      // share the transport, so lanes stay independent and sample-locked.
      for (const hit of hitsAtStep(currentPattern, stepIndex)) {
        const voice = voices[hit.laneId]
        voice.gain.gain.setValueAtTime(hit.gain, time)
        voice.player.start(time)
      }
    }, '16n')
    repeatScheduled = true
  }
  transport.start()
}

export function stop(): void {
  const transport = Tone.getTransport()
  transport.stop()
  // stop() resets transport position, so the next play starts on step 1.
}

import * as Tone from 'tone'
import { STEP_COUNT, type Pattern } from '../model/types'

/**
 * The audio engine owns all Tone.js objects and lives outside React.
 * Tone.Transport is the only musical clock: the step callback is scheduled
 * on the transport lookahead and reads the *live* pattern reference, so
 * step edits are heard on the very next 16th without rescheduling.
 */

export const DEFAULT_BPM = 130
export const MIN_BPM = 60
export const MAX_BPM = 200
const TICKS_PER_16TH = Tone.getTransport().PPQ / 4

let bpm = DEFAULT_BPM
let currentPattern: Pattern | null = null
let kick: Tone.Player | null = null
let kickLoaded: Promise<void> | null = null
let repeatScheduled = false

/** Point the scheduler at the latest pattern state. Cheap; call on every edit. */
export function setPattern(pattern: Pattern): void {
  currentPattern = pattern
}

export function setBpm(next: number): void {
  bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, next))
  // Ramp instead of jumping so mid-playback tempo changes are click-free;
  // step scheduling derives from transport ticks, so the sequence position
  // is unaffected by the tempo curve.
  Tone.getTransport().bpm.rampTo(bpm, 0.1)
}

/** Step the transport is currently on (for the rAF playhead in AC4). */
export function getCurrentStep(): number {
  const transport = Tone.getTransport()
  if (transport.state !== 'started') return -1
  return Math.floor(transport.ticks / TICKS_PER_16TH) % STEP_COUNT
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
  if (!kickLoaded) {
    kick = new Tone.Player('/samples/kick-909.wav').toDestination()
    kickLoaded = Tone.loaded()
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
  await kickLoaded
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
      const lane = currentPattern?.lanes.find((l) => l.id === 'kick')
      if (lane?.steps[stepIndex]?.on) {
        kick?.start(time)
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

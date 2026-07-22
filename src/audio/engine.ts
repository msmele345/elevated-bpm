import * as Tone from 'tone'
import { DEFAULT_BASS_SETTINGS, type BassSettings } from '../model/bass'
import type { Mixer } from '../model/mixer'
import { noteEventAtStep } from '../model/note'
import { clampBpm, DEFAULT_BPM } from '../model/transport'
import { STEP_COUNT, type DrumLaneId, type Pattern } from '../model/types'
import { voiceStep } from './hits'
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
let currentMixer: Mixer = {}
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

/**
 * The bass instrument: one sawtooth oscillator through a resonant lowpass.
 * A single Tone.Synth is monophonic by construction — a new note takes the
 * voice from the one still ringing — and the filter sits after it so cutoff
 * and resonance shape the sound continuously, audible even mid-note.
 */
interface BassVoice {
  synth: Tone.Synth
  filter: Tone.Filter
}
let bass: BassVoice | null = null
let bassSettings: BassSettings = DEFAULT_BASS_SETTINGS

/** Point the scheduler at the latest pattern state. Cheap; call on every edit. */
export function setPattern(pattern: Pattern): void {
  currentPattern = pattern
}

/** Point the scheduler at the latest mute/solo state. Cheap; call on every edit. */
export function setMixer(mixer: Mixer): void {
  currentMixer = mixer
}

/**
 * Apply the bass patch. Cheap and idempotent, so knob motion can call it on
 * every pointer move: cutoff ramps over a few milliseconds (a jump in filter
 * frequency zippers audibly), the rest take effect on the next note.
 */
export function setBassSettings(next: BassSettings): void {
  bassSettings = next
  if (!bass) return
  bass.filter.frequency.rampTo(next.cutoff, 0.02)
  bass.filter.Q.rampTo(next.resonance, 0.02)
  bass.synth.envelope.decay = next.decay
}

export function setBpm(next: number): void {
  bpm = clampBpm(next)
  // Ramp instead of jumping so mid-playback tempo changes are click-free;
  // step scheduling derives from transport ticks, so the sequence position
  // is unaffected by the tempo curve.
  Tone.getTransport().bpm.rampTo(bpm, 0.1)
}

/** One 16th in seconds at the current tempo — a note length in steps × this. */
function secondsPer16th(): number {
  return 15 / Tone.getTransport().bpm.value
}

/** Step the transport is currently on (for the rAF playhead in AC4). */
export function getCurrentStep(): number {
  const transport = Tone.getTransport()
  if (transport.state !== 'started') return -1
  return stepIndexAtTicks(transport.ticks, TICKS_PER_16TH, STEP_COUNT)
}

/** Bass level: sits under the kit so the drums keep the front of the mix. */
const BASS_GAIN = 0.55

function createBassVoice(): BassVoice {
  const filter = new Tone.Filter({ type: 'lowpass', rolloff: -24 })
  const synth = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    // Short attack + low sustain: a plucked 303-style note whose tail the
    // decay knob stretches from a stab to a rolling line.
    envelope: { attack: 0.004, decay: DEFAULT_BASS_SETTINGS.decay, sustain: 0.25, release: 0.08 },
    volume: Tone.gainToDb(BASS_GAIN),
  }).connect(filter)
  filter.toDestination()
  return { synth, filter }
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
    bass = createBassVoice()
    setBassSettings(bassSettings)
    samplesLoaded = Tone.loaded()
    Tone.getTransport().bpm.value = bpm
    if (import.meta.env.DEV) {
      // Debug handle for tooling/tests; never used by app code.
      const meter = new Tone.Meter()
      Tone.getDestination().connect(meter)
      ;(window as unknown as Record<string, unknown>).__ebpm = {
        transport: Tone.getTransport(),
        meter,
        voices,
        bass,
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
      // Resolve the 16th through the mixer and choke groups: muted/soloed
      // lanes are filtered out and a firing closed hat cuts the open hat.
      const { starts, chokes } = voiceStep(currentPattern, stepIndex, currentMixer)
      // Cut ringing choked voices first so a same-time restart isn't clipped.
      for (const laneId of chokes) {
        voices[laneId].player.stop(time)
      }
      // All voices share the transport, so lanes stay independent and
      // sample-locked; each fires at its own accent velocity.
      for (const hit of starts) {
        const voice = voices[hit.laneId]
        voice.gain.gain.setValueAtTime(hit.gain, time)
        voice.player.start(time)
      }
      // The bass rides the same scheduled 16th as the drums, so it is locked
      // to them by construction. Its length is already clipped to the next
      // note, keeping the single voice monophonic.
      const note = noteEventAtStep(currentPattern, 'bass', stepIndex)
      if (note && bass) {
        bass.synth.triggerAttackRelease(
          note.frequency,
          note.lengthSteps * secondsPer16th(),
          time,
        )
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

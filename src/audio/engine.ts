import * as Tone from 'tone'
import { DEFAULT_BASS_SETTINGS, type BassSettings } from '../model/bass'
import type { Mixer } from '../model/mixer'
import { midiToFrequency, noteEventsAtStep } from '../model/note'
import { SCOPE_SPEC } from '../model/scope'
import { createStabNoteHolds, createStabSoundingNotes } from '../model/stab'
import { clampBpm, DEFAULT_BPM } from '../model/transport'
import { STEP_COUNT, type DrumLaneId, type Pattern } from '../model/types'
import { voiceStep } from './hits'
import { KIT_SAMPLES } from './kit'
import { createStabVoices, type StabVoices } from './stabVoice'
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
export const TICKS_PER_16TH = Tone.getTransport().PPQ / 4

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

/**
 * The live stab instrument is genuinely polyphonic: every held pitch gets its
 * own Tone.Synth voice, so computer-keyboard chords attack and release
 * independently instead of stealing the bass synth's monophonic voice.
 */
let stab: StabVoices | null = null

/**
 * Master spectrum tap for the scope. An analyser only pulls samples when its
 * value is read — it sits off the destination as a dead-end branch, never in
 * the signal path, so drawing (or not drawing) it cannot affect the audio.
 */
let analyser: Tone.Analyser | null = null

// Pointer contacts, computer keys, and accessible button activation all feed
// the same source-aware hold boundary.
const stabNoteHolds = createStabNoteHolds()
const stabSoundingNotes = createStabSoundingNotes()

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

/**
 * Transport position in ticks, or -1 when not running (same convention as
 * getCurrentStep). Sub-step resolution for the room light's strobe phase,
 * which needs to know where inside the beat the transport is.
 */
export function getTransportTicks(): number {
  const transport = Tone.getTransport()
  if (transport.state !== 'started') return -1
  return transport.ticks
}

/** Bass level: sits under the kit so the drums keep the front of the mix. */
const BASS_GAIN = 0.55
const STAB_GAIN = 0.36

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

function createStabSynth(): Tone.PolySynth<Tone.Synth> {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.004, decay: 0.16, sustain: 0.36, release: 0.12 },
    volume: Tone.gainToDb(STAB_GAIN),
  }).toDestination()
}

/**
 * Create every audio voice once. Sample loading continues asynchronously,
 * while the synthesized instruments are playable as soon as the AudioContext
 * starts — live keys never wait for drum assets to download.
 */
function ensureVoices(): void {
  if (samplesLoaded) return
  voices = Object.fromEntries(
    (Object.entries(KIT_SAMPLES) as [DrumLaneId, string][]).map(([laneId, url]) => {
      const gain = new Tone.Gain(1).toDestination()
      const player = new Tone.Player(url).connect(gain)
      return [laneId, { player, gain }]
    }),
  ) as Record<DrumLaneId, Voice>
  bass = createBassVoice()
  stab = createStabVoices(createStabSynth)
  analyser = new Tone.Analyser('fft', SCOPE_SPEC.binCount)
  // Snappier than the analyser's 0.8 default: the scope does its own fall
  // decay, so internal smoothing only has to keep single frames from jittering.
  analyser.smoothing = 0.5
  Tone.getDestination().connect(analyser)
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
      stab,
    }
  }
}

/**
 * Unlock the audio context (must be called from a user gesture — browser
 * autoplay policy) and lazily create + load the instrument voices. Idempotent, so
 * the app calls it eagerly on the first gesture anywhere (pointer or key)
 * and play() awaits it again as a safety net — by the time the user reaches
 * Play, the context is running and the sample is loaded.
 */
export async function unlockAudio(): Promise<void> {
  await Tone.start()
  ensureVoices()
  await samplesLoaded
}

/**
 * Start one live stab note. The hold is recorded before AudioContext startup
 * so a very quick tap cannot leave a late, stuck attack behind. Tone.immediate
 * bypasses transport look-ahead for direct manipulation latency.
 */
export function attackStabNote(source: string, midi: number): void {
  const attack = stabNoteHolds.press(source, midi)
  if (!attack) return

  void Tone.start().then(() => {
    ensureVoices()
    if (!stabNoteHolds.isCurrent(attack)) return
    stab?.attackLive(midiToFrequency(attack.midi), Tone.immediate(), 0.82)
    stabSoundingNotes.attackLive(attack.midi)
  })
}

/** Release one input source's hold without cutting off another source. */
export function releaseStabNote(source: string): void {
  const release = stabNoteHolds.release(source)
  if (!release) return
  stab?.releaseLive(midiToFrequency(release.midi), Tone.immediate())
  stabSoundingNotes.releaseLive(release.midi)
}

/** Current live + sequenced stab pitches, read by the keyboard's rAF loop. */
export function getSoundingStabNotes(): readonly number[] {
  return stabSoundingNotes.atTime(Tone.immediate())
}

/**
 * The latest FFT frame off the master output (dB per bin), or null before the
 * first user gesture creates the audio graph. Read by the scope's rAF loop.
 */
export function getSpectrum(): Float32Array | null {
  if (!analyser) return null
  return analyser.getValue() as Float32Array
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
      // Every note lane resolves from this same scheduled 16th as the drums.
      // Bass uses its monophonic voice. Programmed stabs use a separate
      // polyphonic pool from live input so same-pitch releases cannot steal a
      // held live key.
      for (const note of noteEventsAtStep(currentPattern, stepIndex)) {
        const duration = note.lengthSteps * secondsPer16th()
        if (note.laneId === 'bass' && bass) {
          bass.synth.triggerAttackRelease(note.frequency, duration, time)
        }
        if (note.laneId === 'stab' && stab) {
          stab.triggerSequenced(note.frequency, duration, time, 0.72)
          stabSoundingNotes.schedule(note.midi, time, time + duration)
        }
      }
    }, '16n')
    repeatScheduled = true
  }
  transport.start()
}

export function stop(): void {
  const transport = Tone.getTransport()
  transport.stop()
  stab?.stopSequenced()
  stabSoundingNotes.clearSequenced()
  // stop() resets transport position, so the next play starts on step 1.
}

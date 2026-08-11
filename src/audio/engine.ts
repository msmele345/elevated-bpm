import * as Tone from 'tone'
import { DEFAULT_BASS_SETTINGS, type BassSettings } from '../model/bass'
import {
  DEFAULT_FX_SETTINGS,
  delaySeconds,
  fxBusParams,
  MAX_DELAY_SECONDS,
  type FxSettings,
} from '../model/fx'
import {
  DEFAULT_MASTER_SETTINGS,
  masterBusParams,
  type MasterSettings,
} from '../model/master'
import { laneIsAudible, type Mixer } from '../model/mixer'
import { midiToFrequency, noteEventsAtStep } from '../model/note'
import { SCOPE_SPEC } from '../model/scope'
import {
  CURATED_SAMPLE_SOURCE,
  createPadSoundingLanes,
  createSamplerSettings,
  isPadLaneId,
  type PadHitOrigin,
  type SamplerSettings,
} from '../model/sampler'
import { createStabNoteHolds, createStabSoundingNotes } from '../model/stab'
import { clampBpm, DEFAULT_BPM } from '../model/transport'
import { STEP_COUNT, type LaneId, type PadLaneId, type Pattern } from '../model/types'
import { voiceStep } from './hits'
import { KIT_SAMPLES, PAD_SAMPLES } from './kit'
import { triggerPadVoice } from './padVoice'
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
let currentSamplerSettings: SamplerSettings = createSamplerSettings()
let repeatScheduled = false

/**
 * One voice per lane: a Player through its own Gain so each 16th can be fired
 * at its step's velocity (accent vs. not). Created lazily on unlock.
 */
interface Voice {
  player: Tone.Player
  gain: Tone.Gain
}
let voices: Record<LaneId, Voice> | null = null
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
 * The master bus: every instrument feeds one shared input, then the whole mix
 * runs filter → drive → destination. The two macro knobs on the Master strip
 * shape this chain — a performance filter and saturation across the full mix,
 * never per instrument.
 */
interface MasterBus {
  input: Tone.Gain
  filter: Tone.Filter
  drive: Tone.Distortion
}
let master: MasterBus | null = null
let masterSettings: MasterSettings = DEFAULT_MASTER_SETTINGS

/**
 * One instrument's tap into the FX bus. Every voice of the instrument connects
 * here instead of straight to the master, and the tap fans out to both the dry
 * mix and the send. That is what makes a send *post-fader in spirit*: a lane the
 * sequencer never fires reaches neither path, so muting a lane mutes its echo.
 *
 * This is the contract a later instrument follows rather than being retrofitted
 * into: give it a tap and it is on the bus.
 */
interface SendTap {
  /** Where the instrument's voices connect. */
  input: Tone.Gain
  /** Level into the FX bus. */
  send: Tone.Gain
}

type SendTapId = 'drums' | 'bass' | 'stab' | 'sampler'

/**
 * The shared FX bus: sends sum into one input, run through the delay and then
 * the reverb, and return to the *master input* — upstream of the macro filter,
 * so closing that filter sweeps the tails along with the mix. Returning after
 * it would leave repeats ringing brightly through a closed filter, which is the
 * wrong sound and the opposite of the dub move this exists for.
 */
interface FxBus {
  input: Tone.Gain
  delay: Tone.FeedbackDelay
  reverb: Tone.Reverb
  taps: Record<SendTapId, SendTap>
}
let fx: FxBus | null = null
let fxSettings: FxSettings = DEFAULT_FX_SETTINGS

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
const heldPadSources = new Set<string>()
const padSoundingLanes = createPadSoundingLanes()

/** Point the scheduler at the latest pattern state. Cheap; call on every edit. */
export function setPattern(pattern: Pattern): void {
  currentPattern = pattern
}

/** Point the scheduler at the latest mute/solo state. Cheap; call on every edit. */
export function setMixer(mixer: Mixer): void {
  currentMixer = mixer
}

/** Point pad hits at the latest regions and Tune values. Cheap; call on every edit. */
export function setSamplerSettings(settings: SamplerSettings): void {
  currentSamplerSettings = settings
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

/**
 * Apply the master macros. Cheap and idempotent like the bass patch: cutoff
 * and wet ramp over a few milliseconds so knob motion is heard as a sweep,
 * and the distortion curve is only rebuilt when the drive amount changed.
 */
export function setMasterSettings(next: MasterSettings): void {
  masterSettings = next
  if (!master) return
  const bus = masterBusParams(next)
  master.filter.frequency.rampTo(bus.cutoff, 0.02)
  master.drive.wet.rampTo(bus.wet, 0.02)
  if (master.drive.distortion !== bus.distortion) {
    master.drive.distortion = bus.distortion
  }
}

/**
 * Apply the FX patch. Same contract as the bass and master patches — cheap,
 * idempotent, safe to call on every pointer move — with sends and the reverb
 * mix ramped so a dragged knob is heard as a fade rather than a step.
 */
export function setFxSettings(next: FxSettings): void {
  fxSettings = next
  if (!fx) return
  const bus = fxBusParams(next)
  fx.taps.drums.send.gain.rampTo(bus.drumSend, 0.02)
  fx.taps.bass.send.gain.rampTo(bus.bassSend, 0.02)
  fx.taps.stab.send.gain.rampTo(bus.stabSend, 0.02)
  fx.taps.sampler.send.gain.rampTo(bus.samplerSend, 0.02)
  fx.delay.feedback.rampTo(bus.feedback, 0.02)
  fx.reverb.wet.rampTo(bus.reverbWet, 0.02)
}

export function setBpm(next: number): void {
  bpm = clampBpm(next)
  // Ramp instead of jumping so mid-playback tempo changes are click-free;
  // step scheduling derives from transport ticks, so the sequence position
  // is unaffected by the tempo curve.
  Tone.getTransport().bpm.rampTo(bpm, 0.1)
  // The delay's division is musical, but Tone converts a notation delay time to
  // seconds *once*, when it is set — a time-unit Param does not follow later
  // tempo changes — so the repeats are retuned here, at the one door tempo walks
  // through. Ramped alongside the transport: gliding a delay line pitch-bends
  // its tail the way a tape delay does, where a jump would click.
  fx?.delay.delayTime.rampTo(delaySeconds(bpm), 0.1)
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

/**
 * Build the shared output chain. The filter's gentler -12 dB rolloff is the
 * classic DJ-mixer master filter — it dulls the whole mix without gutting it —
 * where the bass voice's own -24 dB filter is a sound-design tool.
 */
function createMasterBus(): MasterBus {
  const drive = new Tone.Distortion({ distortion: 0, wet: 0 })
  const filter = new Tone.Filter({ type: 'lowpass', rolloff: -12 }).connect(drive)
  const input = new Tone.Gain(1).connect(filter)
  drive.toDestination()
  return { input, filter, drive }
}

/**
 * How long the send reverb rings. Fixed rather than a knob: Tone.Reverb builds
 * a new impulse response whenever its decay changes, which is far too expensive
 * to do under a dragged control. The knob rides the wet mix instead.
 */
const REVERB_DECAY_SECONDS = 2.4

/**
 * Build the FX chain. Delay before reverb, the conventional order — the reverb
 * smears the repeats, rather than the repeats multiplying an already smeared
 * signal.
 *
 * Nothing here is awaited. Tone.Reverb generates its impulse response
 * asynchronously and exposes a `ready` promise; waiting on that during the first
 * user gesture is exactly the stall the deck's first-click promise forbids. The
 * reverb simply passes its (delayed) input through until the IR lands, which is
 * also why its wet mix is capped below 1 — the return is never silent while the
 * convolver is still empty.
 */
function createFxBus(dry: Tone.ToneAudioNode): FxBus {
  const reverb = new Tone.Reverb({
    decay: REVERB_DECAY_SECONDS,
    preDelay: 0.01,
    wet: 0,
  }).connect(dry)
  const delay = new Tone.FeedbackDelay({
    delayTime: delaySeconds(bpm),
    // A delay line's ceiling is fixed when it is built, so it has to cover the
    // longest division the transport's slowest tempo can ask for.
    maxDelay: MAX_DELAY_SECONDS,
    feedback: 0,
    // Fully wet: the dry signal already reached the master on its own path, and
    // a second copy through the send would just thicken the mix.
    wet: 1,
  }).connect(reverb)
  const input = new Tone.Gain(1).connect(delay)
  return {
    input,
    delay,
    reverb,
    taps: {
      drums: createSendTap(dry, input),
      bass: createSendTap(dry, input),
      stab: createSendTap(dry, input),
      sampler: createSendTap(dry, input),
    },
  }
}

/** A fan-out from one instrument's voices to the dry mix and the FX bus. */
function createSendTap(dry: Tone.ToneAudioNode, fxInput: Tone.ToneAudioNode): SendTap {
  // Resting at zero, so the bus is inaudible until the user opens a send —
  // an untouched deck runs the same unity-gain dry path it always did.
  const send = new Tone.Gain(0).connect(fxInput)
  const input = new Tone.Gain(1)
  input.connect(dry)
  input.connect(send)
  return { input, send }
}

function createBassVoice(destination: Tone.ToneAudioNode): BassVoice {
  const filter = new Tone.Filter({ type: 'lowpass', rolloff: -24 })
  const synth = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    // Short attack + low sustain: a plucked 303-style note whose tail the
    // decay knob stretches from a stab to a rolling line.
    envelope: { attack: 0.004, decay: DEFAULT_BASS_SETTINGS.decay, sustain: 0.25, release: 0.08 },
    volume: Tone.gainToDb(BASS_GAIN),
  }).connect(filter)
  filter.connect(destination)
  return { synth, filter }
}

function createStabSynth(destination: Tone.ToneAudioNode): Tone.PolySynth<Tone.Synth> {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.004, decay: 0.16, sustain: 0.36, release: 0.12 },
    volume: Tone.gainToDb(STAB_GAIN),
  }).connect(destination)
}

/**
 * Create every audio voice once. Sample loading continues asynchronously,
 * while the synthesized instruments are playable as soon as the AudioContext
 * starts — live keys never wait for drum assets to download.
 */
function ensureVoices(): void {
  if (samplesLoaded) return
  master = createMasterBus()
  // Every instrument reaches the master through its own send tap, so each one
  // is already on the FX bus rather than being retrofitted onto it later.
  const taps = (fx = createFxBus(master.input)).taps
  const sampleUrls: Record<LaneId, string> = { ...KIT_SAMPLES, ...PAD_SAMPLES }
  voices = Object.fromEntries(
    (Object.entries(sampleUrls) as [LaneId, string][]).map(([laneId, url]) => {
      // One send for the whole kit and one for the sampler. Per-lane accent
      // gains sit before those taps, so velocity rides through to the echo.
      const destination = isPadLaneId(laneId) ? taps.sampler.input : taps.drums.input
      const gain = new Tone.Gain(1).connect(destination)
      const player = new Tone.Player(url).connect(gain)
      return [laneId, { player, gain }]
    }),
  ) as Record<LaneId, Voice>
  bass = createBassVoice(taps.bass.input)
  // Live and sequenced stabs share the tap, so both are on the send.
  stab = createStabVoices(() => createStabSynth(taps.stab.input))
  analyser = new Tone.Analyser('fft', SCOPE_SPEC.binCount)
  // Snappier than the analyser's 0.8 default: the scope does its own fall
  // decay, so internal smoothing only has to keep single frames from jittering.
  analyser.smoothing = 0.5
  Tone.getDestination().connect(analyser)
  setBassSettings(bassSettings)
  setMasterSettings(masterSettings)
  setFxSettings(fxSettings)
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
      master,
      fx,
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

/** Fire a one-shot pad from pointer, keyboard, or a future MIDI source. */
export function attackPad(inputSourceId: string, padId: PadLaneId): void {
  if (heldPadSources.has(inputSourceId)) return
  heldPadSources.add(inputSourceId)
  // Unlike the synthesized stabs, a pad cannot start until its buffer exists.
  // Queue the first gesture behind the shared preload instead of throwing it
  // away while Tone.Player is still loading.
  void unlockAudio().then(() => {
    if (!laneIsAudible(padId, currentMixer)) return
    const now = Tone.immediate()
    triggerPlayablePad(padId, 1, now, now, 'live')
  })
}

/** Release an input source so its next press can retrigger; one-shots keep ringing. */
export function releasePad(inputSourceId: string): void {
  heldPadSources.delete(inputSourceId)
}

/** Keep live and sequenced pad hits on the same playable-source boundary. */
function triggerPlayablePad(
  padId: PadLaneId,
  gain: number,
  time: number,
  currentTime: number,
  origin: PadHitOrigin,
): void {
  const voice = voices?.[padId]
  const pad = currentSamplerSettings[padId]
  // The tracer has one shipped source. Later intake replaces the Player's
  // buffer before assigning other source ids; until then an unknown id is
  // metadata without playable audio and must stay silent.
  if (!voice || pad.region?.sourceId !== CURATED_SAMPLE_SOURCE.id) return
  for (const window of triggerPadVoice(voice, pad, gain, time, currentTime)) {
    padSoundingLanes.schedule(padId, window.startsAt, window.endsAt, origin)
  }
}

/** Current live + sequenced pad ids, read by the panel's rAF loop. */
export function getSoundingPadIds(): readonly PadLaneId[] {
  return padSoundingLanes.atTime(Tone.immediate())
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
        if (isPadLaneId(hit.laneId)) {
          triggerPlayablePad(hit.laneId, hit.gain, time, Tone.immediate(), 'sequenced')
        } else {
          voice.gain.gain.setValueAtTime(hit.gain, time)
          voice.player.start(time)
        }
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
  padSoundingLanes.clearSequenced()
  // stop() resets transport position, so the next play starts on step 1.
}

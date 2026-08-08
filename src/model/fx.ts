import { createPatch, setPatchParam, specOf, type ParamSpec } from './knob'
import { MIN_BPM } from './transport'

/**
 * The FX bus: one delay and one reverb shared by the whole deck, fed by a send
 * level per instrument. This is the dub techno move — a chop or a stab given
 * space — and it is the reason the return lands upstream of the master filter,
 * so closing that filter sweeps the tails along with the mix.
 *
 * Every send rests at zero. Nothing reaches the delay until the user opens one,
 * which is what lets an untouched deck sound bit-identical to the one before
 * the bus existed.
 */

export type FxParamId = 'drumSend' | 'bassSend' | 'stabSend' | 'feedback' | 'reverb'

export interface FxSettings {
  /** How much of the drum kit is sent to the FX bus, 0 (dry) to 100 (%). */
  drumSend: number
  /** How much of the bass is sent to the FX bus, 0 (dry) to 100 (%). */
  bassSend: number
  /** How much of the stabs are sent to the FX bus, 0 (dry) to 100 (%). */
  stabSend: number
  /** How much of the delay's output feeds back in — the length of the trail. */
  feedback: number
  /** How much reverb sits on the repeats, 0 (crisp echo) to 100 (%). */
  reverb: number
}

export const FX_PARAMS: ReadonlyArray<ParamSpec & { id: FxParamId }> = [
  { id: 'drumSend', label: 'Drum Send', min: 0, max: 100, default: 0, unit: '%' },
  { id: 'bassSend', label: 'Bass Send', min: 0, max: 100, default: 0, unit: '%' },
  { id: 'stabSend', label: 'Stab Send', min: 0, max: 100, default: 0, unit: '%' },
  // The delay and reverb rest somewhere musical rather than at zero: with every
  // send closed they are inaudible either way, so the first send a user opens
  // should already sound like an effect instead of a bypass.
  { id: 'feedback', label: 'Feedback', min: 0, max: 100, default: 40, unit: '%' },
  { id: 'reverb', label: 'Reverb', min: 0, max: 100, default: 40, unit: '%' },
]

export const DEFAULT_FX_SETTINGS: FxSettings = {
  drumSend: 0,
  bassSend: 0,
  stabSend: 0,
  feedback: 40,
  reverb: 40,
}

/** The spec behind one FX knob — its range, default, and taper. */
export function fxParamSpec(id: FxParamId): ParamSpec {
  return specOf(FX_PARAMS, id)
}

/** Immutably set one FX control, clamped to its range. */
export function setFxParam(settings: FxSettings, id: FxParamId, value: number): FxSettings {
  return setPatchParam(FX_PARAMS, settings, id, value)
}

/** Build the patch from whatever was persisted (or nothing), repairing it. */
export function createFxSettings(saved: unknown): FxSettings {
  return createPatch(FX_PARAMS, DEFAULT_FX_SETTINGS, saved)
}

/** What the audio engine sets on the FX nodes for one FxSettings. */
export interface FxBusParams {
  /** Send gains, 0..1, one per instrument tap. */
  drumSend: number
  bassSend: number
  stabSend: number
  /** Delay feedback coefficient, 0..1. */
  feedback: number
  /** Dry/wet of the reverb stage sitting after the delay. */
  reverbWet: number
}

/**
 * A fully open send stays under unity: the kit already sums five lanes into the
 * master, and an echo return as loud as the dry signal is how a groovebox ends
 * up clipping at the destination.
 */
const MAX_SEND_GAIN = 0.8
/** Short of unity by design — at 1 the delay line never decays. */
const MAX_FEEDBACK = 0.85
/**
 * The reverb never goes fully wet. Musically that keeps the repeats crisp
 * through the smear; structurally it means the return still carries the delay
 * while the reverb's impulse response is still being generated.
 */
const MAX_REVERB_WET = 0.85

function amount(value: number, spec: ParamSpec): number {
  return value / spec.max
}

/** Map the patch onto the bus nodes. */
export function fxBusParams(settings: FxSettings): FxBusParams {
  const send = (value: number, id: FxParamId) => amount(value, fxParamSpec(id)) * MAX_SEND_GAIN
  return {
    drumSend: send(settings.drumSend, 'drumSend'),
    bassSend: send(settings.bassSend, 'bassSend'),
    stabSend: send(settings.stabSend, 'stabSend'),
    feedback: amount(settings.feedback, fxParamSpec('feedback')) * MAX_FEEDBACK,
    reverbWet: amount(settings.reverb, fxParamSpec('reverb')) * MAX_REVERB_WET,
  }
}

/**
 * The delay's musical division, in 16ths: three of them is the dotted eighth —
 * *the* techno delay, the one that lands between the grid rather than on it.
 */
export const DELAY_SIXTEENTHS = 3

/**
 * The delay time at a given tempo, in seconds.
 *
 * The division is musical, so the repeats move with the transport instead of
 * sitting at a fixed millisecond value. Tone's notation (`"8n."`) expresses the
 * division but does not keep it: a time-unit Param converts notation to seconds
 * *once*, when it is set, and does not track later tempo changes. Tone's other
 * offer, `Transport.syncSignal`, does reciprocate a time-domain target — but it
 * is typed for `Signal` where a delay time is a `Param`, and it works by driving
 * the parameter from an always-on audio-rate reciprocal chain, which is a lot of
 * machinery to modulate a delay line with. So the engine retunes from here
 * instead, whenever the BPM moves.
 */
export function delaySeconds(bpm: number): number {
  // One 16th is 15/bpm seconds (a quarter note is 60/bpm).
  return (DELAY_SIXTEENTHS * 15) / bpm
}

/**
 * The longest delay the transport can ask for. A delay line's maximum is fixed
 * when the node is built, so it has to cover the slowest tempo up front.
 */
export const MAX_DELAY_SECONDS = delaySeconds(MIN_BPM)

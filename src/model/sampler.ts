import { claimsInstrumentKeys } from './instrumentKeys'
import { clampParam, type ParamSpec } from './knob'
import type { PadLaneId } from './types'

export type SampleOrigin = 'shipped' | 'upload' | 'recording'

/** Metadata only. Audio never enters ProjectState. */
export interface SampleSource {
  id: string
  name: string
  origin: SampleOrigin
  duration: number
  channels: number
}

/** A re-editable window into one source. */
export interface SampleRegion {
  sourceId: string
  start: number
  duration: number
}

export interface PadSettings {
  region: SampleRegion | null
  /** Pitch in semitones; playback speed moves with pitch like a record. */
  tune: number
  /** Number of 16th-note steps to fill. Its control and rate math arrive in EB2-05. */
  fit: number | null
  name: string
}

export type SamplerSettings = Record<PadLaneId, PadSettings>

export interface PadLaneSpec {
  id: PadLaneId
  label: string
  keyCode: `Digit${1 | 2 | 3 | 4}`
  keyLabel: `${1 | 2 | 3 | 4}`
}

export const PAD_LANES: readonly PadLaneSpec[] = [
  { id: 'pad1', label: 'Pad 1', keyCode: 'Digit1', keyLabel: '1' },
  { id: 'pad2', label: 'Pad 2', keyCode: 'Digit2', keyLabel: '2' },
  { id: 'pad3', label: 'Pad 3', keyCode: 'Digit3', keyLabel: '3' },
  { id: 'pad4', label: 'Pad 4', keyCode: 'Digit4', keyLabel: '4' },
]

const PAD_LANE_IDS: ReadonlySet<string> = new Set(PAD_LANES.map((pad) => pad.id))

export function isPadLaneId(value: unknown): value is PadLaneId {
  return typeof value === 'string' && PAD_LANE_IDS.has(value)
}

/**
 * The tracer's known one-shot. It deliberately reuses the shipped perc asset;
 * the source is metadata in the document and the audio registry owns its URL.
 */
export const CURATED_SAMPLE_SOURCE: SampleSource = {
  id: 'curated-warehouse-perc',
  name: 'Warehouse Perc',
  origin: 'shipped',
  duration: 0.25,
  channels: 1,
}

export const MIN_PAD_TUNE = -24
export const MAX_PAD_TUNE = 24
export const MIN_FIT_STEPS = 1
export const MAX_FIT_STEPS = 16

export type SamplerParamId = `${PadLaneId}Tune`

/** One uniquely named Tune knob per pad, ready for the deck-wide registry. */
export const SAMPLER_PARAMS: ReadonlyArray<ParamSpec & {
  id: SamplerParamId
  padId: PadLaneId
}> = PAD_LANES.map((pad) => ({
  id: `${pad.id}Tune` as SamplerParamId,
  padId: pad.id,
  label: `${pad.label} Tune`,
  min: MIN_PAD_TUNE,
  max: MAX_PAD_TUNE,
  default: 0,
  unit: 'st',
}))

export function samplerParamForPad(
  padId: PadLaneId,
): (typeof SAMPLER_PARAMS)[number] {
  return SAMPLER_PARAMS.find((param) => param.padId === padId)!
}

function defaultPad(padId: PadLaneId): PadSettings {
  const label = PAD_LANES.find((pad) => pad.id === padId)!.label
  return { region: null, tune: 0, fit: null, name: label }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function repairRegion(value: unknown): SampleRegion | null {
  if (!isRecord(value)) return null
  if (typeof value.sourceId !== 'string' || value.sourceId.length === 0) return null
  if (typeof value.start !== 'number' || !Number.isFinite(value.start) || value.start < 0) {
    return null
  }
  if (
    typeof value.duration !== 'number' ||
    !Number.isFinite(value.duration) ||
    value.duration <= 0
  ) {
    return null
  }
  return { sourceId: value.sourceId, start: value.start, duration: value.duration }
}

function repairFit(value: unknown): number | null {
  return Number.isInteger(value) &&
    (value as number) >= MIN_FIT_STEPS &&
    (value as number) <= MAX_FIT_STEPS
    ? (value as number)
    : null
}

function repairPad(padId: PadLaneId, value: unknown): PadSettings {
  const fallback = defaultPad(padId)
  if (!isRecord(value)) return fallback
  const spec = samplerParamForPad(padId)
  return {
    region: repairRegion(value.region),
    tune: typeof value.tune === 'number' ? clampParam(spec, value.tune) : fallback.tune,
    fit: repairFit(value.fit),
    name: typeof value.name === 'string' && value.name.trim() !== '' ? value.name : fallback.name,
  }
}

/** Build a complete, range-safe sampler patch from persisted input or nothing. */
export function createSamplerSettings(saved?: unknown): SamplerSettings {
  const raw = isRecord(saved) ? saved : {}
  return Object.fromEntries(
    PAD_LANES.map((pad) => [pad.id, repairPad(pad.id, raw[pad.id])]),
  ) as SamplerSettings
}

/**
 * How much of a source a pad opens on before anyone has trimmed it.
 *
 * A region is rendered into a slice, so assignment has a cost the old
 * reference-into-a-source model did not: an untrimmed six-minute track would
 * render a six-minute slice and undo the memory budget the whole feature rests
 * on. Four seconds is a bar at 60 BPM and takes most breaks and one-shots
 * whole; anything longer is a starting point to trim from in the editor rather
 * than a limit on what can be chopped.
 */
export const DEFAULT_PAD_REGION_SECONDS = 4

/** Point a pad at a source, opening on the front of it for trimming. */
export function assignSourceToPad(
  settings: SamplerSettings,
  padId: PadLaneId,
  source: SampleSource,
): SamplerSettings {
  return {
    ...settings,
    [padId]: {
      ...settings[padId],
      name: source.name,
      region: {
        sourceId: source.id,
        start: 0,
        duration: Math.min(source.duration, DEFAULT_PAD_REGION_SECONDS),
      },
    },
  }
}

/**
 * Land a trimmed region on a pad. A commit is a chop, not a reset: how the pad
 * plays — its Tune, its fit target — belongs to the user and survives it, which
 * is what makes reopening a region a correction rather than a redo.
 *
 * Only the named pad changes, so several regions cut from one source land on
 * different pads without disturbing each other.
 */
export function commitRegionToPad(
  settings: SamplerSettings,
  padId: PadLaneId,
  region: SampleRegion,
  name: string,
): SamplerSettings {
  return { ...settings, [padId]: { ...settings[padId], region, name } }
}

/** Immutably set (or clear) a pad's fit-to-steps target. */
export function setPadFit(
  settings: SamplerSettings,
  padId: PadLaneId,
  fit: number | null,
): SamplerSettings {
  return { ...settings, [padId]: { ...settings[padId], fit: repairFit(fit) } }
}

/** Immutably tune one pad, clamped to the knob's playable range. */
export function setPadTune(
  settings: SamplerSettings,
  padId: PadLaneId,
  tune: number,
): SamplerSettings {
  return {
    ...settings,
    [padId]: { ...settings[padId], tune: clampParam(samplerParamForPad(padId), tune) },
  }
}

/** Record-style pitch: twelve semitones doubles or halves playback speed. */
export function tunePlaybackRate(tune: number): number {
  return 2 ** (clampParam(SAMPLER_PARAMS[0], tune) / 12)
}

/**
 * The rate a pad actually plays at: its Tune and its fit-to-steps target
 * composed into one number.
 *
 * Fitting is the same arithmetic as tuning — region duration over target
 * duration — so **pitch moves with speed, the way pitching a record does**.
 * There is no time-stretching and no pitch-independent processing anywhere in
 * this feature, which is what makes the result predictable and musical rather
 * than processed-sounding.
 *
 * `secondsPerStep` is passed in rather than stored, so a fitted chop follows
 * the transport: change the tempo and the chop stays locked to its steps.
 */
export function padPlaybackRate(
  pad: PadSettings,
  sliceDuration: number,
  secondsPerStep: number,
): number {
  const tuned = tunePlaybackRate(pad.tune)
  if (pad.fit === null || sliceDuration <= 0 || secondsPerStep <= 0) return tuned
  return tuned * (sliceDuration / (pad.fit * secondsPerStep))
}

/**
 * What a rate did to the chop, in the two terms the user hears it in. Speed
 * and pitch are one number here, and saying both is the point: fitting is a
 * tradeoff, and it should be visible rather than mysterious.
 */
export function formatPadRate(rate: number): string {
  const semitones = 12 * Math.log2(rate)
  const sign = semitones < 0 ? '' : '+'
  return `${Math.round(rate * 100)} % speed, ${sign}${semitones.toFixed(1)} st`
}

interface PadKeyboardInput {
  code: string
  target: unknown
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

/** Resolve a global digit key only when the focused control does not own it. */
export function padForKeyboardInput(input: PadKeyboardInput): PadLaneSpec | undefined {
  if (input.metaKey || input.ctrlKey || input.altKey) return undefined
  if (
    typeof input.target === 'object' &&
    input.target !== null &&
    claimsInstrumentKeys(input.target as Parameters<typeof claimsInstrumentKeys>[0])
  ) {
    return undefined
  }
  return PAD_LANES.find((pad) => pad.keyCode === input.code)
}

/** Which input opened a light window. Transport stop only owns its own. */
export type PadHitOrigin = 'live' | 'sequenced'

interface PadSoundWindow {
  padId: PadLaneId
  origin: PadHitOrigin
  startsAt: number
  endsAt: number
}

export interface PadSoundingLanes {
  schedule(
    padId: PadLaneId,
    startsAt: number,
    endsAt: number,
    origin: PadHitOrigin,
  ): void
  /** Drop transport-scheduled windows, leaving a held live hit lit. */
  clearSequenced(): void
  /** Pads audible at a monotonically increasing audio-context time. */
  atTime(time: number): PadLaneId[]
}

/**
 * Audio-clock windows for pad LEDs. A retrigger clips an older window at the
 * new attack, matching the one-player-per-pad self-choke rule — and it clips
 * across origins, because a live hit and a sequenced one share that one player.
 */
export function createPadSoundingLanes(): PadSoundingLanes {
  let windows: PadSoundWindow[] = []
  return {
    schedule(padId, startsAt, endsAt, origin) {
      if (endsAt <= startsAt) return
      windows = windows.map((window) =>
        window.padId === padId && window.endsAt > startsAt
          ? { ...window, endsAt: Math.max(window.startsAt, startsAt) }
          : window,
      )
      windows.push({ padId, origin, startsAt, endsAt })
    },

    clearSequenced() {
      windows = windows.filter((window) => window.origin === 'live')
    },

    atTime(time) {
      windows = windows.filter((window) => window.endsAt > time)
      const sounding = new Set(
        windows
          .filter((window) => window.startsAt <= time)
          .map((window) => window.padId),
      )
      return PAD_LANES.flatMap((pad) => (sounding.has(pad.id) ? [pad.id] : []))
    },
  }
}

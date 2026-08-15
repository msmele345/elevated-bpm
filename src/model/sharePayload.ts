import {
  activePattern,
  migrateProjectState,
  PROJECT_STATE_VERSION,
  type InstrumentSettings,
  type ProjectState,
} from './projectState'
import { BASS_PARAMS } from './bass'
import { FX_PARAMS } from './fx'
import { MASTER_PARAMS } from './master'
import type { Mixer } from './mixer'
import { MAX_NOTE_LENGTH, MIN_NOTE_LENGTH, NOTE_LANES } from './note'
import { KIT_LANES } from './pattern'
import {
  MAX_FIT_STEPS,
  MIN_FIT_STEPS,
  PAD_LANES,
  SAMPLER_PARAMS,
  type SampleSource,
  type SamplerSettings,
} from './sampler'
import { STEP_COUNT, type Pattern } from './types'
import { MAX_BPM, MIN_BPM } from './transport'

/**
 * What a shared beat *is*, independent of how it travels.
 *
 * A link and a bundle are two carriers for one payload: the same document
 * serialization, the same gzip compression, the same base64 encoding, the same
 * migration, the same structural validation and the same typed error codes.
 * Only the carrier differs — a query string that cannot hold audio, and a file
 * that can.
 *
 * | | Carrier | Audio |
 * |---|---|---|
 * | Link | query string | dropped — the URL ceiling makes it impossible |
 * | Bundle | file | included |
 *
 * Keeping this here rather than in either carrier is what makes that claim
 * enforceable instead of aspirational: there is one serializer and one
 * validator, so a bundle cannot quietly drift into accepting a document a link
 * would refuse.
 */

/** Both carriers report the same two failures in the same words. */
export const MALFORMED_SHARE_MESSAGE =
  'This shared beat link is damaged or incomplete. Your saved project is safe.'

export const UNSUPPORTED_VERSION_MESSAGE =
  'This shared beat uses an incompatible version of Elevated BPM and cannot be opened here.'

/**
 * Curriculum progress and preferences belong to whoever opens a payload, never
 * to whoever sent it. Blanked on the way out so a sender never ships their own
 * progress, and again on the way in so an older payload carrying a stale
 * progress map reads as a valid beat rather than a rejected one.
 */
export function recipientOwnedBlanks(): Pick<
  ProjectState,
  'lessonProgress' | 'prefs' | 'activeLessonId'
> {
  return { lessonProgress: {}, prefs: {}, activeLessonId: null }
}

/** The document a payload carries: the active pattern and everything shaping it. */
export function projectForSharing(project: ProjectState): ProjectState {
  const pattern = activePattern(project)
  return {
    version: PROJECT_STATE_VERSION,
    patterns: [pattern],
    activePatternId: pattern.id,
    transport: project.transport,
    instrumentSettings: project.instrumentSettings,
    sources: project.sources,
    mixer: project.mixer,
    ...recipientOwnedBlanks(),
  }
}

/**
 * Base64 in chunks rather than one character at a time: a bundle pushes real
 * volume through here — a second of stereo audio is a couple of hundred
 * kilobytes — where a link only ever carried a compressed document.
 */
const BASE64_CHUNK = 0x8000

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let at = 0; at < bytes.length; at += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + BASE64_CHUNK))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function base64UrlToBytes(encoded: string): Uint8Array {
  const padded = encoded.replaceAll('-', '+').replaceAll('_', '/').padEnd(
    Math.ceil(encoded.length / 4) * 4,
    '=',
  )
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

/** JSON, gzipped. The one serializer both carriers write through. */
export async function compressPayload(payload: unknown): Promise<Uint8Array> {
  const input = new TextEncoder().encode(JSON.stringify(payload))
  const stream = new CompressionStream('gzip')
  const output = new Response(stream.readable).arrayBuffer()
  const writer = stream.writable.getWriter()
  await writer.write(input)
  await writer.close()
  return new Uint8Array(await output)
}

/**
 * Gunzip. Throws on a stream that was cut short, which is what lets a bundle
 * tell a truncated file apart from a document it merely could not read.
 */
export async function decompressPayload(bytes: Uint8Array): Promise<string> {
  const stream = new DecompressionStream('gzip')
  const output = new Response(stream.readable).arrayBuffer()
  const writer = stream.writable.getWriter()
  const written = writer.write(bytes).then(() => writer.close())
  // A payload cut short fails at *both* ends of the stream. Settling them
  // together is what keeps that one failure — the case a bundle has to name as
  // truncation — from being caught at one end and surfacing as an unhandled
  // rejection at the other.
  const [, decoded] = await Promise.all([written, output])
  return new TextDecoder().decode(decoded)
}

/** Exported so the bundle carrier narrows its own wrapper the same way. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isLane(
  value: unknown,
  expectedId: string,
  isStep: (step: unknown) => boolean,
): boolean {
  return (
    isRecord(value) &&
    value.id === expectedId &&
    typeof value.label === 'string' &&
    Array.isArray(value.steps) &&
    value.steps.length === STEP_COUNT &&
    value.steps.every(isStep)
  )
}

function isDrumStep(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.on === 'boolean' &&
    typeof value.accent === 'boolean'
  )
}

function isNoteStep(value: unknown, minPitch: number, maxPitch: number): boolean {
  return (
    isRecord(value) &&
    typeof value.on === 'boolean' &&
    Number.isInteger(value.pitch) &&
    (value.pitch as number) >= minPitch &&
    (value.pitch as number) <= maxPitch &&
    Number.isInteger(value.length) &&
    (value.length as number) >= MIN_NOTE_LENGTH &&
    (value.length as number) <= MAX_NOTE_LENGTH
  )
}

function isPattern(value: unknown): value is Pattern {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !Array.isArray(value.lanes) ||
    !Array.isArray(value.padLanes) ||
    !Array.isArray(value.noteLanes) ||
    value.lanes.length !== KIT_LANES.length ||
    value.padLanes.length !== PAD_LANES.length ||
    value.noteLanes.length !== NOTE_LANES.length
  ) {
    return false
  }

  const lanes = value.lanes
  const padLanes = value.padLanes
  const noteLanes = value.noteLanes
  const drumsValid = KIT_LANES.every((spec, laneIndex) =>
    isLane(lanes[laneIndex], spec.id, isDrumStep),
  )
  if (!drumsValid) return false

  const padsValid = PAD_LANES.every((spec, laneIndex) =>
    isLane(padLanes[laneIndex], spec.id, isDrumStep),
  )
  if (!padsValid) return false

  return NOTE_LANES.every((spec, laneIndex) =>
    isLane(noteLanes[laneIndex], spec.id, (step) =>
      isNoteStep(step, spec.minPitch, spec.maxPitch),
    ),
  )
}

function isPatch(
  value: unknown,
  params: ReadonlyArray<{ id: string; min: number; max: number }>,
): boolean {
  if (!isRecord(value)) return false
  return params.every((param) => {
    const setting = value[param.id]
    return isFiniteNumber(setting) && setting >= param.min && setting <= param.max
  })
}

function isInstrumentSettings(value: unknown): value is InstrumentSettings {
  return (
    isRecord(value) &&
    isPatch(value.bass, BASS_PARAMS) &&
    isPatch(value.master, MASTER_PARAMS) &&
    isPatch(value.fx, FX_PARAMS) &&
    isSamplerSettings(value.sampler)
  )
}

function isRegion(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.sourceId === 'string' &&
      value.sourceId.length > 0 &&
      isFiniteNumber(value.start) &&
      value.start >= 0 &&
      isFiniteNumber(value.duration) &&
      value.duration > 0)
  )
}

function isSamplerSettings(value: unknown): value is SamplerSettings {
  if (!isRecord(value) || Object.keys(value).length !== PAD_LANES.length) return false
  return PAD_LANES.every((pad) => {
    const settings = value[pad.id]
    const tune = SAMPLER_PARAMS.find((param) => param.padId === pad.id)!
    return (
      isRecord(settings) &&
      isRegion(settings.region) &&
      isFiniteNumber(settings.tune) &&
      settings.tune >= tune.min &&
      settings.tune <= tune.max &&
      (settings.fit === null ||
        (Number.isInteger(settings.fit) &&
          (settings.fit as number) >= MIN_FIT_STEPS &&
          (settings.fit as number) <= MAX_FIT_STEPS)) &&
      typeof settings.name === 'string' &&
      settings.name.trim().length > 0
    )
  })
}

function isSources(value: unknown): value is SampleSource[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  for (const source of value) {
    if (
      !isRecord(source) ||
      typeof source.id !== 'string' ||
      source.id.length === 0 ||
      ids.has(source.id) ||
      typeof source.name !== 'string' ||
      source.name.trim().length === 0 ||
      !['shipped', 'upload', 'recording'].includes(source.origin as string) ||
      !isFiniteNumber(source.duration) ||
      source.duration <= 0 ||
      !Number.isInteger(source.channels) ||
      (source.channels as number) < 1
    ) {
      return false
    }
    ids.add(source.id)
  }
  return true
}

function isMixer(value: unknown): value is Mixer {
  if (!isRecord(value)) return false
  const laneIds = new Set<string>([
    ...KIT_LANES.map(({ id }) => id),
    ...PAD_LANES.map(({ id }) => id),
  ])
  return Object.entries(value).every(
    ([laneId, mix]) =>
      laneIds.has(laneId) &&
      isRecord(mix) &&
      typeof mix.muted === 'boolean' &&
      typeof mix.soloed === 'boolean',
  )
}

export function isSharedProject(value: unknown): value is ProjectState {
  return (
    isRecord(value) &&
    value.version === PROJECT_STATE_VERSION &&
    Array.isArray(value.patterns) &&
    value.patterns.length === 1 &&
    isPattern(value.patterns[0]) &&
    typeof value.activePatternId === 'string' &&
    value.activePatternId === value.patterns[0].id &&
    isRecord(value.transport) &&
    isFiniteNumber(value.transport.bpm) &&
    value.transport.bpm >= MIN_BPM &&
    value.transport.bpm <= MAX_BPM &&
    isInstrumentSettings(value.instrumentSettings) &&
    isSources(value.sources) &&
    isRecord(value.lessonProgress) &&
    Object.keys(value.lessonProgress).length === 0 &&
    isRecord(value.prefs) &&
    Object.keys(value.prefs).length === 0 &&
    isMixer(value.mixer) &&
    value.activeLessonId === null
  )
}

/**
 * Lift a decoded document to the current schema and check it is a beat the
 * deck can actually run.
 *
 * Migration is what lets a payload outlive the schema bumps that follow it —
 * the property that matters most for a bundle, because a bundle is a file
 * people keep. It returns null and also throws on bodies it cannot read, so
 * both are treated the same way here: a document that will not lift is damaged,
 * not incompatible.
 */
export function readSharedDocument(document: unknown): ProjectState | null {
  let migrated: ProjectState | null
  try {
    migrated = migrateProjectState(document)
  } catch {
    return null
  }
  if (migrated === null) return null
  // Validate the migrated document, so the structural checks keep asserting the
  // shape the deck runs today. Left unknown so `isSharedProject` stays the only
  // thing that narrows it — migration hands back the current version by
  // assertion, not by checking.
  const project: unknown = { ...migrated, ...recipientOwnedBlanks() }
  return isSharedProject(project) ? project : null
}

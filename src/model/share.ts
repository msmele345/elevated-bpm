import {
  activePattern,
  migrateProjectState,
  PROJECT_STATE_VERSION,
  type InstrumentSettings,
  type ProjectState,
} from './projectState'
import { BASS_PARAMS } from './bass'
import { MASTER_PARAMS } from './master'
import type { Mixer } from './mixer'
import { MAX_NOTE_LENGTH, MIN_NOTE_LENGTH, NOTE_LANES } from './note'
import { KIT_LANES } from './pattern'
import { STEP_COUNT, type Pattern } from './types'
import { MAX_BPM, MIN_BPM } from './transport'

export const SHARE_QUERY_PARAM = 'p'
/** Conservative ceiling that stays beneath long-standing browser/proxy URL limits. */
export const PRACTICAL_SHARE_URL_LIMIT = 2_000

export type SharedProjectResult =
  | { status: 'none' }
  | { status: 'ready'; project: ProjectState }
  | {
      status: 'error'
      code: 'malformed' | 'unsupported-version'
      message: string
    }

/**
 * Curriculum progress and preferences belong to whoever opens a link, never to
 * whoever sent it. Blanked on the way out so a sender never ships their own
 * progress, and again on the way in so an older payload carrying a stale
 * progress map reads as a valid beat rather than a rejected link.
 */
function recipientOwnedBlanks(): Pick<
  ProjectState,
  'lessonProgress' | 'prefs' | 'activeLessonId'
> {
  return { lessonProgress: {}, prefs: {}, activeLessonId: null }
}

function projectForSharing(project: ProjectState): ProjectState {
  const pattern = activePattern(project)
  return {
    version: PROJECT_STATE_VERSION,
    patterns: [pattern],
    activePatternId: pattern.id,
    transport: project.transport,
    instrumentSettings: project.instrumentSettings,
    mixer: project.mixer,
    ...recipientOwnedBlanks(),
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const padded = encoded.replaceAll('-', '+').replaceAll('_', '/').padEnd(
    Math.ceil(encoded.length / 4) * 4,
    '=',
  )
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function compress(text: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(text)
  const stream = new CompressionStream('gzip')
  const output = new Response(stream.readable).arrayBuffer()
  const writer = stream.writable.getWriter()
  await writer.write(input)
  await writer.close()
  return new Uint8Array(await output)
}

async function decompress(bytes: Uint8Array): Promise<string> {
  const stream = new DecompressionStream('gzip')
  const output = new Response(stream.readable).arrayBuffer()
  const writer = stream.writable.getWriter()
  await writer.write(bytes)
  await writer.close()
  return new TextDecoder().decode(await output)
}

async function encodeSharedProject(project: ProjectState): Promise<string> {
  const compressed = await compress(JSON.stringify(project))
  return `${PROJECT_STATE_VERSION}.${bytesToBase64Url(compressed)}`
}

function malformedShare(): SharedProjectResult {
  return {
    status: 'error',
    code: 'malformed',
    message: 'This shared beat link is damaged or incomplete. Your saved project is safe.',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
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
    !Array.isArray(value.noteLanes) ||
    value.lanes.length !== KIT_LANES.length ||
    value.noteLanes.length !== NOTE_LANES.length
  ) {
    return false
  }

  const lanes = value.lanes
  const noteLanes = value.noteLanes
  const drumsValid = KIT_LANES.every((spec, laneIndex) =>
    isLane(lanes[laneIndex], spec.id, isDrumStep),
  )
  if (!drumsValid) return false

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
    isRecord(value) && isPatch(value.bass, BASS_PARAMS) && isPatch(value.master, MASTER_PARAMS)
  )
}

function isMixer(value: unknown): value is Mixer {
  if (!isRecord(value)) return false
  const laneIds = new Set(KIT_LANES.map(({ id }) => id))
  return Object.entries(value).every(
    ([laneId, mix]) =>
      laneIds.has(laneId as (typeof KIT_LANES)[number]['id']) &&
      isRecord(mix) &&
      typeof mix.muted === 'boolean' &&
      typeof mix.soloed === 'boolean',
  )
}

function isSharedProject(value: unknown): value is ProjectState {
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
    isRecord(value.lessonProgress) &&
    Object.keys(value.lessonProgress).length === 0 &&
    isRecord(value.prefs) &&
    Object.keys(value.prefs).length === 0 &&
    isMixer(value.mixer) &&
    value.activeLessonId === null
  )
}

/** Build a share URL without disturbing unrelated query parameters. */
export async function createShareUrl(project: ProjectState, baseUrl: string): Promise<string> {
  const url = new URL(baseUrl)
  url.searchParams.set(SHARE_QUERY_PARAM, await encodeSharedProject(projectForSharing(project)))
  return url.toString()
}

/**
 * Put a shared beat on the deck while retaining recipient-only curriculum and
 * preference data. The caller decides whether this preview is ever persisted.
 */
export function projectWithSharedBeat(
  base: ProjectState,
  sharedProject: ProjectState,
): ProjectState {
  const pattern = activePattern(sharedProject)
  const inactivePatterns = base.patterns.filter(
    (candidate) => candidate.id !== base.activePatternId && candidate.id !== pattern.id,
  )
  return {
    ...base,
    patterns: [...inactivePatterns, pattern],
    activePatternId: pattern.id,
    transport: sharedProject.transport,
    instrumentSettings: sharedProject.instrumentSettings,
    mixer: sharedProject.mixer,
  }
}

/** Read the optional shared beat carried by a URL. */
export async function readSharedBeat(urlValue: string): Promise<SharedProjectResult> {
  let encoded: string | null
  try {
    encoded = new URL(urlValue).searchParams.get(SHARE_QUERY_PARAM)
  } catch {
    return malformedShare()
  }
  if (encoded === null) return { status: 'none' }

  const separator = encoded.indexOf('.')
  if (separator < 1 || !/^\d+$/.test(encoded.slice(0, separator))) return malformedShare()
  // The prefix stays a cheap pre-decompression guard, but only one mismatch is
  // beyond repair: a payload from a build newer than this one. Everything at or
  // below the current version is lifted by the same migration a saved document
  // takes, so a link outlives the schema bumps that follow it.
  if (Number(encoded.slice(0, separator)) > PROJECT_STATE_VERSION) {
    return {
      status: 'error',
      code: 'unsupported-version',
      message:
        'This shared beat uses an incompatible version of Elevated BPM and cannot be opened here.',
    }
  }
  try {
    const compressed = base64UrlToBytes(encoded.slice(separator + 1))
    // Migration both returns null and throws on bodies it cannot read, so it
    // belongs inside this catch: a payload that fails to lift is a damaged
    // link, not an incompatible one.
    const migrated = migrateProjectState(JSON.parse(await decompress(compressed)))
    if (migrated === null) return malformedShare()

    // Validate the migrated document, so the structural checks keep asserting
    // the shape the deck actually runs today. Left unknown so isSharedProject
    // stays the only thing that narrows it — migration hands back the current
    // version by assertion, not by checking.
    const project: unknown = { ...migrated, ...recipientOwnedBlanks() }
    if (!isSharedProject(project)) return malformedShare()
    return { status: 'ready', project }
  } catch {
    return malformedShare()
  }
}

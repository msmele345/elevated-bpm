import { activePattern, PROJECT_STATE_VERSION, type ProjectState } from './projectState'
import { PAD_LANES, padAudioState, type AvailableAudio } from './sampler'
import {
  base64UrlToBytes,
  bytesToBase64Url,
  compressPayload,
  decompressPayload,
  MALFORMED_SHARE_MESSAGE,
  projectForSharing,
  readSharedDocument,
  UNSUPPORTED_VERSION_MESSAGE,
} from './sharePayload'

/**
 * The link carrier. Everything about *what* a shared beat is lives in
 * `sharePayload`; this module is only how one travels in a query string — and
 * the one thing that is true of a link and not of a bundle: **it cannot carry
 * audio**.
 *
 * That is not a limitation to engineer around. A 180 KB sample is roughly
 * 240 KB base64-encoded, audio is already compressed so gzip buys effectively
 * nothing, and the practical URL ceiling is 2,000 characters. Two orders of
 * magnitude is not a budget to tune. So links degrade by design — and say so.
 */

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

function malformedShare(): SharedProjectResult {
  return { status: 'error', code: 'malformed', message: MALFORMED_SHARE_MESSAGE }
}

/** Build a share URL without disturbing unrelated query parameters. */
export async function createShareUrl(project: ProjectState, baseUrl: string): Promise<string> {
  const compressed = await compressPayload(projectForSharing(project))
  const url = new URL(baseUrl)
  url.searchParams.set(
    SHARE_QUERY_PARAM,
    `${PROJECT_STATE_VERSION}.${bytesToBase64Url(compressed)}`,
  )
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
    sources: sharedProject.sources,
    mixer: sharedProject.mixer,
  }
}

/**
 * What an incoming beat could not bring with it, said plainly.
 *
 * A recipient whose pads are silent with no explanation assumes the app is
 * broken, so the count is named and so is the only thing that would fix it.
 * It does not offer to fetch the audio, because with no backend there is
 * nothing to fetch from.
 *
 * Counted from the pads that landed **silent** — the modelled "slice missing"
 * state — rather than from how the beat arrived, so a bundle, which carries its
 * audio, says nothing at all.
 */
export function sharedAudioNotice(
  project: ProjectState,
  available: AvailableAudio,
): string | null {
  const sampler = project.instrumentSettings.sampler
  const silent = PAD_LANES.filter(
    (pad) => padAudioState(sampler[pad.id], available) === 'silent',
  ).length
  if (silent === 0) return null
  return silent === 1
    ? '1 sound could not travel: audio is far too large to fit in a link. Ask whoever sent it for a bundle file to hear it.'
    : `${silent} sounds could not travel: audio is far too large to fit in a link. Ask whoever sent it for a bundle file to hear them.`
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
      message: UNSUPPORTED_VERSION_MESSAGE,
    }
  }
  try {
    const compressed = base64UrlToBytes(encoded.slice(separator + 1))
    const project = readSharedDocument(JSON.parse(await decompressPayload(compressed)))
    return project === null ? malformedShare() : { status: 'ready', project }
  } catch {
    return malformedShare()
  }
}

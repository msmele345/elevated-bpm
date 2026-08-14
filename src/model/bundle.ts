import { activePattern, PROJECT_STATE_VERSION, type ProjectState } from './projectState'
import { PAD_LANES, namedPad, type SamplerSettings } from './sampler'
import { sliceKey, type Slice } from './slice'
import {
  base64UrlToBytes,
  bytesToBase64Url,
  compressPayload,
  decompressPayload,
  projectForSharing,
  readSharedDocument,
  UNSUPPORTED_VERSION_MESSAGE,
} from './sharePayload'
import type { PadLaneId } from './types'

/**
 * The file carrier. A **bundle** is the share payload with audio in it: the
 * same document serialization, the same gzip compression, the same base64
 * encoding, the same migration and the same validation the link already uses —
 * written to a file rather than a query string.
 *
 * It is deliberately **not a new format**. The share pipeline already
 * serializes, compresses, encodes, validates and reports typed errors on
 * exactly this document, and all of it is already under test; reusing it means
 * a bundle inherits a proven path instead of standing up a parallel one. That
 * is the whole reason an archive format was rejected.
 *
 * ## What travels, and what does not
 *
 * Bundles carry **slices, not sources**. Three chops totalling under two
 * seconds must not ship a multi-megabyte break, and slices are already
 * persisted, so export is mostly assembly. The consequence is by design: a
 * recipient's pads land in the "slice present, source missing" state — they
 * sound, and they say re-chop is unavailable.
 *
 * ## The accepted cost
 *
 * Nobody can open a bundle and look inside it the way they could an archive, so
 * a failed import cannot be diagnosed by inspection. **The refusal message is
 * therefore the only diagnostic anyone will ever get**, which is why every one
 * below names a different thing: cut short, unreadable, missing audio, from a
 * newer build, or not a bundle at all.
 */

/**
 * Base64 wraps the PCM *inside* the document, where gzip can take the third it
 * adds back — base64-encoded PCM has low per-character entropy. Doing it again
 * around the finished gzip, the way a URL forces, would be an unrecoverable
 * third on top of a file whose whole point is being sendable. A file is a
 * binary carrier, so the bytes go in as bytes.
 */
const BUNDLE_MAGIC = 'elevated-bpm-bundle/'

/** Enough of the file to read the header out of without touching the rest. */
const MAX_HEADER_BYTES = BUNDLE_MAGIC.length + 16

export const BUNDLE_FILE_EXTENSION = '.ebpm'
export const BUNDLE_MEDIA_TYPE = 'application/octet-stream'

/**
 * What "actually sendable" means, and the ceiling the slice format was chosen
 * against. Four one-second 16-bit stereo slices are 768 KB of PCM at 48 kHz and
 * land just under this; Float32 slices would be roughly double and would not.
 */
export const SENDABLE_BUNDLE_LIMIT = 850_000

/** One slice on the wire: its shape, and its PCM as base64. */
interface EncodedSlice {
  sampleRate: number
  channels: number
  frames: number
  pcm: string
}

interface BundleDocument {
  project: unknown
  slices: Record<string, EncodedSlice>
}

export type BundleExport =
  | { status: 'ready'; blob: Blob; fileName: string }
  | { status: 'error'; code: 'silent-pad'; message: string }

export type BundleErrorCode =
  | 'not-a-bundle'
  | 'unsupported-version'
  | 'truncated'
  | 'malformed'
  | 'missing-audio'

export type BundleResult =
  | { status: 'ready'; project: ProjectState; slices: Array<[string, Slice]> }
  | { status: 'error'; code: BundleErrorCode; message: string }

/**
 * Little-endian by the platform's own typed-array view. Every platform a
 * browser ships on is little-endian, and reading the bytes back through the
 * same view is what keeps this a copy rather than a conversion.
 */
function pcmBytes(pcm: Int16Array): Uint8Array {
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
}

function encodeSlice(slice: Slice): EncodedSlice {
  return {
    sampleRate: slice.sampleRate,
    channels: slice.channels,
    frames: slice.frames,
    pcm: bytesToBase64Url(pcmBytes(slice.pcm)),
  }
}

/**
 * A slice off the wire, or nothing. The PCM is checked against the shape it
 * claims: without that a damaged string builds a misaligned buffer and the pad
 * plays rubbish instead of the import being refused.
 */
function decodeSlice(value: unknown): Slice | null {
  if (value === null || typeof value !== 'object') return null
  const encoded = value as Partial<EncodedSlice>
  if (
    typeof encoded.sampleRate !== 'number' ||
    !Number.isFinite(encoded.sampleRate) ||
    encoded.sampleRate <= 0 ||
    !Number.isInteger(encoded.channels) ||
    (encoded.channels as number) < 1 ||
    !Number.isInteger(encoded.frames) ||
    (encoded.frames as number) < 0 ||
    typeof encoded.pcm !== 'string'
  ) {
    return null
  }
  const bytes = base64UrlToBytes(encoded.pcm)
  const samples = (encoded.frames as number) * (encoded.channels as number)
  if (bytes.byteLength !== samples * Int16Array.BYTES_PER_ELEMENT) return null
  return {
    sampleRate: encoded.sampleRate,
    channels: encoded.channels as number,
    frames: encoded.frames as number,
    pcm: new Int16Array(bytes.buffer, bytes.byteOffset, samples),
  }
}

/**
 * Which pads a beat needs audio for, and under which key — in the order they
 * sit on the deck.
 *
 * Exported because the writer, the reader and the deck all have to agree on it:
 * a bundle carries exactly what this names, refuses exactly what this names and
 * finds missing, and the deck registers exactly this when it opens one.
 */
export function padsNeedingAudio(
  settings: SamplerSettings,
): Array<{ padId: PadLaneId; key: string }> {
  return PAD_LANES.flatMap((pad) => {
    const region = settings[pad.id].region
    return region ? [{ padId: pad.id, key: sliceKey(region) }] : []
  })
}

/** A file name a recipient can recognize, from a beat name that could be anything. */
function bundleFileName(name: string): string {
  const cleaned = name.replace(/[^\w \-.]+/g, '').trim()
  return `${cleaned === '' ? 'Elevated BPM beat' : cleaned}${BUNDLE_FILE_EXTENSION}`
}

/**
 * Write a bundle, given the slices storage actually holds.
 *
 * A pad whose audio is gone is refused rather than dropped: that pad is silent
 * on the sender's own deck, and a bundle missing it is a file this build would
 * refuse to open. Saying so here — naming the pad, and the one click that fixes
 * it — is the difference between a bad file and no file.
 */
export async function createBundle(
  project: ProjectState,
  slices: ReadonlyMap<string, Slice>,
): Promise<BundleExport> {
  const sampler = project.instrumentSettings.sampler
  const needed = padsNeedingAudio(sampler)
  const silent = needed.filter(({ key }) => !slices.has(key))
  if (silent.length > 0) {
    const named = silent.map(({ padId }) => namedPad(sampler, padId))
    return {
      status: 'error',
      code: 'silent-pad',
      message: `${named.join(' and ')} ${
        named.length === 1 ? 'has' : 'have'
      } no audio to put in a bundle. Relink ${
        named.length === 1 ? 'it' : 'them'
      }, then export again.`,
    }
  }

  const document: BundleDocument = {
    project: projectForSharing(project),
    slices: Object.fromEntries(
      needed.map(({ key }) => [key, encodeSlice(slices.get(key)!)]),
    ),
  }
  const header = new TextEncoder().encode(`${BUNDLE_MAGIC}${PROJECT_STATE_VERSION}\n`)
  return {
    status: 'ready',
    blob: new Blob([header, await compressPayload(document)], { type: BUNDLE_MEDIA_TYPE }),
    fileName: bundleFileName(activePattern(project).name),
  }
}

function refuse(code: BundleErrorCode, message: string): BundleResult {
  return { status: 'error', code, message }
}

/** The version this file was written at, or nothing if it is not a bundle. */
function bundleVersion(bytes: Uint8Array): number | null {
  const head = new TextDecoder().decode(bytes.subarray(0, MAX_HEADER_BYTES))
  if (!head.startsWith(BUNDLE_MAGIC)) return null
  const newline = head.indexOf('\n')
  if (newline < 0) return null
  const version = head.slice(BUNDLE_MAGIC.length, newline)
  return /^\d+$/.test(version) ? Number(version) : null
}

/**
 * Open a bundle: the same migration and the same validation a link takes, plus
 * the audio a link cannot carry.
 *
 * The order the checks run in is what makes each message true. The header is
 * read before anything is decompressed, so a file from a newer build is named
 * as such rather than failing somewhere further in; decompression comes next,
 * so a file cut short in transit is named as truncated rather than as damaged;
 * and only then is the document read, so "the beat could not be read" means
 * exactly that.
 */
export async function readBundle(file: ArrayBuffer): Promise<BundleResult> {
  const bytes = new Uint8Array(file)
  const version = bundleVersion(bytes)
  if (version === null) {
    return refuse(
      'not-a-bundle',
      'This file is not an Elevated BPM bundle. Your saved project is safe.',
    )
  }
  // Everything at or below this build is lifted by the same migration a saved
  // document takes, so a bundle outlives the schema bumps that follow it. Only
  // a payload from a newer build is beyond repair.
  if (version > PROJECT_STATE_VERSION) {
    return refuse('unsupported-version', UNSUPPORTED_VERSION_MESSAGE)
  }

  const body = bytes.subarray(bytes.indexOf(0x0a) + 1)
  let json: string
  try {
    json = await decompressPayload(body)
  } catch {
    // gzip carries its own length and checksum, so a stream that will not
    // finish is a file that did not arrive whole.
    return refuse(
      'truncated',
      'This bundle is incomplete — the file was cut short before it finished. Ask whoever sent it to send it again.',
    )
  }

  const malformed = refuse(
    'malformed',
    'This bundle opened, but the beat inside it could not be read. Your saved project is safe.',
  )
  let document: BundleDocument
  try {
    document = JSON.parse(json) as BundleDocument
  } catch {
    return malformed
  }
  const project = readSharedDocument(document?.project)
  if (project === null) return malformed

  const sampler = project.instrumentSettings.sampler
  const needed = padsNeedingAudio(sampler)
  const carried = document.slices
  if (carried !== null && typeof carried === 'object' && !Array.isArray(carried)) {
    const slices: Array<[string, Slice]> = []
    const missing: PadLaneId[] = []
    for (const { padId, key } of needed) {
      const decoded = decodeSlice(carried[key])
      if (!decoded) {
        // A slice that is absent is a bundle exported from a deck with a silent
        // pad; one that is present but does not match its own shape is damage.
        if (!(key in carried)) missing.push(padId)
        else return malformed
        continue
      }
      if (!slices.some(([held]) => held === key)) slices.push([key, decoded])
    }
    if (missing.length > 0) {
      const named = missing.map((padId) => namedPad(sampler, padId))
      return refuse(
        'missing-audio',
        `This bundle is missing the audio for ${named.join(
          ' and ',
        )}. Ask whoever sent it to export it again.`,
      )
    }
    return { status: 'ready', project, slices }
  }
  return malformed
}

/**
 * The intake gate: what the deck will accept as a source, decided before any
 * decoding happens. Pure arithmetic over a file's metadata, so the rules that
 * protect the tab's memory are testable without a browser.
 */

/** A cheap first gate that costs nothing to apply. */
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024

/**
 * Six minutes accepts essentially any full track — the stated use case — and
 * refuses DJ mixes and long sets. Duration is the only real lever the app has
 * on peak memory: decoding preserves a file's channel count and resamples to
 * the audio context's rate, so neither term is the app's to choose.
 */
export const MAX_SOURCE_SECONDS = 6 * 60

/**
 * Every limit the user is told about is spelled from the constants above, so
 * the hint beside the file picker and the message on a refusal can never drift
 * apart from the rule that actually runs.
 */
const SIZE_LIMIT_LABEL = `${MAX_SOURCE_BYTES / 1024 / 1024} MB`
const DURATION_LIMIT_LABEL = `${MAX_SOURCE_SECONDS / 60} minutes`

/** Stated where audio is loaded, before the user waits on anything. */
export const INTAKE_LIMITS_HINT = `Any audio file this browser can play, up to ${SIZE_LIMIT_LABEL} and ${DURATION_LIMIT_LABEL}.`

export interface IntakeRejection {
  code: 'too-large' | 'too-long' | 'undecodable'
  message: string
}

function quoted(name: string): string {
  return `“${name}”`
}

/** What a nameless file is called, so a source always has something to show. */
const UNNAMED_SOURCE = 'Untitled sample'

/**
 * A source is named after its file, minus the extension. Every source carries
 * a non-empty name — it is what the sources list, the pad face and the share
 * payload all read — so a file with nothing usable in its name still gets one.
 */
export function sourceNameFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]+$/, '').trim()
  return withoutExtension === '' ? UNNAMED_SOURCE : withoutExtension
}

/**
 * The file is the problem, not the app. Formats are never allowlisted — the
 * browser is the authority on what it can play — so this is what a refusal
 * looks like once the browser itself has said no.
 */
export function undecodableRejection(name: string): IntakeRejection {
  return {
    code: 'undecodable',
    message: `${quoted(name)} could not be read as audio. This browser cannot play that file — your project is unchanged.`,
  }
}

/** Refuse an oversized file having done no work at all. */
export function rejectionForSize(name: string, bytes: number): IntakeRejection | null {
  if (bytes <= MAX_SOURCE_BYTES) return null
  return {
    code: 'too-large',
    message: `${quoted(name)} is too large. Sources must be ${SIZE_LIMIT_LABEL} or smaller.`,
  }
}

/**
 * Refuse an over-long file once its duration is known — probed from metadata,
 * still before any decode.
 */
export function rejectionForDuration(name: string, seconds: number): IntakeRejection | null {
  // A probe that came back with no readable duration says nothing about length
  // — it says the browser could not read the file, which is the honest message.
  if (Number.isNaN(seconds) || seconds <= 0) return undecodableRejection(name)
  if (seconds <= MAX_SOURCE_SECONDS) return null
  return {
    code: 'too-long',
    message: `${quoted(name)} is too long. Sources must be ${DURATION_LIMIT_LABEL} or shorter.`,
  }
}

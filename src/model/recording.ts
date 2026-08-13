import type { SampleSource } from './sampler'

/**
 * The recording session, as a state machine. It exists as pure code because it
 * is what guarantees the indicator can never be wrong about whether the mic is
 * live — the one question a user should never have to check visually.
 */

export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopping'

export interface RecordingState {
  status: RecordingStatus
  /** Wall clock, not musical time; only meaningful once the mic opened. */
  startedAt: number | null
  /**
   * What assistive technology is told. It is carried here rather than looked up
   * from the status because "the microphone is off" is only worth saying to
   * someone who was just told it was on — and idle is the state both before a
   * recording and after one.
   */
  announcement: string
}

/** "Am I being recorded" should never be a question anyone answers visually. */
export const MIC_LIVE_ANNOUNCEMENT = 'Recording. The microphone is live.'
export const MIC_OFF_ANNOUNCEMENT = 'Recording stopped. The microphone is off.'

/**
 * Said before recording, once and quietly. Both halves are warnings the user
 * would otherwise learn the hard way: the loop would be baked into the sample
 * with no way to undo it, and speakers plus a mic plus the master drive is a
 * howl whose volume control they will not be able to find.
 */
export const RECORDING_HINT =
  'Recording stops the loop. Wear headphones so the microphone does not hear the deck.'

/**
 * A refused permission is a normal failure, worded like a refused file: say
 * what happened, say the project is untouched, and leave everything open.
 */
export const MICROPHONE_DENIED_MESSAGE =
  'The microphone is not available. Allow microphone access in your browser to record — your project is unchanged.'

export const RECORDING_FAILED_MESSAGE =
  'The recording failed and nothing was captured. Your project is unchanged.'

/**
 * A take stopped before it caught anything. Worth its own message because the
 * intake gate would call an empty file undecodable — blaming the browser for
 * something the user did, which is the one thing that copy must never do.
 */
export const EMPTY_RECORDING_MESSAGE =
  'That take was too short to keep — nothing was captured. Your project is unchanged.'

export const IDLE_RECORDING: RecordingState = {
  status: 'idle',
  startedAt: null,
  announcement: '',
}

/**
 * Every transition below refuses to fire from a state it does not belong to,
 * and returns what it was given instead. That is what makes a stray second
 * click, or a browser event arriving late, unable to move the machine — and so
 * unable to make the indicator disagree with the microphone.
 */

/** The user chose to record. Nothing is asked of the browser before this. */
export function requestMicrophone(state: RecordingState): RecordingState {
  if (state.status !== 'idle') return state
  return { status: 'requesting', startedAt: null, announcement: '' }
}

/** The user allowed it and capture has begun. */
export function microphoneOpened(state: RecordingState, now: number): RecordingState {
  if (state.status !== 'requesting') return state
  return { status: 'recording', startedAt: now, announcement: MIC_LIVE_ANNOUNCEMENT }
}

/** The user asked it to stop; the recorder is still flushing what it captured. */
export function stopRequested(state: RecordingState): RecordingState {
  if (state.status !== 'recording') return state
  return { status: 'stopping', startedAt: state.startedAt, announcement: MIC_LIVE_ANNOUNCEMENT }
}

/**
 * Capture is over and the browser's inputs have been given back. This is the
 * one way out — a finished recording, a refused permission and a failed one all
 * leave through it — so the mic is announced off exactly when it was ever on.
 */
export function microphoneReleased(state: RecordingState): RecordingState {
  if (!isMicrophoneLive(state)) return IDLE_RECORDING
  return { ...IDLE_RECORDING, announcement: MIC_OFF_ANNOUNCEMENT }
}

/** What takes are called before their number. */
const RECORDING_NAME_STEM = 'Recording'

/**
 * The name a finished take arrives under. A recording becomes a file so that it
 * can travel the exact path an upload does, which means this has to survive
 * that path's own naming rule — the extension is stripped back off by
 * `sourceNameFromFileName`, leaving the stem the user reads.
 *
 * Numbering counts past the highest take ever named rather than counting what
 * is there, so deleting a take does not hand its name to the next one.
 */
export function recordingFileName(sources: readonly SampleSource[], mimeType: string): string {
  let highest = 0
  for (const source of sources) {
    if (source.origin !== 'recording') continue
    const numbered = new RegExp(`^${RECORDING_NAME_STEM} (\\d+)$`).exec(source.name)
    if (numbered) highest = Math.max(highest, Number(numbered[1]))
  }
  const name = `${RECORDING_NAME_STEM} ${highest + 1}`
  // Containers differ across browsers and a blob can arrive with no type at
  // all; the extension is only ever a hint, never something relied on.
  const subtype = /^audio\/([^;]+)/.exec(mimeType)?.[1]?.trim()
  return subtype ? `${name}.${subtype}` : name
}

/**
 * How long the microphone has been open. This is both what the indicator shows
 * and, at the moment of release, what the intake gate measures the recording
 * against — so it runs until the mic closes rather than until the user asks.
 */
export function elapsedSeconds(state: RecordingState, now: number): number {
  if (state.startedAt === null) return 0
  return Math.max(0, (now - state.startedAt) / 1000)
}

/** `M:SS`. Seconds are floored, so the readout never claims time not yet spent. */
export function formatElapsed(seconds: number): string {
  const whole = Math.floor(Math.max(0, seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * Whether the browser is capturing right now. Asking is not capturing — the
 * permission prompt is open and no audio is reaching anything yet — but
 * stopping still is, because the recorder has to flush what it captured before
 * the inputs can be released.
 */
export function isMicrophoneLive(state: RecordingState): boolean {
  return state.status === 'recording' || state.status === 'stopping'
}

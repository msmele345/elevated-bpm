/**
 * The browser half of recording: `getUserMedia` and `MediaRecorder`, and
 * nothing else. Everything decision-shaped lives above this boundary in pure
 * code, so this module stays small enough to read and is verified in a browser
 * rather than in tests — the deliberate gap EB2-07 records.
 *
 * **The mic is never monitored.** The stream goes straight from `getUserMedia`
 * to `MediaRecorder`; no `AudioContext` node is built from it at any point, so
 * there is no edge to `Tone.getDestination()` to forget to leave out. Feedback
 * is not merely unwired here — with no node in the graph it is not expressible,
 * which is the strongest form the rule can take. The types below carry a `Blob`
 * and a list of inputs, never an audio node, so it stays that way.
 */

/** A live input the browser opened. A `MediaStreamTrack` is one of these. */
export interface InputTrack {
  readonly readyState: string
  stop(): void
}

export interface MicrophoneSession {
  /** Stop capturing and hand back everything that was captured. */
  finish(): Promise<Blob>
  /**
   * Every input the browser opened. Releasing them is the app's to do rather
   * than this module's: "the mic goes off when you stop" is a privacy promise,
   * so it is kept above this boundary where it can be held to it.
   */
  readonly tracks: readonly InputTrack[]
}

/**
 * The microphone opened but capture could not be set up on it. Distinct from a
 * refusal because the user did nothing wrong and there is nothing for them to
 * allow — telling them to grant permission they already granted would send them
 * to a browser setting that is not the problem.
 */
export const RECORDER_UNAVAILABLE = 'RecorderUnavailableError'

export function isRecorderUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === RECORDER_UNAVAILABLE
}

/**
 * Ask for the microphone. Called only when the user chooses to record — never
 * at startup and never speculatively — and rejects when they say no.
 */
export async function openMicrophone(): Promise<MicrophoneSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

  try {
    // No `mimeType` is requested: containers differ across browsers and the
    // decode path must accept whatever this produces, so the browser picks what
    // it is best at rather than being pushed toward something it will refuse.
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    })

    // Subscribed before `start`, so a recorder that fails immediately is still
    // caught by something rather than rejecting into nowhere.
    const captured = new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener(
        'stop',
        () => resolve(new Blob(chunks, { type: recorder.mimeType })),
        { once: true },
      )
      recorder.addEventListener('error', () => reject(new Error('The recording failed.')), {
        once: true,
      })
    })

    recorder.start()

    return {
      tracks: stream.getTracks(),
      finish() {
        // Stopping is what flushes the last chunk, so the blob is only whole
        // once `stop` has fired — which is what the caller awaits.
        if (recorder.state !== 'inactive') recorder.stop()
        return captured
      },
    }
  } catch (cause) {
    // Everything above runs *after* the browser granted the microphone, and
    // both `new MediaRecorder` and `start()` can throw. Rejecting from here
    // without stopping the tracks would leave the microphone open with the
    // deck showing idle — a live mic nothing would ever release, which is the
    // exact failure the privacy commitment exists to prevent. This is the one
    // place the tracks cannot be released by the caller, because the caller is
    // never handed them.
    for (const track of stream.getTracks()) track.stop()
    const failure = new Error('The microphone opened but recording could not start.', { cause })
    failure.name = RECORDER_UNAVAILABLE
    throw failure
  }
}

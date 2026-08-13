import {
  rejectionForProbe,
  rejectionForSize,
  sourceNameFromFileName,
  undecodableRejection,
  type IntakeRejection,
} from '../model/intake'
import type { SampleOrigin, SampleSource } from '../model/sampler'
import type { RenderableAudio } from '../model/slice'

/**
 * Bringing the learner's own audio in. The gate is pure and lives in the model;
 * what is here is the order the steps run in — size, then duration, then decode
 * — and the rule that nothing about a file is believed until it is decoded.
 *
 * Decode and the metadata probe are real I/O, so they are injected, following
 * the autosaver's pattern of being constructed with its save function. That is
 * what keeps this whole path testable without a browser or a real decoder.
 */

/**
 * What a decoder hands back: audio that knows its own shape and can be read
 * sample by sample. This is the *render* decode — the feature's peak memory
 * moment — and it exists only long enough to render a slice out of, which is
 * why the duration cap above it is where it is.
 */
export interface DecodedSample extends RenderableAudio {
  readonly duration: number
}

/** All the intake path itself needs of a file; a real `File` is one of these. */
export interface IntakeFile {
  readonly name: string
  readonly size: number
}

export interface SampleIntakeDeps<F extends IntakeFile> {
  /** Duration from an audio element's metadata — no decoding, so it is cheap. */
  probeDuration(file: F): Promise<number>
  decode(file: F): Promise<DecodedSample>
  newSourceId(): string
}

/**
 * What differs between a file the user chose and audio they recorded. Neither
 * changes the gate: same limits, same order, same refusals, same decode. A
 * recording is indistinguishable from an upload everywhere downstream, which is
 * the whole reason it is brought in as a file rather than by its own path.
 */
export interface IntakeOptions {
  /** Carried for the curriculum's benefit, not the audio path's. */
  origin?: SampleOrigin
  /**
   * A length already measured by whatever produced the audio, used in place of
   * the metadata probe. A recording has one and needs it: a `MediaRecorder`
   * container commonly declares no duration at all, so probing one would refuse
   * every recording as over-length. A chosen file has no such clock and is
   * probed as it always was.
   */
  knownDuration?: number
}

export type IntakeOutcome =
  | { status: 'loaded'; source: SampleSource; buffer: DecodedSample }
  | { status: 'rejected'; rejection: IntakeRejection }

export interface SampleIntake<F extends IntakeFile> {
  load(file: F, options?: IntakeOptions): Promise<IntakeOutcome>
}

export function createSampleIntake<F extends IntakeFile>(
  deps: SampleIntakeDeps<F>,
): SampleIntake<F> {
  return {
    async load(file, options = {}) {
      const oversized = rejectionForSize(file.name, file.size)
      if (oversized) return { status: 'rejected', rejection: oversized }

      let buffer: DecodedSample
      try {
        const seconds = options.knownDuration ?? (await deps.probeDuration(file))
        const overLong = rejectionForProbe(file.name, seconds)
        if (overLong) return { status: 'rejected', rejection: overLong }
        // The browser is the authority on what it can play, so formats are
        // never allowlisted: attempt the decode and report what happened.
        buffer = await deps.decode(file)
      } catch {
        // Either step throwing means the same thing — this browser cannot read
        // the file — and a probe that throws never reaches the decode.
        return { status: 'rejected', rejection: undecodableRejection(file.name) }
      }

      return {
        status: 'loaded',
        // The decoded buffer is the authority on the audio's shape: a probe's
        // duration is an estimate, and a variable-bitrate file will disagree
        // with it. Everything downstream measures against what actually plays.
        source: {
          id: deps.newSourceId(),
          name: sourceNameFromFileName(file.name),
          origin: options.origin ?? 'upload',
          duration: buffer.duration,
          channels: buffer.numberOfChannels,
        },
        buffer,
      }
    },
  }
}

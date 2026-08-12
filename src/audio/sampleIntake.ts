import {
  rejectionForProbe,
  rejectionForSize,
  sourceNameFromFileName,
  undecodableRejection,
  type IntakeRejection,
} from '../model/intake'
import type { SampleSource } from '../model/sampler'
import type { SampleBuffer } from './sampleRegistry'

/**
 * Bringing the learner's own audio in. The gate is pure and lives in the model;
 * what is here is the order the steps run in — size, then duration, then decode
 * — and the rule that nothing about a file is believed until it is decoded.
 *
 * Decode and the metadata probe are real I/O, so they are injected, following
 * the autosaver's pattern of being constructed with its save function. That is
 * what keeps this whole path testable without a browser or a real decoder.
 */

/** What a decoder hands back: playable audio that knows its own shape. */
export interface DecodedSample extends SampleBuffer {
  readonly numberOfChannels: number
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

export type IntakeOutcome =
  | { status: 'loaded'; source: SampleSource; buffer: DecodedSample }
  | { status: 'rejected'; rejection: IntakeRejection }

export interface SampleIntake<F extends IntakeFile> {
  load(file: F): Promise<IntakeOutcome>
}

export function createSampleIntake<F extends IntakeFile>(
  deps: SampleIntakeDeps<F>,
): SampleIntake<F> {
  return {
    async load(file) {
      const oversized = rejectionForSize(file.name, file.size)
      if (oversized) return { status: 'rejected', rejection: oversized }

      let buffer: DecodedSample
      try {
        const overLong = rejectionForProbe(file.name, await deps.probeDuration(file))
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
          origin: 'upload',
          duration: buffer.duration,
          channels: buffer.numberOfChannels,
        },
        buffer,
      }
    },
  }
}

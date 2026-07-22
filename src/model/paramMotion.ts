import { normalizeParam, type ParamSpec } from './knob'

/**
 * What a knob did, rather than where it ended up. Every other goal assertion is
 * a claim about the document as it stands; a sweep is a claim about motion over
 * time, so it needs its own record — the widest span of a knob's travel reached
 * while the transport was running.
 *
 * Spans are kept in normalized knob travel (0..1), not raw units, so "swept
 * half the knob" means the same thing on a log-tapered cutoff as on a linear
 * resonance.
 */

/** The extremes one parameter has reached, in normalized knob travel. */
export interface ParamSpan {
  min: number
  max: number
}

/** Observed motion, keyed by parameter id. */
export type ParamMotion = Record<string, ParamSpan>

/** A session that has not moved anything yet. */
export const NO_PARAM_MOTION: ParamMotion = {}

/**
 * Fold one knob position into the record. Motion is only observed while
 * playing: sound design is something you do to a running loop, so a knob
 * turned on a stopped deck leaves no trace.
 */
export function observeParamMotion(
  motion: ParamMotion,
  spec: ParamSpec,
  value: number,
  playing: boolean,
): ParamMotion {
  if (!playing) return motion
  const position = normalizeParam(spec, value)
  const span = motion[spec.id]
  return {
    ...motion,
    [spec.id]: span
      ? { min: Math.min(span.min, position), max: Math.max(span.max, position) }
      : { min: position, max: position },
  }
}

/** How much of its travel a parameter has covered, 0 (untouched) to 1 (end to end). */
export function paramTravel(motion: ParamMotion, paramId: string): number {
  const span = motion[paramId]
  return span ? span.max - span.min : 0
}

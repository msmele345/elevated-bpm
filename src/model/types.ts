/**
 * Ubiquitous-language domain types (see plans/elevated-bpm-v1.md).
 * Patterns are first-class, ID'd 16-step loops; this shape is the seed of
 * the versioned ProjectState document introduced in Phase 3.
 */

export const STEP_COUNT = 16

/** One cell of a drum lane. */
export interface DrumStep {
  on: boolean
  accent: boolean
}

export type DrumLaneId = 'kick' | 'snare' | 'closedHat' | 'openHat' | 'perc'

/** A drum lane: 16 steps of on/off + accent. */
export interface DrumLane {
  id: DrumLaneId
  label: string
  steps: DrumStep[]
}

/** A first-class 16-step loop. */
export interface Pattern {
  id: string
  name: string
  lanes: DrumLane[]
}

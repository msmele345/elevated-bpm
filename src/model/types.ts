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

/**
 * One cell of a note lane: a pitch (MIDI note number) and a length in whole
 * steps, so a note can ring across the 16ths that follow it.
 */
export interface NoteStep {
  on: boolean
  pitch: number
  length: number
}

export type NoteLaneId = 'bass'

/** A note lane: 16 steps of on/off + pitch + length. */
export interface NoteLane {
  id: NoteLaneId
  label: string
  steps: NoteStep[]
}

/**
 * A first-class 16-step loop. Drum lanes and note lanes are separate lists
 * because their steps carry different musical content, but both are sequenced
 * off the same step index, which is what keeps bass locked to the drums.
 */
export interface Pattern {
  id: string
  name: string
  lanes: DrumLane[]
  noteLanes: NoteLane[]
}

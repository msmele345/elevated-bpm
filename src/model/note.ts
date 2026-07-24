import { STEP_COUNT, type NoteLane, type NoteLaneId, type NoteStep, type Pattern } from './types'

/**
 * Note lanes: the melodic half of a pattern. A step carries a pitch and a
 * length instead of an accent, and the lane is played monophonically — one
 * note at a time, a later note cutting the one still ringing.
 */

/** MIDI note the bass lane parks on: C2, the root a 303 line usually sits on. */
export const DEFAULT_PITCH = 36
/** Two octaves of bass, C1–C3: low enough to rumble, high enough to sing. */
export const MIN_PITCH = 24
export const MAX_PITCH = 48
/** The stab lane matches the visible one-octave keyboard, C4–C5. */
export const STAB_DEFAULT_PITCH = 60
export const STAB_MIN_PITCH = 60
export const STAB_MAX_PITCH = 72

/** Note length in whole steps — one 16th up to a full beat. */
export const MIN_NOTE_LENGTH = 1
export const MAX_NOTE_LENGTH = 4

/**
 * The note lanes a pattern has, in deck order. Like KIT_LANES for drums, this
 * list is the authority for each lane's label, default pitch, and range.
 */
interface NoteLaneSpec {
  id: NoteLaneId
  label: string
  defaultPitch: number
  minPitch: number
  maxPitch: number
}

export const NOTE_LANES: ReadonlyArray<NoteLaneSpec> = [
  {
    id: 'bass',
    label: 'Bass',
    defaultPitch: DEFAULT_PITCH,
    minPitch: MIN_PITCH,
    maxPitch: MAX_PITCH,
  },
  {
    id: 'stab',
    label: 'Stab',
    defaultPitch: STAB_DEFAULT_PITCH,
    minPitch: STAB_MIN_PITCH,
    maxPitch: STAB_MAX_PITCH,
  },
]

function emptyNoteSteps(defaultPitch: number): NoteStep[] {
  return Array.from({ length: STEP_COUNT }, () => ({
    on: false,
    pitch: defaultPitch,
    length: MIN_NOTE_LENGTH,
  }))
}

/** Every note lane, all steps off and parked at the default pitch. */
export function createNoteLanes(): NoteLane[] {
  return NOTE_LANES.map(({ id, label, defaultPitch }) => ({
    id,
    label,
    steps: emptyNoteSteps(defaultPitch),
  }))
}

/**
 * Return the pattern with every note lane present, in deck order. Lanes the
 * pattern already has keep their programmed notes; missing ones arrive empty,
 * which is what lets a document saved before the bass existed load intact.
 */
export function withNoteLanes(pattern: Pattern): Pattern {
  return {
    ...pattern,
    noteLanes: NOTE_LANES.map(({ id, label, defaultPitch }) => {
      return (
        pattern.noteLanes?.find((lane) => lane.id === id) ?? {
          id,
          label,
          steps: emptyNoteSteps(defaultPitch),
        }
      )
    }),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Immutably replace one step of one note lane, leaving other lanes by reference. */
function mapNoteStep(
  pattern: Pattern,
  laneId: NoteLaneId,
  stepIndex: number,
  next: (step: NoteStep) => NoteStep,
): Pattern {
  return {
    ...pattern,
    noteLanes: pattern.noteLanes.map((lane) =>
      lane.id === laneId
        ? { ...lane, steps: lane.steps.map((step, i) => (i === stepIndex ? next(step) : step)) }
        : lane,
    ),
  }
}

/**
 * Immutably switch a note on or off. Pitch and length survive the round trip,
 * so clearing a note by mistake doesn't cost the work of shaping it.
 */
export function toggleNoteStep(pattern: Pattern, laneId: NoteLaneId, stepIndex: number): Pattern {
  return mapNoteStep(pattern, laneId, stepIndex, (step) => ({ ...step, on: !step.on }))
}

/** Immutably shift one note by `semitones`, clamped to the lane's range. */
export function transposeNoteStep(
  pattern: Pattern,
  laneId: NoteLaneId,
  stepIndex: number,
  semitones: number,
): Pattern {
  const spec = NOTE_LANES.find((lane) => lane.id === laneId)
  if (!spec) return pattern
  return mapNoteStep(pattern, laneId, stepIndex, (step) => ({
    ...step,
    pitch: clamp(step.pitch + semitones, spec.minPitch, spec.maxPitch),
  }))
}

/** Immutably grow or shrink one note by whole steps, clamped to the legal range. */
export function resizeNoteStep(
  pattern: Pattern,
  laneId: NoteLaneId,
  stepIndex: number,
  steps: number,
): Pattern {
  return mapNoteStep(pattern, laneId, stepIndex, (step) => ({
    ...step,
    length: clamp(step.length + steps, MIN_NOTE_LENGTH, MAX_NOTE_LENGTH),
  }))
}

/** What a note lane sounds on one 16th: nothing, or a single note. */
export interface NoteEvent {
  midi: number
  frequency: number
  /** How many 16ths the note actually rings for, once the next note cuts it. */
  lengthSteps: number
}

export interface LaneNoteEvent extends NoteEvent {
  laneId: NoteLaneId
}

/**
 * How far a note starting at `stepIndex` can ring before the next programmed
 * note takes the voice. Scanning wraps around the loop, because step 15 runs
 * straight back into step 0 on the next pass.
 */
function stepsUntilNextNote(steps: NoteStep[], stepIndex: number, limit: number): number {
  for (let ahead = 1; ahead < limit; ahead += 1) {
    if (steps[(stepIndex + ahead) % steps.length].on) return ahead
  }
  return limit
}

/**
 * The note a lane starts on `stepIndex`, or null. One event at most, and its
 * length is clipped where the next note begins — the lane is monophonic, so
 * the engine never has to arbitrate between two overlapping voices.
 */
export function noteEventAtStep(
  pattern: Pattern,
  laneId: NoteLaneId,
  stepIndex: number,
): NoteEvent | null {
  const lane = pattern.noteLanes?.find((l) => l.id === laneId)
  const step = lane?.steps[stepIndex]
  if (!lane || !step?.on) return null
  return {
    midi: step.pitch,
    frequency: midiToFrequency(step.pitch),
    lengthSteps: stepsUntilNextNote(lane.steps, stepIndex, step.length),
  }
}

/** Every melodic event starting on one shared 16th-note transport boundary. */
export function noteEventsAtStep(pattern: Pattern, stepIndex: number): LaneNoteEvent[] {
  return NOTE_LANES.flatMap(({ id }) => {
    const event = noteEventAtStep(pattern, id, stepIndex)
    return event ? [{ laneId: id, ...event }] : []
  })
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** MIDI note number as a keyboard name, e.g. 36 → "C2". */
export function midiToNoteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

/** MIDI note number as an equal-tempered frequency in Hz (A4 = 440). */
export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

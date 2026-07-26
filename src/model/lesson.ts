import { BASS_PARAMS, type BassParamId } from './bass'
import { NO_CHORD_PLAY, type ChordPlay } from './chordPlay'
import { NOTE_LANES } from './note'
import { NO_PARAM_MOTION, paramTravel, type ParamMotion } from './paramMotion'
import { KIT_LANES } from './pattern'
import { MAX_BPM, MIN_BPM } from './transport'
import {
  STEP_COUNT,
  type DrumLaneId,
  type NoteLaneId,
  type NoteStep,
  type Pattern,
} from './types'

/**
 * Lessons are pure data (see plans/elevated-bpm-v1.md): a JSON definition of
 * intro text, spotlight targets, and declarative goal assertions evaluated
 * against ProjectState. Adding a lesson must require no code.
 */

/** Spotlight target id, e.g. "lane:kick" (later: "knob:cutoff", "transport:play"). */
export type SpotlightTarget = string

/** Declarative goal assertion over live pattern state. */
export interface StepsActiveGoal {
  type: 'stepsActive'
  lane: DrumLaneId
  steps: number[]
}

/**
 * Dynamics rather than placement: exactly these steps of a drum lane are
 * accented. What separates a machine-like loop from one that pushes.
 */
export interface StepsAccentedGoal {
  type: 'stepsAccented'
  lane: DrumLaneId
  steps: number[]
}

/** The melodic twin of stepsActive: exactly these steps of a note lane hold a note. */
export interface NotesActiveGoal {
  type: 'notesActive'
  lane: NoteLaneId
  steps: number[]
}

/**
 * An open goal: at least `min` notes anywhere in the lane. The line is the
 * user's own — the lesson asks for a bassline, not for one particular one.
 */
export interface NotesPlacedGoal {
  type: 'notesPlaced'
  lane: NoteLaneId
  min: number
}

/** At least `min` different pitches in the lane: the line has to move, not drone. */
export interface PitchesVariedGoal {
  type: 'pitchesVaried'
  lane: NoteLaneId
  min: number
}

/** The transport sits in a tempo range — the goal of a "find the tempo" lesson. */
export interface BpmInRangeGoal {
  type: 'bpmInRange'
  min: number
  max: number
}

/**
 * Live playing, not programming: at least `minNotes` sounded together on the
 * keyboard. Like paramSwept, this is a claim about what the user did, so it
 * reads a session observation rather than the document.
 */
export interface ChordPlayedGoal {
  type: 'chordPlayed'
  minNotes: number
}

/**
 * Sound-design goal: the user moved a knob across at least `minTravel` of its
 * range (0..1) while the loop was running. Motion, not a final value — the
 * lesson is "hear what the filter does", and any single cutoff setting would
 * be a poor proxy for that.
 */
export interface ParamSweptGoal {
  type: 'paramSwept'
  param: BassParamId
  minTravel: number
}

export type GoalAssertion =
  | StepsActiveGoal
  | StepsAccentedGoal
  | NotesActiveGoal
  | NotesPlacedGoal
  | PitchesVariedGoal
  | BpmInRangeGoal
  | ParamSweptGoal
  | ChordPlayedGoal

export interface Lesson {
  id: string
  title: string
  intro: string
  spotlight: SpotlightTarget[]
  goal: GoalAssertion[]
}

/** Ids of one kind of spotlight target, e.g. the "kick" of "lane:kick". */
function spotlitIds(lesson: Lesson | null, prefix: string): string[] {
  if (!lesson) return []
  return lesson.spotlight
    .filter((target) => target.startsWith(prefix))
    .map((target) => target.slice(prefix.length))
}

/** Lane ids the active lesson spotlights; empty when no lesson is active. */
export function spotlitLaneIds(lesson: Lesson | null): DrumLaneId[] {
  return spotlitIds(lesson, 'lane:') as DrumLaneId[]
}

/** Note lane ids the active lesson spotlights, e.g. "noteLane:bass" → "bass". */
export function spotlitNoteLaneIds(lesson: Lesson | null): NoteLaneId[] {
  return spotlitIds(lesson, 'noteLane:') as NoteLaneId[]
}

/** Knob ids the active lesson spotlights, e.g. "knob:cutoff" → "cutoff". */
export function spotlitParamIds(lesson: Lesson | null): string[] {
  return spotlitIds(lesson, 'knob:')
}

/**
 * Whether the lesson points at one particular control, for surfaces the deck
 * has exactly one of — e.g. "transport:tempo" or "keyboard:stab".
 */
export function spotlightsTarget(lesson: Lesson | null, target: string): boolean {
  return lesson?.spotlight.includes(target) ?? false
}

/**
 * Everything a goal can be asserted against: the document as it stands, plus
 * what the user has done to it this session. Goals stay declarative; the
 * context is the only thing that grows as the vocabulary does.
 */
export interface GoalContext {
  pattern: Pattern
  /** Knob motion observed during playback; absent for a session that has moved nothing. */
  motion?: ParamMotion
  /** The transport tempo the document is set to. */
  bpm?: number
  /** Live keyboard playing observed this session. */
  chord?: ChordPlay
}

/** True when exactly the wanted step indexes satisfy `holds`, and no others. */
function exactlyOn<T>(steps: T[], wanted: number[], holds: (step: T) => boolean): boolean {
  const set = new Set(wanted)
  // Exact match: every goal step on, every other step off — wrong or extra
  // steps must never falsely complete a lesson.
  return steps.every((step, i) => holds(step) === set.has(i))
}

function isStepsActiveMet(goal: StepsActiveGoal, pattern: Pattern): boolean {
  const lane = pattern.lanes.find((l) => l.id === goal.lane)
  if (!lane) return false
  return exactlyOn(lane.steps, goal.steps, (step) => step.on)
}

function isStepsAccentedMet(goal: StepsAccentedGoal, pattern: Pattern): boolean {
  const lane = pattern.lanes.find((l) => l.id === goal.lane)
  if (!lane) return false
  return exactlyOn(lane.steps, goal.steps, (step) => step.on && step.accent)
}

/** The programmed notes of one note lane, silent steps left out. */
function notesOf(pattern: Pattern, laneId: NoteLaneId): NoteStep[] {
  const lane = pattern.noteLanes?.find((l) => l.id === laneId)
  return lane ? lane.steps.filter((step) => step.on) : []
}

function isNotesActiveMet(goal: NotesActiveGoal, pattern: Pattern): boolean {
  const lane = pattern.noteLanes?.find((l) => l.id === goal.lane)
  if (!lane) return false
  return exactlyOn(lane.steps, goal.steps, (step) => step.on)
}

function isAssertionMet(goal: GoalAssertion, context: GoalContext): boolean {
  switch (goal.type) {
    case 'stepsActive':
      return isStepsActiveMet(goal, context.pattern)
    case 'stepsAccented':
      return isStepsAccentedMet(goal, context.pattern)
    case 'notesActive':
      return isNotesActiveMet(goal, context.pattern)
    case 'notesPlaced':
      return notesOf(context.pattern, goal.lane).length >= goal.min
    case 'pitchesVaried':
      // Pitch parked under a step that is switched off is not part of the line.
      return new Set(notesOf(context.pattern, goal.lane).map((step) => step.pitch)).size >= goal.min
    case 'bpmInRange':
      return context.bpm !== undefined && context.bpm >= goal.min && context.bpm <= goal.max
    case 'paramSwept':
      return paramTravel(context.motion ?? NO_PARAM_MOTION, goal.param) >= goal.minTravel
    case 'chordPlayed':
      return (context.chord ?? NO_CHORD_PLAY).maxNotes >= goal.minNotes
  }
}

/** True when every goal assertion of the lesson holds against the live session. */
export function isGoalMet(lesson: Lesson, context: GoalContext): boolean {
  return lesson.goal.every((goal) => isAssertionMet(goal, context))
}

function fail(lessonId: string, message: string): never {
  throw new Error(`Invalid lesson${lessonId ? ` "${lessonId}"` : ''}: ${message}`)
}

const DRUM_LANE_IDS: string[] = KIT_LANES.map((lane) => lane.id)
const NOTE_LANE_IDS: string[] = NOTE_LANES.map((lane) => lane.id)
const PARAM_IDS: ReadonlySet<string> = new Set(BASS_PARAMS.map((param) => param.id))

function isBassParamId(value: unknown): value is BassParamId {
  return typeof value === 'string' && PARAM_IDS.has(value)
}

/**
 * A lane the deck actually has. Authoring a lesson is a JSON-only job, so a
 * mistyped lane must fail loudly here rather than become a goal that can never
 * be met and never be seen to fail.
 */
function parseLane(
  lane: unknown,
  known: string[],
  lessonId: string,
  index: number,
): string {
  if (typeof lane !== 'string' || !known.includes(lane)) {
    fail(lessonId, `goal[${index}] names lane "${String(lane)}"; the deck has ${known.join(', ')}`)
  }
  return lane
}

function parseSteps(steps: unknown, lessonId: string, index: number): number[] {
  if (
    !Array.isArray(steps) ||
    steps.length === 0 ||
    new Set(steps).size !== steps.length ||
    !steps.every((s) => Number.isInteger(s) && s >= 0 && s < STEP_COUNT)
  ) {
    fail(
      lessonId,
      `goal[${index}] steps must be unique integers in [0, ${STEP_COUNT}) and cannot be empty`,
    )
  }
  return steps
}

/** A count of steps or notes: an integer a 16-step pattern could actually reach. */
function parseCount(
  value: unknown,
  field: string,
  min: number,
  lessonId: string,
  index: number,
): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > STEP_COUNT) {
    fail(lessonId, `goal[${index}] ${field} must be an integer in [${min}, ${STEP_COUNT}]`)
  }
  return value as number
}

function parseStepsActiveGoal(
  goal: Partial<StepsActiveGoal>,
  lessonId: string,
  index: number,
): StepsActiveGoal {
  return {
    type: 'stepsActive',
    lane: parseLane(goal.lane, DRUM_LANE_IDS, lessonId, index) as DrumLaneId,
    steps: parseSteps(goal.steps, lessonId, index),
  }
}

function parseStepsAccentedGoal(
  goal: Partial<StepsAccentedGoal>,
  lessonId: string,
  index: number,
): StepsAccentedGoal {
  return {
    type: 'stepsAccented',
    lane: parseLane(goal.lane, DRUM_LANE_IDS, lessonId, index) as DrumLaneId,
    steps: parseSteps(goal.steps, lessonId, index),
  }
}

function parseNotesActiveGoal(
  goal: Partial<NotesActiveGoal>,
  lessonId: string,
  index: number,
): NotesActiveGoal {
  return {
    type: 'notesActive',
    lane: parseLane(goal.lane, NOTE_LANE_IDS, lessonId, index) as NoteLaneId,
    steps: parseSteps(goal.steps, lessonId, index),
  }
}

function parseNotesPlacedGoal(
  goal: Partial<NotesPlacedGoal>,
  lessonId: string,
  index: number,
): NotesPlacedGoal {
  return {
    type: 'notesPlaced',
    lane: parseLane(goal.lane, NOTE_LANE_IDS, lessonId, index) as NoteLaneId,
    min: parseCount(goal.min, 'min', 1, lessonId, index),
  }
}

function parsePitchesVariedGoal(
  goal: Partial<PitchesVariedGoal>,
  lessonId: string,
  index: number,
): PitchesVariedGoal {
  const lane = parseLane(goal.lane, NOTE_LANE_IDS, lessonId, index) as NoteLaneId
  const spec = NOTE_LANES.find((candidate) => candidate.id === lane)!
  const distinctPitches = spec.maxPitch - spec.minPitch + 1
  const max = Math.min(STEP_COUNT, distinctPitches)
  if (!Number.isInteger(goal.min) || (goal.min as number) < 2 || (goal.min as number) > max) {
    fail(lessonId, `goal[${index}] min must be an integer in [2, ${max}] for lane "${lane}"`)
  }
  return {
    type: 'pitchesVaried',
    lane,
    // One pitch is a line that never moves, so it is no goal at all.
    min: goal.min as number,
  }
}

function parseBpmInRangeGoal(
  goal: Partial<BpmInRangeGoal>,
  lessonId: string,
  index: number,
): BpmInRangeGoal {
  const { min, max } = goal
  // A range the tempo control cannot reach — or one that runs backwards — is a
  // goal the user could never satisfy.
  if (
    typeof min !== 'number' ||
    typeof max !== 'number' ||
    min < MIN_BPM ||
    max > MAX_BPM ||
    min > max
  ) {
    fail(lessonId, `goal[${index}] bpm range must run min → max inside [${MIN_BPM}, ${MAX_BPM}]`)
  }
  return { type: 'bpmInRange', min, max }
}

function parseChordPlayedGoal(
  goal: Partial<ChordPlayedGoal>,
  lessonId: string,
  index: number,
): ChordPlayedGoal {
  // One note is not a chord; a hand is not twelve.
  if (!Number.isInteger(goal.minNotes) || (goal.minNotes as number) < 2 || (goal.minNotes as number) > 12) {
    fail(lessonId, `goal[${index}] minNotes must be an integer in [2, 12]`)
  }
  return { type: 'chordPlayed', minNotes: goal.minNotes as number }
}

function parseParamSweptGoal(
  goal: Partial<ParamSweptGoal>,
  lessonId: string,
  index: number,
): ParamSweptGoal {
  if (goal.param === undefined) {
    fail(lessonId, `goal[${index}] is missing a param`)
  }
  if (!isBassParamId(goal.param)) {
    fail(
      lessonId,
      `goal[${index}] names param "${goal.param}"; the deck has ${[...PARAM_IDS].join(', ')}`,
    )
  }
  // Travel is a fraction of the knob's range, so anything outside (0, 1] is
  // either a no-op goal or one no amount of knob turning can ever satisfy.
  if (typeof goal.minTravel !== 'number' || !(goal.minTravel > 0 && goal.minTravel <= 1)) {
    fail(lessonId, `goal[${index}] minTravel must be a number in (0, 1]`)
  }
  return { type: 'paramSwept', param: goal.param, minTravel: goal.minTravel }
}

function parseGoal(raw: unknown, lessonId: string, index: number): GoalAssertion {
  const goal = raw as Partial<GoalAssertion> | null
  if (goal === null || typeof goal !== 'object') fail(lessonId, `goal[${index}] must be an object`)
  switch (goal.type) {
    case 'stepsActive':
      return parseStepsActiveGoal(goal, lessonId, index)
    case 'stepsAccented':
      return parseStepsAccentedGoal(goal, lessonId, index)
    case 'notesActive':
      return parseNotesActiveGoal(goal, lessonId, index)
    case 'notesPlaced':
      return parseNotesPlacedGoal(goal, lessonId, index)
    case 'pitchesVaried':
      return parsePitchesVariedGoal(goal, lessonId, index)
    case 'bpmInRange':
      return parseBpmInRangeGoal(goal, lessonId, index)
    case 'paramSwept':
      return parseParamSweptGoal(goal, lessonId, index)
    case 'chordPlayed':
      return parseChordPlayedGoal(goal, lessonId, index)
    default:
      fail(lessonId, `goal[${index}] has unknown type "${String(goal.type)}"`)
  }
}

/** Parse an untrusted JSON value into a Lesson, throwing a descriptive error if malformed. */
export function parseLesson(data: unknown): Lesson {
  if (data === null || typeof data !== 'object') {
    throw new Error('Invalid lesson: definition must be an object')
  }
  const raw = data as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id : ''

  for (const field of ['id', 'title', 'intro'] as const) {
    if (typeof raw[field] !== 'string' || raw[field] === '') {
      fail(id, `"${field}" must be a non-empty string`)
    }
  }
  if (!Array.isArray(raw.spotlight) || !raw.spotlight.every((t) => typeof t === 'string')) {
    fail(id, '"spotlight" must be an array of target ids')
  }
  if (!Array.isArray(raw.goal) || raw.goal.length === 0) {
    fail(id, '"goal" must be a non-empty array of assertions')
  }

  return {
    id,
    title: raw.title as string,
    intro: raw.intro as string,
    spotlight: raw.spotlight,
    goal: raw.goal.map((g, i) => parseGoal(g, id, i)),
  }
}

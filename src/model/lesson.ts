import { NO_CHORD_PLAY, type ChordPlay } from './chordPlay'
import { DECK_PARAM_IDS, isDeckParamId, type DeckParamId } from './deckParams'
import { NOTE_FLAG_LANES, NOTE_LANES, slideReach } from './note'
import { NO_PARAM_MOTION, paramTravel, type ParamMotion } from './paramMotion'
import { KIT_LANES } from './pattern'
import { MAX_SLICE_SECONDS } from './region'
import {
  MAX_FIT_STEPS,
  MAX_PAD_TUNE,
  MIN_FIT_STEPS,
  PAD_LANES,
  SHIPPED_SOURCES,
  shippedSource,
  type PadSettings,
  type SampleOrigin,
  type SampleRegion,
  type SampleSource,
  type SamplerSettings,
} from './sampler'
import { MAX_BPM, MIN_BPM, SWING_PARAM, wholeSwingPercent } from './transport'
import {
  STEP_COUNT,
  type DrumLaneId,
  type NoteLaneId,
  type NoteStep,
  type PadLaneId,
  type Pattern,
} from './types'

/**
 * A ceiling on how many sources a goal may ask for. Nothing in the document
 * bounds the bank, so this is the arc's own judgement: a lesson that asked for
 * more sounds than a learner would plausibly load is one they would give up on.
 */
const MAX_GOAL_SOURCES = 8

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

/**
 * At least `min` notes of a flag lane carry the 303 accent. An open count, like
 * notesPlaced: which notes bite is the learner's call.
 */
export interface NotesAccentedGoal {
  type: 'notesAccented'
  lane: NoteLaneId
  min: number
}

/**
 * At least `min` slides that glide into a following note. A slide into a rest
 * only ties, and one on an empty step does nothing, so neither counts: the
 * lesson is the glide, and those are not one.
 */
export interface NotesSlidGoal {
  type: 'notesSlid'
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
 * The transport's swing sits in a range — the goal of a "shuffle" lesson. In
 * percent, as the Swing knob reads, so a lesson author writes what the learner
 * sees.
 */
export interface SwingInRangeGoal {
  type: 'swingInRange'
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
  /** Any knob on the deck — bass, master, or FX. */
  param: DeckParamId
  minTravel: number
}

/**
 * Origins a sampling goal can ask for. `'user'` means either way a learner
 * brings audio in — the point is that they brought it, not how.
 *
 * `'shipped'` is deliberately absent: the deck installs the curated source so a
 * first chop is one click away, and a goal it satisfied on its own would arrive
 * already earned. That is the trap the backbeat clap fell into in Phase 7, and
 * this is where it is refused.
 */
export type GoalOrigin = 'user' | 'upload' | 'recording'

/** Audio the learner brought in themselves, of a given kind and count. */
export interface SourceLoadedGoal {
  type: 'sourceLoaded'
  origin: GoalOrigin
  min: number
}

/** Pads carrying a chop — optionally only chops cut from the learner's own audio. */
export interface PadAssignedGoal {
  type: 'padAssigned'
  min: number
  origin?: GoalOrigin
}

/**
 * A chop that starts inside a window of a particular file.
 *
 * The source id is as load-bearing as the window: a window alone is a false
 * positive waiting to happen, because a learner who loads their own break and
 * happens to chop near the same offset would complete a lesson about a file
 * they never opened.
 */
export interface RegionStartsWithinGoal {
  type: 'regionStartsWithin'
  pad: PadLaneId
  source: string
  from: number
  to: number
}

/** A chop trimmed down to at most this long — "trim it tight". */
export interface RegionShorterThanGoal {
  type: 'regionShorterThan'
  pad: PadLaneId
  seconds: number
}

/** A pad holding a chop *and* declaring how many steps it should fill. */
export interface FitTargetSetGoal {
  type: 'fitTargetSet'
  pad: PadLaneId
  minSteps: number
}

/** A pad pitched away from neutral, in either direction. */
export interface PadTunedGoal {
  type: 'padTuned'
  pad: PadLaneId
  minSemitones: number
}

/** Pad steps switched on anywhere across the sampler: the kit, sequenced. */
export interface PadStepsPlacedGoal {
  type: 'padStepsPlaced'
  min: number
}

export type GoalAssertion = (
  | StepsActiveGoal
  | StepsAccentedGoal
  | NotesActiveGoal
  | NotesPlacedGoal
  | PitchesVariedGoal
  | NotesAccentedGoal
  | NotesSlidGoal
  | BpmInRangeGoal
  | SwingInRangeGoal
  | ParamSweptGoal
  | ChordPlayedGoal
  | SourceLoadedGoal
  | PadAssignedGoal
  | RegionStartsWithinGoal
  | RegionShorterThanGoal
  | FitTargetSetGoal
  | PadTunedGoal
  | PadStepsPlacedGoal
) & {
  /**
   * Overrides the noun on this goal's progress chip ("Downbeats 3/4" rather
   * than "Kick 3/4"). Optional; validated non-empty when present.
   */
  label?: string
}

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

/** Sampler pad ids the active lesson spotlights, e.g. "pad:pad1" → "pad1". */
export function spotlitPadIds(lesson: Lesson | null): PadLaneId[] {
  return spotlitIds(lesson, 'pad:') as PadLaneId[]
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
/**
 * What the sampler looks like to a goal: the four pads and the bank behind
 * them. Both halves are needed — a pad names a source id, and only the bank
 * knows whether that source is one the app installed or one the learner did.
 */
export interface SamplerGoalContext {
  pads: SamplerSettings
  sources: readonly SampleSource[]
}

export interface GoalContext {
  pattern: Pattern
  /** Knob motion observed during playback; absent for a session that has moved nothing. */
  motion?: ParamMotion
  /** The transport tempo the document is set to. */
  bpm?: number
  /** The transport swing the document is set to, as the stored 0.50–0.75 fraction. */
  swing?: number
  /** Live keyboard playing observed this session. */
  chord?: ChordPlay
  /** The sampler's pads and the sources behind them. */
  sampler?: SamplerGoalContext
}

/**
 * How far one assertion is from being met, read against the live session.
 *
 * Every goal type answers in the same shape so a chip can show it and so
 * completion can be derived from it: a lesson is met when every assertion
 * reports `met`, which means progress and completion can never disagree.
 *
 * - `done` of `total`: wanted steps placed, a count capped at its minimum, a
 *   sweep's travel against `minTravel`. A goal that is only met or not reports
 *   1 or 0 of 1.
 * - `extra`: for exact-placement goals, steps that hold but were not wanted.
 *   A count, never a position — progress must not give away which steps.
 * - `current`: for range and value goals, the value the deck holds now, when
 *   it means something (absent with no chop, no fit, or no transport; a pad
 *   with no tune reads 0, its neutral).
 */
export interface AssertionProgress {
  met: boolean
  done: number
  total: number
  extra: number
  current?: number
}

/** Wanted steps that satisfy `holds`, and steps that do but were not wanted. */
function placementProgress<T>(
  steps: T[] | undefined,
  wanted: number[],
  holds: (step: T) => boolean,
): AssertionProgress {
  const set = new Set(wanted)
  let done = 0
  let extra = 0
  for (const [i, step] of (steps ?? []).entries()) {
    if (!holds(step)) continue
    if (set.has(i)) done += 1
    else extra += 1
  }
  // Exact match: every goal step on, every other step off — wrong or extra
  // steps must never falsely complete a lesson.
  return { met: done === wanted.length && extra === 0, done, total: wanted.length, extra }
}

/** A minimum-count goal: the count so far, capped at the minimum it asks for. */
function countProgress(count: number, min: number): AssertionProgress {
  return { met: count >= min, done: Math.min(count, min), total: min, extra: 0 }
}

/** A goal that is only met or not, with the value the deck holds now. */
function valueProgress(met: boolean, current: number | undefined): AssertionProgress {
  return { met, done: met ? 1 : 0, total: 1, extra: 0, current }
}

/** The programmed notes of one note lane, silent steps left out. */
function notesOf(pattern: Pattern, laneId: NoteLaneId): NoteStep[] {
  const lane = pattern.noteLanes?.find((l) => l.id === laneId)
  return lane ? lane.steps.filter((step) => step.on) : []
}

/** Slides in one note lane whose gate reaches a note, measured as the voice measures it. */
function connectedSlides(pattern: Pattern, laneId: NoteLaneId): number {
  const lane = pattern.noteLanes?.find((l) => l.id === laneId)
  if (!lane) return 0
  return lane.steps.filter((_, index) => slideReach(lane, index)?.into === 'note').length
}

/** True when a source's origin answers what the goal asked for. */
function matchesOrigin(origin: SampleOrigin, wanted: GoalOrigin): boolean {
  return wanted === 'user' ? origin !== 'shipped' : origin === wanted
}

/** One pad's settings, or nothing when the sampler is not in the context at all. */
function padOf(context: GoalContext, padId: PadLaneId): PadSettings | undefined {
  return context.sampler?.pads[padId]
}

/** A pad's chop and the source it was cut from, resolved together. */
function chopOf(
  context: GoalContext,
  padId: PadLaneId,
): { region: SampleRegion; source?: SampleSource } | undefined {
  const region = padOf(context, padId)?.region
  if (!region) return undefined
  return {
    region,
    source: context.sampler?.sources.find((candidate) => candidate.id === region.sourceId),
  }
}

/** Pads holding a chop, narrowed to a source origin when the goal names one. */
function assignedPads(context: GoalContext, origin?: GoalOrigin): number {
  return PAD_LANES.filter((pad) => {
    const chop = chopOf(context, pad.id)
    if (!chop) return false
    if (!origin) return true
    return chop.source !== undefined && matchesOrigin(chop.source.origin, origin)
  }).length
}

/** One assertion's progress against the live session. */
export function assertionProgress(goal: GoalAssertion, context: GoalContext): AssertionProgress {
  const { pattern } = context
  switch (goal.type) {
    case 'stepsActive':
      return placementProgress(
        pattern.lanes.find((l) => l.id === goal.lane)?.steps,
        goal.steps,
        (step) => step.on,
      )
    case 'stepsAccented':
      return placementProgress(
        pattern.lanes.find((l) => l.id === goal.lane)?.steps,
        goal.steps,
        (step) => step.on && step.accent,
      )
    case 'notesActive':
      return placementProgress(
        pattern.noteLanes?.find((l) => l.id === goal.lane)?.steps,
        goal.steps,
        (step) => step.on,
      )
    case 'notesPlaced':
      return countProgress(notesOf(pattern, goal.lane).length, goal.min)
    case 'pitchesVaried':
      // Pitch parked under a step that is switched off is not part of the line.
      return countProgress(
        new Set(notesOf(pattern, goal.lane).map((step) => step.pitch)).size,
        goal.min,
      )
    case 'notesAccented':
      // An accent parked on a step with no note is silent, so not part of the line.
      return countProgress(
        notesOf(pattern, goal.lane).filter((step) => step.accent).length,
        goal.min,
      )
    case 'notesSlid':
      return countProgress(connectedSlides(pattern, goal.lane), goal.min)
    case 'bpmInRange': {
      const { bpm } = context
      return valueProgress(bpm !== undefined && bpm >= goal.min && bpm <= goal.max, bpm)
    }
    case 'swingInRange': {
      const percent = context.swing === undefined ? undefined : wholeSwingPercent(context.swing)
      return valueProgress(
        percent !== undefined && percent >= goal.min && percent <= goal.max,
        percent,
      )
    }
    case 'paramSwept': {
      const travel = paramTravel(context.motion ?? NO_PARAM_MOTION, goal.param)
      return { met: travel >= goal.minTravel, done: travel, total: goal.minTravel, extra: 0 }
    }
    case 'chordPlayed':
      return countProgress((context.chord ?? NO_CHORD_PLAY).maxNotes, goal.minNotes)
    case 'sourceLoaded':
      return countProgress(
        (context.sampler?.sources ?? []).filter((source) =>
          matchesOrigin(source.origin, goal.origin),
        ).length,
        goal.min,
      )
    case 'padAssigned':
      return countProgress(assignedPads(context, goal.origin), goal.min)
    case 'regionStartsWithin': {
      const chop = chopOf(context, goal.pad)
      // The file matters as much as the window: the same offset in the
      // learner's own break is a different chop entirely.
      if (!chop || chop.region.sourceId !== goal.source) return valueProgress(false, undefined)
      const { start } = chop.region
      return valueProgress(start >= goal.from && start <= goal.to, start)
    }
    case 'regionShorterThan': {
      const duration = chopOf(context, goal.pad)?.region.duration
      return valueProgress(duration !== undefined && duration <= goal.seconds, duration)
    }
    case 'fitTargetSet': {
      const pad = padOf(context, goal.pad)
      // A fit target on a pad with nothing on it is not fitting anything.
      const fit = pad?.region && pad.fit !== null ? pad.fit : undefined
      return valueProgress(fit !== undefined && fit >= goal.minSteps, fit)
    }
    case 'padTuned': {
      const tune = padOf(context, goal.pad)?.tune ?? 0
      return valueProgress(Math.abs(tune) >= goal.minSemitones, tune)
    }
    case 'padStepsPlaced':
      return countProgress(
        pattern.padLanes.reduce(
          (placed, lane) => placed + lane.steps.filter((step) => step.on).length,
          0,
        ),
        goal.min,
      )
  }
}

/** True when every goal assertion of the lesson holds against the live session. */
export function isGoalMet(lesson: Lesson, context: GoalContext): boolean {
  return lesson.goal.every((goal) => assertionProgress(goal, context).met)
}

function fail(lessonId: string, message: string): never {
  throw new Error(`Invalid lesson${lessonId ? ` "${lessonId}"` : ''}: ${message}`)
}

const DRUM_LANE_IDS: string[] = KIT_LANES.map((lane) => lane.id)
const NOTE_LANE_IDS: string[] = NOTE_LANES.map((lane) => lane.id)
const FLAG_LANE_IDS: string[] = [...NOTE_FLAG_LANES]

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

/**
 * A note lane that shows the 303 flags. Every note lane carries them, but only
 * these have rows to set them and a voice that plays them — a flag goal on any
 * other lane is one the deck gives the learner no way to meet.
 */
function parseFlagLane(lane: unknown, lessonId: string, index: number): NoteLaneId {
  if (typeof lane !== 'string' || !FLAG_LANE_IDS.includes(lane)) {
    fail(
      lessonId,
      `goal[${index}] names lane "${String(lane)}"; only ${FLAG_LANE_IDS.join(', ')} shows accent and slide`,
    )
  }
  return lane as NoteLaneId
}

function parseNotesAccentedGoal(
  goal: Partial<NotesAccentedGoal>,
  lessonId: string,
  index: number,
): NotesAccentedGoal {
  return {
    type: 'notesAccented',
    lane: parseFlagLane(goal.lane, lessonId, index),
    min: parseCount(goal.min, 'min', 1, lessonId, index),
  }
}

function parseNotesSlidGoal(
  goal: Partial<NotesSlidGoal>,
  lessonId: string,
  index: number,
): NotesSlidGoal {
  return {
    type: 'notesSlid',
    lane: parseFlagLane(goal.lane, lessonId, index),
    min: parseCount(goal.min, 'min', 1, lessonId, index),
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

function parseSwingInRangeGoal(
  goal: Partial<SwingInRangeGoal>,
  lessonId: string,
  index: number,
): SwingInRangeGoal {
  const { min, max } = goal
  // Percent, the knob's own units: a range written as the stored fraction
  // (0.56) would sit below the knob and fail here rather than never complete.
  if (
    typeof min !== 'number' ||
    typeof max !== 'number' ||
    min < SWING_PARAM.min ||
    max > SWING_PARAM.max ||
    min > max
  ) {
    fail(
      lessonId,
      `goal[${index}] swing range must run min → max inside [${SWING_PARAM.min}, ${SWING_PARAM.max}] percent`,
    )
  }
  return { type: 'swingInRange', min, max }
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
  if (!isDeckParamId(goal.param)) {
    fail(
      lessonId,
      `goal[${index}] names param "${goal.param}"; the deck has ${[...DECK_PARAM_IDS].join(', ')}`,
    )
  }
  // Travel is a fraction of the knob's range, so anything outside (0, 1] is
  // either a no-op goal or one no amount of knob turning can ever satisfy.
  if (typeof goal.minTravel !== 'number' || !(goal.minTravel > 0 && goal.minTravel <= 1)) {
    fail(lessonId, `goal[${index}] minTravel must be a number in (0, 1]`)
  }
  return { type: 'paramSwept', param: goal.param, minTravel: goal.minTravel }
}

const PAD_LANE_IDS: string[] = PAD_LANES.map((pad) => pad.id)

/** A pad the sampler actually has. Four, fixed and closed. */
function parsePad(pad: unknown, lessonId: string, index: number): PadLaneId {
  if (typeof pad !== 'string' || !PAD_LANE_IDS.includes(pad)) {
    fail(
      lessonId,
      `goal[${index}] names pad "${String(pad)}"; the sampler has ${PAD_LANE_IDS.join(', ')}`,
    )
  }
  return pad as PadLaneId
}

const GOAL_ORIGINS: string[] = ['user', 'upload', 'recording']

/**
 * An origin a goal may ask for. "shipped" is refused rather than accepted and
 * ignored: a goal the pre-installed source satisfies on its own is a lesson
 * that opens already earned, and it must fail here rather than at runtime.
 */
function parseOrigin(origin: unknown, lessonId: string, index: number): GoalOrigin {
  if (typeof origin !== 'string' || !GOAL_ORIGINS.includes(origin)) {
    fail(
      lessonId,
      `goal[${index}] origin must be one of ${GOAL_ORIGINS.join(', ')} — a shipped source must never earn a lesson`,
    )
  }
  return origin as GoalOrigin
}

/** An integer count inside a ceiling the deck could actually reach. */
function parseBoundedCount(
  value: unknown,
  field: string,
  min: number,
  max: number,
  lessonId: string,
  index: number,
): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(lessonId, `goal[${index}] ${field} must be an integer in [${min}, ${max}]`)
  }
  return value as number
}

function parseSourceLoadedGoal(
  goal: Partial<SourceLoadedGoal>,
  lessonId: string,
  index: number,
): SourceLoadedGoal {
  return {
    type: 'sourceLoaded',
    origin: parseOrigin(goal.origin, lessonId, index),
    min: parseBoundedCount(goal.min, 'min', 1, MAX_GOAL_SOURCES, lessonId, index),
  }
}

function parsePadAssignedGoal(
  goal: Partial<PadAssignedGoal>,
  lessonId: string,
  index: number,
): PadAssignedGoal {
  return {
    type: 'padAssigned',
    min: parseBoundedCount(goal.min, 'min', 1, PAD_LANES.length, lessonId, index),
    ...(goal.origin === undefined
      ? {}
      : { origin: parseOrigin(goal.origin, lessonId, index) }),
  }
}

function parseRegionStartsWithinGoal(
  goal: Partial<RegionStartsWithinGoal>,
  lessonId: string,
  index: number,
): RegionStartsWithinGoal {
  const pad = parsePad(goal.pad, lessonId, index)
  // Only a shipped source has a duration knowable when the lesson is parsed, so
  // it is the only thing a window can be checked against — and checking is the
  // point: a window past the end of the file is a lesson nobody can finish.
  const source = typeof goal.source === 'string' ? shippedSource(goal.source) : undefined
  if (!source) {
    fail(
      lessonId,
      `goal[${index}] names source "${String(goal.source)}"; the app ships ${SHIPPED_SOURCES.map((s) => s.id).join(', ')}`,
    )
  }
  const { from, to } = goal
  if (
    typeof from !== 'number' ||
    typeof to !== 'number' ||
    !(from >= 0) ||
    !(to <= source.duration) ||
    from >= to
  ) {
    fail(
      lessonId,
      `goal[${index}] window must run from → to inside [0, ${source.duration}] of "${source.id}"`,
    )
  }
  return { type: 'regionStartsWithin', pad, source: source.id, from, to }
}

function parseRegionShorterThanGoal(
  goal: Partial<RegionShorterThanGoal>,
  lessonId: string,
  index: number,
): RegionShorterThanGoal {
  const pad = parsePad(goal.pad, lessonId, index)
  // A chop can never be longer than a slice, and a zero-length one is silence.
  if (
    typeof goal.seconds !== 'number' ||
    !(goal.seconds > 0 && goal.seconds <= MAX_SLICE_SECONDS)
  ) {
    fail(lessonId, `goal[${index}] seconds must be a number in (0, ${MAX_SLICE_SECONDS}]`)
  }
  return { type: 'regionShorterThan', pad, seconds: goal.seconds }
}

function parseFitTargetSetGoal(
  goal: Partial<FitTargetSetGoal>,
  lessonId: string,
  index: number,
): FitTargetSetGoal {
  return {
    type: 'fitTargetSet',
    pad: parsePad(goal.pad, lessonId, index),
    minSteps: parseBoundedCount(
      goal.minSteps,
      'minSteps',
      MIN_FIT_STEPS,
      MAX_FIT_STEPS,
      lessonId,
      index,
    ),
  }
}

function parsePadTunedGoal(
  goal: Partial<PadTunedGoal>,
  lessonId: string,
  index: number,
): PadTunedGoal {
  const pad = parsePad(goal.pad, lessonId, index)
  // Neutral is no goal at all, and further than the knob turns is unreachable.
  if (
    typeof goal.minSemitones !== 'number' ||
    !(goal.minSemitones > 0 && goal.minSemitones <= MAX_PAD_TUNE)
  ) {
    fail(lessonId, `goal[${index}] minSemitones must be a number in (0, ${MAX_PAD_TUNE}]`)
  }
  return { type: 'padTuned', pad, minSemitones: goal.minSemitones }
}

function parsePadStepsPlacedGoal(
  goal: Partial<PadStepsPlacedGoal>,
  lessonId: string,
  index: number,
): PadStepsPlacedGoal {
  return {
    type: 'padStepsPlaced',
    min: parseBoundedCount(
      goal.min,
      'min',
      1,
      STEP_COUNT * PAD_LANES.length,
      lessonId,
      index,
    ),
  }
}

/**
 * A goal's own fields plus its optional chip label. The label is copied only
 * when the JSON carries one, so a goal without it parses to exactly its fields.
 */
function parseGoal(raw: unknown, lessonId: string, index: number): GoalAssertion {
  const goal = raw as Partial<GoalAssertion> | null
  if (goal === null || typeof goal !== 'object') fail(lessonId, `goal[${index}] must be an object`)
  const parsed = parseGoalFields(goal, lessonId, index)
  if (goal.label === undefined) return parsed
  if (typeof goal.label !== 'string' || goal.label.trim() === '') {
    fail(lessonId, `goal[${index}] label must be a non-empty string when present`)
  }
  return { ...parsed, label: goal.label }
}

function parseGoalFields(
  goal: Partial<GoalAssertion>,
  lessonId: string,
  index: number,
): GoalAssertion {
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
    case 'notesAccented':
      return parseNotesAccentedGoal(goal, lessonId, index)
    case 'notesSlid':
      return parseNotesSlidGoal(goal, lessonId, index)
    case 'bpmInRange':
      return parseBpmInRangeGoal(goal, lessonId, index)
    case 'swingInRange':
      return parseSwingInRangeGoal(goal, lessonId, index)
    case 'paramSwept':
      return parseParamSweptGoal(goal, lessonId, index)
    case 'chordPlayed':
      return parseChordPlayedGoal(goal, lessonId, index)
    case 'sourceLoaded':
      return parseSourceLoadedGoal(goal, lessonId, index)
    case 'padAssigned':
      return parsePadAssignedGoal(goal, lessonId, index)
    case 'regionStartsWithin':
      return parseRegionStartsWithinGoal(goal, lessonId, index)
    case 'regionShorterThan':
      return parseRegionShorterThanGoal(goal, lessonId, index)
    case 'fitTargetSet':
      return parseFitTargetSetGoal(goal, lessonId, index)
    case 'padTuned':
      return parsePadTunedGoal(goal, lessonId, index)
    case 'padStepsPlaced':
      return parsePadStepsPlacedGoal(goal, lessonId, index)
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

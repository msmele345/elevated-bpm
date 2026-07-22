import { NO_PARAM_MOTION, paramTravel, type ParamMotion } from './paramMotion'
import { STEP_COUNT, type DrumLaneId, type Pattern } from './types'

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
 * Sound-design goal: the user moved a knob across at least `minTravel` of its
 * range (0..1) while the loop was running. Motion, not a final value — the
 * lesson is "hear what the filter does", and any single cutoff setting would
 * be a poor proxy for that.
 */
export interface ParamSweptGoal {
  type: 'paramSwept'
  param: string
  minTravel: number
}

export type GoalAssertion = StepsActiveGoal | ParamSweptGoal

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

/** Knob ids the active lesson spotlights, e.g. "knob:cutoff" → "cutoff". */
export function spotlitParamIds(lesson: Lesson | null): string[] {
  return spotlitIds(lesson, 'knob:')
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
}

function isStepsActiveMet(goal: StepsActiveGoal, pattern: Pattern): boolean {
  const lane = pattern.lanes.find((l) => l.id === goal.lane)
  if (!lane) return false
  const wanted = new Set(goal.steps)
  // Exact match: every goal step on, every other step off — wrong or extra
  // steps must never falsely complete a lesson.
  return lane.steps.every((step, i) => step.on === wanted.has(i))
}

function isAssertionMet(goal: GoalAssertion, context: GoalContext): boolean {
  switch (goal.type) {
    case 'stepsActive':
      return isStepsActiveMet(goal, context.pattern)
    case 'paramSwept':
      return paramTravel(context.motion ?? NO_PARAM_MOTION, goal.param) >= goal.minTravel
  }
}

/** True when every goal assertion of the lesson holds against the live session. */
export function isGoalMet(lesson: Lesson, context: GoalContext): boolean {
  return lesson.goal.every((goal) => isAssertionMet(goal, context))
}

function fail(lessonId: string, message: string): never {
  throw new Error(`Invalid lesson${lessonId ? ` "${lessonId}"` : ''}: ${message}`)
}

function parseStepsActiveGoal(
  goal: Partial<StepsActiveGoal>,
  lessonId: string,
  index: number,
): StepsActiveGoal {
  if (typeof goal.lane !== 'string') fail(lessonId, `goal[${index}] is missing a lane`)
  if (
    !Array.isArray(goal.steps) ||
    !goal.steps.every((s) => Number.isInteger(s) && s >= 0 && s < STEP_COUNT)
  ) {
    fail(lessonId, `goal[${index}] steps must be integers in [0, ${STEP_COUNT})`)
  }
  return { type: 'stepsActive', lane: goal.lane as DrumLaneId, steps: goal.steps }
}

function parseParamSweptGoal(
  goal: Partial<ParamSweptGoal>,
  lessonId: string,
  index: number,
): ParamSweptGoal {
  if (typeof goal.param !== 'string' || goal.param === '') {
    fail(lessonId, `goal[${index}] is missing a param`)
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
    case 'paramSwept':
      return parseParamSweptGoal(goal, lessonId, index)
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

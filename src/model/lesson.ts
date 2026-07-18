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

export type GoalAssertion = StepsActiveGoal

export interface Lesson {
  id: string
  title: string
  intro: string
  spotlight: SpotlightTarget[]
  goal: GoalAssertion[]
}

/** Lane ids the active lesson spotlights; empty when no lesson is active. */
export function spotlitLaneIds(lesson: Lesson | null): DrumLaneId[] {
  if (!lesson) return []
  return lesson.spotlight
    .filter((target) => target.startsWith('lane:'))
    .map((target) => target.slice('lane:'.length) as DrumLaneId)
}

function isAssertionMet(goal: GoalAssertion, pattern: Pattern): boolean {
  const lane = pattern.lanes.find((l) => l.id === goal.lane)
  if (!lane) return false
  const wanted = new Set(goal.steps)
  // Exact match: every goal step on, every other step off — wrong or extra
  // steps must never falsely complete a lesson.
  return lane.steps.every((step, i) => step.on === wanted.has(i))
}

/** True when every goal assertion of the lesson holds against the live pattern. */
export function isGoalMet(lesson: Lesson, pattern: Pattern): boolean {
  return lesson.goal.every((goal) => isAssertionMet(goal, pattern))
}

function fail(lessonId: string, message: string): never {
  throw new Error(`Invalid lesson${lessonId ? ` "${lessonId}"` : ''}: ${message}`)
}

function parseGoal(raw: unknown, lessonId: string, index: number): GoalAssertion {
  const goal = raw as Partial<StepsActiveGoal> | null
  if (goal === null || typeof goal !== 'object') fail(lessonId, `goal[${index}] must be an object`)
  if (goal.type !== 'stepsActive') {
    fail(lessonId, `goal[${index}] has unknown type "${String(goal.type)}"`)
  }
  if (typeof goal.lane !== 'string') fail(lessonId, `goal[${index}] is missing a lane`)
  if (
    !Array.isArray(goal.steps) ||
    !goal.steps.every((s) => Number.isInteger(s) && s >= 0 && s < STEP_COUNT)
  ) {
    fail(lessonId, `goal[${index}] steps must be integers in [0, ${STEP_COUNT})`)
  }
  return { type: 'stepsActive', lane: goal.lane as DrumLaneId, steps: goal.steps }
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

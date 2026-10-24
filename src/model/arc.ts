import { NO_CHORD_PLAY, type ChordPlay } from './chordPlay'
import { isGoalMet, type GoalContext, type Lesson } from './lesson'
import { NO_PARAM_MOTION, type ParamMotion } from './paramMotion'
import { activePattern, type LessonProgress, type ProjectState } from './projectState'

/**
 * An Arc is an ordered list of lessons (see plans/elevated-bpm-v1.md). These
 * are the pure rules for moving along one: which lesson the deck is showing,
 * where the user is on the path, and what is left to earn.
 *
 * Navigation never touches the sandbox — an arc function reads progress and
 * returns a lesson, and nothing here can edit a pattern or a knob.
 */

export type LessonProgressMap = Record<string, LessonProgress>

/**
 * What the user has *done* this session, as opposed to what the document
 * holds. Knob motion and live playing are claims about the session and are
 * never persisted, so they arrive alongside the document rather than in it.
 */
export interface SessionObservations {
  motion?: ParamMotion
  chord?: ChordPlay
}

/**
 * Everything a goal is evaluated against, assembled in one place.
 *
 * There is one builder because there are several callers — the live deck, an
 * arriving shared link, an opened bundle — and a caller that forgot to pass
 * part of the document would not fail loudly: it would quietly make some
 * assertions unmeetable and, worse, make an arriving beat look unbuilt and so
 * earn its recipient lessons they never did.
 */
export function goalContextFor(
  state: ProjectState,
  session: SessionObservations = {},
): GoalContext {
  return {
    pattern: activePattern(state),
    bpm: state.transport.bpm,
    swing: state.transport.swing,
    motion: session.motion ?? NO_PARAM_MOTION,
    chord: session.chord ?? NO_CHORD_PLAY,
    sampler: { pads: state.instrumentSettings.sampler, sources: state.sources },
  }
}

/**
 * Every slot of an arriving bank that already satisfies each lesson, by
 * lesson id. A lesson met in no slot is absent.
 *
 * Inheritance is held per slot rather than per lesson: the work that arrived
 * is the sender's *in the slots it arrived in*. Selecting another slot and
 * coming back is not taking that work apart, so the shared slot stays held
 * until its own goal stops being met — while a lesson the learner builds in a
 * slot of their own is theirs, and earns credit at once.
 */
export function slotsAlreadyMeeting(
  lessons: Lesson[],
  state: ProjectState,
): Map<string, Set<string>> {
  const meeting = new Map<string, Set<string>>()
  for (const slot of state.patterns) {
    const context = goalContextFor({ ...state, activePatternId: slot.id })
    for (const lessonId of lessonsAlreadyMet(lessons, context)) {
      meeting.set(lessonId, (meeting.get(lessonId) ?? new Set()).add(slot.id))
    }
  }
  return meeting
}

/**
 * What is held back after the selected slot is copied onto another. A copy of
 * a held slot is still the sender's work, so the target is held wherever the
 * source was — otherwise copying a shared slot onto an empty one would launder
 * credit. A target overwritten by a slot that was not held now holds nothing
 * of the sender's, so it is released. Never edits `held` in place.
 */
export function heldAfterCopy(
  held: ReadonlyMap<string, ReadonlySet<string>>,
  sourceId: string,
  targetId: string,
): Map<string, Set<string>> {
  const after = new Map<string, Set<string>>()
  for (const [lessonId, slots] of held) {
    const next = new Set(slots)
    if (slots.has(sourceId)) next.add(targetId)
    else next.delete(targetId)
    if (next.size > 0) after.set(lessonId, next)
  }
  return after
}

/** One rung of the path as the arc UI renders it. */
export interface ArcEntry {
  lesson: Lesson
  /** 1-based place in the arc, the number the user sees. */
  position: number
  completed: boolean
  current: boolean
}

function isCompleted(progress: LessonProgressMap, lessonId: string): boolean {
  return progress[lessonId]?.completed ?? false
}

/**
 * The lesson the deck is on. An explicit selection wins — the user may step
 * anywhere on the path, forwards to look ahead or back to redo earned work.
 * Left to itself the arc follows its own order to the first lesson not yet
 * finished with, resting on the last one when there is nothing left.
 *
 * "Finished with" means earned *and* put away: a lesson whose goal has just
 * been met stays on screen until the user dismisses it, so the next lesson
 * never appears over the top of a celebration.
 */
export function activeArcLesson(
  arc: Lesson[],
  progress: LessonProgressMap,
  selectedId: string | null,
): Lesson {
  const selected = arc.find((lesson) => lesson.id === selectedId)
  if (selected) return selected
  const unfinished = arc.find((lesson) => {
    const earned = progress[lesson.id]
    return !(earned?.completed && earned.dismissed)
  })
  return unfinished ?? arc[arc.length - 1]
}

/**
 * Where the path goes after `afterId`: the next unearned lesson, wrapping back
 * to work left behind by a user who jumped ahead. Null once the arc is done.
 */
export function nextUnfinishedLessonId(
  arc: Lesson[],
  progress: LessonProgressMap,
  afterId: string,
): string | null {
  const from = arc.findIndex((lesson) => lesson.id === afterId)
  const ordered = [...arc.slice(from + 1), ...arc.slice(0, Math.max(from, 0))]
  return ordered.find((lesson) => !isCompleted(progress, lesson.id))?.id ?? null
}

/** How much of the arc is earned — the number the progress meter reports. */
export function arcCompletion(
  arc: Lesson[],
  progress: LessonProgressMap,
): { completed: number; total: number } {
  return {
    completed: arc.filter((lesson) => isCompleted(progress, lesson.id)).length,
    total: arc.length,
  }
}

/** The whole path in order, ready to render. */
export function arcEntries(
  arc: Lesson[],
  progress: LessonProgressMap,
  activeId: string,
): ArcEntry[] {
  return arc.map((lesson, i) => ({
    lesson,
    position: i + 1,
    completed: isCompleted(progress, lesson.id),
    current: lesson.id === activeId,
  }))
}

/** True when `lessonId` names the capstone at the end of this data-defined arc. */
export function isFinalArcLesson(arc: Lesson[], lessonId: string): boolean {
  return arc.length > 0 && arc[arc.length - 1].id === lessonId
}

/**
 * The lessons a beat already satisfies the moment it lands on the deck.
 *
 * A goal is a claim about work the user did, so a beat that arrives already
 * containing that work — an incoming shared beat — must not earn credit for
 * it. The caller holds this set as a session observation and stops inheriting
 * a lesson as soon as its goal stops being met, so a recipient who takes the
 * beat apart and builds it back up earns it honestly.
 */
export function lessonsAlreadyMet(arc: Lesson[], context: GoalContext): Set<string> {
  return new Set(
    arc.filter((lesson) => isGoalMet(lesson, context)).map((lesson) => lesson.id),
  )
}

export interface LessonCompletionDetection {
  justCompleted: boolean
  showFinale: boolean
}

/**
 * The user-edit transition consumed by App: recognize a newly met goal once,
 * and distinguish the data-defined capstone without replaying it for persisted
 * or revisited completion.
 */
export function detectLessonCompletion(
  arc: Lesson[],
  lesson: Lesson,
  alreadyCompleted: boolean,
  context: GoalContext,
): LessonCompletionDetection {
  if (alreadyCompleted || !isGoalMet(lesson, context)) {
    return { justCompleted: false, showFinale: false }
  }
  return {
    justCompleted: true,
    showFinale: isFinalArcLesson(arc, lesson.id),
  }
}

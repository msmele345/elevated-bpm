import { deckParamSpec } from './deckParams'
import {
  assertionProgress,
  type AssertionProgress,
  type GoalAssertion,
  type GoalContext,
  type GoalOrigin,
  type Lesson,
} from './lesson'
import { NOTE_LANES } from './note'
import { KIT_LANES } from './pattern'
import { MAX_FIT_STEPS, PAD_LANES } from './sampler'
import type { DrumLaneId, NoteLaneId, PadLaneId } from './types'

/**
 * A Progress chip: one goal assertion's progress as the lesson card shows it,
 * e.g. "Kick 3/4 · 1 extra" or "Tempo 130 → 138–145". The text is generated
 * from the goal type and the lane's or knob's display label, so every lesson
 * gets chips without a word of JSON; a goal's `label` overrides the noun.
 *
 * A chip tells the learner how close they are, never which steps are wrong:
 * placement goals report counts, not positions.
 */
export interface ProgressChip {
  text: string
  met: boolean
}

function drumLabel(id: DrumLaneId): string {
  return KIT_LANES.find((lane) => lane.id === id)!.label
}

function noteLabel(id: NoteLaneId): string {
  return NOTE_LANES.find((lane) => lane.id === id)!.label
}

function padLabel(id: PadLaneId): string {
  return PAD_LANES.find((pad) => pad.id === id)!.label
}

const SOURCE_NOUNS: Record<GoalOrigin, string> = {
  user: 'Your sounds',
  upload: 'Uploads',
  recording: 'Recordings',
}

const CHOP_NOUNS: Record<GoalOrigin, string> = {
  user: 'Your chops',
  upload: 'Chops from uploads',
  recording: 'Chops from recordings',
}

/** What the chip is about, before any number: the lane, the knob, the pad. */
function generatedNoun(goal: GoalAssertion): string {
  switch (goal.type) {
    case 'stepsActive':
      return drumLabel(goal.lane)
    case 'stepsAccented':
      return `${drumLabel(goal.lane)} accents`
    case 'notesActive':
      return noteLabel(goal.lane)
    case 'notesPlaced':
      return `${noteLabel(goal.lane)} notes`
    case 'pitchesVaried':
      return `${noteLabel(goal.lane)} pitches`
    case 'bpmInRange':
      return 'Tempo'
    case 'swingInRange':
      return 'Swing'
    case 'paramSwept':
      return `${deckParamSpec(goal.param).label} sweep`
    case 'chordPlayed':
      return 'Chord'
    case 'sourceLoaded':
      return SOURCE_NOUNS[goal.origin]
    case 'padAssigned':
      return goal.origin ? CHOP_NOUNS[goal.origin] : 'Pads chopped'
    case 'padStepsPlaced':
      return 'Pad steps'
    case 'regionStartsWithin':
      return `${padLabel(goal.pad)} start`
    case 'regionShorterThan':
      return `${padLabel(goal.pad)} length`
    case 'fitTargetSet':
      return `${padLabel(goal.pad)} fit`
    case 'padTuned':
      return `${padLabel(goal.pad)} tune`
  }
}

/** Seconds as the region editor reads them; a dash when there is no chop. */
function seconds(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(2)} s`
}

/**
 * A tempo as the goal judges it. A whole BPM reads whole; a fractional one (a
 * hand-edited document, say) keeps a decimal, so 137.6 never reads as an
 * in-range 138 while the goal is still unmet.
 */
function tempo(bpm: number): string {
  return Number.isInteger(bpm) ? `${bpm}` : bpm.toFixed(1)
}

/** Semitones signed the way a tune knob reads, with a true minus sign. */
function signed(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return '0'
}

/** The progress after the noun. */
function reading(goal: GoalAssertion, progress: AssertionProgress): string {
  const { done, total, extra, current } = progress
  switch (goal.type) {
    case 'stepsActive':
    case 'stepsAccented':
    case 'notesActive':
      return extra > 0 ? `${done}/${total} · ${extra} extra` : `${done}/${total}`
    case 'notesPlaced':
    case 'pitchesVaried':
    case 'chordPlayed':
    case 'sourceLoaded':
    case 'padAssigned':
    case 'padStepsPlaced':
      return `${done}/${total}`
    case 'paramSwept':
      // Floored, so a sweep a hair short never reads as full.
      return `${progress.met ? 100 : Math.floor((done / total) * 100)}%`
    case 'bpmInRange':
      return `${current === undefined ? '—' : tempo(current)} → ${goal.min}–${goal.max}`
    case 'swingInRange':
      return `${current === undefined ? '—' : `${current}%`} → ${goal.min}–${goal.max}%`
    case 'regionStartsWithin':
      // The window itself is the answer, so only where the chop starts now.
      return seconds(current)
    case 'regionShorterThan':
      return `${seconds(current)} → ≤${goal.seconds.toFixed(2)} s`
    case 'fitTargetSet': {
      const target = goal.minSteps < MAX_FIT_STEPS ? `${goal.minSteps}+` : `${goal.minSteps}`
      return `${current === undefined ? 'off' : current} → ${target} steps`
    }
    case 'padTuned':
      return `${signed(current ?? 0)} → ±${goal.minSemitones} st`
  }
}

/** One assertion's chip against the live session. */
export function progressChip(goal: GoalAssertion, context: GoalContext): ProgressChip {
  const progress = assertionProgress(goal, context)
  return {
    text: `${goal.label ?? generatedNoun(goal)} ${reading(goal, progress)}`,
    met: progress.met,
  }
}

/** Every chip of a lesson, in goal order. */
export function progressChips(lesson: Lesson, context: GoalContext): ProgressChip[] {
  return lesson.goal.map((goal) => progressChip(goal, context))
}

/** True when two chip rows show exactly the same thing. */
export function sameChips(a: readonly ProgressChip[], b: readonly ProgressChip[]): boolean {
  return a.length === b.length && a.every((chip, i) => chip.text === b[i].text && chip.met === b[i].met)
}

/**
 * The chips that have just become met — what the live region may announce.
 * Count changes are never announced. With no baseline, or one from a
 * different lesson (a different number of goals), nothing is new: arriving
 * somewhere is not the learner finishing something.
 */
export function chipsNewlyMet(
  previous: readonly ProgressChip[] | null,
  next: readonly ProgressChip[],
): ProgressChip[] {
  if (!previous || previous.length !== next.length) return []
  return next.filter((chip, i) => chip.met && !previous[i].met)
}

/** What the live region says for chips just met: "Kick 4/4 done". */
export function chipMetAnnouncement(chips: readonly ProgressChip[]): string {
  return chips.map((chip) => `${chip.text} done`).join('. ')
}

/** What the live region says, instead of any chip, when the lesson completes. */
export function lessonCompleteAnnouncement(lesson: Lesson): string {
  return `Lesson complete: ${lesson.title}`
}

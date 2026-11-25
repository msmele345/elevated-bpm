import { memo, useState } from 'react'
import type { Lesson } from '../model/lesson'
import type { ProgressChip } from '../model/progressChip'

/**
 * How long a just-earned lesson holds its full celebration card before it
 * shrinks to the completed strip and gives the Deck its room back.
 */
export const CELEBRATION_MS = 2400

interface LessonPanelProps {
  lesson: Lesson
  /** 1-based place on the arc, and how long the arc is. */
  position: number
  total: number
  completed: boolean
  /** True while a lesson the learner just earned is being celebrated. */
  celebrating: boolean
  /** The lesson Next ▸ moves on to, or null when the track has nothing left to earn. */
  nextTitle: string | null
  /** One Progress chip per goal assertion, in goal order; shown only while unearned. */
  chips: readonly ProgressChip[]
  /** Whether the lesson has a spotlit control on the deck for "Show me" to find. */
  canShowMe: boolean
  onDismiss: () => void
  /** Put the earned lesson away and move the path on — the only way it moves. */
  onNext: () => void
  onShowMe: () => void
}

/**
 * The lesson card: shows where the user is on the arc plus the active lesson's
 * title and intro text, flips into a celebration once the goal is
 * auto-detected, and can be dismissed at any time (the sandbox is never gated).
 *
 * Once the celebration is over an earned lesson shrinks to a slim strip — ✓,
 * Next ▸ and a way to reopen its text — so the Deck comes back on screen. An
 * earned card shows no chips: it says it is done. The
 * path still waits for Next ▸, so a celebration is never cut short. Whether the
 * strip is reopened is the card's own business: the card is keyed by lesson,
 * so walking onto another lesson starts it folded again, and nothing is saved.
 *
 * Its chips say how close each assertion is. Announcing them is the deck's
 * one lesson live region's job, not the card's: the card can be dismissed,
 * and a region that mounts with its message is a region that is never heard.
 */
function Lessons({
  lesson,
  position,
  total,
  completed,
  celebrating,
  nextTitle,
  chips,
  canShowMe,
  onDismiss,
  onNext,
  onShowMe,
}: LessonPanelProps) {
  const [reopened, setReopened] = useState(false)
  const view: 'working' | 'celebrating' | 'reopened' | 'strip' = !completed
    ? 'working'
    : celebrating
      ? 'celebrating'
      : reopened
        ? 'reopened'
        : 'strip'

  const next = (
    <button type="button" className="lesson-next" onClick={onNext}>
      {nextTitle ? (
        <>
          Next: {nextTitle} <span aria-hidden="true">▸</span>
        </>
      ) : (
        'Done'
      )}
    </button>
  )

  if (view === 'strip') {
    return (
      <aside className="lesson-panel is-complete is-strip" aria-label="Lesson">
        <span className="lesson-check" aria-hidden="true">
          ✓
        </span>
        <span className="lesson-tag">Lesson complete</span>
        <h2 className="lesson-title">{lesson.title}</h2>
        <div className="lesson-actions">
          <button
            type="button"
            className="lesson-link"
            onClick={() => setReopened(true)}
            aria-expanded={false}
            aria-label="Reopen lesson"
          >
            Reopen
          </button>
          {next}
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={
        view === 'working'
          ? 'lesson-panel'
          : view === 'reopened'
            ? 'lesson-panel is-complete is-reopened'
            : 'lesson-panel is-complete'
      }
      aria-label="Lesson"
    >
      <div className="lesson-head">
        <span className="lesson-tag">
          {completed ? 'Lesson complete' : `Lesson ${position} of ${total}`}
        </span>
        {view === 'working' ? (
          <button
            type="button"
            className="lesson-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss lesson"
          >
            ✕
          </button>
        ) : (
          <div className="lesson-actions">
            {view === 'reopened' && (
              <button
                type="button"
                className="lesson-link"
                onClick={() => setReopened(false)}
                aria-expanded={true}
                aria-label="Collapse lesson"
              >
                Collapse
              </button>
            )}
            {next}
          </div>
        )}
      </div>
      <h2 className="lesson-title">
        {lesson.title}
        {completed && (
          <span className="lesson-check" aria-hidden="true">
            ✓
          </span>
        )}
      </h2>
      {view === 'celebrating' ? (
        <p className="lesson-celebration">
          Locked in — goal complete. Keep it running and make it yours.
        </p>
      ) : (
        <p className="lesson-intro">
          {lesson.intro}
          {canShowMe && view === 'working' && (
            <>
              {' '}
              <button type="button" className="lesson-link lesson-show-me" onClick={onShowMe}>
                Show me
              </button>
            </>
          )}
        </p>
      )}
      {/* An earned lesson says it is done; its chips step aside. */}
      {view === 'working' && (
        <ul className="lesson-chips" aria-label="Goal progress">
          {chips.map((chip, i) => (
            <li key={i} className={chip.met ? 'lesson-chip is-met' : 'lesson-chip'}>
              {chip.met && (
                <span className="lesson-chip-check" aria-hidden="true">
                  ✓
                </span>
              )}
              {chip.text}
              {chip.met && <span className="visually-hidden">, done</span>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

export const LessonPanel = memo(Lessons)

import { memo } from 'react'
import type { Lesson } from '../model/lesson'
import type { ProgressChip } from '../model/progressChip'

interface LessonPanelProps {
  lesson: Lesson
  /** 1-based place on the arc, and how long the arc is. */
  position: number
  total: number
  completed: boolean
  /** One Progress chip per goal assertion, in goal order. */
  chips: readonly ProgressChip[]
  onDismiss: () => void
}

/**
 * The lesson panel: shows where the user is on the arc plus the active
 * lesson's title and intro text, flips into a celebration once the goal is
 * auto-detected, and can be dismissed at any time (the sandbox is never gated).
 *
 * Its chips say how close each assertion is. Announcing them is the deck's
 * one lesson live region's job, not the card's: the card can be dismissed,
 * and a region that mounts with its message is a region that is never heard.
 */
function Lessons({ lesson, position, total, completed, chips, onDismiss }: LessonPanelProps) {
  return (
    <aside className={completed ? 'lesson-panel is-complete' : 'lesson-panel'} aria-label="Lesson">
      <div className="lesson-head">
        <span className="lesson-tag">
          {completed ? 'Lesson complete' : `Lesson ${position} of ${total}`}
        </span>
        <button
          type="button"
          className="lesson-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss lesson"
        >
          ✕
        </button>
      </div>
      <h2 className="lesson-title">
        {lesson.title}
        {completed && (
          <span className="lesson-check" aria-hidden="true">
            ✓
          </span>
        )}
      </h2>
      {completed ? (
        <p className="lesson-celebration">
          Locked in — goal complete. Keep it running and make it yours.
        </p>
      ) : (
        <p className="lesson-intro">{lesson.intro}</p>
      )}
      <ul className="lesson-chips" aria-label="Goal progress">
        {chips.map((chip, i) => {
          // Completion is latched, so an earned card reads as a finished
          // checklist even after the beat has moved on.
          const met = completed || chip.met
          return (
            <li key={i} className={met ? 'lesson-chip is-met' : 'lesson-chip'}>
              {met && (
                <span className="lesson-chip-check" aria-hidden="true">
                  ✓
                </span>
              )}
              {chip.text}
              {met && <span className="visually-hidden">, done</span>}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

export const LessonPanel = memo(Lessons)

import type { Lesson } from '../model/lesson'

interface LessonPanelProps {
  lesson: Lesson
  completed: boolean
  onDismiss: () => void
}

/**
 * The lesson tracer panel: shows the active lesson's title and intro text,
 * flips into a celebration once the goal is auto-detected, and can be
 * dismissed at any time (the sandbox is never gated).
 */
export function LessonPanel({ lesson, completed, onDismiss }: LessonPanelProps) {
  return (
    <aside className={completed ? 'lesson-panel is-complete' : 'lesson-panel'} aria-label="Lesson">
      <div className="lesson-head">
        <span className="lesson-tag">{completed ? 'Lesson complete' : 'Lesson'}</span>
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
        <p className="lesson-celebration" role="status">
          Locked in — goal complete. Keep it running and make it yours.
        </p>
      ) : (
        <p className="lesson-intro">{lesson.intro}</p>
      )}
    </aside>
  )
}

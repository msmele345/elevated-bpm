import { memo } from 'react'
import type { ArcEntry } from '../model/arc'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'

interface LessonArcProps {
  entries: ArcEntry[]
  completed: number
  total: number
  onSelect: (lessonId: string) => void
}

/**
 * The curriculum arc as a path across the panel: one numbered pad per lesson,
 * lit when earned, ringed where the user is standing. Every lesson is
 * enterable — the arc shows the way through but never gates the deck — and
 * selecting one only moves the marker, so the sandbox is untouched by
 * navigation.
 */
function CurriculumArc({ entries, completed, total, onSelect }: LessonArcProps) {
  const current = entries.find((entry) => entry.current)
  return (
    <nav
      className="arc"
      id={DECK_SECTION_IDS.curriculum}
      tabIndex={-1}
      aria-labelledby={sectionTitleId(DECK_SECTION_IDS.curriculum)}
    >
      <div className="arc-head">
        <h2 className="arc-tag" id={sectionTitleId(DECK_SECTION_IDS.curriculum)}>
          Curriculum
        </h2>
        <span className="arc-count">
          <span className="arc-count-done">{completed}</span> / {total} complete
        </span>
      </div>
      <div
        className="arc-meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-label="Lessons complete"
      >
        <span className="arc-meter-fill" style={{ width: `${(completed / total) * 100}%` }} />
      </div>
      <ol className="arc-path">
        {entries.map((entry) => (
          <li key={entry.lesson.id}>
            <button
              type="button"
              className="arc-stop"
              data-complete={entry.completed || undefined}
              data-current={entry.current || undefined}
              aria-current={entry.current ? 'step' : undefined}
              aria-label={`Lesson ${entry.position}: ${entry.lesson.title}${
                entry.completed ? ' — complete' : ''
              }`}
              title={`${entry.position}. ${entry.lesson.title}`}
              onClick={() => onSelect(entry.lesson.id)}
            >
              <span className="arc-stop-led" aria-hidden="true" />
              <span className="arc-stop-number" aria-hidden="true">
                {entry.position}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {current && (
        <p className="arc-here">
          <span className="arc-here-position">{current.position}</span>
          {current.lesson.title}
        </p>
      )}
    </nav>
  )
}

export const LessonArc = memo(CurriculumArc)

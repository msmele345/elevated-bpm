import type { Lesson } from '../model/lesson'

interface LessonPanelProps {
  lesson: Lesson
}

/**
 * The lesson tracer panel: shows the active lesson's title and intro text.
 * Goal progress and completion celebration arrive with the later Phase 2 ACs.
 */
export function LessonPanel({ lesson }: LessonPanelProps) {
  return (
    <aside className="lesson-panel" aria-label="Lesson">
      <span className="lesson-tag">Lesson</span>
      <h2 className="lesson-title">{lesson.title}</h2>
      <p className="lesson-intro">{lesson.intro}</p>
    </aside>
  )
}

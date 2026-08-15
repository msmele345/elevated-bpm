import { memo } from 'react'
import type { ArcEntry } from '../model/arc'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'

/** One track on the selector, with how far along it the user is. */
export interface ArcTrack {
  id: string
  title: string
  blurb: string
  completed: number
  total: number
}

interface LessonArcProps {
  tracks: ArcTrack[]
  activeArcId: string
  entries: ArcEntry[]
  completed: number
  total: number
  onSelectArc: (arcId: string) => void
  onSelect: (lessonId: string) => void
}

const TRACKS_LABEL_ID = 'deck-curriculum-tracks'

/**
 * The curriculum as a track selector over a path: one numbered pad per lesson
 * of the chosen track, lit when earned, ringed where the user is standing.
 *
 * Every lesson is enterable and every track is switchable — the arc shows the
 * way through but never gates the deck — and both selections only move a
 * marker, so the sandbox is untouched by navigation. Each track carries its own
 * progress here because that is the question the selector answers: not just
 * what is available, but where the user is on each of them.
 */
function CurriculumArc({
  tracks,
  activeArcId,
  entries,
  completed,
  total,
  onSelectArc,
  onSelect,
}: LessonArcProps) {
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
      <div className="arc-tracks" role="group" aria-labelledby={TRACKS_LABEL_ID}>
        <span className="visually-hidden" id={TRACKS_LABEL_ID}>
          Curriculum tracks
        </span>
        {tracks.map((track) => (
          <button
            key={track.id}
            type="button"
            className="arc-track"
            data-current={track.id === activeArcId || undefined}
            aria-pressed={track.id === activeArcId}
            aria-label={`${track.title} track — ${track.completed} of ${track.total} complete. ${track.blurb}`}
            onClick={() => onSelectArc(track.id)}
          >
            <span className="arc-track-name">{track.title}</span>
            <span className="arc-track-count" aria-hidden="true">
              {track.completed}/{track.total}
            </span>
          </button>
        ))}
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

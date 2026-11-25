import { memo, useId, useState } from 'react'
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
 * The curriculum line: a track selector, how far along the chosen track the
 * user is, and the lesson they are standing on — all in one line, so the
 * curriculum informs without pushing the instrument down the screen. "Path ▸"
 * unfolds the numbered path: one pad per lesson, lit when earned, ringed where
 * the user is standing.
 *
 * Every lesson is enterable and every track is switchable — the arc shows the
 * way through but never gates the deck — and both selections only move a
 * marker, so the sandbox is untouched by navigation. Each track carries its own
 * progress here because that is the question the selector answers: not just
 * what is available, but where the user is on each of them.
 *
 * Whether the path is unfolded is this session's business only: it lives in
 * component state and is never written to `prefs`.
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
  const [pathShown, setPathShown] = useState(false)
  const pathId = useId()
  return (
    <nav
      className="arc"
      id={DECK_SECTION_IDS.curriculum}
      tabIndex={-1}
      aria-labelledby={sectionTitleId(DECK_SECTION_IDS.curriculum)}
    >
      <div className="arc-line">
        <h2 className="arc-tag" id={sectionTitleId(DECK_SECTION_IDS.curriculum)}>
          Curriculum
        </h2>
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
        <div className="arc-progress">
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
          <span className="arc-count" aria-hidden="true">
            <span className="arc-count-done">{completed}</span>/{total}
          </span>
        </div>
        {current && (
          <p className="arc-here">
            <span className="arc-here-position">{current.position}</span>
            <span className="arc-here-title">{current.lesson.title}</span>
          </p>
        )}
        <button
          type="button"
          className="arc-path-toggle"
          aria-expanded={pathShown}
          aria-controls={pathShown ? pathId : undefined}
          onClick={() => setPathShown((shown) => !shown)}
        >
          Path
          <span className="arc-path-toggle-caret" aria-hidden="true">
            {pathShown ? '▾' : '▸'}
          </span>
        </button>
      </div>
      {pathShown && (
        <ol className="arc-path" id={pathId}>
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
      )}
    </nav>
  )
}

export const LessonArc = memo(CurriculumArc)

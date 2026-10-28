import { memo } from 'react'
import type { NoteFlag, NoteLane, NoteLaneId } from '../model/types'

interface NoteFlagRowProps {
  lane: NoteLane
  flag: NoteFlag
  /** The row's printed name, e.g. "Accent". */
  label: string
  spotlit?: boolean
  /** Named, like the note lane's own callbacks, so the deck can hand one handler down. */
  onToggle: (laneId: NoteLaneId, stepIndex: number) => void
}

/**
 * A thin row of 16 toggles under a note lane, one 303 flag per step. It is a
 * `.step-row` with a `.step-grid` like the lane above it, so the steps share
 * the lane's tracks and step n sits under note n on desktop and on a phone.
 *
 * A flag is kept on a step with no note, so a toggle says so in its name
 * rather than refusing: placing the note later brings the flag into play.
 * Ordinary buttons with `aria-pressed`, so a whole line can be set from the
 * keyboard.
 */
function NoteFlagSteps({ lane, flag, label, spotlit = false, onToggle }: NoteFlagRowProps) {
  const name = `${lane.label} ${label.toLowerCase()}`
  return (
    <div
      className={['step-row', 'flag-row', spotlit && 'is-spotlit'].filter(Boolean).join(' ')}
      data-flag={flag}
    >
      <div className="lane-label flag-label">{label}</div>
      <div className="step-grid" role="group" aria-label={`${name} steps`}>
        {lane.steps.map((step, i) => {
          const set = step[flag]
          return (
            <button
              key={i}
              type="button"
              className="step flag-step"
              data-quad={Math.floor(i / 4)}
              data-no-note={step.on ? undefined : ''}
              aria-pressed={set}
              aria-label={`${name}, step ${i + 1}, ${set ? (step.on ? 'on' : 'on (no note)') : 'off'}`}
              onClick={() => onToggle(lane.id, i)}
            >
              <span className="step-led" aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const NoteFlagRow = memo(NoteFlagSteps)

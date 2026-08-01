import { memo, type KeyboardEvent } from 'react'
import { midiToNoteName } from '../model/note'
import type { NoteLane, NoteLaneId } from '../model/types'

interface NoteRowProps {
  lane: NoteLane
  /** Named callbacks, for the same reason as the drum lane's — see StepRow. */
  onToggleStep: (laneId: NoteLaneId, stepIndex: number) => void
  onTranspose: (laneId: NoteLaneId, stepIndex: number, semitones: number) => void
  onResize: (laneId: NoteLaneId, stepIndex: number, steps: number) => void
  spotlit?: boolean
}

const OCTAVE = 12

/**
 * A melodic note lane: 16 steps that carry a pitch and a length instead of an
 * accent. A click arms the note; the arrow keys shape it in place — up/down
 * transposes (shift for whole octaves), left/right sets how many 16ths it
 * rings — so a line can be programmed entirely from the keyboard.
 *
 * Memoized alongside the drum lanes, and for the same reason.
 */
function NoteRowLane({
  lane,
  onToggleStep,
  onTranspose,
  onResize,
  spotlit = false,
}: NoteRowProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, stepIndex: number) => {
    const semitones = event.shiftKey ? OCTAVE : 1
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        return onTranspose(lane.id, stepIndex, semitones)
      case 'ArrowDown':
        event.preventDefault()
        return onTranspose(lane.id, stepIndex, -semitones)
      case 'ArrowRight':
        event.preventDefault()
        return onResize(lane.id, stepIndex, 1)
      case 'ArrowLeft':
        event.preventDefault()
        return onResize(lane.id, stepIndex, -1)
      default:
        return
    }
  }

  return (
    <div className={['step-row', 'note-row', spotlit && 'is-spotlit'].filter(Boolean).join(' ')}>
      <div className="lane-label">
        <span className="lane-led" aria-hidden="true" />
        {lane.label}
      </div>
      <div className="step-grid" role="group" aria-label={`${lane.label} steps`}>
        {lane.steps.map((step, i) => (
          <button
            key={i}
            type="button"
            className="step note-step"
            data-quad={Math.floor(i / 4)}
            data-step-index={i}
            data-length={step.on ? step.length : undefined}
            aria-pressed={step.on}
            aria-label={
              step.on
                ? `${lane.label} step ${i + 1}, ${midiToNoteName(step.pitch)}, ${step.length} step${step.length === 1 ? '' : 's'} long`
                : `${lane.label} step ${i + 1}, empty`
            }
            onClick={() => onToggleStep(lane.id, i)}
            onKeyDown={(event) => handleKeyDown(event, i)}
          >
            <span className="step-led" aria-hidden="true" />
            <span className="note-name" aria-hidden="true">
              {step.on ? midiToNoteName(step.pitch) : i + 1}
            </span>
            <span className="note-length" aria-hidden="true">
              {step.on ? '·'.repeat(step.length) : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export const NoteRow = memo(NoteRowLane)

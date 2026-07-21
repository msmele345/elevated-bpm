import type { DrumLane } from '../model/types'

interface StepRowProps {
  lane: DrumLane
  onCycleStep: (stepIndex: number) => void
  onToggleMute: () => void
  onToggleSolo: () => void
  spotlit?: boolean
  muted?: boolean
  soloed?: boolean
  /** Not sounding right now (muted, or un-soloed while another lane solos). */
  silenced?: boolean
}

/**
 * One sequencer lane: label + mute/solo strip plus 16 step buttons, grouped
 * into the four classic 909 color quads. Steps are plain DOM buttons (per the
 * rendering split: pads/keys/steps are DOM/CSS, never canvas).
 */
export function StepRow({
  lane,
  onCycleStep,
  onToggleMute,
  onToggleSolo,
  spotlit = false,
  muted = false,
  soloed = false,
  silenced = false,
}: StepRowProps) {
  const classNames = ['step-row', spotlit && 'is-spotlit', silenced && 'is-silenced']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classNames}>
      <div className="lane-label">
        <span className="lane-led" aria-hidden="true" />
        {lane.label}
        <span className="lane-mix">
          <button
            type="button"
            className="lane-mix-btn is-mute"
            aria-pressed={muted}
            aria-label={`Mute ${lane.label}`}
            onClick={onToggleMute}
          >
            M
          </button>
          <button
            type="button"
            className="lane-mix-btn is-solo"
            aria-pressed={soloed}
            aria-label={`Solo ${lane.label}`}
            onClick={onToggleSolo}
          >
            S
          </button>
        </span>
      </div>
      <div className="step-grid" role="group" aria-label={`${lane.label} steps`}>
        {lane.steps.map((step, i) => (
          <button
            key={i}
            type="button"
            className="step"
            data-quad={Math.floor(i / 4)}
            data-step-index={i}
            data-accent={step.accent || undefined}
            aria-pressed={step.on}
            aria-label={`${lane.label} step ${i + 1}${step.accent ? ' (accent)' : ''}`}
            onClick={() => onCycleStep(i)}
          >
            <span className="step-led" aria-hidden="true" />
            <span className="step-num" aria-hidden="true">
              {i + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

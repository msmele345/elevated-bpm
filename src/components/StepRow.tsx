import type { DrumLane } from '../model/types'

interface StepRowProps {
  lane: DrumLane
  onCycleStep: (stepIndex: number) => void
  spotlit?: boolean
}

/**
 * One sequencer lane: label plus 16 step buttons, grouped into the four
 * classic 909 color quads. Steps are plain DOM buttons (per the rendering
 * split: pads/keys/steps are DOM/CSS, never canvas).
 */
export function StepRow({ lane, onCycleStep, spotlit = false }: StepRowProps) {
  return (
    <div className={spotlit ? 'step-row is-spotlit' : 'step-row'}>
      <div className="lane-label">
        <span className="lane-led" aria-hidden="true" />
        {lane.label}
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

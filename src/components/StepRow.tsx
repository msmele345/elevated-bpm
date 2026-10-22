import { memo } from 'react'
import type { LevelParamId } from '../model/mixer'
import type { LaneId, StepLane } from '../model/types'
import { VoiceMixStrip } from './VoiceMixStrip'

interface StepRowProps {
  lane: StepLane<LaneId>
  /**
   * The lane names itself in every callback, so the deck can hand each row one
   * callback that never changes identity. Closing over the lane up there would
   * mean a fresh function per row per render, and the memo below would never
   * bail out on anything.
   */
  onCycleStep: (laneId: LaneId, stepIndex: number) => void
  onToggleMute: (laneId: LaneId) => void
  onToggleSolo: (laneId: LaneId) => void
  onLevelChange: (id: LevelParamId, value: number) => void
  spotlit?: boolean
  muted?: boolean
  soloed?: boolean
  /** Not sounding right now (muted, or un-soloed while another voice solos). */
  silenced?: boolean
  /** The lane's Level, a linear channel gain. */
  level?: number
  /** The active lesson is pointing at this lane's Level knob. */
  levelSpotlit?: boolean
}

/**
 * One sequencer lane: label + mute/solo/Level strip plus 16 step buttons, grouped
 * into the four classic 909 color quads. Steps are plain DOM buttons (per the
 * rendering split: pads/keys/steps are DOM/CSS, never canvas).
 *
 * Memoized: a row is nineteen controls, and seven of them sit on the deck. A
 * knob moving elsewhere must not cost a rebuild of all of them mid-playback.
 */
function StepRowLane({
  lane,
  onCycleStep,
  onToggleMute,
  onToggleSolo,
  onLevelChange,
  spotlit = false,
  muted = false,
  soloed = false,
  silenced = false,
  level = 1,
  levelSpotlit = false,
}: StepRowProps) {
  const classNames = ['step-row', spotlit && 'is-spotlit', silenced && 'is-silenced']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classNames}>
      <div className="lane-label">
        <span className="lane-led" aria-hidden="true" />
        {lane.label}
        <VoiceMixStrip
          voiceId={lane.id}
          label={lane.label}
          muted={muted}
          soloed={soloed}
          level={level}
          levelSpotlit={levelSpotlit}
          onToggleMute={onToggleMute}
          onToggleSolo={onToggleSolo}
          onLevelChange={onLevelChange}
        />
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
            onClick={() => onCycleStep(lane.id, i)}
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

export const StepRow = memo(StepRowLane)

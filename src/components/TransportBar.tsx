import { memo } from 'react'
import { MAX_BPM, MIN_BPM } from '../audio/engine'

interface TransportBarProps {
  isPlaying: boolean
  bpm: number
  /** The active lesson is pointing at the tempo fader. */
  spotlitTempo?: boolean
  /** The loop is not offered while the microphone is open. */
  heldForRecording?: boolean
  onTogglePlay: () => void
  onBpmChange: (bpm: number) => void
}

function Transport({
  isPlaying,
  bpm,
  spotlitTempo = false,
  heldForRecording = false,
  onTogglePlay,
  onBpmChange,
}: TransportBarProps) {
  return (
    <div className="transport">
      <button
        type="button"
        className="transport-play"
        aria-pressed={isPlaying}
        // `aria-disabled` rather than `disabled`: disabling a focused control
        // drops focus to the document, and this deck is 163 tab stops deep.
        // The handler refuses too, so the control cannot be talked into it.
        aria-disabled={heldForRecording || undefined}
        onClick={onTogglePlay}
      >
        <span className="transport-play-led" aria-hidden="true" />
        {isPlaying ? 'Stop' : 'Play'}
      </button>
      <label className={spotlitTempo ? 'transport-tempo is-spotlit' : 'transport-tempo'}>
        <span className="transport-tempo-label">Tempo</span>
        <input
          type="range"
          className="transport-tempo-fader"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={bpm}
          onChange={(e) => onBpmChange(Number(e.target.value))}
          aria-label="Tempo in beats per minute"
        />
      </label>
      <div className="transport-bpm" aria-hidden="true">
        <span className="transport-bpm-value">{bpm}</span>
        <span className="transport-bpm-unit">BPM</span>
      </div>
    </div>
  )
}

export const TransportBar = memo(Transport)

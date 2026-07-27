import { MAX_BPM, MIN_BPM } from '../audio/engine'

interface TransportBarProps {
  isPlaying: boolean
  bpm: number
  /** The active lesson is pointing at the tempo fader. */
  spotlitTempo?: boolean
  onTogglePlay: () => void
  onBpmChange: (bpm: number) => void
}

export function TransportBar({
  isPlaying,
  bpm,
  spotlitTempo = false,
  onTogglePlay,
  onBpmChange,
}: TransportBarProps) {
  return (
    <div className="transport">
      <button
        type="button"
        className="transport-play"
        aria-pressed={isPlaying}
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

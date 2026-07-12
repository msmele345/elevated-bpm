interface TransportBarProps {
  isPlaying: boolean
  bpm: number
  onTogglePlay: () => void
}

export function TransportBar({ isPlaying, bpm, onTogglePlay }: TransportBarProps) {
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
      <div className="transport-bpm" aria-label={`Tempo ${bpm} beats per minute`}>
        <span className="transport-bpm-value">{bpm}</span>
        <span className="transport-bpm-unit">BPM</span>
      </div>
    </div>
  )
}

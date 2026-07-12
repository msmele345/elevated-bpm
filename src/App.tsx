import { useEffect, useState } from 'react'
import { StepRow } from './components/StepRow'
import { TransportBar } from './components/TransportBar'
import { createInitialPattern, toggleStep } from './model/pattern'
import type { DrumLaneId } from './model/types'
import * as engine from './audio/engine'

export default function App() {
  const [pattern, setPattern] = useState(createInitialPattern)
  const [isPlaying, setIsPlaying] = useState(false)

  // Keep the audio engine pointed at the latest pattern; playback reads it
  // live on each scheduled 16th, so edits are audible immediately.
  useEffect(() => {
    engine.setPattern(pattern)
  }, [pattern])

  const handleToggleStep = (laneId: DrumLaneId, stepIndex: number) => {
    setPattern((p) => toggleStep(p, laneId, stepIndex))
  }

  const handleTogglePlay = async () => {
    if (isPlaying) {
      engine.stop()
      setIsPlaying(false)
    } else {
      await engine.play()
      setIsPlaying(true)
    }
  }

  return (
    <main className="deck">
      <header className="deck-header">
        <h1 className="brand">
          Elevated <em>BPM</em>
        </h1>
        <span className="deck-model">RHYTHM COMPOSER · EB-01</span>
      </header>

      <section className="panel" aria-label="Drum machine">
        <TransportBar isPlaying={isPlaying} bpm={engine.DEFAULT_BPM} onTogglePlay={handleTogglePlay} />
        {pattern.lanes.map((lane) => (
          <StepRow
            key={lane.id}
            lane={lane}
            onToggleStep={(stepIndex) => handleToggleStep(lane.id, stepIndex)}
          />
        ))}
        <p className="panel-hint">Tap steps to program the kick — 1 · 5 · 9 · 13 is four-on-the-floor.</p>
      </section>
    </main>
  )
}

import { useEffect, useRef, useState } from 'react'
import { StepRow } from './components/StepRow'
import { TransportBar } from './components/TransportBar'
import { usePlayhead } from './hooks/usePlayhead'
import { createInitialPattern, toggleStep } from './model/pattern'
import type { DrumLaneId } from './model/types'
import * as engine from './audio/engine'

export default function App() {
  const [pattern, setPattern] = useState(createInitialPattern)
  const [isPlaying, setIsPlaying] = useState(false)
  const [bpm, setBpm] = useState(engine.DEFAULT_BPM)
  const panelRef = useRef<HTMLElement>(null)

  usePlayhead(panelRef, isPlaying)

  // Keep the audio engine pointed at the latest pattern; playback reads it
  // live on each scheduled 16th, so edits are audible immediately.
  useEffect(() => {
    engine.setPattern(pattern)
  }, [pattern])

  // Unlock the audio context and preload the kick on the first gesture
  // anywhere, so the first Play is instant and never blocked by autoplay
  // policy. unlockAudio is idempotent; play() also awaits it as a fallback.
  useEffect(() => {
    const unlock = () => {
      void engine.unlockAudio()
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const handleToggleStep = (laneId: DrumLaneId, stepIndex: number) => {
    setPattern((p) => toggleStep(p, laneId, stepIndex))
  }

  const handleBpmChange = (next: number) => {
    setBpm(next)
    engine.setBpm(next)
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

      <section className="panel" aria-label="Drum machine" ref={panelRef}>
        <TransportBar
          isPlaying={isPlaying}
          bpm={bpm}
          onTogglePlay={handleTogglePlay}
          onBpmChange={handleBpmChange}
        />
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

import { useEffect, useRef, useState } from 'react'
import { LessonPanel } from './components/LessonPanel'
import { StepRow } from './components/StepRow'
import { TransportBar } from './components/TransportBar'
import { usePlayhead } from './hooks/usePlayhead'
import { isGoalMet, parseLesson, spotlitLaneIds, type Lesson } from './model/lesson'
import { createInitialPattern, toggleStep } from './model/pattern'
import type { DrumLaneId } from './model/types'
import * as engine from './audio/engine'
import fourOnTheFloorJson from './lessons/four-on-the-floor.json'

// Lessons are pure data: the definition is JSON, parsed once at module load.
const fourOnTheFloor = parseLesson(fourOnTheFloorJson)

export default function App() {
  const [pattern, setPattern] = useState(createInitialPattern)
  const [isPlaying, setIsPlaying] = useState(false)
  const [bpm, setBpm] = useState(engine.DEFAULT_BPM)
  const [activeLesson] = useState<Lesson | null>(fourOnTheFloor)
  const [lessonCompleted, setLessonCompleted] = useState(false)
  const [lessonDismissed, setLessonDismissed] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  // Spotlight guides toward the goal, so it rests once the goal is met or
  // the lesson is put away.
  const spotlitLanes = lessonCompleted || lessonDismissed ? [] : spotlitLaneIds(activeLesson)

  usePlayhead(panelRef, isPlaying)

  // Goal detection: re-evaluated on every pattern edit (never on the audio
  // clock) and latched — un-toggling a step later doesn't revoke completion.
  // Runs even while dismissed so resuming shows the earned celebration.
  useEffect(() => {
    if (!activeLesson || lessonCompleted) return
    if (isGoalMet(activeLesson, pattern)) setLessonCompleted(true)
  }, [pattern, activeLesson, lessonCompleted])

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

      {activeLesson &&
        (lessonDismissed ? (
          <button
            type="button"
            className="lesson-resume"
            onClick={() => setLessonDismissed(false)}
          >
            <span className="lesson-resume-led" aria-hidden="true" />
            Resume lesson · {activeLesson.title}
          </button>
        ) : (
          <LessonPanel
            lesson={activeLesson}
            completed={lessonCompleted}
            onDismiss={() => setLessonDismissed(true)}
          />
        ))}

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
            spotlit={spotlitLanes.includes(lane.id)}
            onToggleStep={(stepIndex) => handleToggleStep(lane.id, stepIndex)}
          />
        ))}
        <p className="panel-hint">Tap steps to program the kick — 1 · 5 · 9 · 13 is four-on-the-floor.</p>
      </section>
    </main>
  )
}

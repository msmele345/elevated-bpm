import { useEffect, useRef, useState } from 'react'
import { LessonPanel } from './components/LessonPanel'
import { StepRow } from './components/StepRow'
import { TransportBar } from './components/TransportBar'
import { usePlayhead } from './hooks/usePlayhead'
import { isGoalMet, parseLesson, spotlitLaneIds, type Lesson } from './model/lesson'
import {
  activePattern,
  createInitialProjectState,
  cycleActivePatternStep,
  openingProjectState,
  setTransportBpm,
  toggleLaneMute,
  toggleLaneSolo,
  updateLessonProgress,
} from './model/projectState'
import type { DrumLaneId } from './model/types'
import * as engine from './audio/engine'
import { createAutosaver } from './storage/autosave'
import { loadProjectState, saveProjectState } from './storage/projectStore'
import fourOnTheFloorJson from './lessons/four-on-the-floor.json'

// Lessons are pure data: the definition is JSON, parsed once at module load.
const fourOnTheFloor = parseLesson(fourOnTheFloorJson)

// Long enough to coalesce a burst of step taps into one IndexedDB write,
// short enough that a save has almost always landed before a refresh.
const AUTOSAVE_DELAY_MS = 400

export default function App() {
  // ProjectState is the single source of truth: pattern edits, transport
  // settings, and lesson progress all live in (and persist as) one document.
  const [project, setProject] = useState(createInitialProjectState)
  const [hydrated, setHydrated] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeLesson] = useState<Lesson | null>(fourOnTheFloor)
  const panelRef = useRef<HTMLElement>(null)
  const autosaverRef = useRef(createAutosaver(saveProjectState, AUTOSAVE_DELAY_MS))

  const pattern = activePattern(project)
  const bpm = project.transport.bpm
  const soloing = Object.values(project.mixer).some((mix) => mix?.soloed)
  const lessonProgress = activeLesson ? project.lessonProgress[activeLesson.id] : undefined
  const lessonCompleted = lessonProgress?.completed ?? false
  const lessonDismissed = lessonProgress?.dismissed ?? false

  // Spotlight guides toward the goal, so it rests once the goal is met or
  // the lesson is put away.
  const spotlitLanes = lessonCompleted || lessonDismissed ? [] : spotlitLaneIds(activeLesson)

  usePlayhead(panelRef, isPlaying)

  // Hydrate from IndexedDB once on mount: a returning user gets their saved
  // beat back, a first-time one gets the demo groove so the deck is never
  // silent on the first press of play. Either way the engine's tempo follows
  // the document that won.
  useEffect(() => {
    let cancelled = false
    void loadProjectState().then((saved) => {
      if (cancelled) return
      const opening = openingProjectState(saved)
      setProject(opening)
      engine.setBpm(opening.transport.bpm)
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced autosave of every document change after hydration — never on
  // the audio clock, and coalesced so playback stays glitch-free.
  useEffect(() => {
    if (!hydrated) return
    autosaverRef.current.schedule(project)
  }, [project, hydrated])

  // A refresh or tab close inside the debounce window must not lose the last
  // edit: flush the pending save as the page goes away.
  useEffect(() => {
    const flush = () => autosaverRef.current.flush()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  // Goal detection: re-evaluated on every pattern edit (never on the audio
  // clock) and latched in the document — un-toggling a step later doesn't
  // revoke completion, and completion survives a reload.
  useEffect(() => {
    if (!activeLesson || lessonCompleted) return
    if (isGoalMet(activeLesson, pattern)) {
      setProject((p) => updateLessonProgress(p, activeLesson.id, { completed: true }))
    }
  }, [pattern, activeLesson, lessonCompleted])

  // Keep the audio engine pointed at the latest pattern; playback reads it
  // live on each scheduled 16th, so edits are audible immediately.
  useEffect(() => {
    engine.setPattern(pattern)
  }, [pattern])

  // Same for mute/solo: the engine reads the live mixer per 16th, so toggling
  // a lane silences or solos it on the next step with no restart.
  useEffect(() => {
    engine.setMixer(project.mixer)
  }, [project.mixer])

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

  const handleCycleStep = (laneId: DrumLaneId, stepIndex: number) => {
    setProject((p) => cycleActivePatternStep(p, laneId, stepIndex))
  }

  const handleToggleMute = (laneId: DrumLaneId) => {
    setProject((p) => toggleLaneMute(p, laneId))
  }

  const handleToggleSolo = (laneId: DrumLaneId) => {
    setProject((p) => toggleLaneSolo(p, laneId))
  }

  const handleBpmChange = (next: number) => {
    setProject((p) => setTransportBpm(p, next))
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

  const handleSetLessonDismissed = (dismissed: boolean) => {
    if (!activeLesson) return
    setProject((p) => updateLessonProgress(p, activeLesson.id, { dismissed }))
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
            onClick={() => handleSetLessonDismissed(false)}
          >
            <span className="lesson-resume-led" aria-hidden="true" />
            Resume lesson · {activeLesson.title}
          </button>
        ) : (
          <LessonPanel
            lesson={activeLesson}
            completed={lessonCompleted}
            onDismiss={() => handleSetLessonDismissed(true)}
          />
        ))}

      <section className="panel" aria-label="Drum machine" ref={panelRef}>
        <TransportBar
          isPlaying={isPlaying}
          bpm={bpm}
          onTogglePlay={handleTogglePlay}
          onBpmChange={handleBpmChange}
        />
        {pattern.lanes.map((lane) => {
          const mix = project.mixer[lane.id]
          // With any solo engaged, a lane that is not soloed is silenced —
          // shown dimmed so the deck reflects what is actually sounding.
          const silenced = soloing ? !mix?.soloed : (mix?.muted ?? false)
          return (
            <StepRow
              key={lane.id}
              lane={lane}
              spotlit={spotlitLanes.includes(lane.id)}
              muted={mix?.muted ?? false}
              soloed={mix?.soloed ?? false}
              silenced={silenced}
              onCycleStep={(stepIndex) => handleCycleStep(lane.id, stepIndex)}
              onToggleMute={() => handleToggleMute(lane.id)}
              onToggleSolo={() => handleToggleSolo(lane.id)}
            />
          )
        })}
        <p className="panel-hint">Tap a step: once to place it, again for an accent, again to clear.</p>
      </section>
    </main>
  )
}

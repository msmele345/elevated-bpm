import { useEffect, useRef, useState } from 'react'
import { BassPanel } from './components/BassPanel'
import { LessonPanel } from './components/LessonPanel'
import { StabKeyboard } from './components/StabKeyboard'
import { StepRow } from './components/StepRow'
import { TransportBar } from './components/TransportBar'
import { usePlayhead } from './hooks/usePlayhead'
import { bassParamSpec, type BassParamId } from './model/bass'
import { isGoalMet, parseLesson, spotlitLaneIds, spotlitParamIds } from './model/lesson'
import { NO_PARAM_MOTION, observeParamMotion } from './model/paramMotion'
import {
  activePattern,
  createInitialProjectState,
  cycleActivePatternStep,
  openingProjectState,
  resizeActivePatternNote,
  setBassParamValue,
  setTransportBpm,
  toggleActivePatternNoteStep,
  toggleLaneMute,
  toggleLaneSolo,
  transposeActivePatternNote,
  updateLessonProgress,
} from './model/projectState'
import type { DrumLaneId } from './model/types'
import * as engine from './audio/engine'
import { createAutosaver } from './storage/autosave'
import { loadProjectState, saveProjectState } from './storage/projectStore'
import filterSweepJson from './lessons/filter-sweep.json'
import fourOnTheFloorJson from './lessons/four-on-the-floor.json'

// Lessons are pure data: the definitions are JSON, parsed once at module load.
// The order is the arc — rhythm first, then sound design. Full arc navigation
// (jumping between lessons) lands in Phase 7.
const LESSONS = [fourOnTheFloorJson, filterSweepJson].map(parseLesson)

// Long enough to coalesce a burst of step taps into one IndexedDB write,
// short enough that a save has almost always landed before a refresh.
const AUTOSAVE_DELAY_MS = 400

export default function App() {
  // ProjectState is the single source of truth: pattern edits, transport
  // settings, and lesson progress all live in (and persist as) one document.
  const [project, setProject] = useState(createInitialProjectState)
  const [hydrated, setHydrated] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  // Knob motion is a claim about this session, not about the saved document:
  // it is what the user just did to a running loop, so it lives in memory and
  // never dirties the autosave. Completion itself is still latched in the
  // document, so an earned sweep survives a reload.
  const [paramMotion, setParamMotion] = useState(NO_PARAM_MOTION)
  // The playhead sweeps every grid on the deck — drums and bass alike — so
  // its root is the deck, not one panel.
  const deckRef = useRef<HTMLElement>(null)
  const autosaverRef = useRef(createAutosaver(saveProjectState, AUTOSAVE_DELAY_MS))

  const pattern = activePattern(project)
  const bassLane = pattern.noteLanes[0]
  const bassSettings = project.instrumentSettings.bass
  const bpm = project.transport.bpm
  const soloing = Object.values(project.mixer).some((mix) => mix?.soloed)

  // The arc advances only once a finished lesson is put away, so the
  // celebration is never cut short by the next lesson appearing over it.
  const activeLesson =
    LESSONS.find((lesson) => {
      const progress = project.lessonProgress[lesson.id]
      return !(progress?.completed && progress.dismissed)
    }) ?? LESSONS[LESSONS.length - 1]

  const lessonProgress = project.lessonProgress[activeLesson.id]
  const lessonCompleted = lessonProgress?.completed ?? false
  const lessonDismissed = lessonProgress?.dismissed ?? false

  // Spotlight guides toward the goal, so it rests once the goal is met or
  // the lesson is put away.
  const spotlitResting = lessonCompleted || lessonDismissed
  const spotlitLanes = spotlitResting ? [] : spotlitLaneIds(activeLesson)
  const spotlitParams = spotlitResting ? [] : spotlitParamIds(activeLesson)

  usePlayhead(deckRef, isPlaying)

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

  // Goal detection: re-evaluated on every user edit — a step tap or a knob
  // move — and never on the audio clock. Completion is latched in the
  // document, so undoing the work later doesn't revoke it and the earned
  // lesson survives a reload.
  useEffect(() => {
    if (lessonCompleted) return
    if (isGoalMet(activeLesson, { pattern, motion: paramMotion })) {
      setProject((p) => updateLessonProgress(p, activeLesson.id, { completed: true }))
    }
  }, [pattern, paramMotion, activeLesson, lessonCompleted])

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

  // And the bass patch: the engine ramps cutoff/resonance, so a knob dragged
  // mid-loop reshapes the sound as it moves rather than on the next note.
  useEffect(() => {
    engine.setBassSettings(bassSettings)
  }, [bassSettings])

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

  const handleToggleNoteStep = (stepIndex: number) => {
    setProject((p) => toggleActivePatternNoteStep(p, 'bass', stepIndex))
  }

  const handleTransposeNote = (stepIndex: number, semitones: number) => {
    setProject((p) => transposeActivePatternNote(p, 'bass', stepIndex, semitones))
  }

  const handleResizeNote = (stepIndex: number, steps: number) => {
    setProject((p) => resizeActivePatternNote(p, 'bass', stepIndex, steps))
  }

  const handleBassParamChange = (id: BassParamId, value: number) => {
    setProject((p) => setBassParamValue(p, id, value))
    // Sound design is something you do to a running loop, so only motion over
    // playing audio counts toward a sweep goal.
    setParamMotion((m) => observeParamMotion(m, bassParamSpec(id), value, isPlaying))
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
    setProject((p) => updateLessonProgress(p, activeLesson.id, { dismissed }))
  }

  return (
    <main className="deck" ref={deckRef}>
      <header className="deck-header">
        <h1 className="brand">
          Elevated <em>BPM</em>
        </h1>
        <span className="deck-model">RHYTHM COMPOSER · EB-01</span>
      </header>

      {lessonDismissed ? (
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
      )}

      <section className="panel" aria-label="Drum machine">
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

      <BassPanel
        lane={bassLane}
        settings={bassSettings}
        spotlitParams={spotlitParams}
        onToggleStep={handleToggleNoteStep}
        onTranspose={handleTransposeNote}
        onResize={handleResizeNote}
        onParamChange={handleBassParamChange}
      />

      <StabKeyboard onAttack={engine.attackStabNote} onRelease={engine.releaseStabNote} />
    </main>
  )
}

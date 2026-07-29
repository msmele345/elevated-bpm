import { useCallback, useEffect, useRef, useState } from 'react'
import { BassPanel } from './components/BassPanel'
import { FinaleMoment } from './components/FinaleMoment'
import { LessonArc } from './components/LessonArc'
import { LessonPanel } from './components/LessonPanel'
import { ShareControls } from './components/ShareControls'
import { StabKeyboard } from './components/StabKeyboard'
import { StepRow } from './components/StepRow'
import { TransportBar } from './components/TransportBar'
import { usePlayhead } from './hooks/usePlayhead'
import { useRoomLight } from './hooks/useRoomLight'
import {
  activeArcLesson,
  arcCompletion,
  arcEntries,
  detectLessonCompletion,
  lessonsAlreadyMet,
  nextUnfinishedLessonId,
} from './model/arc'
import { bassParamSpec, type BassParamId } from './model/bass'
import { NO_CHORD_PLAY, observeChordAttack, observeChordRelease } from './model/chordPlay'
import {
  spotlightsTarget,
  spotlitLaneIds,
  spotlitNoteLaneIds,
  spotlitParamIds,
} from './model/lesson'
import { NO_PARAM_MOTION, observeParamMotion } from './model/paramMotion'
import {
  activePattern,
  createInitialProjectState,
  cycleActivePatternStep,
  enterLesson,
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
import {
  createShareUrl,
  projectWithSharedBeat,
  readSharedBeat,
  SHARE_QUERY_PARAM,
} from './model/share'
import type { DrumLaneId, NoteLaneId } from './model/types'
import * as engine from './audio/engine'
import { createAutosaver } from './storage/autosave'
import { loadProjectState, saveProjectState } from './storage/projectStore'
import { ARC } from './lessons'

// Long enough to coalesce a burst of step taps into one IndexedDB write,
// short enough that a save has almost always landed before a refresh.
const AUTOSAVE_DELAY_MS = 400

export default function App() {
  // ProjectState is the single source of truth: pattern edits, transport
  // settings, and lesson progress all live in (and persist as) one document.
  const [project, setProject] = useState(createInitialProjectState)
  const [hydrated, setHydrated] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  // An incoming beat runs as a disposable in-memory preview. Holding the
  // recipient's opening document here lets "Back to my project" restore it
  // exactly; autosave stays suspended until the preview is explicitly kept.
  const [sharePreview, setSharePreview] = useState<{
    recipientProject: ReturnType<typeof createInitialProjectState>
  } | null>(null)
  const [incomingShareError, setIncomingShareError] = useState<string | null>(null)
  const [outgoingShareError, setOutgoingShareError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [sharedUrl, setSharedUrl] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  // A session-only graduation overlay: it appears on the transition into an
  // earned capstone, never just because an already-complete project reloaded.
  const [finaleVisible, setFinaleVisible] = useState(false)
  // Knob motion is a claim about this session, not about the saved document:
  // it is what the user just did to a running loop, so it lives in memory and
  // never dirties the autosave. Completion itself is still latched in the
  // document, so an earned sweep survives a reload.
  const [paramMotion, setParamMotion] = useState(NO_PARAM_MOTION)
  // Live playing is a session observation too. The record of what is held
  // right now lives in a ref — it changes on every key press and no pixel
  // depends on it — while state carries only the biggest chord played, so a
  // key press re-renders the deck once a chord grows, and never otherwise.
  const chordRef = useRef(NO_CHORD_PLAY)
  const [chordPlay, setChordPlay] = useState(NO_CHORD_PLAY)
  // Goals describe what the user did, so work that arrives already done in an
  // incoming shared beat is inherited, not earned: these lessons are held back
  // from completion until their goal stops being met and is built again. A
  // session observation like the others — never persisted.
  const inheritedLessonsRef = useRef<Set<string>>(new Set())
  // The playhead sweeps every grid on the deck — drums, bass, and stabs — so
  // its root is the deck, not one panel.
  const deckRef = useRef<HTMLElement>(null)
  const autosaverRef = useRef(createAutosaver(saveProjectState, AUTOSAVE_DELAY_MS))

  const pattern = activePattern(project)
  const bassLane = pattern.noteLanes.find((lane) => lane.id === 'bass')!
  const stabLane = pattern.noteLanes.find((lane) => lane.id === 'stab')!
  const bassSettings = project.instrumentSettings.bass
  const bpm = project.transport.bpm
  const soloing = Object.values(project.mixer).some((mix) => mix?.soloed)

  // Where the user is on the arc: their own selection if they stepped off the
  // path, otherwise the first lesson still unearned.
  const activeLesson = activeArcLesson(ARC, project.lessonProgress, project.activeLessonId)
  const arcPath = arcEntries(ARC, project.lessonProgress, activeLesson.id)
  const arcDone = arcCompletion(ARC, project.lessonProgress)
  const here = arcPath.find((entry) => entry.current)!

  const lessonProgress = project.lessonProgress[activeLesson.id]
  const lessonCompleted = lessonProgress?.completed ?? false
  const lessonDismissed = lessonProgress?.dismissed ?? false

  // Spotlight guides toward the goal, so it rests once the goal is met or
  // the lesson is put away.
  const spotlitResting = lessonCompleted || lessonDismissed
  const spotlitLanes = spotlitResting ? [] : spotlitLaneIds(activeLesson)
  const spotlitNoteLanes = spotlitResting ? [] : spotlitNoteLaneIds(activeLesson)
  const spotlitParams = spotlitResting ? [] : spotlitParamIds(activeLesson)
  const spotlitTarget = (target: string) =>
    !spotlitResting && spotlightsTarget(activeLesson, target)

  usePlayhead(deckRef, isPlaying)
  useRoomLight(isPlaying, bpm)

  // Hydrate from IndexedDB once on mount: a returning user gets their saved
  // beat back, a first-time one gets the demo groove so the deck is never
  // silent on the first press of play. Either way the engine's tempo follows
  // the document that won.
  useEffect(() => {
    let cancelled = false
    void Promise.all([loadProjectState(), readSharedBeat(window.location.href)]).then(
      ([saved, incoming]) => {
        if (cancelled) return
        const opening = openingProjectState(saved)
        const next =
          incoming.status === 'ready'
            ? projectWithSharedBeat(opening, incoming.project)
            : opening
        if (incoming.status === 'ready') {
          setSharePreview({ recipientProject: opening })
          inheritedLessonsRef.current = lessonsAlreadyMet(ARC, {
            pattern: activePattern(next),
            motion: NO_PARAM_MOTION,
            bpm: next.transport.bpm,
            chord: NO_CHORD_PLAY,
          })
        } else if (incoming.status === 'error') {
          setIncomingShareError(incoming.message)
        }
        setProject(next)
        engine.setBpm(next.transport.bpm)
        setHydrated(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced autosave of every document change after hydration — never on
  // the audio clock, and coalesced so playback stays glitch-free.
  useEffect(() => {
    if (!hydrated || sharePreview !== null) return
    autosaverRef.current.schedule(project)
  }, [project, hydrated, sharePreview])

  // Once the deck changes, an older generated link no longer describes what
  // is on it. Clear the stale result; the user can press Share again.
  useEffect(() => {
    setSharedUrl(null)
    setShareCopied(false)
  }, [project])

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
    const completion = detectLessonCompletion(ARC, activeLesson, lessonCompleted, {
      pattern,
      motion: paramMotion,
      bpm,
      chord: chordPlay,
    })
    if (!completion.justCompleted) {
      // The goal is not met right now, so whatever the shared beat brought
      // with it is gone: from here the lesson is the user's to earn.
      inheritedLessonsRef.current.delete(activeLesson.id)
      return
    }
    // Met, but only because the beat arrived that way — hold the credit.
    if (inheritedLessonsRef.current.has(activeLesson.id)) return
    setProject((p) => updateLessonProgress(p, activeLesson.id, { completed: true }))
    if (completion.showFinale) setFinaleVisible(true)
  }, [pattern, paramMotion, bpm, chordPlay, activeLesson, lessonCompleted])

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

  const handleToggleNoteStep = (laneId: NoteLaneId, stepIndex: number) => {
    setProject((p) => toggleActivePatternNoteStep(p, laneId, stepIndex))
  }

  const handleTransposeNote = (
    laneId: NoteLaneId,
    stepIndex: number,
    semitones: number,
  ) => {
    setProject((p) => transposeActivePatternNote(p, laneId, stepIndex, semitones))
  }

  const handleResizeNote = (laneId: NoteLaneId, stepIndex: number, steps: number) => {
    setProject((p) => resizeActivePatternNote(p, laneId, stepIndex, steps))
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

  const handleStabAttack = (source: string, midi: number) => {
    // Sound first: the note is attacked before any bookkeeping, so watching
    // for a chord never costs the keyboard its latency.
    engine.attackStabNote(source, midi)
    chordRef.current = observeChordAttack(chordRef.current, source, midi)
    // Same record back when the chord did not grow, so React bails out and a
    // held key repeats nothing up the tree.
    setChordPlay((played) =>
      chordRef.current.maxNotes > played.maxNotes ? chordRef.current : played,
    )
  }

  const handleStabRelease = (source: string) => {
    engine.releaseStabNote(source)
    chordRef.current = observeChordRelease(chordRef.current, source)
  }

  const handleDismissLesson = () => {
    setProject((p) => {
      const next = updateLessonProgress(p, activeLesson.id, { dismissed: true })
      if (!next.lessonProgress[activeLesson.id]?.completed) return next
      // Putting away a finished lesson moves the deck on to the next unearned
      // one — the celebration is never cut short, and the path keeps its
      // momentum. With the arc finished there is nowhere to move on to.
      const following = nextUnfinishedLessonId(ARC, next.lessonProgress, activeLesson.id)
      return following ? enterLesson(next, following) : next
    })
  }

  const handleSelectLesson = (lessonId: string) => {
    setProject((p) => enterLesson(p, lessonId))
  }

  const handleResumeLesson = () => {
    setProject((p) => enterLesson(p, activeLesson.id))
  }

  const removeShareFromAddress = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete(SHARE_QUERY_PARAM)
    window.history.replaceState(null, '', url)
  }

  const handleShare = async () => {
    setIsSharing(true)
    setOutgoingShareError(null)
    try {
      const url = await createShareUrl(project, window.location.href)
      setSharedUrl(url)
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url)
          setShareCopied(true)
        } catch {
          // Clipboard permission is optional: the rendered URL remains
          // selectable so the share action still succeeds.
        }
      }
    } catch {
      setOutgoingShareError(
        'A share link could not be created in this browser. Your project is still safe.',
      )
    } finally {
      setIsSharing(false)
    }
  }

  const handleKeepSharedBeat = async () => {
    try {
      await saveProjectState(project)
      setSharePreview(null)
      removeShareFromAddress()
    } catch {
      setOutgoingShareError(
        'This beat could not be saved yet. The preview is still open and your project is safe.',
      )
    }
  }

  const handleRestoreOwnProject = () => {
    if (!sharePreview) return
    engine.stop()
    setIsPlaying(false)
    engine.setBpm(sharePreview.recipientProject.transport.bpm)
    setProject(sharePreview.recipientProject)
    // The shared beat is off the deck, so nothing is inherited from it any more.
    inheritedLessonsRef.current = new Set()
    setSharePreview(null)
    removeShareFromAddress()
  }

  const handleDismissIncomingError = () => {
    setIncomingShareError(null)
    removeShareFromAddress()
  }

  // Stable because the modal owns a window listener while mounted; changing
  // this callback would tear that listener down and refocus its button.
  const handleCloseFinale = useCallback(() => setFinaleVisible(false), [])

  return (
    <>
      {/* The room: decorative club light behind the deck, driven by rAF CSS
          variables — static markup, so it never re-renders on the audio clock. */}
      <div className="room" aria-hidden="true">
        <div className="room-wash room-wash-a" />
        <div className="room-wash room-wash-b" />
        <div className="room-wash room-wash-c" />
        <div className="room-wash room-wash-a-cool" />
        <div className="room-wash room-wash-b-cool" />
        <div className="room-wash room-wash-c-cool" />
        <div className="room-beam room-beam-a" />
        <div className="room-beam room-beam-b" />
      </div>

      <main
        className="deck"
        ref={deckRef}
        inert={finaleVisible}
        aria-hidden={finaleVisible || undefined}
      >
      <header className="deck-header">
        <h1 className="brand">
          Elevated <em>BPM</em>
        </h1>
        <span className="deck-model">RHYTHM COMPOSER · EB-01</span>
      </header>

      <ShareControls
        previewing={sharePreview !== null}
        errorMessage={incomingShareError ?? outgoingShareError}
        shareReady={hydrated}
        isSharing={isSharing}
        sharedUrl={sharedUrl}
        copied={shareCopied}
        onShare={handleShare}
        onKeep={handleKeepSharedBeat}
        onRestore={handleRestoreOwnProject}
        onDismissError={() => {
          if (incomingShareError) {
            handleDismissIncomingError()
          } else {
            setOutgoingShareError(null)
          }
        }}
      />

      <LessonArc
        entries={arcPath}
        completed={arcDone.completed}
        total={arcDone.total}
        onSelect={handleSelectLesson}
      />

      {lessonDismissed ? (
        <button type="button" className="lesson-resume" onClick={handleResumeLesson}>
          <span className="lesson-resume-led" aria-hidden="true" />
          Resume lesson · {activeLesson.title}
        </button>
      ) : (
        <LessonPanel
          lesson={activeLesson}
          position={here.position}
          total={arcDone.total}
          completed={lessonCompleted}
          onDismiss={handleDismissLesson}
        />
      )}

      <section className="panel" aria-label="Drum machine">
        <TransportBar
          isPlaying={isPlaying}
          bpm={bpm}
          spotlitTempo={spotlitTarget('transport:tempo')}
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
        spotlitLane={spotlitNoteLanes.includes('bass')}
        spotlitParams={spotlitParams}
        onToggleStep={(stepIndex) => handleToggleNoteStep('bass', stepIndex)}
        onTranspose={(stepIndex, semitones) =>
          handleTransposeNote('bass', stepIndex, semitones)
        }
        onResize={(stepIndex, steps) => handleResizeNote('bass', stepIndex, steps)}
        onParamChange={handleBassParamChange}
      />

      <StabKeyboard
        lane={stabLane}
        spotlitLane={spotlitNoteLanes.includes('stab')}
        spotlitKeys={spotlitTarget('keyboard:stab')}
        onAttack={handleStabAttack}
        onRelease={handleStabRelease}
        getSoundingNotes={engine.getSoundingStabNotes}
        onToggleStep={(stepIndex) => handleToggleNoteStep('stab', stepIndex)}
        onTranspose={(stepIndex, semitones) =>
          handleTransposeNote('stab', stepIndex, semitones)
        }
        onResize={(stepIndex, steps) => handleResizeNote('stab', stepIndex, steps)}
      />
    </main>
      {finaleVisible && <FinaleMoment onClose={handleCloseFinale} />}
    </>
  )
}

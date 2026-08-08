import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BassPanel } from './components/BassPanel'
import { Knob } from './components/Knob'
import { FinaleMoment } from './components/FinaleMoment'
import { LessonArc } from './components/LessonArc'
import { LessonPanel } from './components/LessonPanel'
import { PanelTitle } from './components/PanelTitle'
import { ShareControls } from './components/ShareControls'
import { SkipLinks } from './components/SkipLinks'
import { SpectrumScope } from './components/SpectrumScope'
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
import { DECK_SECTION_IDS, sectionTitleId } from './model/deckSections'
import { FX_PARAMS, fxParamSpec, type FxParamId } from './model/fx'
import { MASTER_PARAMS, masterParamSpec, type MasterParamId } from './model/master'
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
  setFxParamValue,
  setMasterParamValue,
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

/** Names the send group, so its five knobs are announced as one block. */
const FX_GROUP_LABEL_ID = 'deck-fx-bus-label'

export default function App() {
  // ProjectState is the single source of truth: pattern edits, transport
  // settings, and lesson progress all live in (and persist as) one document.
  const [project, setProject] = useState(createInitialProjectState)
  const [hydrated, setHydrated] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  // Mirrored in a ref so the handlers that only need to *ask* whether the loop
  // is running can stay identity-stable across a play/stop.
  const isPlayingRef = useRef(false)
  isPlayingRef.current = isPlaying
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
  const masterSettings = project.instrumentSettings.master
  const fxSettings = project.instrumentSettings.fx
  const bpm = project.transport.bpm
  const soloing = Object.values(project.mixer).some((mix) => mix?.soloed)

  // Where the user is on the arc: their own selection if they stepped off the
  // path, otherwise the first lesson still unearned.
  const activeLesson = activeArcLesson(ARC, project.lessonProgress, project.activeLessonId)
  // Memoized because the arc is a fresh array every time it is built, and a
  // fresh array is a changed prop: without this the fourteen arc pads would
  // rebuild on every knob move.
  const arcPath = useMemo(
    () => arcEntries(ARC, project.lessonProgress, activeLesson.id),
    [project.lessonProgress, activeLesson.id],
  )
  const arcDone = arcCompletion(ARC, project.lessonProgress)
  const here = arcPath.find((entry) => entry.current)!

  const lessonProgress = project.lessonProgress[activeLesson.id]
  const lessonCompleted = lessonProgress?.completed ?? false
  const lessonDismissed = lessonProgress?.dismissed ?? false

  // Spotlight guides toward the goal, so it rests once the goal is met or
  // the lesson is put away.
  const spotlitResting = lessonCompleted || lessonDismissed
  const spotlitLanes = useMemo(
    () => (spotlitResting ? [] : spotlitLaneIds(activeLesson)),
    [spotlitResting, activeLesson],
  )
  const spotlitNoteLanes = useMemo(
    () => (spotlitResting ? [] : spotlitNoteLaneIds(activeLesson)),
    [spotlitResting, activeLesson],
  )
  // A prop the bass panel holds by reference, so it has to be the same array
  // between renders or the panel and all three of its knobs rebuild.
  const spotlitParams = useMemo(
    () => (spotlitResting ? [] : spotlitParamIds(activeLesson)),
    [spotlitResting, activeLesson],
  )
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

  // A pending save must not outlive the deck. The handlers above already
  // flushed on every path a user takes to leave, so anything still pending at
  // unmount is an orphan whose write would reach for a torn-down IndexedDB.
  useEffect(() => {
    const autosaver = autosaverRef.current
    return () => autosaver.cancel()
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

  // The master macros ride the same path: the bus ramps filter and drive, so
  // the whole mix sweeps live under a dragged knob.
  useEffect(() => {
    engine.setMasterSettings(masterSettings)
  }, [masterSettings])

  // And the FX bus: sends and the reverb mix ramp too, so opening a send while
  // the loop runs fades the echo in rather than switching it on.
  useEffect(() => {
    engine.setFxSettings(fxSettings)
  }, [fxSettings])

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

  // Every handler below is stable across renders, because the panels they are
  // handed to are memoized: a fresh closure is a changed prop, and a changed
  // prop would rebuild seven lanes and a keyboard on each pointer move of a
  // dragged knob — the dropped frame this deck must not have while playing.
  const handleCycleStep = useCallback((laneId: DrumLaneId, stepIndex: number) => {
    setProject((p) => cycleActivePatternStep(p, laneId, stepIndex))
  }, [])

  const handleToggleMute = useCallback((laneId: DrumLaneId) => {
    setProject((p) => toggleLaneMute(p, laneId))
  }, [])

  const handleToggleSolo = useCallback((laneId: DrumLaneId) => {
    setProject((p) => toggleLaneSolo(p, laneId))
  }, [])

  const handleToggleNoteStep = useCallback((laneId: NoteLaneId, stepIndex: number) => {
    setProject((p) => toggleActivePatternNoteStep(p, laneId, stepIndex))
  }, [])

  const handleTransposeNote = useCallback(
    (laneId: NoteLaneId, stepIndex: number, semitones: number) => {
      setProject((p) => transposeActivePatternNote(p, laneId, stepIndex, semitones))
    },
    [],
  )

  const handleResizeNote = useCallback(
    (laneId: NoteLaneId, stepIndex: number, steps: number) => {
      setProject((p) => resizeActivePatternNote(p, laneId, stepIndex, steps))
    },
    [],
  )

  const handleBassParamChange = useCallback((id: BassParamId, value: number) => {
    setProject((p) => setBassParamValue(p, id, value))
    // Sound design is something you do to a running loop, so only motion over
    // playing audio counts toward a sweep goal. Read from the ref rather than
    // the state so this handler never has to change identity.
    setParamMotion((m) => observeParamMotion(m, bassParamSpec(id), value, isPlayingRef.current))
  }, [])

  const handleMasterParamChange = useCallback((id: MasterParamId, value: number) => {
    setProject((p) => setMasterParamValue(p, id, value))
    setParamMotion((m) => observeParamMotion(m, masterParamSpec(id), value, isPlayingRef.current))
  }, [])

  const handleFxParamChange = useCallback((id: FxParamId, value: number) => {
    setProject((p) => setFxParamValue(p, id, value))
    setParamMotion((m) => observeParamMotion(m, fxParamSpec(id), value, isPlayingRef.current))
  }, [])

  const handleBpmChange = useCallback((next: number) => {
    setProject((p) => setTransportBpm(p, next))
    engine.setBpm(next)
  }, [])

  const handleTogglePlay = useCallback(async () => {
    if (isPlayingRef.current) {
      engine.stop()
      setIsPlaying(false)
    } else {
      await engine.play()
      setIsPlaying(true)
    }
  }, [])

  const handleStabAttack = useCallback((source: string, midi: number) => {
    // Sound first: the note is attacked before any bookkeeping, so watching
    // for a chord never costs the keyboard its latency.
    engine.attackStabNote(source, midi)
    chordRef.current = observeChordAttack(chordRef.current, source, midi)
    // Same record back when the chord did not grow, so React bails out and a
    // held key repeats nothing up the tree.
    setChordPlay((played) =>
      chordRef.current.maxNotes > played.maxNotes ? chordRef.current : played,
    )
  }, [])

  const handleStabRelease = useCallback((source: string) => {
    engine.releaseStabNote(source)
    chordRef.current = observeChordRelease(chordRef.current, source)
  }, [])

  // Which lesson these act on is read back out of the document inside the
  // updater rather than closed over, so they never change identity either.
  const handleDismissLesson = useCallback(() => {
    setProject((p) => {
      const lessonId = activeArcLesson(ARC, p.lessonProgress, p.activeLessonId).id
      const next = updateLessonProgress(p, lessonId, { dismissed: true })
      if (!next.lessonProgress[lessonId]?.completed) return next
      // Putting away a finished lesson moves the deck on to the next unearned
      // one — the celebration is never cut short, and the path keeps its
      // momentum. With the arc finished there is nowhere to move on to.
      const following = nextUnfinishedLessonId(ARC, next.lessonProgress, lessonId)
      return following ? enterLesson(next, following) : next
    })
  }, [])

  const handleSelectLesson = useCallback((lessonId: string) => {
    setProject((p) => enterLesson(p, lessonId))
  }, [])

  const handleResumeLesson = useCallback(() => {
    setProject((p) =>
      enterLesson(p, activeArcLesson(ARC, p.lessonProgress, p.activeLessonId).id),
    )
  }, [])

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
      <SkipLinks />

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

      {/* The master strip: deck-global transport, the main-out scope, and the
          two macro knobs — filter and drive — that shape the whole mix. */}
      <section
        className="panel master-panel"
        id={DECK_SECTION_IDS.master}
        tabIndex={-1}
        aria-labelledby={sectionTitleId(DECK_SECTION_IDS.master)}
      >
        <PanelTitle
          sectionId={DECK_SECTION_IDS.master}
          name="Master"
          model="MAIN OUT · MX-01"
        />
        <TransportBar
          isPlaying={isPlaying}
          bpm={bpm}
          spotlitTempo={spotlitTarget('transport:tempo')}
          onTogglePlay={handleTogglePlay}
          onBpmChange={handleBpmChange}
        />
        <div className="master-out">
          <SpectrumScope />
          <div className="knob-row master-knobs">
            {MASTER_PARAMS.map((param) => (
              <Knob
                key={param.id}
                spec={param}
                value={masterSettings[param.id]}
                spotlit={spotlitParams.includes(param.id)}
                onChange={handleMasterParamChange}
              />
            ))}
          </div>
        </div>
        {/* The send bus, grouped apart from the macros: three send levels and
            the two controls shaping what they arrive into. */}
        <div className="fx-bus">
          <span className="fx-bus-name" id={FX_GROUP_LABEL_ID}>
            Send FX · delay 1/8 dotted → reverb
          </span>
          <div className="knob-row fx-knobs" role="group" aria-labelledby={FX_GROUP_LABEL_ID}>
            {FX_PARAMS.map((param) => (
              <Knob
                key={param.id}
                spec={param}
                value={fxSettings[param.id]}
                spotlit={spotlitParams.includes(param.id)}
                onChange={handleFxParamChange}
              />
            ))}
          </div>
        </div>
      </section>

      <section
        className="panel"
        id={DECK_SECTION_IDS.drums}
        tabIndex={-1}
        aria-labelledby={sectionTitleId(DECK_SECTION_IDS.drums)}
      >
        <PanelTitle
          sectionId={DECK_SECTION_IDS.drums}
          name="Drum Machine"
          model="RHYTHM SECTION · DR-909"
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
              onCycleStep={handleCycleStep}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
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
        onToggleStep={handleToggleNoteStep}
        onTranspose={handleTransposeNote}
        onResize={handleResizeNote}
        onParamChange={handleBassParamChange}
      />

      <StabKeyboard
        lane={stabLane}
        spotlitLane={spotlitNoteLanes.includes('stab')}
        spotlitKeys={spotlitTarget('keyboard:stab')}
        onAttack={handleStabAttack}
        onRelease={handleStabRelease}
        getSoundingNotes={engine.getSoundingStabNotes}
        onToggleStep={handleToggleNoteStep}
        onTranspose={handleTransposeNote}
        onResize={handleResizeNote}
      />
    </main>
      {finaleVisible && <FinaleMoment onClose={handleCloseFinale} />}
    </>
  )
}

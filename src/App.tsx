import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BassPanel } from './components/BassPanel'
import { Knob } from './components/Knob'
import { FinaleMoment } from './components/FinaleMoment'
import { LessonArc } from './components/LessonArc'
import { LessonPanel } from './components/LessonPanel'
import { MidiPanel } from './components/MidiPanel'
import { PanelTitle } from './components/PanelTitle'
import { ShareControls } from './components/ShareControls'
import { SamplerPanel } from './components/SamplerPanel'
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
  goalContextFor,
  lessonsAlreadyMet,
  nextUnfinishedLessonId,
} from './model/arc'
import type { BassParamId } from './model/bass'
import { deckParamSpec } from './model/deckParams'
import { DECK_SECTION_IDS, sectionTitleId } from './model/deckSections'
import { FX_PARAMS, type FxParamId } from './model/fx'
import { MASTER_PARAMS, type MasterParamId } from './model/master'
import {
  createMidiRouter,
  resolveSelectedDevice,
  type MidiConnection,
  type MidiInstruction,
} from './model/midi'
import { isMidiSupported, openMidiInputs, type MidiInputSession } from './audio/midiInput'
import { NO_CHORD_PLAY, observeChordAttack, observeChordRelease } from './model/chordPlay'
import {
  spotlightsTarget,
  spotlitLaneIds,
  spotlitNoteLaneIds,
  spotlitPadIds,
  spotlitParamIds,
} from './model/lesson'
import { NO_PARAM_MOTION, observeParamMotion } from './model/paramMotion'
import {
  activeLessonIdFor,
  activePattern,
  addSource,
  assignSourceToSamplerPad,
  commitRegionToSamplerPad,
  createInitialProjectState,
  cycleActivePatternStep,
  enterLesson,
  openingProjectState,
  referencedAudio,
  relinkSamplerPad,
  removeSource,
  resizeActivePatternNote,
  selectArc,
  setBassParamValue,
  setFxParamValue,
  setMasterParamValue,
  setSamplerPadFit,
  setSamplerParamValue,
  setTransportBpm,
  toggleActivePatternNoteStep,
  toggleLaneMute,
  toggleLaneSolo,
  transposeActivePatternNote,
  updateLessonProgress,
  type ProjectState,
} from './model/projectState'
import {
  createShareUrl,
  projectWithSharedBeat,
  readSharedBeat,
  sharedAudioNotice,
  SHARE_QUERY_PARAM,
} from './model/share'
import { createBundle, padsNeedingAudio, readBundle } from './model/bundle'
import {
  openingRegionForSource,
  padsUsingSource,
  namedPad,
  PAD_LANES,
  type AvailableAudio,
  type SampleRegion,
  type SampleSource,
  type SamplerParamId,
} from './model/sampler'
import { sliceKey, type Slice } from './model/slice'
import type { AnalysisAudio } from './audio/engine'
import { clampRegionToSource } from './model/region'
import { RegionEditor } from './components/RegionEditor'
import type { Lesson } from './model/lesson'
import type { LaneId, NoteLaneId, PadLaneId } from './model/types'
import * as engine from './audio/engine'
import { decodeSample, newSourceId, probeDuration } from './audio/sampleDecoder'
import { createSampleIntake, type IntakeOptions } from './audio/sampleIntake'
import { isRecorderUnavailable, openMicrophone, type MicrophoneSession } from './audio/microphone'
import {
  EMPTY_RECORDING_MESSAGE,
  IDLE_RECORDING,
  MICROPHONE_DENIED_MESSAGE,
  RECORDING_FAILED_MESSAGE,
  elapsedSeconds,
  isTransportHeld,
  microphoneOpened,
  microphoneReleased,
  recordingFileName,
  requestMicrophone,
  stopRequested,
  type RecordingState,
} from './model/recording'
import { createAutosaver } from './storage/autosave'
import { loadProjectState, saveProjectState } from './storage/projectStore'
import {
  collectUnreferencedAudio,
  deleteSource,
  loadSlicesFor,
  loadSource,
  loadStoredAudio,
  saveSliceWithinQuota,
  saveSourceWithinQuota,
} from './storage/sampleStore'
import { ALL_LESSONS, ARCS, arcById } from './lessons'

// Long enough to coalesce a burst of step taps into one IndexedDB write,
// short enough that a save has almost always landed before a refresh.
const AUTOSAVE_DELAY_MS = 400

/** Names the send group, so its five knobs are announced as one block. */
const FX_GROUP_LABEL_ID = 'deck-fx-bus-label'

/**
 * Intake, constructed with its real I/O the way the autosaver is constructed
 * with its save function. Built once at module scope because it holds nothing
 * per-deck, and so the handler that uses it never changes identity.
 */
const sampleIntake = createSampleIntake<File>({
  probeDuration,
  decode: decodeSample,
  newSourceId,
})

// How the engine reaches bytes this session never saw — the reason a chop is
// still re-editable after a reload. Wired once, at the composition root, so the
// engine keeps knowing nothing about storage.
engine.setStoredSourceLoader(loadSource)

/** Nothing has been read from storage yet; every pad reads as silent until it has. */
const NO_AUDIO: AvailableAudio = { slices: new Set(), sources: new Set() }

/**
 * The lesson a document is standing on, resolved from the document alone.
 *
 * The navigation handlers call this inside their updater rather than closing
 * over the value, so they never change identity — a fresh closure is a changed
 * prop, and these are handed to memoized panels.
 */
function activeLessonOf(state: ProjectState): Lesson {
  const arc = arcById(state.activeArcId)
  return activeArcLesson(arc.lessons, state.lessonProgress, activeLessonIdFor(state, arc.id))
}

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
  // A refused file is a message and nothing else: the document is never
  // touched on the way to this state, so experimenting with files is free.
  const [intakeError, setIntakeError] = useState<string | null>(null)
  /**
   * Which audio actually survived, in the two terms a pad depends on: the
   * slices that make sound and the sources that make re-chopping possible.
   * Read from storage at load and kept current as audio is written or given up.
   */
  const [audio, setAudio] = useState<AvailableAudio>(NO_AUDIO)
  // What storage cost, when it cost anything. An eviction is worth saying; a
  // write that could not be made at all is worth saying loudly.
  const [storageNotice, setStorageNotice] = useState<{
    message: string
    severity: 'info' | 'error'
  } | null>(null)
  // The source a delete has been asked for but not confirmed. Deleting is
  // permitted, but only after the user has been told what it is under.
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null)
  // Durability is requested once there is user-created audio worth protecting,
  // and not at startup, where it would be a permission prompt about nothing.
  const persistenceRequested = useRef(false)
  /**
   * Whether the microphone is live, and nothing else is allowed to have an
   * opinion about it. Mirrored in a ref because a transition has to be read
   * back inside the same async handler that made it, before React re-renders.
   */
  const [recordingState, setRecordingState] = useState(IDLE_RECORDING)
  const recordingRef = useRef(recordingState)
  /** The open session, held only while one is running. */
  const micSessionRef = useRef<MicrophoneSession | null>(null)
  /**
   * Where the deck stands with MIDI, and which controller is playing it.
   *
   * A browser without Web MIDI opens on `unsupported` and stops there: absence
   * is a normal state this deck reports and otherwise ignores completely.
   */
  const [midiConnection, setMidiConnection] = useState<MidiConnection>(() =>
    isMidiSupported() ? { status: 'idle' } : { status: 'unsupported' },
  )
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  /**
   * Read back inside the adapter's own callbacks, which are handed over once
   * and never see a later render's state.
   */
  const selectedDeviceRef = useRef<string | null>(null)
  const midiRouterRef = useRef(createMidiRouter())
  const midiSessionRef = useRef<MidiInputSession | null>(null)
  /** A request is open. Read synchronously, so a second press cannot slip in. */
  const midiConnectingRef = useRef(false)
  const [outgoingShareError, setOutgoingShareError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  // Assembling a bundle reads every pad's audio back out of storage, so unlike
  // a link it is not instant and the action says so while it runs.
  const [isBundling, setIsBundling] = useState(false)
  const [sharedUrl, setSharedUrl] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  // A session-only graduation overlay, holding *which* track is being
  // celebrated so its own copy can be shown. It appears on the transition into
  // an earned capstone, never just because an already-complete project
  // reloaded.
  const [finaleArcId, setFinaleArcId] = useState<string | null>(null)
  /**
   * The open chopping surface, or nothing. It holds the analysis decode, which
   * is why closing the editor is the moment that memory is given back — and
   * why the region being edited lives here rather than in the document: an
   * abandoned trim must leave the pad exactly as it was.
   */
  const [editor, setEditor] = useState<{
    source: SampleSource
    analysis: AnalysisAudio
    padId: PadLaneId | null
    region: SampleRegion
  } | null>(null)
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
  const samplerSettings = project.instrumentSettings.sampler
  const bpm = project.transport.bpm
  const soloing = Object.values(project.mixer).some((mix) => mix?.soloed)
  // Mirrored so the sampler's handlers can read the current sources and pads
  // without closing over them — a fresh closure is a changed prop, and these
  // are handed to a memoized panel.
  const sourcesRef = useRef(project.sources)
  sourcesRef.current = project.sources
  const samplerRef = useRef(samplerSettings)
  samplerRef.current = samplerSettings

  // Which curriculum track is on screen, and where the user stands on it:
  // their own selection if they stepped off the path, otherwise the first
  // lesson of *that track* still unearned. The other track's place is untouched
  // by any of this — that is the whole of switching without losing your place.
  const activeArc = arcById(project.activeArcId)
  const activeLesson = activeArcLesson(
    activeArc.lessons,
    project.lessonProgress,
    activeLessonIdFor(project, activeArc.id),
  )
  // Memoized because the arc is a fresh array every time it is built, and a
  // fresh array is a changed prop: without this the arc pads would rebuild on
  // every knob move.
  const arcPath = useMemo(
    () => arcEntries(activeArc.lessons, project.lessonProgress, activeLesson.id),
    [activeArc, project.lessonProgress, activeLesson.id],
  )
  const arcDone = arcCompletion(activeArc.lessons, project.lessonProgress)
  // Every track and how far along it the user is — what the selector renders.
  const tracks = useMemo(
    () =>
      ARCS.map((arc) => ({
        id: arc.id,
        title: arc.title,
        blurb: arc.blurb,
        ...arcCompletion(arc.lessons, project.lessonProgress),
      })),
    [project.lessonProgress],
  )
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
  const spotlitPads = useMemo(
    () => (spotlitResting ? [] : spotlitPadIds(activeLesson)),
    [spotlitResting, activeLesson],
  )
  const spotlitTarget = (target: string) =>
    !spotlitResting && spotlightsTarget(activeLesson, target)
  const spotlitSources = spotlitTarget('sampler:sources')

  usePlayhead(deckRef, isPlaying)
  useRoomLight(isPlaying, bpm)

  // Hydrate from IndexedDB once on mount: a returning user gets their saved
  // beat back, a first-time one gets the demo groove so the deck is never
  // silent on the first press of play. Either way the engine's tempo follows
  // the document that won.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [saved, incoming] = await Promise.all([
        loadProjectState(),
        readSharedBeat(window.location.href),
      ])
      if (cancelled) return
      const opening = openingProjectState(saved)
      const next =
        incoming.status === 'ready' ? projectWithSharedBeat(opening, incoming.project) : opening
      if (incoming.status === 'ready') {
        // Every registered track, not only the techno one: a beat can arrive
        // carrying sampling work as readily as it carries a kick pattern.
        inheritedLessonsRef.current = lessonsAlreadyMet(ALL_LESSONS, goalContextFor(next))
      }
      try {
        // Orphans are collected against the user's *own* document, never the
        // preview: a previewed beat is not authoritative, and sweeping against
        // it would delete the recipient's audio rather than the stranded audio.
        // This is the one moment a referencing document is authoritative, which
        // is why the sweep lives here and not at write time.
        await collectUnreferencedAudio(referencedAudio(opening))
        if (cancelled) return
        // Slices only, and no decode: this is the whole startup budget.
        await openAudioFor(next)
      } catch {
        // A storage problem is never a broken app. The deck opens with its
        // pads reading as silent, and every one of them offers a relink.
      }
      if (cancelled) return
      // The document and everything that describes it arrive together, in one
      // transition: a preview strip on screen before the beat it announces
      // would be describing the wrong deck.
      if (incoming.status === 'ready') setSharePreview({ recipientProject: opening })
      else if (incoming.status === 'error') setIncomingShareError(incoming.message)
      setProject(next)
      engine.setBpm(next.transport.bpm)
      setHydrated(true)
    })()
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
    const completion = detectLessonCompletion(
      activeArc.lessons,
      activeLesson,
      lessonCompleted,
      // The whole document, so a goal about the sampler reads the sampler: one
      // builder, because a caller that quietly left half the deck out would
      // make assertions unmeetable rather than fail loudly.
      goalContextFor(project, { motion: paramMotion, chord: chordPlay }),
    )
    if (!completion.justCompleted) {
      // The goal is not met right now, so whatever the shared beat brought
      // with it is gone: from here the lesson is the user's to earn.
      inheritedLessonsRef.current.delete(activeLesson.id)
      return
    }
    // Met, but only because the beat arrived that way — hold the credit.
    if (inheritedLessonsRef.current.has(activeLesson.id)) return
    setProject((p) => updateLessonProgress(p, activeLesson.id, { completed: true }))
    if (completion.showFinale) setFinaleArcId(activeArc.id)
  }, [project, paramMotion, chordPlay, activeArc, activeLesson, lessonCompleted])

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

  // Pad regions and Tune values are read live at each scheduled or performed
  // hit, so edits take effect without rebuilding or restarting the transport.
  useEffect(() => {
    engine.setSamplerSettings(samplerSettings)
  }, [samplerSettings])

  // A file dropped anywhere but a drop target would otherwise navigate the tab
  // to it, taking an unsaved session with it. The deck's own targets stop the
  // event before it reaches here, so this only ever swallows a stray drop.
  useEffect(() => {
    const swallow = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

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
  const handleCycleStep = useCallback((laneId: LaneId, stepIndex: number) => {
    setProject((p) => cycleActivePatternStep(p, laneId, stepIndex))
  }, [])

  const handleToggleMute = useCallback((laneId: LaneId) => {
    setProject((p) => toggleLaneMute(p, laneId))
  }, [])

  const handleToggleSolo = useCallback((laneId: LaneId) => {
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
    setParamMotion((m) => observeParamMotion(m, deckParamSpec(id), value, isPlayingRef.current))
  }, [])

  const handleMasterParamChange = useCallback((id: MasterParamId, value: number) => {
    setProject((p) => setMasterParamValue(p, id, value))
    setParamMotion((m) => observeParamMotion(m, deckParamSpec(id), value, isPlayingRef.current))
  }, [])

  const handleFxParamChange = useCallback((id: FxParamId, value: number) => {
    setProject((p) => setFxParamValue(p, id, value))
    setParamMotion((m) => observeParamMotion(m, deckParamSpec(id), value, isPlayingRef.current))
  }, [])

  const handleSamplerParamChange = useCallback((id: SamplerParamId, value: number) => {
    setProject((p) => setSamplerParamValue(p, id, value))
    setParamMotion((m) => observeParamMotion(m, deckParamSpec(id), value, isPlayingRef.current))
  }, [])

  /**
   * Keep new audio, and say what keeping it cost.
   *
   * Every write goes through the quota policy: a browser out of room gives up
   * sources — never slices — and retries, so the user is only told there is not
   * enough space once that has genuinely failed. What is reported names pads
   * rather than ids, because a pad is the thing the user can act on.
   */
  const keepAudio = useCallback(
    async (
      write: {
        source?: { id: string; bytes: Blob }
        slice?: { key: string; value: Slice; padName: string }
      },
      /**
       * A shared beat being previewed may not spend the recipient's own audio
       * to make room for itself. Eviction is not undoable, and backing out of a
       * preview has to be free.
       */
      { mayEvictSources = true }: { mayEvictSources?: boolean } = {},
    ) => {
      const evicted: string[] = []
      const unsaved: string[] = []
      try {
        if (write.source) {
          // The first moment there is user-created audio worth protecting.
          if (!persistenceRequested.current) {
            persistenceRequested.current = true
            void navigator.storage?.persist?.()
          }
          const outcome = await saveSourceWithinQuota(write.source.id, write.source.bytes)
          evicted.push(...outcome.evicted)
          if (outcome.status === 'saved') {
            const id = write.source.id
            setAudio((held) => ({ ...held, sources: new Set([...held.sources, id]) }))
          }
        }
        if (write.slice) {
          const outcome = await saveSliceWithinQuota(write.slice.key, write.slice.value, {
            mayEvictSources,
          })
          evicted.push(...outcome.evicted)
          if (outcome.status === 'saved') {
            const key = write.slice.key
            setAudio((held) => ({ ...held, slices: new Set([...held.slices, key]) }))
          } else {
            unsaved.push(write.slice.padName)
          }
        }
      } catch {
        if (write.slice) unsaved.push(write.slice.padName)
      }
      // Evicting is housekeeping the user should know about but never hear:
      // those pads keep sounding and lose only the ability to be re-chopped.
      const evictedPads = evicted.flatMap((id) => padsUsingSource(samplerRef.current, id))
      if (unsaved.length > 0) {
        setStorageNotice({
          severity: 'error',
          message: `There is not enough room to keep ${unsaved.join(' and ')}. ${unsaved.length === 1 ? 'It sounds' : 'They sound'} until you reload — delete a source to make space.`,
        })
      } else if (evictedPads.length > 0) {
        setStorageNotice({
          severity: 'info',
          message: `Made room by discarding the original audio behind ${evictedPads.join(' and ')}. ${evictedPads.length === 1 ? 'That pad keeps' : 'Those pads keep'} sounding, but can no longer be re-chopped.`,
        })
      }
      // Sources went, so pads that used them are no longer re-editable.
      if (evicted.length > 0) {
        setAudio((held) => ({
          ...held,
          sources: new Set([...held.sources].filter((id) => !evicted.includes(id))),
        }))
      }
    },
    [],
  )

  const handleDismissStorageNotice = useCallback(() => setStorageNotice(null), [])

  /**
   * Point the engine at exactly the audio a set of pads owns — and at nothing
   * else.
   *
   * Registering is not enough by itself, because a *slice* — not a region — is
   * what decides whether a pad sounds. A deck that **swaps** documents rather
   * than editing one therefore has to take audio away as well as give it:
   * opening a shared beat and backing out of one are both that swap, and
   * without the clear a pad the incoming beat leaves empty goes on playing
   * whatever the outgoing one had put there.
   *
   * The audio arrives as an argument rather than being fetched, because the
   * three callers get it from three places: startup and restore read storage,
   * and a bundle carries its own.
   */
  const soundPads = useCallback((padSlices: Iterable<[PadLaneId, Slice]>) => {
    const owned = new Map(padSlices)
    for (const pad of PAD_LANES) {
      const slice = owned.get(pad.id)
      if (slice) engine.registerSlice(pad.id, slice)
      else engine.clearSlice(pad.id)
    }
  }, [])

  /** Put one stored document's audio on the deck: startup, and backing out. */
  const openAudioFor = useCallback(
    async (state: ProjectState) => {
      try {
        const stored = await loadStoredAudio(state)
        soundPads(stored.padSlices)
        setAudio(stored.available)
      } catch {
        // A storage problem is never a broken app — here it costs the pads
        // whatever they were already sounding, and nothing else.
      }
    },
    [soundPads],
  )

  /**
   * Point a pad at a source. The audio has to be rendered before the document
   * moves: a pad that claimed a sound it could not make would be the silent
   * state EB2-06 models, arrived at by accident rather than by loss.
   */
  const handleAssignSamplerSource = useCallback(
    async (padId: PadLaneId, sourceId: string) => {
      const source = sourcesRef.current.find((candidate) => candidate.id === sourceId)
      if (!source) return
      const region = openingRegionForSource(source)
      const rendered = await engine.commitPadRegion(padId, region)
      if (!rendered) return
      setProject((p) => assignSourceToSamplerPad(p, padId, sourceId))
      await keepAudio({ slice: { key: sliceKey(region), value: rendered, padName: source.name } })
    },
    [keepAudio],
  )

  const handleFitChange = useCallback((padId: PadLaneId, fit: number | null) => {
    setProject((p) => setSamplerPadFit(p, padId, fit))
  }, [])

  /**
   * Open a source in the editor. The analysis decode is reduced-rate mono and
   * is held only while this is open — the residency the two-decode split
   * exists to bound — so it is acquired here and released on close.
   */
  const handleOpenEditor = useCallback(async (sourceId: string, padId: PadLaneId | null) => {
    const source = sourcesRef.current.find((candidate) => candidate.id === sourceId)
    if (!source) return
    const analysis = await engine.openSourceAnalysis(sourceId)
    if (!analysis) {
      setIntakeError(
        `“${source.name}” could not be opened for editing. Your project is unchanged.`,
      )
      return
    }
    // Reopening a pad shows the edges it currently has, so moving one is a
    // correction rather than a redo.
    const existing = padId ? samplerRef.current[padId].region : null
    const region =
      existing && existing.sourceId === sourceId
        ? clampRegionToSource(existing, analysis.duration)
        : // The analysis decode is the authority on how long the audio really
          // is, so the opening window is measured against it rather than the
          // duration the document recorded at intake.
          openingRegionForSource({ ...source, duration: analysis.duration })
    setEditor({ source, analysis, padId, region })
  }, [])

  const handleCloseEditor = useCallback(() => {
    engine.closeSourceAnalysis()
    setEditor(null)
  }, [])

  const handleEditorRegionChange = useCallback((region: SampleRegion) => {
    setEditor((open) => (open ? { ...open, region } : open))
  }, [])

  const handleAudition = useCallback((region: SampleRegion) => {
    engine.auditionRegion(region)
  }, [])

  /**
   * Commit the region to a pad: render the slice first, then move the
   * document. A render that fails leaves the pad sounding exactly what it
   * sounded before.
   */
  const handleCommitRegion = useCallback(
    async (padId: PadLaneId, region: SampleRegion) => {
      const rendered = await engine.commitPadRegion(padId, region)
      if (!rendered) return
      setProject((p) => commitRegionToSamplerPad(p, padId, region))
      engine.closeSourceAnalysis()
      setEditor(null)
      // The chop's audio is kept under the region that made it, so re-chopping
      // writes a new key and leaves the old slice for the sweep to collect.
      await keepAudio({
        slice: {
          key: sliceKey(region),
          value: rendered,
          padName: samplerRef.current[padId].name,
        },
      })
    },
    [keepAudio],
  )

  /**
   * Bring a file in, from the picker or from a drop. Nothing reaches the
   * document until the audio is decoded and registered, so a refusal at any
   * stage leaves the project byte-identical — and the source and its pad
   * arrive in one transition, never as two edits a save could land between.
   */
  const handleLoadFile = useCallback(
    async (
      file: File,
      padId: PadLaneId | null,
      options: IntakeOptions & {
        /** A repair rather than a choice, so the pad keeps the name it wears. */
        relinking?: boolean
      } = {},
    ) => {
      const outcome = await sampleIntake.load(file, options)
      if (outcome.status === 'rejected') {
        setIntakeError(outcome.rejection.message)
        return
      }
      // The bytes are kept so the source can be chopped later; the decode is
      // not. It is the render decode — the feature's peak memory moment — and it
      // is used here to render the pad's opening slice and then dropped.
      engine.registerSourceBytes(outcome.source.id, file)
      const region = openingRegionForSource(outcome.source)
      const rendered =
        padId !== null ? engine.renderPadSlice(padId, outcome.buffer, region) : null
      setIntakeError(null)
      setProject((p) => {
        const withSource = addSource(p, outcome.source)
        if (padId === null) return withSource
        // Relinking is a repair, so the pad keeps the name the user reads on
        // it; a plain assignment is a choice and takes the file's name.
        return options.relinking
          ? relinkSamplerPad(withSource, padId, outcome.source.id)
          : assignSourceToSamplerPad(withSource, padId, outcome.source.id)
      })
      await keepAudio({
        source: { id: outcome.source.id, bytes: file },
        slice: rendered
          ? { key: sliceKey(region), value: rendered, padName: outcome.source.name }
          : undefined,
      })
    },
    [keepAudio],
  )

  /** Point a pad that lost its audio at a file that has it again. */
  const handleRelinkPad = useCallback(
    (file: File, padId: PadLaneId) => handleLoadFile(file, padId, { relinking: true }),
    [handleLoadFile],
  )

  /**
   * Silence the loop, through the state the whole deck reads. Calling
   * `engine.stop()` alone would leave the play control, the playhead and the
   * room light all believing the loop was still running.
   */
  const stopTransport = useCallback(() => {
    if (!isPlayingRef.current) return
    engine.stop()
    setIsPlaying(false)
  }, [])

  /**
   * Move the machine and read back what it became, in one step. A refused
   * transition returns the state it was given *by identity*, which is how a
   * caller tells "this moved" from "this was already there" — the status alone
   * cannot, since a second stop while stopping is refused into `'stopping'`.
   */
  const advanceRecording = useCallback(
    (transition: (state: RecordingState) => RecordingState) => {
      const before = recordingRef.current
      const advanced = transition(before)
      recordingRef.current = advanced
      setRecordingState(advanced)
      return { state: advanced, moved: advanced !== before }
    },
    [],
  )

  /**
   * Ask for the microphone — only here, only because the user chose to, and
   * never at startup. The loop stops first: recording over it would bake the
   * loop into the sample with no way to undo that, and it is also the loudest
   * thing the microphone could be pointed at.
   */
  const handleStartRecording = useCallback(async () => {
    // A second press must not ask the browser for a microphone it is already
    // opening, or already has.
    if (!advanceRecording(requestMicrophone).moved) return
    stopTransport()
    try {
      micSessionRef.current = await openMicrophone()
    } catch (error) {
      // A refusal is a normal, dismissible failure, worded like a refused file
      // — but a microphone that opened and then could not be recorded from is
      // not the user's doing, and must not send them to a permission setting
      // that is already granted.
      advanceRecording(microphoneReleased)
      setIntakeError(
        isRecorderUnavailable(error) ? RECORDING_FAILED_MESSAGE : MICROPHONE_DENIED_MESSAGE,
      )
      return
    }
    advanceRecording((state) => microphoneOpened(state, performance.now()))
  }, [advanceRecording, stopTransport])

  /**
   * Stop, and bring the take in as a source. The recorder is flushed first and
   * the inputs are released in a `finally`, so the browser's own recording
   * indicator goes out whether the take succeeded or failed.
   */
  const handleStopRecording = useCallback(async () => {
    // Read before the transition, so there is no path that reaches "stopping"
    // with nothing to stop — which would leave the indicator claiming a live
    // microphone that nothing would ever release.
    const session = micSessionRef.current
    if (!session) return
    // A second stop must not flush and import the same take twice, which would
    // land it as two sources.
    const { state: stopping, moved } = advanceRecording(stopRequested)
    if (!moved) return

    let captured: Blob
    try {
      captured = await session.finish()
    } catch {
      setIntakeError(RECORDING_FAILED_MESSAGE)
      return
    } finally {
      // Stopped by name rather than dropped by reference: granting permission
      // once must not mean being listened to continuously.
      for (const track of session.tracks) track.stop()
      micSessionRef.current = null
      advanceRecording(microphoneReleased)
    }

    if (captured.size === 0) {
      setIntakeError(EMPTY_RECORDING_MESSAGE)
      return
    }

    // The clock that made the take measured it exactly, so the gate reads that
    // rather than probing the container it happens to have come back in.
    const seconds = elapsedSeconds(stopping, performance.now())
    const name = recordingFileName(sourcesRef.current, captured.type)
    // From here it is a file, and travels the exact path an upload does.
    await handleLoadFile(new File([captured], name, { type: captured.type }), null, {
      origin: 'recording',
      knownDuration: seconds,
    })
  }, [advanceRecording, handleLoadFile])

  /**
   * Reclaim a source. The pads it is under keep their regions and so keep their
   * slices — housekeeping is never audible — and lose only re-editability.
   */
  const handleDeleteSource = useCallback(async (sourceId: string) => {
    setSourceToDelete(null)
    setProject((p) => removeSource(p, sourceId))
    setAudio((held) => ({
      ...held,
      sources: new Set([...held.sources].filter((id) => id !== sourceId)),
    }))
    try {
      await deleteSource(sourceId)
    } catch {
      // The bytes outliving the document is a wasted few megabytes the next
      // load's sweep collects — never a reason to refuse the user's edit.
    }
  }, [])

  const handleDismissIntakeError = useCallback(() => setIntakeError(null), [])

  const handleBpmChange = useCallback((next: number) => {
    setProject((p) => setTransportBpm(p, next))
    engine.setBpm(next)
  }, [])

  const handleTogglePlay = useCallback(async () => {
    if (isPlayingRef.current) {
      stopTransport()
    } else if (isTransportHeld(recordingRef.current)) {
      // Stopping the transport to record would be pointless if the next click
      // put it straight back: the loop would be in the sample, and mic plus
      // speakers plus the master drive is the howl the rule exists to prevent.
      // The two never run together — that is the whole of the feedback rule.
      //
      // Held from the moment the user asks, not from the moment the mic opens:
      // the permission prompt leaves the page interactive, so "not capturing
      // yet" would otherwise be a window in which the loop could be restarted
      // and then recorded the instant the prompt was answered.
    } else {
      await engine.play()
      setIsPlaying(true)
    }
  }, [stopTransport])

  const handleStabAttack = useCallback((source: string, midi: number, velocity?: number) => {
    // Sound first: the note is attacked before any bookkeeping, so watching
    // for a chord never costs the keyboard its latency.
    engine.attackStabNote(source, midi, velocity)
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

  const handlePadAttack = useCallback(
    (inputSourceId: string, padId: PadLaneId, accent?: boolean) => {
      engine.attackPad(inputSourceId, padId, accent)
    },
    [],
  )

  const handlePadRelease = useCallback((inputSourceId: string) => {
    engine.releasePad(inputSourceId)
  }, [])

  /**
   * Carry out what the router decided, through the deck's own live-play
   * handlers rather than straight into the engine.
   *
   * That is the whole of the integration, and it is what makes a MIDI note
   * genuinely indistinguishable from a computer key: the same handlers mean the
   * same hold model, the same on-screen lighting, and a chord played on
   * hardware counting toward the lesson that asks for one.
   */
  const runMidi = useCallback(
    (instructions: readonly MidiInstruction[]) => {
      for (const instruction of instructions) {
        switch (instruction.kind) {
          case 'stabAttack':
            handleStabAttack(instruction.source, instruction.midi, instruction.velocity)
            break
          case 'stabRelease':
            handleStabRelease(instruction.source)
            break
          case 'padAttack':
            handlePadAttack(instruction.source, instruction.padId, instruction.accent)
            break
          case 'padRelease':
            handlePadRelease(instruction.source)
            break
        }
      }
    },
    [handleStabAttack, handleStabRelease, handlePadAttack, handlePadRelease],
  )

  /** Point the deck at a controller, letting go of whatever the last one held. */
  const selectMidiDevice = useCallback(
    (deviceId: string | null) => {
      const previous = selectedDeviceRef.current
      if (previous !== null && previous !== deviceId) {
        // Nothing will ever send those note-offs now, so switching has to be
        // them — the same rule an unplug follows.
        runMidi(midiRouterRef.current.releaseDevice(previous))
      }
      selectedDeviceRef.current = deviceId
      setSelectedDeviceId(deviceId)
    },
    [runMidi],
  )

  /**
   * Ask for MIDI access. Called from the device panel and nowhere else: a
   * permission prompt nobody asked for is not how a deck that is playable on
   * first click should open.
   */
  const handleConnectMidi = useCallback(async () => {
    // A permission prompt leaves the page interactive, so pressing again while
    // one is open must not open a second request — the first session would be
    // replaced without ever being closed, leaving its ports listening.
    if (midiSessionRef.current || midiConnectingRef.current || !isMidiSupported()) return
    midiConnectingRef.current = true
    setMidiConnection({ status: 'connecting' })
    try {
      const session = await openMidiInputs({
        onMessage: (deviceId, data) => {
          // Only the chosen controller plays the deck. A second one sitting on
          // the desk is listened to but not heard, so it cannot join in.
          if (deviceId !== selectedDeviceRef.current) return
          runMidi(midiRouterRef.current.receive(deviceId, data))
        },
        onDevices: (devices) => {
          setMidiConnection({ status: 'ready', devices })
          selectMidiDevice(resolveSelectedDevice(devices, selectedDeviceRef.current))
        },
        onDisconnect: (deviceId) => {
          // The classic stuck note: a controller pulled out mid-note will never
          // send its note-offs, so its disconnect is them.
          runMidi(midiRouterRef.current.releaseDevice(deviceId))
        },
      })
      midiSessionRef.current = session
      setMidiConnection({ status: 'ready', devices: session.devices })
      selectMidiDevice(resolveSelectedDevice(session.devices, selectedDeviceRef.current))
    } catch {
      // A refusal is the user's answer, not a fault. The deck is untouched.
      setMidiConnection({ status: 'refused' })
    } finally {
      midiConnectingRef.current = false
    }
  }, [runMidi, selectMidiDevice])

  const handleSelectMidiDevice = useCallback(
    (deviceId: string) => selectMidiDevice(deviceId),
    [selectMidiDevice],
  )

  // Close the ports when the deck goes away, releasing anything still held.
  // Deliberately not tied to blur or visibility the way computer keys are: a
  // physical key stays down when the tab loses focus, and its note-off is
  // still coming.
  useEffect(
    () => () => {
      const held = selectedDeviceRef.current
      if (held !== null) runMidi(midiRouterRef.current.releaseDevice(held))
      midiSessionRef.current?.close()
      midiSessionRef.current = null
    },
    [runMidi],
  )

  // Which lesson these act on is read back out of the document inside the
  // updater rather than closed over, so they never change identity either.
  const handleDismissLesson = useCallback(() => {
    setProject((p) => {
      const arc = arcById(p.activeArcId)
      const lessonId = activeLessonOf(p).id
      const next = updateLessonProgress(p, lessonId, { dismissed: true })
      if (!next.lessonProgress[lessonId]?.completed) return next
      // Putting away a finished lesson moves the deck on to the next unearned
      // one on *this* track — the celebration is never cut short, and the path
      // keeps its momentum. With the arc finished there is nowhere to move on to.
      const following = nextUnfinishedLessonId(arc.lessons, next.lessonProgress, lessonId)
      return following ? enterLesson(next, arc.id, following) : next
    })
  }, [])

  const handleSelectLesson = useCallback((lessonId: string) => {
    setProject((p) => enterLesson(p, arcById(p.activeArcId).id, lessonId))
  }, [])

  /**
   * Bring the other track on screen. Pure marker movement: neither track's
   * place moves, and nothing about the beat, the patches or the pads is
   * touched — the transport does not even notice.
   */
  const handleSelectArc = useCallback((arcId: string) => {
    setProject((p) => selectArc(p, arcId))
  }, [])

  const handleResumeLesson = useCallback(() => {
    setProject((p) => enterLesson(p, arcById(p.activeArcId).id, activeLessonOf(p).id))
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

  /**
   * Write a bundle: the same payload a link carries, plus the audio a link
   * cannot. Assembly rather than processing — the slices were rendered and
   * persisted when the chops were committed.
   */
  const handleExportBundle = async () => {
    setIsBundling(true)
    setOutgoingShareError(null)
    try {
      const needed = padsNeedingAudio(project.instrumentSettings.sampler)
      const bundle = await createBundle(
        project,
        await loadSlicesFor(needed.map(({ key }) => key)),
      )
      if (bundle.status === 'error') {
        // A pad silent here would be silent there, so this is a file this very
        // build would refuse to open. Better to say so than to write it.
        setOutgoingShareError(bundle.message)
        return
      }
      const href = URL.createObjectURL(bundle.blob)
      const link = document.createElement('a')
      link.href = href
      link.download = bundle.fileName
      link.click()
      // The handle owns a megabyte of audio, so it is given back — but only
      // once the browser has had the click, which it takes synchronously.
      window.setTimeout(() => URL.revokeObjectURL(href), 0)
    } catch {
      setOutgoingShareError(
        'A bundle could not be written in this browser. Your project is still safe.',
      )
    } finally {
      setIsBundling(false)
    }
  }

  /**
   * Open a bundle: the same preview-and-confirm a link gets, because trying
   * someone else's beat must never cost you your own.
   *
   * The audio is registered before the document moves, so a pad never claims a
   * sound it cannot make — and it is written to storage the way an upload's is,
   * which is what lets a kept beat survive a reload. A preview that is backed
   * out of leaves that audio referenced by nothing, and the sweep at next load
   * is what collects it.
   */
  const handleOpenBundle = async (file: File) => {
    setIncomingShareError(null)
    setOutgoingShareError(null)
    let opened
    try {
      opened = await readBundle(await file.arrayBuffer())
    } catch {
      setIncomingShareError(
        'That bundle could not be read from disk. Your saved project is safe.',
      )
      return
    }
    if (opened.status === 'error') {
      setIncomingShareError(opened.message)
      return
    }

    // Whose project to give back on "Back to my project": the one already held
    // if a beat is being previewed, so opening a second bundle cannot lose it.
    const recipientProject = sharePreview?.recipientProject ?? project
    const next = projectWithSharedBeat(recipientProject, opened.project)
    const carried = opened.slices
    const needed = padsNeedingAudio(next.instrumentSettings.sampler)
    soundPads(
      needed.flatMap(({ padId, key }) => {
        const slice = carried.get(key)
        return slice ? [[padId, slice] as [PadLaneId, Slice]] : []
      }),
    )
    // Goals describe what the *user* did, so a beat that arrives already built
    // is inherited rather than earned — exactly as it is through a link.
    // A bundle carries real audio, so without this a recipient would arrive
    // with "build your own kit" already earned — the most obviously unearned
    // completion the product could hand out.
    inheritedLessonsRef.current = lessonsAlreadyMet(ALL_LESSONS, goalContextFor(next))
    setSharePreview({ recipientProject })
    setProject(next)
    engine.setBpm(next.transport.bpm)
    setAudio((held) => ({
      ...held,
      slices: new Set([...held.slices, ...carried.keys()]),
    }))
    for (const { padId, key } of needed) {
      const slice = carried.get(key)
      if (!slice) continue
      await keepAudio(
        {
          slice: { key, value: slice, padName: namedPad(next.instrumentSettings.sampler, padId) },
        },
        // Someone else's beat may not cost the recipient their own sounds to
        // make room for itself — not while they can still hand it back.
        { mayEvictSources: false },
      )
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
    // A bundle put audio on the pads, so giving the document back is only half
    // of it: the sound has to go back too, or the sender's chop keeps playing
    // under the recipient's own beat.
    void openAudioFor(sharePreview.recipientProject)
  }

  const handleDismissIncomingError = () => {
    setIncomingShareError(null)
    removeShareFromAddress()
  }

  // Stable because the modal owns a window listener while mounted; changing
  // this callback would tear that listener down and refocus its button.
  const handleCloseFinale = useCallback(() => setFinaleArcId(null), [])

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
        // Both overlays are real modals: while one is open the deck behind is
        // unreachable, which is what scopes their keys and their focus.
        inert={finaleArcId !== null || editor !== null}
        aria-hidden={finaleArcId !== null || editor !== null || undefined}
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
        isBundling={isBundling}
        sharedUrl={sharedUrl}
        copied={shareCopied}
        // Counted from the pads that landed silent, so a bundle — which carries
        // its audio — says nothing, and a link says exactly what it cost.
        degradedNotice={sharePreview ? sharedAudioNotice(project, audio) : null}
        onShare={handleShare}
        onExportBundle={handleExportBundle}
        onOpenBundle={handleOpenBundle}
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
        tracks={tracks}
        activeArcId={activeArc.id}
        entries={arcPath}
        completed={arcDone.completed}
        total={arcDone.total}
        onSelectArc={handleSelectArc}
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
          heldForRecording={isTransportHeld(recordingState)}
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

      <SamplerPanel
        lanes={pattern.padLanes}
        settings={samplerSettings}
        sources={project.sources}
        audio={audio}
        mixer={project.mixer}
        soloing={soloing}
        spotlitPads={spotlitPads}
        spotlitParams={spotlitParams}
        spotlitSources={spotlitSources}
        intakeError={intakeError}
        storageNotice={storageNotice}
        sourceToDelete={sourceToDelete}
        bpm={bpm}
        recording={recordingState}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onAssign={handleAssignSamplerSource}
        onOpenEditor={handleOpenEditor}
        onFitChange={handleFitChange}
        onLoadFile={handleLoadFile}
        onRelinkPad={handleRelinkPad}
        onAskDeleteSource={setSourceToDelete}
        onDeleteSource={handleDeleteSource}
        onDismissStorageNotice={handleDismissStorageNotice}
        onDismissIntakeError={handleDismissIntakeError}
        onTuneChange={handleSamplerParamChange}
        onAttack={handlePadAttack}
        onRelease={handlePadRelease}
        getSoundingPadIds={engine.getSoundingPadIds}
        onCycleStep={handleCycleStep}
        onToggleMute={handleToggleMute}
        onToggleSolo={handleToggleSolo}
      />

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

      {/* Last on the deck: a setup surface, not an instrument. Putting it here
          keeps it out of the middle of the playing flow a keyboard user tabs
          through to reach the pads and keys. */}
      <MidiPanel
        connection={midiConnection}
        selectedDeviceId={selectedDeviceId}
        onConnect={handleConnectMidi}
        onSelectDevice={handleSelectMidiDevice}
      />
    </main>
      {editor && (
        <RegionEditor
          source={editor.source}
          analysis={editor.analysis}
          region={editor.region}
          padId={editor.padId}
          onRegionChange={handleEditorRegionChange}
          onAudition={handleAudition}
          onCommit={handleCommitRegion}
          onClose={handleCloseEditor}
        />
      )}
      {finaleArcId !== null && (
        <FinaleMoment finale={arcById(finaleArcId).finale} onClose={handleCloseFinale} />
      )}
    </>
  )
}

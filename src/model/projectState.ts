import {
  createBassSettings,
  DEFAULT_BASS_SETTINGS,
  setBassParam,
  type BassParamId,
  type BassSettings,
} from './bass'
import type { LaneMix, Mixer } from './mixer'
import { resizeNoteStep, toggleNoteStep, transposeNoteStep, withNoteLanes } from './note'
import { createDemoPattern, createInitialPattern, cycleStep, withFullKit } from './pattern'
import { clampBpm, DEFAULT_BPM, type TransportSettings } from './transport'
import type { DrumLaneId, NoteLaneId, Pattern } from './types'

/**
 * ProjectState is the single versioned state document (see
 * plans/elevated-bpm-v1.md): the source of truth the UI edits, the payload
 * persisted to IndexedDB, the contract lesson goals evaluate against, and
 * the future URL-sharing/sync document.
 */

// v2 grew the pattern to the full kit; v3 added the per-lane mute/solo mixer;
// v4 added the bass note lane and its synth patch.
export const PROJECT_STATE_VERSION = 4

/** Per-lesson progress; keyed by lesson id in the document. */
export interface LessonProgress {
  completed: boolean
  dismissed: boolean
}

/** Every instrument's patch, keyed by instrument. Stabs join in Phase 6. */
export interface InstrumentSettings {
  bass: BassSettings
}

export interface ProjectState {
  version: number
  patterns: Pattern[]
  activePatternId: string
  transport: TransportSettings
  instrumentSettings: InstrumentSettings
  lessonProgress: Record<string, LessonProgress>
  prefs: Record<string, unknown>
  /** Per-lane mute/solo. Absent lanes are audible and un-soloed. */
  mixer: Mixer
}

export function createInitialProjectState(): ProjectState {
  const pattern = createInitialPattern()
  return {
    version: PROJECT_STATE_VERSION,
    patterns: [pattern],
    activePatternId: pattern.id,
    transport: { bpm: DEFAULT_BPM },
    instrumentSettings: { bass: DEFAULT_BASS_SETTINGS },
    lessonProgress: {},
    prefs: {},
    mixer: {},
  }
}

/**
 * A fresh document pre-loaded with the demo groove, so the very first press
 * of play sounds like techno instead of silence.
 */
export function createDemoProjectState(): ProjectState {
  const pattern = createDemoPattern()
  return { ...createInitialProjectState(), patterns: [pattern], activePatternId: pattern.id }
}

/**
 * The document the deck opens with, given whatever was loaded from storage.
 * The demo seeds genuinely new projects only — a returning user's saved beat
 * comes back exactly as they left it, never overwritten by the starter.
 */
export function openingProjectState(saved: ProjectState | null): ProjectState {
  return saved ?? createDemoProjectState()
}

/** The pattern the deck is editing/playing. The document guarantees it exists. */
export function activePattern(state: ProjectState): Pattern {
  const pattern = state.patterns.find((p) => p.id === state.activePatternId)
  if (!pattern) throw new Error(`ProjectState has no pattern "${state.activePatternId}"`)
  return pattern
}

/** Immutably advance one step of the active pattern (off → on → accent → off). */
export function cycleActivePatternStep(
  state: ProjectState,
  laneId: DrumLaneId,
  stepIndex: number,
): ProjectState {
  return {
    ...state,
    patterns: state.patterns.map((p) =>
      p.id === state.activePatternId ? cycleStep(p, laneId, stepIndex) : p,
    ),
  }
}

/** Immutably apply a note-lane edit to the active pattern. */
function editActivePattern(
  state: ProjectState,
  edit: (pattern: Pattern) => Pattern,
): ProjectState {
  return {
    ...state,
    patterns: state.patterns.map((p) => (p.id === state.activePatternId ? edit(p) : p)),
  }
}

/** Immutably switch one note of the active pattern on or off. */
export function toggleActivePatternNoteStep(
  state: ProjectState,
  laneId: NoteLaneId,
  stepIndex: number,
): ProjectState {
  return editActivePattern(state, (p) => toggleNoteStep(p, laneId, stepIndex))
}

/** Immutably shift one note of the active pattern by semitones. */
export function transposeActivePatternNote(
  state: ProjectState,
  laneId: NoteLaneId,
  stepIndex: number,
  semitones: number,
): ProjectState {
  return editActivePattern(state, (p) => transposeNoteStep(p, laneId, stepIndex, semitones))
}

/** Immutably grow or shrink one note of the active pattern by whole steps. */
export function resizeActivePatternNote(
  state: ProjectState,
  laneId: NoteLaneId,
  stepIndex: number,
  steps: number,
): ProjectState {
  return editActivePattern(state, (p) => resizeNoteStep(p, laneId, stepIndex, steps))
}

/** Immutably set one bass knob in the document, clamped to its range. */
export function setBassParamValue(
  state: ProjectState,
  id: BassParamId,
  value: number,
): ProjectState {
  return {
    ...state,
    instrumentSettings: {
      ...state.instrumentSettings,
      bass: setBassParam(state.instrumentSettings.bass, id, value),
    },
  }
}

/** Immutably set the transport BPM, clamped to the playable range. */
export function setTransportBpm(state: ProjectState, bpm: number): ProjectState {
  return { ...state, transport: { ...state.transport, bpm: clampBpm(bpm) } }
}

const EMPTY_PROGRESS: LessonProgress = { completed: false, dismissed: false }

/** Immutably merge partial progress for one lesson. */
export function updateLessonProgress(
  state: ProjectState,
  lessonId: string,
  progress: Partial<LessonProgress>,
): ProjectState {
  const current = state.lessonProgress[lessonId] ?? EMPTY_PROGRESS
  return {
    ...state,
    lessonProgress: { ...state.lessonProgress, [lessonId]: { ...current, ...progress } },
  }
}

const AUDIBLE: LaneMix = { muted: false, soloed: false }

/** Immutably flip one field of one lane's mixer strip. */
function updateLaneMix(
  state: ProjectState,
  laneId: DrumLaneId,
  patch: Partial<LaneMix>,
): ProjectState {
  const current = state.mixer[laneId] ?? AUDIBLE
  return {
    ...state,
    mixer: { ...state.mixer, [laneId]: { ...current, ...patch } },
  }
}

/** Immutably toggle a lane's mute. */
export function toggleLaneMute(state: ProjectState, laneId: DrumLaneId): ProjectState {
  return updateLaneMix(state, laneId, { muted: !(state.mixer[laneId]?.muted ?? false) })
}

/** Immutably toggle a lane's solo. */
export function toggleLaneSolo(state: ProjectState, laneId: DrumLaneId): ProjectState {
  return updateLaneMix(state, laneId, { soloed: !(state.mixer[laneId]?.soloed ?? false) })
}

/**
 * Migration hook: lift a persisted document of any known version to the
 * current shape. Returns null for unrecognized input so callers fall back to
 * a fresh document instead of crashing on stranded data.
 */
export function migrateProjectState(raw: unknown): ProjectState | null {
  if (raw === null || typeof raw !== 'object') return null
  const doc = raw as { version?: unknown }
  // Each step lifts the document one version; they chain so an ancient save
  // reaches the current shape through the same path a recent one takes.
  if (doc.version === 0) return migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(migrateV0ToV1(doc))))
  if (doc.version === 1) return migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(doc as ProjectStateV1)))
  if (doc.version === 2) return migrateV3ToV4(migrateV2ToV3(doc as ProjectStateV2))
  if (doc.version === 3) return migrateV3ToV4(doc as ProjectStateV3)
  if (doc.version === PROJECT_STATE_VERSION) return raw as ProjectState
  return null
}

/** Fields shared by every document version, before the version-specific bits. */
type ProjectStateBase = Omit<ProjectState, 'version' | 'mixer' | 'instrumentSettings'> & {
  instrumentSettings: Record<string, unknown>
}

/** v0 was the pre-document shape: one bare pattern and a flat bpm. */
interface ProjectStateV0 {
  version: 0
  pattern: Pattern
  bpm: number
}

/** v1 was the document, but patterns carried only the Phase 1 kick lane. */
type ProjectStateV1 = ProjectStateBase & { version: 1 }

/** v2 grew the full kit but had no mixer. */
type ProjectStateV2 = ProjectStateBase & { version: 2 }

/** v3 had the mixer, but patterns were drums-only and no synth was patched. */
type ProjectStateV3 = ProjectStateBase & { version: 3; mixer: Mixer }

function migrateV0ToV1(doc: object): ProjectStateV1 {
  const { pattern, bpm } = doc as ProjectStateV0
  return {
    version: 1,
    patterns: [pattern],
    activePatternId: pattern.id,
    transport: { bpm: clampBpm(bpm) },
    instrumentSettings: {},
    lessonProgress: {},
    prefs: {},
  }
}

function migrateV1ToV2(doc: ProjectStateV1): ProjectStateV2 {
  return { ...doc, version: 2, patterns: doc.patterns.map(withFullKit) }
}

function migrateV2ToV3(doc: ProjectStateV2): ProjectStateV3 {
  return { ...doc, version: 3, mixer: {} }
}

function migrateV3ToV4(doc: ProjectStateV3): ProjectState {
  return {
    ...doc,
    version: 4,
    patterns: doc.patterns.map(withNoteLanes),
    // createBassSettings repairs a partial or out-of-range saved patch, so a
    // hand-edited document can never hand the synth a bad value.
    instrumentSettings: { bass: createBassSettings(doc.instrumentSettings?.bass) },
  }
}

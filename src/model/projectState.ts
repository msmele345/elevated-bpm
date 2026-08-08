import {
  createBassSettings,
  DEFAULT_BASS_SETTINGS,
  setBassParam,
  type BassParamId,
  type BassSettings,
} from './bass'
import {
  createFxSettings,
  DEFAULT_FX_SETTINGS,
  setFxParam,
  type FxParamId,
  type FxSettings,
} from './fx'
import {
  createMasterSettings,
  DEFAULT_MASTER_SETTINGS,
  setMasterParam,
  type MasterParamId,
  type MasterSettings,
} from './master'
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
// v4 added bass; v5 the sequenced stab note lane; v6 remembers which lesson of
// the arc the user is on; v7 added the master-bus macros (filter, drive);
// v8 added the shared FX bus and its per-instrument send levels.
export const PROJECT_STATE_VERSION = 8

/** Per-lesson progress; keyed by lesson id in the document. */
export interface LessonProgress {
  completed: boolean
  dismissed: boolean
}

/** Persisted instrument patches; the Phase 6 stab uses a fixed patch. */
export interface InstrumentSettings {
  bass: BassSettings
  /** The master strip's macro filter and drive across the whole mix. */
  master: MasterSettings
  /** The shared delay/reverb bus and the send level of each instrument into it. */
  fx: FxSettings
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
  /**
   * The lesson of the arc the user stepped into, or null to follow the arc's
   * own order. Persisted so a reload resumes where they were on the path.
   */
  activeLessonId: string | null
}

export function createInitialProjectState(): ProjectState {
  const pattern = createInitialPattern()
  return {
    version: PROJECT_STATE_VERSION,
    patterns: [pattern],
    activePatternId: pattern.id,
    transport: { bpm: DEFAULT_BPM },
    instrumentSettings: {
      bass: DEFAULT_BASS_SETTINGS,
      master: DEFAULT_MASTER_SETTINGS,
      fx: DEFAULT_FX_SETTINGS,
    },
    lessonProgress: {},
    prefs: {},
    mixer: {},
    activeLessonId: null,
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

/** Immutably set one master macro in the document, clamped to its range. */
export function setMasterParamValue(
  state: ProjectState,
  id: MasterParamId,
  value: number,
): ProjectState {
  return {
    ...state,
    instrumentSettings: {
      ...state.instrumentSettings,
      master: setMasterParam(state.instrumentSettings.master, id, value),
    },
  }
}

/** Immutably set one FX control in the document, clamped to its range. */
export function setFxParamValue(
  state: ProjectState,
  id: FxParamId,
  value: number,
): ProjectState {
  return {
    ...state,
    instrumentSettings: {
      ...state.instrumentSettings,
      fx: setFxParam(state.instrumentSettings.fx, id, value),
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

/**
 * Immutably step onto a lesson of the arc (or back onto its path with null).
 * Navigation only ever moves the marker: the pattern, the patch, the transport
 * and earned progress all come through untouched, so entering or leaving a
 * lesson can never cost the user their sandbox.
 */
export function selectLesson(state: ProjectState, lessonId: string | null): ProjectState {
  return { ...state, activeLessonId: lessonId }
}

/**
 * Step into a lesson from the arc: select it and reopen its panel. Completion
 * already earned stays earned — a lesson can be revisited to re-read it
 * without the celebration being taken back.
 */
export function enterLesson(state: ProjectState, lessonId: string): ProjectState {
  return selectLesson(updateLessonProgress(state, lessonId, { dismissed: false }), lessonId)
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
  if (doc.version === 0) {
    return migrateV7ToV8(
      migrateV6ToV7(
        migrateV5ToV6(
          migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(migrateV0ToV1(doc))))),
        ),
      ),
    )
  }
  if (doc.version === 1) {
    return migrateV7ToV8(
      migrateV6ToV7(
        migrateV5ToV6(
          migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(doc as ProjectStateV1)))),
        ),
      ),
    )
  }
  if (doc.version === 2) {
    return migrateV7ToV8(
      migrateV6ToV7(
        migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(doc as ProjectStateV2)))),
      ),
    )
  }
  if (doc.version === 3) {
    return migrateV7ToV8(
      migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(doc as ProjectStateV3)))),
    )
  }
  if (doc.version === 4) {
    return migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(doc as ProjectStateV4))))
  }
  if (doc.version === 5) {
    return migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(doc as ProjectStateV5)))
  }
  if (doc.version === 6) return migrateV7ToV8(migrateV6ToV7(doc as ProjectStateV6))
  if (doc.version === 7) return migrateV7ToV8(doc as ProjectStateV7)
  if (doc.version === PROJECT_STATE_VERSION) return raw as ProjectState
  return null
}

/** Fields shared by every document version, before the version-specific bits. */
type ProjectStateBase = Omit<
  ProjectState,
  'version' | 'mixer' | 'instrumentSettings' | 'activeLessonId'
> & {
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

/** Instrument patches before v7 carried only the bass; the master bus had no macros. */
interface InstrumentSettingsPreV7 {
  bass: BassSettings
}

/** v4 added the bass lane and synth patch, but no stab lane yet. */
type ProjectStateV4 = Omit<
  ProjectState,
  'version' | 'activeLessonId' | 'instrumentSettings'
> & { version: 4; instrumentSettings: InstrumentSettingsPreV7 }

/** v5 had every instrument, but the arc was a fixed order with no place to be on it. */
type ProjectStateV5 = Omit<
  ProjectState,
  'version' | 'activeLessonId' | 'instrumentSettings'
> & { version: 5; instrumentSettings: InstrumentSettingsPreV7 }

/** v6 knew where the user was on the arc, but the main out had no macros yet. */
type ProjectStateV6 = Omit<ProjectState, 'version' | 'instrumentSettings'> & {
  version: 6
  instrumentSettings: InstrumentSettingsPreV7
}

/** Instrument patches before v8 had no FX bus: every voice ran dry to the master. */
type InstrumentSettingsPreV8 = InstrumentSettingsPreV7 & { master: MasterSettings }

/** v7 had the master macros, but no send bus behind them. */
type ProjectStateV7 = Omit<ProjectState, 'version' | 'instrumentSettings'> & {
  version: 7
  instrumentSettings: InstrumentSettingsPreV8
}

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

function migrateV3ToV4(doc: ProjectStateV3): ProjectStateV4 {
  return {
    ...doc,
    version: 4,
    patterns: doc.patterns.map(withNoteLanes),
    // createBassSettings repairs a partial or out-of-range saved patch, so a
    // hand-edited document can never hand the synth a bad value.
    instrumentSettings: { bass: createBassSettings(doc.instrumentSettings?.bass) },
  }
}

function migrateV4ToV5(doc: ProjectStateV4): ProjectStateV5 {
  return {
    ...doc,
    version: 5,
    patterns: doc.patterns.map(withNoteLanes),
  }
}

function migrateV5ToV6(doc: ProjectStateV5): ProjectStateV6 {
  // No selection: a returning user rejoins the arc at the first lesson they
  // have not earned, with everything they had already earned intact.
  return { ...doc, version: 6, activeLessonId: null }
}

function migrateV6ToV7(doc: ProjectStateV6): ProjectStateV7 {
  return {
    ...doc,
    version: 7,
    // createMasterSettings repairs a partial or hand-edited patch the same way
    // the bass migration does — an older document gets the neutral macros.
    instrumentSettings: {
      ...doc.instrumentSettings,
      master: createMasterSettings(
        (doc.instrumentSettings as unknown as Record<string, unknown>).master,
      ),
    },
  }
}

function migrateV7ToV8(doc: ProjectStateV7): ProjectState {
  return {
    ...doc,
    version: 8,
    // Every send closed, exactly as the master macros arrived neutral at v7: an
    // upgraded document has to sound the way its owner left it.
    instrumentSettings: {
      ...doc.instrumentSettings,
      fx: createFxSettings(
        (doc.instrumentSettings as unknown as Record<string, unknown>).fx,
      ),
    },
  }
}

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
import {
  createDemoPattern,
  createInitialPattern,
  cycleStep,
  withFullKit,
  withPadLanes,
} from './pattern'
import {
  CURATED_SAMPLE_SOURCE,
  PAD_LANES,
  SAMPLER_PARAMS,
  assignSourceToPad,
  commitRegionToPad,
  createSamplerSettings,
  relinkPadToSource,
  setPadFit,
  setPadTune,
  withShippedSources,
  type SampleRegion,
  type SampleSource,
  type SamplerParamId,
  type SamplerSettings,
} from './sampler'
import { sliceKey } from './slice'
import { clampBpm, DEFAULT_BPM, type TransportSettings } from './transport'
import type { LaneId, NoteLaneId, PadLaneId, Pattern } from './types'

/**
 * ProjectState is the single versioned state document (see
 * plans/elevated-bpm-v1.md): the source of truth the UI edits, the payload
 * persisted to IndexedDB, the contract lesson goals evaluate against, and
 * the future URL-sharing/sync document.
 */

// v2 grew the pattern to the full kit; v3 added the per-lane mute/solo mixer;
// v4 added bass; v5 the sequenced stab note lane; v6 remembers which lesson of
// the arc the user is on; v7 added the master-bus macros (filter, drive);
// v8 added the shared FX bus and its per-instrument send levels; v9 added the
// sampler's source metadata, pad lanes and pad settings; v10 makes the
// curriculum multi-track — one lesson pointer per arc, plus the arc on screen.
export const PROJECT_STATE_VERSION = 10

/**
 * The arc a document that predates the multi-track curriculum was on.
 *
 * v9 had one path and one pointer, so that pointer can only ever have meant
 * this arc — which is what makes the v9 → v10 migration a lift rather than a
 * guess. The document names arcs by id and knows nothing else about them; the
 * curriculum registry is what resolves one.
 */
export const DEFAULT_ARC_ID = 'techno'

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
  /** Four fixed sampler pads: source region, Tune, future fit target, and name. */
  sampler: SamplerSettings
}

export interface ProjectState {
  version: number
  patterns: Pattern[]
  activePatternId: string
  transport: TransportSettings
  instrumentSettings: InstrumentSettings
  /** Audio-source metadata only; sample bytes live outside this document. */
  sources: SampleSource[]
  lessonProgress: Record<string, LessonProgress>
  prefs: Record<string, unknown>
  /** Per-lane mute/solo. Absent lanes are audible and un-soloed. */
  mixer: Mixer
  /** Which curriculum track is on screen. */
  activeArcId: string
  /**
   * Where the user stands on **each** arc: the lesson they stepped into, or
   * absent to follow that arc's own order.
   *
   * One pointer per arc rather than one overall, because a single pointer
   * cannot hold two places — switching to sampling and back would leave it
   * naming a sampling lesson, which the techno arc would fail to find, and the
   * user's rung would be silently gone. Persisted, so a reload resumes both.
   */
  activeLessonIds: Record<string, string | null>
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
      sampler: createSamplerSettings(),
    },
    sources: [CURATED_SAMPLE_SOURCE],
    lessonProgress: {},
    prefs: {},
    mixer: {},
    activeArcId: DEFAULT_ARC_ID,
    activeLessonIds: {},
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
  laneId: LaneId,
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

/**
 * Take a loaded source into the document. Metadata only — the audio itself is
 * registered with the engine — and deliberately not an edit to the beat: the
 * pattern, the patches and the mixer come through by reference, so bringing a
 * sound in can never disturb what the user has built.
 */
export function addSource(state: ProjectState, source: SampleSource): ProjectState {
  return { ...state, sources: [...state.sources, source] }
}

/**
 * Take a source out of the bank. The pads that used it deliberately keep their
 * regions: a region is what references a slice, and a slice is what makes
 * sound, so reclaiming space costs those pads their re-editability and nothing
 * the user can hear.
 */
export function removeSource(state: ProjectState, sourceId: string): ProjectState {
  return { ...state, sources: state.sources.filter((source) => source.id !== sourceId) }
}

/**
 * Point a pad that lost its audio at a file that has it again. Distinct from
 * assignment because it is a repair rather than a choice: the name the user is
 * reading on that pad — along with its tune, its fit target and its programming
 * — is theirs and survives, so losing a file costs one click and not the beat.
 */
export function relinkSamplerPad(
  state: ProjectState,
  padId: PadLaneId,
  sourceId: string,
): ProjectState {
  const source = state.sources.find((candidate) => candidate.id === sourceId)
  if (!source) return state
  return {
    ...state,
    instrumentSettings: {
      ...state.instrumentSettings,
      sampler: relinkPadToSource(state.instrumentSettings.sampler, padId, source),
    },
  }
}

/** Assign a source already owned by the document to one sampler pad. */
export function assignSourceToSamplerPad(
  state: ProjectState,
  padId: PadLaneId,
  sourceId: string,
): ProjectState {
  const source = state.sources.find((candidate) => candidate.id === sourceId)
  if (!source) return state
  return {
    ...state,
    instrumentSettings: {
      ...state.instrumentSettings,
      sampler: assignSourceToPad(state.instrumentSettings.sampler, padId, source),
    },
  }
}

/**
 * Land a trimmed region on a pad. The region keeps referencing its source
 * rather than copying it, which is what makes a chop re-editable and lets one
 * break supply four pads without being loaded four times.
 */
export function commitRegionToSamplerPad(
  state: ProjectState,
  padId: PadLaneId,
  region: SampleRegion,
): ProjectState {
  const source = state.sources.find((candidate) => candidate.id === region.sourceId)
  if (!source) return state
  return {
    ...state,
    instrumentSettings: {
      ...state.instrumentSettings,
      sampler: commitRegionToPad(state.instrumentSettings.sampler, padId, region, source.name),
    },
  }
}

/**
 * The audio this document lays claim to: a key per pad chop, and every source
 * in the bank.
 *
 * This is the reference set an orphan sweep works from, and it is deliberately
 * computed from the whole document at once — one source legitimately backs
 * several pads, and a source loaded but not yet chopped is still the user's, so
 * neither may be collected by looking at a pad in isolation.
 */
export function referencedAudio(state: ProjectState): {
  sliceKeys: Set<string>
  sourceIds: Set<string>
} {
  const sampler = state.instrumentSettings.sampler
  return {
    sliceKeys: new Set(
      PAD_LANES.flatMap((pad) => {
        const region = sampler[pad.id].region
        return region ? [sliceKey(region)] : []
      }),
    ),
    sourceIds: new Set(state.sources.map((source) => source.id)),
  }
}

/** Immutably set (or clear) one pad's fit-to-steps target in the document. */
export function setSamplerPadFit(
  state: ProjectState,
  padId: PadLaneId,
  fit: number | null,
): ProjectState {
  return {
    ...state,
    instrumentSettings: {
      ...state.instrumentSettings,
      sampler: setPadFit(state.instrumentSettings.sampler, padId, fit),
    },
  }
}

/** Immutably set one uniquely named pad Tune knob in the document. */
export function setSamplerParamValue(
  state: ProjectState,
  id: SamplerParamId,
  value: number,
): ProjectState {
  const padId = SAMPLER_PARAMS.find((param) => param.id === id)!.padId
  return {
    ...state,
    instrumentSettings: {
      ...state.instrumentSettings,
      sampler: setPadTune(state.instrumentSettings.sampler, padId, value),
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

/** Where the user stands on one arc, or null to follow that arc's own order. */
export function activeLessonIdFor(state: ProjectState, arcId: string): string | null {
  return state.activeLessonIds[arcId] ?? null
}

/**
 * Immutably step onto a lesson of one arc (or back onto its path with null).
 * Navigation only ever moves that arc's marker: the pattern, the patch, the
 * transport, the sampler and earned progress all come through untouched, so
 * entering or leaving a lesson can never cost the user their sandbox — and the
 * other arc's marker is left exactly where they parked it.
 */
export function selectLesson(
  state: ProjectState,
  arcId: string,
  lessonId: string | null,
): ProjectState {
  return { ...state, activeLessonIds: { ...state.activeLessonIds, [arcId]: lessonId } }
}

/**
 * Immutably bring one curriculum track on screen. Pure marker movement like
 * lesson selection — and it deliberately does not touch either arc's pointer,
 * which is the whole of "switch paths without losing my place in either".
 */
export function selectArc(state: ProjectState, arcId: string): ProjectState {
  return { ...state, activeArcId: arcId }
}

/**
 * Step into a lesson from an arc: bring that track on screen, select the
 * lesson and reopen its panel. Completion already earned stays earned — a
 * lesson can be revisited to re-read it without the celebration being taken
 * back.
 */
export function enterLesson(
  state: ProjectState,
  arcId: string,
  lessonId: string,
): ProjectState {
  return selectArc(
    selectLesson(updateLessonProgress(state, lessonId, { dismissed: false }), arcId, lessonId),
    arcId,
  )
}

const AUDIBLE: LaneMix = { muted: false, soloed: false }

/** Immutably flip one field of one lane's mixer strip. */
function updateLaneMix(
  state: ProjectState,
  laneId: LaneId,
  patch: Partial<LaneMix>,
): ProjectState {
  const current = state.mixer[laneId] ?? AUDIBLE
  return {
    ...state,
    mixer: { ...state.mixer, [laneId]: { ...current, ...patch } },
  }
}

/** Immutably toggle a lane's mute. */
export function toggleLaneMute(state: ProjectState, laneId: LaneId): ProjectState {
  return updateLaneMix(state, laneId, { muted: !(state.mixer[laneId]?.muted ?? false) })
}

/** Immutably toggle a lane's solo. */
export function toggleLaneSolo(state: ProjectState, laneId: LaneId): ProjectState {
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
  switch (doc.version) {
    case 0:
      return migrateProjectState(migrateV0ToV1(doc))
    case 1:
      return migrateProjectState(migrateV1ToV2(doc as ProjectStateV1))
    case 2:
      return migrateProjectState(migrateV2ToV3(doc as ProjectStateV2))
    case 3:
      return migrateProjectState(migrateV3ToV4(doc as ProjectStateV3))
    case 4:
      return migrateProjectState(migrateV4ToV5(doc as ProjectStateV4))
    case 5:
      return migrateProjectState(migrateV5ToV6(doc as ProjectStateV5))
    case 6:
      return migrateProjectState(migrateV6ToV7(doc as ProjectStateV6))
    case 7:
      return migrateProjectState(migrateV7ToV8(doc as ProjectStateV7))
    case 8:
      return migrateProjectState(migrateV8ToV9(doc as ProjectStateV8))
    case 9:
      return migrateV9ToV10(doc as ProjectStateV9)
    case PROJECT_STATE_VERSION:
      return raw as ProjectState
    default:
      return null
  }
}

/**
 * The one lesson pointer every document before v10 carried, and the fields
 * shared by every version before the version-specific bits.
 */
type SingleArcPointer = { activeLessonId: string | null }

type ProjectStateBase = Omit<
  ProjectState,
  'version' | 'mixer' | 'instrumentSettings' | 'activeArcId' | 'activeLessonIds' | 'sources'
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

/** Every version up to v9 carried one arc's worth of state, hence one pointer. */
type SingleArcProjectState = Omit<
  ProjectState,
  'version' | 'instrumentSettings' | 'sources' | 'activeArcId' | 'activeLessonIds'
> &
  SingleArcPointer

/** v4 added the bass lane and synth patch, but no stab lane yet. */
type ProjectStateV4 = Omit<SingleArcProjectState, 'activeLessonId'> & {
  version: 4
  instrumentSettings: InstrumentSettingsPreV7
}

/** v5 had every instrument, but the arc was a fixed order with no place to be on it. */
type ProjectStateV5 = Omit<SingleArcProjectState, 'activeLessonId'> & {
  version: 5
  instrumentSettings: InstrumentSettingsPreV7
}

/** v6 knew where the user was on the arc, but the main out had no macros yet. */
type ProjectStateV6 = SingleArcProjectState & {
  version: 6
  instrumentSettings: InstrumentSettingsPreV7
}

/** Instrument patches before v8 had no FX bus: every voice ran dry to the master. */
type InstrumentSettingsPreV8 = InstrumentSettingsPreV7 & { master: MasterSettings }

/** v7 had the master macros, but no send bus behind them. */
type ProjectStateV7 = SingleArcProjectState & {
  version: 7
  instrumentSettings: InstrumentSettingsPreV8
}

/** v8 had the complete FX patch, but no sampler document fields yet. */
type InstrumentSettingsPreV9 = Omit<InstrumentSettings, 'sampler'>
type ProjectStateV8 = SingleArcProjectState & {
  version: 8
  instrumentSettings: InstrumentSettingsPreV9
}

/** v9 had the whole sampler, but one curriculum path and so one pointer. */
type ProjectStateV9 = SingleArcProjectState & {
  version: 9
  instrumentSettings: InstrumentSettings
  sources: SampleSource[]
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

function migrateV7ToV8(doc: ProjectStateV7): ProjectStateV8 {
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

function migrateV8ToV9(doc: ProjectStateV8): ProjectStateV9 {
  return {
    ...doc,
    version: 9,
    patterns: doc.patterns.map(withPadLanes),
    sources: [CURATED_SAMPLE_SOURCE],
    instrumentSettings: {
      ...doc.instrumentSettings,
      fx: createFxSettings(doc.instrumentSettings.fx),
      sampler: createSamplerSettings(
        (doc.instrumentSettings as unknown as Record<string, unknown>).sampler,
      ),
    },
  }
}

function migrateV9ToV10(doc: ProjectStateV9): ProjectState {
  const { activeLessonId, ...rest } = doc
  return {
    ...rest,
    version: 10,
    // The one pointer v9 had could only ever have meant the techno arc, so it
    // lifts into that slot: a returning user resumes on exactly the rung they
    // were on, and the sampling arc starts on its own path.
    activeArcId: DEFAULT_ARC_ID,
    // A document naming no lesson carries no key: "follow the path" is the
    // absence of a pointer, and a fresh document says it the same way.
    activeLessonIds: activeLessonId ? { [DEFAULT_ARC_ID]: activeLessonId } : {},
    // The curated source became a break in this slice. Only shipped sources are
    // ever retired — the user's own bank is theirs.
    sources: withShippedSources(doc.sources ?? []),
  }
}

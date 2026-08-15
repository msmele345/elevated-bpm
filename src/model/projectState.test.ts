import { describe, expect, it } from 'vitest'
import { BASS_PARAMS, DEFAULT_BASS_SETTINGS } from './bass'
import { DEFAULT_FX_SETTINGS, FX_PARAMS } from './fx'
import { DEFAULT_MASTER_SETTINGS, MASTER_PARAMS } from './master'
import { DEFAULT_PITCH, MIN_NOTE_LENGTH, STAB_DEFAULT_PITCH } from './note'
import { createDemoPattern, createInitialPattern } from './pattern'
import {
  CURATED_SAMPLE_SOURCE,
  createSamplerSettings,
  samplerParamForPad,
} from './sampler'
import { DEFAULT_BPM } from './transport'
import {
  DEFAULT_ARC_ID,
  activeLessonIdFor,
  activePattern,
  addSource,
  selectArc,
  assignSourceToSamplerPad,
  commitRegionToSamplerPad,
  referencedAudio,
  relinkSamplerPad,
  removeSource,
  setSamplerPadFit,
  createInitialProjectState,
  openingProjectState,
  PROJECT_STATE_VERSION,
  migrateProjectState,
  resizeActivePatternNote,
  setBassParamValue,
  setFxParamValue,
  setMasterParamValue,
  setSamplerParamValue,
  setTransportBpm,
  cycleActivePatternStep,
  enterLesson,
  selectLesson,
  toggleActivePatternNoteStep,
  toggleLaneMute,
  toggleLaneSolo,
  transposeActivePatternNote,
  updateLessonProgress,
} from './projectState'

describe('createInitialProjectState', () => {
  it('creates a current-version document with one active pattern and default transport', () => {
    const state = createInitialProjectState()
    expect(state.version).toBe(PROJECT_STATE_VERSION)
    expect(state.patterns).toHaveLength(1)
    expect(state.activePatternId).toBe(state.patterns[0].id)
    expect(state.transport.bpm).toBe(DEFAULT_BPM)
    expect(state.lessonProgress).toEqual({})
    expect(state.instrumentSettings).toEqual({
      bass: DEFAULT_BASS_SETTINGS,
      master: DEFAULT_MASTER_SETTINGS,
      fx: DEFAULT_FX_SETTINGS,
      sampler: createSamplerSettings(),
    })
    expect(state.sources).toEqual([CURATED_SAMPLE_SOURCE])
    expect(state.prefs).toEqual({})
    // No lesson picked yet: the document follows the arc's own path until the
    // user steps off it.
    expect(activeLessonIdFor(state, DEFAULT_ARC_ID)).toBeNull()
    expect(state.activeArcId).toBe(DEFAULT_ARC_ID)
  })
})

describe('selectLesson', () => {
  it('records which lesson the user stepped into, immutably', () => {
    const state = createInitialProjectState()
    const selected = selectLesson(state, DEFAULT_ARC_ID, 'filter-sweep')

    expect(activeLessonIdFor(selected, DEFAULT_ARC_ID)).toBe('filter-sweep')
    expect(activeLessonIdFor(state, DEFAULT_ARC_ID)).toBeNull()
  })

  it('leaves the pattern, transport, and progress alone — navigation is not an edit', () => {
    const sandbox = setTransportBpm(
      cycleActivePatternStep(createInitialProjectState(), 'kick', 4),
      137,
    )
    const selected = selectLesson(sandbox, DEFAULT_ARC_ID, 'stab-chord')

    expect(selected.patterns).toBe(sandbox.patterns)
    expect(selected.transport).toBe(sandbox.transport)
    expect(selected.lessonProgress).toBe(sandbox.lessonProgress)
    expect(selected.instrumentSettings).toBe(sandbox.instrumentSettings)
    expect(selected.sources).toBe(sandbox.sources)
    expect(selected.mixer).toBe(sandbox.mixer)
  })

  it('hands the path back when the selection is cleared', () => {
    const selected = selectLesson(createInitialProjectState(), DEFAULT_ARC_ID, 'filter-sweep')
    expect(activeLessonIdFor(selectLesson(selected, DEFAULT_ARC_ID, null), DEFAULT_ARC_ID))
      .toBeNull()
  })

  it('keeps each arc its own place, so leaving one and coming back finds it unmoved', () => {
    // One pointer cannot hold two places: with a single activeLessonId,
    // switching to sampling would leave it naming a sampling lesson, the techno
    // arc would fail to find it, and the user's rung would be silently gone.
    const state = selectLesson(
      selectLesson(createInitialProjectState(), DEFAULT_ARC_ID, 'filter-sweep'),
      'sampling',
      'trim-it-tight',
    )

    expect(activeLessonIdFor(state, DEFAULT_ARC_ID)).toBe('filter-sweep')
    expect(activeLessonIdFor(state, 'sampling')).toBe('trim-it-tight')
  })
})

describe('selectArc', () => {
  it('names which track is on screen without disturbing either place on it', () => {
    const state = selectLesson(
      selectLesson(createInitialProjectState(), DEFAULT_ARC_ID, 'filter-sweep'),
      'sampling',
      'trim-it-tight',
    )
    const switched = selectArc(state, 'sampling')

    expect(switched.activeArcId).toBe('sampling')
    expect(activeLessonIdFor(switched, DEFAULT_ARC_ID)).toBe('filter-sweep')
    expect(activeLessonIdFor(switched, 'sampling')).toBe('trim-it-tight')
  })

  it('leaves the whole sandbox by reference — switching tracks is not an edit', () => {
    const sandbox = setTransportBpm(
      cycleActivePatternStep(createInitialProjectState(), 'kick', 4),
      137,
    )
    const switched = selectArc(sandbox, 'sampling')

    expect(switched.patterns).toBe(sandbox.patterns)
    expect(switched.instrumentSettings).toBe(sandbox.instrumentSettings)
    expect(switched.sources).toBe(sandbox.sources)
    expect(switched.mixer).toBe(sandbox.mixer)
    expect(switched.transport).toBe(sandbox.transport)
    expect(switched.lessonProgress).toBe(sandbox.lessonProgress)
  })
})

describe('enterLesson', () => {
  it('selects a lesson and reopens it, so a lesson put away can be resumed', () => {
    const dismissed = updateLessonProgress(createInitialProjectState(), 'filter-sweep', {
      dismissed: true,
    })
    const entered = enterLesson(dismissed, DEFAULT_ARC_ID, 'filter-sweep')

    expect(activeLessonIdFor(entered, DEFAULT_ARC_ID)).toBe('filter-sweep')
    expect(entered.lessonProgress['filter-sweep'].dismissed).toBe(false)
  })

  it('brings the track it belongs to on screen with it', () => {
    const entered = enterLesson(createInitialProjectState(), 'sampling', 'trim-it-tight')

    expect(entered.activeArcId).toBe('sampling')
    expect(activeLessonIdFor(entered, 'sampling')).toBe('trim-it-tight')
  })

  it('keeps a lesson already earned marked complete when the user comes back to it', () => {
    const earned = updateLessonProgress(createInitialProjectState(), 'four-on-the-floor', {
      completed: true,
      dismissed: true,
    })
    const entered = enterLesson(earned, DEFAULT_ARC_ID, 'four-on-the-floor')

    expect(entered.lessonProgress['four-on-the-floor']).toEqual({
      completed: true,
      dismissed: false,
    })
  })

  it('never disturbs the sandbox', () => {
    const sandbox = setBassParamValue(
      cycleActivePatternStep(createInitialProjectState(), 'kick', 0),
      'cutoff',
      2400,
    )
    const entered = enterLesson(sandbox, DEFAULT_ARC_ID, 'stab-hits')

    expect(entered.patterns).toBe(sandbox.patterns)
    expect(entered.instrumentSettings).toBe(sandbox.instrumentSettings)
    expect(entered.mixer).toBe(sandbox.mixer)
    expect(entered.sources).toBe(sandbox.sources)
  })
})

describe('openingProjectState', () => {
  it('seeds the demo groove when nothing is saved', () => {
    const opening = openingProjectState(null)
    expect(opening.version).toBe(PROJECT_STATE_VERSION)
    expect(activePattern(opening)).toEqual(createDemoPattern())
    expect(opening.lessonProgress).toEqual({})
  })

  it('returns a saved document untouched — a returning beat is never replaced', () => {
    const saved = cycleActivePatternStep(createInitialProjectState(), 'kick', 3)
    expect(openingProjectState(saved)).toBe(saved)
  })
})

describe('cycleActivePatternStep', () => {
  it('toggles a step of the active pattern immutably through the document', () => {
    const state = createInitialProjectState()
    const next = cycleActivePatternStep(state, 'kick', 4)
    expect(activePattern(next).lanes[0].steps[4].on).toBe(true)
    expect(activePattern(state).lanes[0].steps[4].on).toBe(false)
    expect(next).not.toBe(state)
  })

  it('cycles a pad step through the same document boundary as a drum step', () => {
    const state = createInitialProjectState()
    const next = cycleActivePatternStep(state, 'pad4', 9)

    expect(activePattern(next).padLanes.find((lane) => lane.id === 'pad4')!.steps[9]).toEqual({
      on: true,
      accent: false,
    })
    expect(activePattern(next).lanes).toBe(activePattern(state).lanes)
  })
})

describe('sampler editing', () => {
  it('assigns the curated source to one pad as a whole-source region', () => {
    const state = createInitialProjectState()
    const assigned = assignSourceToSamplerPad(state, 'pad1', CURATED_SAMPLE_SOURCE.id)

    expect(assigned.instrumentSettings.sampler.pad1).toEqual({
      region: {
        sourceId: CURATED_SAMPLE_SOURCE.id,
        start: 0,
        duration: CURATED_SAMPLE_SOURCE.duration,
      },
      tune: 0,
      fit: null,
      name: CURATED_SAMPLE_SOURCE.name,
    })
    expect(assigned.sources).toBe(state.sources)
    expect(state.instrumentSettings.sampler.pad1.region).toBeNull()
  })

  it('ignores an assignment for a source the project does not have', () => {
    const state = createInitialProjectState()
    expect(assignSourceToSamplerPad(state, 'pad2', 'missing-source')).toBe(state)
  })

  it('takes in a loaded source beside the shipped one, disturbing nothing else', () => {
    const state = createInitialProjectState()
    const uploaded = {
      id: 'upload-1',
      name: 'Warehouse Break',
      origin: 'upload' as const,
      duration: 4.02,
      channels: 2,
    }

    const withSource = addSource(state, uploaded)

    expect(withSource.sources).toEqual([CURATED_SAMPLE_SOURCE, uploaded])
    // Loading a sound is not an edit to the beat: a rejected or accepted load
    // must leave the pattern, the patches and the mixer exactly as they were.
    expect(activePattern(withSource)).toBe(activePattern(state))
    expect(withSource.instrumentSettings).toBe(state.instrumentSettings)
    expect(withSource.mixer).toBe(state.mixer)
    expect(state.sources).toEqual([CURATED_SAMPLE_SOURCE])
  })

  it('references every pad chop and every source in the bank', () => {
    // What the sweep keeps. One source legitimately backs several pads, and a
    // source loaded but not yet chopped is still the user's — neither may be
    // collected as an orphan.
    const uploaded = {
      id: 'upload-1',
      name: 'Warehouse Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    const state = commitRegionToSamplerPad(
      commitRegionToSamplerPad(addSource(createInitialProjectState(), uploaded), 'pad1', {
        sourceId: 'upload-1',
        start: 0,
        duration: 0.5,
      }),
      'pad2',
      { sourceId: 'upload-1', start: 2, duration: 0.5 },
    )

    expect(referencedAudio(state)).toEqual({
      sliceKeys: new Set(['upload-1|0|0.5', 'upload-1|2|0.5']),
      sourceIds: new Set([CURATED_SAMPLE_SOURCE.id, 'upload-1']),
    })
  })

  it('lets a source go while every pad it is under keeps its chop', () => {
    // Housekeeping is never audible: the pads lose re-editability, not sound,
    // so their regions stay and keep their slices referenced.
    const uploaded = {
      id: 'upload-1',
      name: 'Warehouse Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    const state = commitRegionToSamplerPad(
      addSource(createInitialProjectState(), uploaded),
      'pad1',
      { sourceId: 'upload-1', start: 0, duration: 0.5 },
    )

    const removed = removeSource(state, 'upload-1')

    expect(removed.sources).toEqual([CURATED_SAMPLE_SOURCE])
    expect(removed.instrumentSettings.sampler.pad1.region).toEqual({
      sourceId: 'upload-1',
      start: 0,
      duration: 0.5,
    })
    expect(referencedAudio(removed).sliceKeys).toEqual(new Set(['upload-1|0|0.5']))
    expect(activePattern(removed)).toBe(activePattern(state))
  })

  it('relinks a silent pad to new audio, keeping the name the user gave it', () => {
    // Losing a file costs one click, not the beat: the pad comes back with its
    // name, its tune, its fit target and its programming intact.
    const state = setSamplerPadFit(
      setSamplerParamValue(
        commitRegionToSamplerPad(createInitialProjectState(), 'pad2', {
          sourceId: 'gone',
          start: 0,
          duration: 0.5,
        }),
        samplerParamForPad('pad2').id,
        7,
      ),
      'pad2',
      4,
    )
    const replacement = {
      id: 'upload-2',
      name: 'Some other file.wav',
      origin: 'upload' as const,
      duration: 1,
      channels: 1,
    }

    const relinked = relinkSamplerPad(addSource(state, replacement), 'pad2', 'upload-2')

    expect(relinked.instrumentSettings.sampler.pad2).toEqual({
      region: { sourceId: 'upload-2', start: 0, duration: 1 },
      tune: 7,
      fit: 4,
      name: state.instrumentSettings.sampler.pad2.name,
    })
    expect(activePattern(relinked)).toBe(activePattern(state))
  })

  it('stores a pad Tune knob value without changing its pattern or sibling pads', () => {
    const state = createInitialProjectState()
    const tuned = setSamplerParamValue(state, samplerParamForPad('pad3').id, 12)

    expect(tuned.instrumentSettings.sampler.pad3.tune).toBe(12)
    expect(tuned.instrumentSettings.sampler.pad2).toBe(state.instrumentSettings.sampler.pad2)
    expect(activePattern(tuned)).toBe(activePattern(state))
  })
})

describe('bass note editing', () => {
  function bassSteps(state: ReturnType<typeof createInitialProjectState>) {
    return activePattern(state).noteLanes.find((lane) => lane.id === 'bass')!.steps
  }

  it('toggles a bass note of the active pattern immutably through the document', () => {
    const state = createInitialProjectState()
    const next = toggleActivePatternNoteStep(state, 'bass', 4)

    expect(bassSteps(next)[4]).toEqual({
      on: true,
      pitch: DEFAULT_PITCH,
      length: MIN_NOTE_LENGTH,
    })
    expect(bassSteps(state)[4].on).toBe(false)
  })

  it('transposes and resizes a note through the document', () => {
    const state = toggleActivePatternNoteStep(createInitialProjectState(), 'bass', 0)
    const shaped = resizeActivePatternNote(transposeActivePatternNote(state, 'bass', 0, 4), 'bass', 0, 1)

    expect(bassSteps(shaped)[0].pitch).toBe(DEFAULT_PITCH + 4)
    expect(bassSteps(shaped)[0].length).toBe(MIN_NOTE_LENGTH + 1)
  })

  it('leaves the drum lanes of the pattern untouched', () => {
    const state = cycleActivePatternStep(createInitialProjectState(), 'kick', 0)
    const next = toggleActivePatternNoteStep(state, 'bass', 8)

    expect(activePattern(next).lanes[0].steps[0].on).toBe(true)
  })
})

describe('setBassParamValue', () => {
  it('stores a knob value in instrumentSettings, clamped, without touching the pattern', () => {
    const state = createInitialProjectState()
    const swept = setBassParamValue(state, 'cutoff', 2400)

    expect(swept.instrumentSettings.bass.cutoff).toBe(2400)
    expect(swept.instrumentSettings.bass.resonance).toBe(DEFAULT_BASS_SETTINGS.resonance)
    expect(activePattern(swept)).toBe(activePattern(state))
    expect(state.instrumentSettings.bass.cutoff).toBe(DEFAULT_BASS_SETTINGS.cutoff)

    const resonance = BASS_PARAMS.find((param) => param.id === 'resonance')!
    expect(setBassParamValue(state, 'resonance', 1e6).instrumentSettings.bass.resonance).toBe(
      resonance.max,
    )
  })
})

describe('setMasterParamValue', () => {
  it('stores a macro value in instrumentSettings, clamped, without touching the bass patch', () => {
    const state = createInitialProjectState()
    const closed = setMasterParamValue(state, 'filter', 640)

    expect(closed.instrumentSettings.master.filter).toBe(640)
    expect(closed.instrumentSettings.master.drive).toBe(DEFAULT_MASTER_SETTINGS.drive)
    expect(closed.instrumentSettings.bass).toBe(state.instrumentSettings.bass)
    expect(activePattern(closed)).toBe(activePattern(state))
    expect(state.instrumentSettings.master.filter).toBe(DEFAULT_MASTER_SETTINGS.filter)

    const drive = MASTER_PARAMS.find((param) => param.id === 'drive')!
    expect(setMasterParamValue(state, 'drive', 1e6).instrumentSettings.master.drive).toBe(
      drive.max,
    )
  })
})

describe('setFxParamValue', () => {
  it('stores an FX value in instrumentSettings, clamped, without touching the other patches', () => {
    const state = createInitialProjectState()
    const sent = setFxParamValue(state, 'stabSend', 55)

    expect(sent.instrumentSettings.fx.stabSend).toBe(55)
    expect(sent.instrumentSettings.fx.drumSend).toBe(DEFAULT_FX_SETTINGS.drumSend)
    expect(sent.instrumentSettings.bass).toBe(state.instrumentSettings.bass)
    expect(sent.instrumentSettings.master).toBe(state.instrumentSettings.master)
    expect(activePattern(sent)).toBe(activePattern(state))
    expect(state.instrumentSettings.fx.stabSend).toBe(DEFAULT_FX_SETTINGS.stabSend)

    const feedback = FX_PARAMS.find((param) => param.id === 'feedback')!
    expect(setFxParamValue(state, 'feedback', 1e6).instrumentSettings.fx.feedback).toBe(
      feedback.max,
    )
  })
})

describe('mixer', () => {
  it('starts with an empty mixer — every lane audible', () => {
    expect(createInitialProjectState().mixer).toEqual({})
  })

  it('toggles a lane mute immutably in the document', () => {
    const state = createInitialProjectState()
    const muted = toggleLaneMute(state, 'closedHat')
    expect(muted.mixer.closedHat).toEqual({ muted: true, soloed: false })
    expect(state.mixer.closedHat).toBeUndefined()

    const unmuted = toggleLaneMute(muted, 'closedHat')
    expect(unmuted.mixer.closedHat?.muted).toBe(false)
  })

  it('toggles a lane solo without clearing its mute flag', () => {
    const state = toggleLaneMute(createInitialProjectState(), 'kick')
    const soloed = toggleLaneSolo(state, 'kick')
    expect(soloed.mixer.kick).toEqual({ muted: true, soloed: true })
  })

  it('stores pad mute and solo in the same mixer as the kit', () => {
    const state = toggleLaneMute(createInitialProjectState(), 'pad2')
    const soloed = toggleLaneSolo(state, 'pad2')

    expect(soloed.mixer.pad2).toEqual({ muted: true, soloed: true })
  })
})

describe('setTransportBpm', () => {
  it('sets the bpm immutably and clamps to the transport range', () => {
    const state = createInitialProjectState()
    expect(setTransportBpm(state, 142).transport.bpm).toBe(142)
    expect(setTransportBpm(state, 10_000).transport.bpm).toBe(200)
    expect(setTransportBpm(state, 1).transport.bpm).toBe(60)
    expect(state.transport.bpm).toBe(DEFAULT_BPM)
  })
})

describe('updateLessonProgress', () => {
  it('merges partial progress for one lesson without touching others', () => {
    const state = createInitialProjectState()
    const completed = updateLessonProgress(state, 'four-on-the-floor', { completed: true })
    expect(completed.lessonProgress['four-on-the-floor']).toEqual({
      completed: true,
      dismissed: false,
    })

    const dismissed = updateLessonProgress(completed, 'four-on-the-floor', { dismissed: true })
    expect(dismissed.lessonProgress['four-on-the-floor']).toEqual({
      completed: true,
      dismissed: true,
    })
    expect(state.lessonProgress).toEqual({})
  })
})

describe('migrateProjectState', () => {
  it('returns a current-version document unchanged', () => {
    const state = updateLessonProgress(
      setTransportBpm(cycleActivePatternStep(createInitialProjectState(), 'kick', 0), 137),
      'four-on-the-floor',
      { completed: true },
    )
    const roundTripped = migrateProjectState(JSON.parse(JSON.stringify(state)))
    expect(roundTripped).toEqual(state)
  })

  it('migrates a v0 document (single pattern + flat bpm) to the current shape', () => {
    const pattern = createInitialPattern()
    const migrated = migrateProjectState({ version: 0, pattern, bpm: 125 })
    expect(migrated).toEqual({
      version: PROJECT_STATE_VERSION,
      patterns: [pattern],
      activePatternId: pattern.id,
      transport: { bpm: 125 },
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
    })
  })

  it('lifts a v9 document’s single lesson pointer into the techno track', () => {
    // v9 had one path and one pointer, so that pointer can only ever have meant
    // the techno arc. A returning user has to resume on exactly that rung.
    const v9 = JSON.parse(
      JSON.stringify({
        ...updateLessonProgress(
          setTransportBpm(cycleActivePatternStep(createInitialProjectState(), 'kick', 4), 126),
          'four-on-the-floor',
          { completed: true, dismissed: true },
        ),
        version: 9,
      }),
    ) as Record<string, unknown>
    delete v9.activeArcId
    delete v9.activeLessonIds
    v9.activeLessonId = 'filter-sweep'

    const migrated = migrateProjectState(v9)!

    expect(migrated.version).toBe(PROJECT_STATE_VERSION)
    expect(migrated.activeArcId).toBe(DEFAULT_ARC_ID)
    expect(activeLessonIdFor(migrated, DEFAULT_ARC_ID)).toBe('filter-sweep')
    expect(activeLessonIdFor(migrated, 'sampling')).toBeNull()
    // Everything earned, and the beat itself, come through untouched.
    expect(migrated.lessonProgress['four-on-the-floor']).toEqual({
      completed: true,
      dismissed: true,
    })
    expect(migrated.transport.bpm).toBe(126)
    expect(migrated.patterns[0].lanes.find((lane) => lane.id === 'kick')!.steps[4].on).toBe(true)
  })

  it('retires a shipped source a v9 document still names, keeping the user’s own', () => {
    // The curated source became a break in this slice. A pad still pointing at
    // the retired one keeps its region and goes on sounding; it loses only the
    // ability to be re-chopped, which is the modelled sourceMissing state.
    const mine = {
      id: 'mine',
      name: 'My Break',
      origin: 'upload' as const,
      duration: 2,
      channels: 2,
    }
    const v9 = JSON.parse(
      JSON.stringify({ ...createInitialProjectState(), version: 9 }),
    ) as Record<string, unknown>
    delete v9.activeArcId
    delete v9.activeLessonIds
    v9.activeLessonId = null
    v9.sources = [
      { id: 'curated-warehouse-perc', name: 'Warehouse Perc', origin: 'shipped', duration: 0.25, channels: 1 },
      mine,
    ]

    expect(migrateProjectState(v9)!.sources).toEqual([mine, CURATED_SAMPLE_SOURCE])
  })

  it('gives a v7 document (no FX bus) closed sends, keeping its beat, patches and earned lessons', () => {
    const v7 = {
      ...updateLessonProgress(
        setMasterParamValue(
          setTransportBpm(setBassParamValue(createInitialProjectState(), 'cutoff', 2400), 126),
          'drive',
          35,
        ),
        'four-on-the-floor',
        { completed: true, dismissed: true },
      ),
      version: 7,
    } as Record<string, unknown>
    const settings = v7.instrumentSettings as Record<string, unknown>
    delete settings.fx

    const migrated = migrateProjectState(JSON.parse(JSON.stringify(v7)))!

    expect(migrated.version).toBe(PROJECT_STATE_VERSION)
    // Sends closed: an upgraded document has to sound exactly as it did before.
    expect(migrated.instrumentSettings.fx).toEqual(DEFAULT_FX_SETTINGS)
    expect(migrated.instrumentSettings.bass.cutoff).toBe(2400)
    expect(migrated.instrumentSettings.master.drive).toBe(35)
    expect(migrated.transport.bpm).toBe(126)
    expect(migrated.lessonProgress['four-on-the-floor']).toEqual({
      completed: true,
      dismissed: true,
    })
  })

  it('gives a v8 document empty pads and the curated source, keeping its beat, FX patch and lessons', () => {
    const current = updateLessonProgress(
      setFxParamValue(
        cycleActivePatternStep(createInitialProjectState(), 'kick', 4),
        'drumSend',
        65,
      ),
      'four-on-the-floor',
      { completed: true, dismissed: true },
    )
    const v8 = JSON.parse(JSON.stringify({ ...current, version: 8 })) as Record<string, unknown>
    delete v8.sources
    v8.patterns = (v8.patterns as Array<Record<string, unknown>>).map((pattern) => {
      const { padLanes: _padLanes, ...beforeSampler } = pattern
      return beforeSampler
    })
    const v8Settings = v8.instrumentSettings as Record<string, unknown>
    delete v8Settings.sampler
    delete (v8Settings.fx as Record<string, unknown>).samplerSend

    const migrated = migrateProjectState(v8)!

    expect(migrated.version).toBe(PROJECT_STATE_VERSION)
    expect(migrated.sources).toEqual([CURATED_SAMPLE_SOURCE])
    expect(migrated.instrumentSettings.sampler).toEqual(createSamplerSettings())
    expect(migrated.patterns[0].padLanes).toHaveLength(4)
    expect(migrated.patterns[0].padLanes.every((lane) => lane.steps.every((step) => !step.on)))
      .toBe(true)
    expect(migrated.patterns[0].lanes.find((lane) => lane.id === 'kick')!.steps[4].on).toBe(true)
    expect(migrated.instrumentSettings.fx.drumSend).toBe(65)
    expect(migrated.instrumentSettings.fx.samplerSend).toBe(0)
    expect(migrated.lessonProgress['four-on-the-floor']).toEqual({
      completed: true,
      dismissed: true,
    })
  })

  it('repairs a hand-edited FX patch on the way in rather than handing the bus a bad value', () => {
    const v7 = { ...createInitialProjectState(), version: 7 } as Record<string, unknown>
    ;(v7.instrumentSettings as Record<string, unknown>).fx = { bassSend: 1e6 }

    const migrated = migrateProjectState(JSON.parse(JSON.stringify(v7)))!

    expect(migrated.instrumentSettings.fx.bassSend).toBe(
      FX_PARAMS.find((param) => param.id === 'bassSend')!.max,
    )
    expect(migrated.instrumentSettings.fx.drumSend).toBe(DEFAULT_FX_SETTINGS.drumSend)
  })

  it('gives a v6 document (no master macros) the neutral master patch, keeping its bass patch', () => {
    const v6 = {
      ...setBassParamValue(createInitialProjectState(), 'cutoff', 2400),
      version: 6,
    } as Record<string, unknown>
    const settings = v6.instrumentSettings as Record<string, unknown>
    delete settings.master

    const migrated = migrateProjectState(JSON.parse(JSON.stringify(v6)))!

    expect(migrated.version).toBe(PROJECT_STATE_VERSION)
    expect(migrated.instrumentSettings.master).toEqual(DEFAULT_MASTER_SETTINGS)
    expect(migrated.instrumentSettings.bass.cutoff).toBe(2400)
  })

  it('puts a v5 document back on the arc path, keeping its earned lessons', () => {
    const v5 = {
      ...updateLessonProgress(createInitialProjectState(), 'four-on-the-floor', {
        completed: true,
        dismissed: true,
      }),
      version: 5,
    } as Record<string, unknown>
    delete v5.activeLessonId

    const migrated = migrateProjectState(v5)!

    expect(migrated.version).toBe(PROJECT_STATE_VERSION)
    expect(activeLessonIdFor(migrated, DEFAULT_ARC_ID)).toBeNull()
    expect(migrated.lessonProgress['four-on-the-floor']).toEqual({
      completed: true,
      dismissed: true,
    })
  })

  it('gives a v3 document (drums only) an empty bass lane and the default patch', () => {
    const v3 = {
      ...createInitialProjectState(),
      version: 3,
      instrumentSettings: {},
      patterns: [{ ...createInitialPattern(), noteLanes: undefined }],
    } as unknown

    const migrated = migrateProjectState(JSON.parse(JSON.stringify(v3)))!

    expect(migrated.version).toBe(PROJECT_STATE_VERSION)
    expect(migrated.instrumentSettings.bass).toEqual(DEFAULT_BASS_SETTINGS)
    const bass = migrated.patterns[0].noteLanes.find((lane) => lane.id === 'bass')!
    expect(bass.steps).toHaveLength(16)
    expect(bass.steps.every((step) => !step.on)).toBe(true)
  })

  it('gives a v4 bass project an empty stab lane without changing its bassline', () => {
    const bassProject = toggleActivePatternNoteStep(createInitialProjectState(), 'bass', 6)
    const v4 = {
      ...bassProject,
      version: 4,
      patterns: bassProject.patterns.map((pattern) => ({
        ...pattern,
        noteLanes: pattern.noteLanes.filter((lane) => lane.id === 'bass'),
      })),
    }

    const migrated = migrateProjectState(JSON.parse(JSON.stringify(v4)))!

    expect(migrated.version).toBe(PROJECT_STATE_VERSION)
    expect(
      migrated.patterns[0].noteLanes.find((lane) => lane.id === 'bass')!.steps[6].on,
    ).toBe(true)
    const stab = migrated.patterns[0].noteLanes.find((lane) => lane.id === 'stab')!
    expect(stab.steps).toHaveLength(16)
    expect(
      stab.steps.every(
        (step) =>
          !step.on && step.pitch === STAB_DEFAULT_PITCH && step.length === MIN_NOTE_LENGTH,
      ),
    ).toBe(true)
  })

  it('keeps a saved bassline and patch when loading a current-version document', () => {
    const saved = setBassParamValue(
      transposeActivePatternNote(
        toggleActivePatternNoteStep(createInitialProjectState(), 'bass', 2),
        'bass',
        2,
        3,
      ),
      'cutoff',
      2400,
    )

    const migrated = migrateProjectState(JSON.parse(JSON.stringify(saved)))!

    expect(migrated.instrumentSettings.bass.cutoff).toBe(2400)
    const bass = migrated.patterns[0].noteLanes.find((lane) => lane.id === 'bass')!
    expect(bass.steps[2]).toEqual({ on: true, pitch: DEFAULT_PITCH + 3, length: MIN_NOTE_LENGTH })
  })

  it('gives a v2 document (no mixer) an empty mixer on load', () => {
    const v2 = { ...createInitialProjectState(), version: 2 } as Record<string, unknown>
    delete v2.mixer
    const migrated = migrateProjectState(v2)!
    expect(migrated.version).toBe(PROJECT_STATE_VERSION)
    expect(migrated.mixer).toEqual({})
  })

  it('fills in the full kit when loading a v1 document saved with only a kick lane', () => {
    const kickOnly = {
      version: 1,
      patterns: [
        {
          id: 'pattern-1',
          name: 'Pattern 1',
          lanes: [
            {
              id: 'kick',
              label: 'Kick',
              steps: Array.from({ length: 16 }, (_, i) => ({
                on: i % 4 === 0,
                accent: false,
              })),
            },
          ],
        },
      ],
      activePatternId: 'pattern-1',
      transport: { bpm: 128 },
      instrumentSettings: {},
      lessonProgress: { 'four-on-the-floor': { completed: true, dismissed: false } },
      prefs: {},
    }

    const migrated = migrateProjectState(kickOnly)!

    expect(migrated.version).toBe(PROJECT_STATE_VERSION)
    // The user's programmed kick survives; the new lanes arrive empty.
    const lanes = migrated.patterns[0].lanes
    expect(lanes.map((lane) => lane.id)).toEqual([
      'kick',
      'snare',
      'closedHat',
      'openHat',
      'perc',
    ])
    expect(lanes[0].steps.filter((s) => s.on)).toHaveLength(4)
    expect(lanes.slice(1).every((lane) => lane.steps.every((s) => !s.on))).toBe(true)
    expect(migrated.transport.bpm).toBe(128)
    expect(migrated.lessonProgress['four-on-the-floor'].completed).toBe(true)
  })

  it('returns null for corrupt or unknown-version input', () => {
    expect(migrateProjectState(null)).toBeNull()
    expect(migrateProjectState('not a document')).toBeNull()
    expect(migrateProjectState({})).toBeNull()
    expect(migrateProjectState({ version: 999 })).toBeNull()
  })
})

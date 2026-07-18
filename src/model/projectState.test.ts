import { describe, expect, it } from 'vitest'
import { createInitialPattern } from './pattern'
import { DEFAULT_BPM } from './transport'
import {
  activePattern,
  createInitialProjectState,
  PROJECT_STATE_VERSION,
  migrateProjectState,
  setTransportBpm,
  toggleActivePatternStep,
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
    expect(state.instrumentSettings).toEqual({})
    expect(state.prefs).toEqual({})
  })
})

describe('toggleActivePatternStep', () => {
  it('toggles a step of the active pattern immutably through the document', () => {
    const state = createInitialProjectState()
    const next = toggleActivePatternStep(state, 'kick', 4)
    expect(activePattern(next).lanes[0].steps[4].on).toBe(true)
    expect(activePattern(state).lanes[0].steps[4].on).toBe(false)
    expect(next).not.toBe(state)
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
      setTransportBpm(toggleActivePatternStep(createInitialProjectState(), 'kick', 0), 137),
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
      instrumentSettings: {},
      lessonProgress: {},
      prefs: {},
    })
  })

  it('returns null for corrupt or unknown-version input', () => {
    expect(migrateProjectState(null)).toBeNull()
    expect(migrateProjectState('not a document')).toBeNull()
    expect(migrateProjectState({})).toBeNull()
    expect(migrateProjectState({ version: 999 })).toBeNull()
  })
})

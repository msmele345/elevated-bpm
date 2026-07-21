import { describe, expect, it } from 'vitest'
import { createInitialPattern } from './pattern'
import { DEFAULT_BPM } from './transport'
import {
  activePattern,
  createInitialProjectState,
  PROJECT_STATE_VERSION,
  migrateProjectState,
  setTransportBpm,
  cycleActivePatternStep,
  toggleLaneMute,
  toggleLaneSolo,
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

describe('cycleActivePatternStep', () => {
  it('toggles a step of the active pattern immutably through the document', () => {
    const state = createInitialProjectState()
    const next = cycleActivePatternStep(state, 'kick', 4)
    expect(activePattern(next).lanes[0].steps[4].on).toBe(true)
    expect(activePattern(state).lanes[0].steps[4].on).toBe(false)
    expect(next).not.toBe(state)
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
      instrumentSettings: {},
      lessonProgress: {},
      prefs: {},
      mixer: {},
    })
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

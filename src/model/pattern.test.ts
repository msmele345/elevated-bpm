import { describe, expect, it } from 'vitest'
import { STEP_COUNT, type Pattern } from './types'
import { createDemoPattern, createInitialPattern, cycleStep, toggleStep } from './pattern'

function kickSteps(pattern: ReturnType<typeof createInitialPattern>) {
  return pattern.lanes.find((lane) => lane.id === 'kick')!.steps
}

/** The step indexes a lane is programmed on, for readable groove assertions. */
function onSteps(pattern: Pattern, laneId: string) {
  const lane = pattern.lanes.find((l) => l.id === laneId)!
  return lane.steps.flatMap((step, i) => (step.on ? [i] : []))
}

describe('cycleStep', () => {
  it('cycles one step through off → on → accented → off', () => {
    const initial = createInitialPattern()

    const on = cycleStep(initial, 'kick', 0)
    expect(kickSteps(on)[0]).toEqual({ on: true, accent: false })

    const accented = cycleStep(on, 'kick', 0)
    expect(kickSteps(accented)[0]).toEqual({ on: true, accent: true })

    const off = cycleStep(accented, 'kick', 0)
    expect(kickSteps(off)[0]).toEqual({ on: false, accent: false })
  })

  it('cycles each lane independently and does not mutate its input', () => {
    const initial = createInitialPattern()
    const result = cycleStep(cycleStep(initial, 'openHat', 2), 'kick', 0)

    expect(kickSteps(result)[0].on).toBe(true)
    expect(result.lanes.find((l) => l.id === 'openHat')!.steps[2].on).toBe(true)
    expect(result.lanes.find((l) => l.id === 'snare')!.steps.some((s) => s.on)).toBe(false)
    expect(kickSteps(initial)[0].on).toBe(false)
  })

  it('uses the same three-state cycle for a pad lane without touching the kit', () => {
    const initial = createInitialPattern()
    const on = cycleStep(initial, 'pad3', 6)
    const accented = cycleStep(on, 'pad3', 6)

    expect(accented.padLanes.find((lane) => lane.id === 'pad3')!.steps[6]).toEqual({
      on: true,
      accent: true,
    })
    expect(accented.lanes).toBe(initial.lanes)
    expect(initial.padLanes.find((lane) => lane.id === 'pad3')!.steps[6].on).toBe(false)
  })
})

describe('createInitialPattern', () => {
  it('creates the full kit — five lanes, kick first, each 16 off steps', () => {
    const pattern = createInitialPattern()
    expect(pattern.lanes.map((lane) => lane.id)).toEqual([
      'kick',
      'snare',
      'closedHat',
      'openHat',
      'perc',
    ])
    for (const lane of pattern.lanes) {
      expect(lane.steps).toHaveLength(STEP_COUNT)
      expect(lane.steps.every((step) => step.on === false && step.accent === false)).toBe(true)
      expect(lane.label.length).toBeGreaterThan(0)
    }
  })

  it('creates four separate empty pad lanes for the sampler panel', () => {
    const pattern = createInitialPattern()

    expect(pattern.padLanes.map((lane) => lane.id)).toEqual(['pad1', 'pad2', 'pad3', 'pad4'])
    for (const lane of pattern.padLanes) {
      expect(lane.steps).toHaveLength(STEP_COUNT)
      expect(lane.steps.every((step) => !step.on && !step.accent)).toBe(true)
    }
  })
})

describe('createDemoPattern', () => {
  it('ships a techno groove: half-time clap, offbeat hats, syncopated perc', () => {
    const demo = createDemoPattern()

    expect(onSteps(demo, 'snare')).toEqual([12])
    expect(onSteps(demo, 'closedHat')).toEqual([2, 6, 10])
    expect(onSteps(demo, 'openHat')).toEqual([14])
    expect(onSteps(demo, 'perc')).toEqual([3, 5, 11, 13])
  })

  it('carries its syncopation in the perc, entirely off the beat', () => {
    // The perc is where the demo is allowed to be busy (no lesson asks for it),
    // so it carries the groove the arc's own lanes cannot: every hit lands on a
    // 16th between the beats, and two of them push.
    const demo = createDemoPattern()
    const perc = demo.lanes.find((lane) => lane.id === 'perc')!

    expect(onSteps(demo, 'perc').every((step) => step % 2 === 1)).toBe(true)
    expect(perc.steps.map((step, i) => (step.accent ? i : -1)).filter((i) => i >= 0)).toEqual([
      5, 11,
    ])
  })

  it('leaves every step the arc teaches unplayed, so no lesson opens already won', () => {
    // Same rule the kick lane has followed since Phase 4: the demo may groove,
    // but it must never do a lesson's work for the user. The curriculum's own
    // guard against this is in lessons/lessons.test.ts — this one keeps the
    // pattern honest at the source.
    const demo = createDemoPattern()

    expect(onSteps(demo, 'kick')).toEqual([])
    expect(onSteps(demo, 'snare')).not.toEqual([4, 12])
    expect(onSteps(demo, 'closedHat')).not.toEqual([2, 6, 10, 14])
    expect(demo.noteLanes.every((lane) => lane.steps.every((step) => !step.on))).toBe(true)
  })
})

describe('toggleStep', () => {
  it('flips only the targeted step, on then off', () => {
    const initial = createInitialPattern()
    const toggledOn = toggleStep(initial, 'kick', 4)
    expect(toggledOn.lanes[0].steps[4].on).toBe(true)
    expect(toggledOn.lanes[0].steps.filter((s) => s.on)).toHaveLength(1)

    const toggledOff = toggleStep(toggledOn, 'kick', 4)
    expect(toggledOff.lanes[0].steps[4].on).toBe(false)
  })

  it('does not mutate the input pattern', () => {
    const initial = createInitialPattern()
    toggleStep(initial, 'kick', 0)
    expect(initial.lanes[0].steps[0].on).toBe(false)
  })

  it('leaves non-matching lanes untouched by reference', () => {
    const initial = createInitialPattern()
    const result = toggleStep(initial, 'snare', 0)
    expect(result.lanes[0]).toBe(initial.lanes[0])
  })
})

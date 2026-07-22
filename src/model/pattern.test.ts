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
})

describe('createDemoPattern', () => {
  it('ships a techno groove: backbeat clap, offbeat hats, syncopated perc', () => {
    const demo = createDemoPattern()

    expect(onSteps(demo, 'snare')).toEqual([4, 12])
    expect(onSteps(demo, 'closedHat')).toEqual([2, 6, 10])
    expect(onSteps(demo, 'openHat')).toEqual([14])
    expect(onSteps(demo, 'perc')).toEqual([5, 11])
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

import { describe, expect, it } from 'vitest'
import { STEP_COUNT } from './types'
import { createInitialPattern, toggleStep } from './pattern'

describe('createInitialPattern', () => {
  it('creates a single kick lane of 16 off steps', () => {
    const pattern = createInitialPattern()
    expect(pattern.lanes).toHaveLength(1)
    expect(pattern.lanes[0].id).toBe('kick')
    expect(pattern.lanes[0].steps).toHaveLength(STEP_COUNT)
    expect(pattern.lanes[0].steps.every((step) => step.on === false)).toBe(true)
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialProjectState, setTransportBpm } from '../model/projectState'
import { createAutosaver } from './autosave'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createAutosaver', () => {
  it('debounces rapid schedules into one save of the latest state', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const autosaver = createAutosaver(save, 500)

    const first = createInitialProjectState()
    const second = setTransportBpm(first, 99)
    autosaver.schedule(first)
    vi.advanceTimersByTime(300)
    autosaver.schedule(second)
    vi.advanceTimersByTime(300)
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(second)
  })

  it('flush saves a pending state immediately and cancels the timer', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const autosaver = createAutosaver(save, 500)

    const state = createInitialProjectState()
    autosaver.schedule(state)
    autosaver.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(state)

    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush without a pending schedule does nothing', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    createAutosaver(save, 500).flush()
    expect(save).not.toHaveBeenCalled()
  })
})

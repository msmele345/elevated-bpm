// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import { indexedDB } from 'fake-indexeddb'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Autosave is debounced, so between a user's last edit and the write there is
 * a window in which the deck can go away. The write must not outlive it: a
 * timer that fires into a torn-down world reaches for an `indexedDB` that is
 * no longer there. Durability on the paths a user actually takes — refresh,
 * tab close — is carried by the pagehide/visibilitychange flush, not by
 * letting an orphaned timer run.
 */

const saveProjectState = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('./storage/projectStore', async () => {
  const actual = await vi.importActual<typeof import('./storage/projectStore')>(
    './storage/projectStore',
  )
  return { ...actual, saveProjectState }
})

vi.mock('./audio/engine', async () => {
  const transport = await import('./model/transport')
  return {
    DEFAULT_BPM: transport.DEFAULT_BPM,
    MIN_BPM: transport.MIN_BPM,
    MAX_BPM: transport.MAX_BPM,
    TICKS_PER_16TH: 48,
    setPattern: () => undefined,
    setMixer: () => undefined,
    setBassSettings: () => undefined,
    setMasterSettings: () => undefined,
    setFxSettings: () => undefined,
    setSamplerSettings: () => undefined,
    setBpm: () => undefined,
    unlockAudio: () => Promise.resolve(),
    play: () => Promise.resolve(),
    stop: () => undefined,
    attackStabNote: () => undefined,
    releaseStabNote: () => undefined,
    attackPad: () => undefined,
    releasePad: () => undefined,
    getSoundingStabNotes: () => [],
    getSoundingPadIds: () => [],
    getSpectrum: () => null,
    getCurrentStep: () => -1,
    getTransportTicks: () => -1,
  }
})

/** Import after the mocks are in place, so App picks up the stubbed store. */
const { default: App } = await import('./App')

/** Longer than App's 400 ms autosave debounce. */
const PAST_THE_DEBOUNCE_MS = 700

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  saveProjectState.mockClear()
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Mount the deck and wait for it to finish hydrating from storage. */
async function renderHydratedDeck() {
  const view = render(createElement(App))
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Share beat' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  return view
}

describe('autosave lifecycle', () => {
  it('writes a step edit once the debounce elapses', async () => {
    const view = await renderHydratedDeck()
    saveProjectState.mockClear()

    screen.getByRole('button', { name: 'Kick step 1' }).click()
    await wait(PAST_THE_DEBOUNCE_MS)

    expect(saveProjectState).toHaveBeenCalled()
    view.unmount()
  })

  it('drops the pending write when the deck unmounts inside the debounce window', async () => {
    const view = await renderHydratedDeck()
    saveProjectState.mockClear()

    screen.getByRole('button', { name: 'Kick step 1' }).click()
    view.unmount()
    await wait(PAST_THE_DEBOUNCE_MS)

    expect(saveProjectState).not.toHaveBeenCalled()
  })
})

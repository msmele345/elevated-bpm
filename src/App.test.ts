// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { indexedDB } from 'fake-indexeddb'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  activePattern,
  createInitialProjectState,
  cycleActivePatternStep,
  setTransportBpm,
} from './model/projectState'
import { createShareUrl, readSharedBeat } from './model/share'
import { loadProjectState, saveProjectState } from './storage/projectStore'

vi.mock('tone', () => {
  const transport = {
    PPQ: 192,
    bpm: {
      value: 130,
      rampTo(value: number) {
        this.value = value
      },
    },
    state: 'stopped',
    ticks: 0,
    stop() {
      this.state = 'stopped'
      this.ticks = 0
    },
  }
  return {
    getTransport: () => transport,
    immediate: () => 0,
  }
})

function deleteProjectDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('elevated-bpm')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Project database deletion was blocked'))
  })
}

beforeEach(async () => {
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.history.replaceState(null, '', '/')
  await deleteProjectDatabase()
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'clipboard')
  vi.unstubAllGlobals()
})

describe('App sharing workflow', () => {
  it('does not share the placeholder document before the saved project hydrates', async () => {
    await saveProjectState(createInitialProjectState())

    render(createElement(App))

    const shareButton = screen.getByRole('button', { name: 'Share beat' })
    expect((shareButton as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() => expect((shareButton as HTMLButtonElement).disabled).toBe(false))
    // Let this mounted project's own debounced save settle before the next
    // isolated IndexedDB fixture starts.
    await new Promise((resolve) => setTimeout(resolve, 450))
  })

  it('previews an incoming beat without autosaving over the recipient project', async () => {
    const recipient = setTransportBpm(
      cycleActivePatternStep(createInitialProjectState(), 'kick', 2),
      123,
    )
    const sender = setTransportBpm(
      cycleActivePatternStep(createInitialProjectState(), 'kick', 8),
      141,
    )
    await saveProjectState(recipient)
    const shareUrl = await createShareUrl(sender, window.location.href)
    window.history.replaceState(null, '', new URL(shareUrl).search)

    render(createElement(App))

    await screen.findByText('Shared beat preview')
    const tempo = screen.getByRole('slider', { name: 'Tempo in beats per minute' })
    expect((tempo as HTMLInputElement).value).toBe('141')

    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(await loadProjectState()).toEqual(recipient)

    fireEvent.click(screen.getByRole('button', { name: 'Back to my project' }))
    await waitFor(() => expect((tempo as HTMLInputElement).value).toBe('123'))
    expect(screen.queryByText('Shared beat preview')).toBeNull()
    expect(activePattern((await loadProjectState())!)).toEqual(activePattern(recipient))
    expect(window.location.search).toBe('')
    await new Promise((resolve) => setTimeout(resolve, 450))
  })

  it('persists an incoming beat only after the recipient explicitly keeps it', async () => {
    const recipient = cycleActivePatternStep(createInitialProjectState(), 'kick', 2)
    const sender = setTransportBpm(
      cycleActivePatternStep(createInitialProjectState(), 'kick', 8),
      145,
    )
    await saveProjectState(recipient)
    const shareUrl = await createShareUrl(sender, window.location.href)
    window.history.replaceState(null, '', new URL(shareUrl).search)

    render(createElement(App))
    await screen.findByText('Shared beat preview')

    fireEvent.click(screen.getByRole('button', { name: 'Keep this beat' }))

    await waitFor(() => expect(screen.queryByText('Shared beat preview')).toBeNull())
    const kept = (await loadProjectState())!
    expect(activePattern(kept)).toEqual(activePattern(sender))
    expect(kept.transport.bpm).toBe(145)
    expect(window.location.search).toBe('')
    await new Promise((resolve) => setTimeout(resolve, 450))
  })

  it('never credits the recipient with lesson work the incoming beat arrived with', async () => {
    const recipient = createInitialProjectState()
    let sender = createInitialProjectState()
    for (const step of [0, 4, 8, 12]) sender = cycleActivePatternStep(sender, 'kick', step)
    await saveProjectState(recipient)
    const shareUrl = await createShareUrl(sender, window.location.href)
    window.history.replaceState(null, '', new URL(shareUrl).search)

    render(createElement(App))
    await screen.findByText('Shared beat preview')
    await new Promise((resolve) => setTimeout(resolve, 50))

    // The four-on-the-floor is the sender's work, so the arc must not light up
    // for it — during the preview or after the recipient keeps the beat.
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')

    fireEvent.click(screen.getByRole('button', { name: 'Keep this beat' }))
    await waitFor(() => expect(screen.queryByText('Shared beat preview')).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 450))

    expect((await loadProjectState())!.lessonProgress).toEqual({})
  })

  it('still earns a lesson the recipient builds on top of a kept beat', async () => {
    const recipient = createInitialProjectState()
    let sender = createInitialProjectState()
    for (const step of [0, 4, 8]) sender = cycleActivePatternStep(sender, 'kick', step)
    await saveProjectState(recipient)
    const shareUrl = await createShareUrl(sender, window.location.href)
    window.history.replaceState(null, '', new URL(shareUrl).search)

    render(createElement(App))
    await screen.findByText('Shared beat preview')

    // The missing downbeat is the recipient's own work: placing it completes
    // the lesson exactly as it would on their own beat.
    fireEvent.click(screen.getByRole('button', { name: 'Kick step 13' }))

    await waitFor(() =>
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1'),
    )
    await new Promise((resolve) => setTimeout(resolve, 450))
  })

  it('shares the hydrated project through the visible share action', async () => {
    const source = setTransportBpm(
      cycleActivePatternStep(createInitialProjectState(), 'snare', 12),
      139,
    )
    await saveProjectState(source)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(createElement(App))
    const shareButton = screen.getByRole('button', { name: 'Share beat' })
    await waitFor(() => expect((shareButton as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(shareButton)

    await screen.findByText('Share URL copied to your clipboard.')
    expect(writeText).toHaveBeenCalledOnce()
    const shared = await readSharedBeat(writeText.mock.calls[0][0])
    expect(shared.status).toBe('ready')
    if (shared.status === 'ready') {
      expect(activePattern(shared.project)).toEqual(activePattern(source))
      expect(shared.project.transport.bpm).toBe(139)
    }
    await new Promise((resolve) => setTimeout(resolve, 450))
  })

  it('keeps the saved project open and explains an incompatible shared link', async () => {
    const recipient = setTransportBpm(
      cycleActivePatternStep(createInitialProjectState(), 'closedHat', 6),
      127,
    )
    await saveProjectState(recipient)
    window.history.replaceState(null, '', '/?p=999.incompatible')

    render(createElement(App))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('incompatible version of Elevated BPM')
    const tempo = screen.getByRole('slider', { name: 'Tempo in beats per minute' })
    expect((tempo as HTMLInputElement).value).toBe('127')
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(await loadProjectState()).toEqual(recipient)
  })
})

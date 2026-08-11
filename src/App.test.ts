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

const engineSpies = vi.hoisted(() => ({
  setPattern: vi.fn(),
  setMixer: vi.fn(),
  setBassSettings: vi.fn(),
  setMasterSettings: vi.fn(),
  setFxSettings: vi.fn(),
  setSamplerSettings: vi.fn(),
  setBpm: vi.fn(),
  unlockAudio: vi.fn().mockResolvedValue(undefined),
  play: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  attackStabNote: vi.fn(),
  releaseStabNote: vi.fn(),
  attackPad: vi.fn(),
  releasePad: vi.fn(),
  getSoundingPadIds: vi.fn((): string[] => []),
}))

vi.mock('./audio/engine', async () => {
  const transport = await import('./model/transport')
  return {
    ...engineSpies,
    DEFAULT_BPM: transport.DEFAULT_BPM,
    MIN_BPM: transport.MIN_BPM,
    MAX_BPM: transport.MAX_BPM,
    TICKS_PER_16TH: 48,
    getSoundingStabNotes: () => [],
    getSpectrum: () => null,
    getCurrentStep: () => -1,
    getTransportTicks: () => -1,
  }
})

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
  for (const spy of Object.values(engineSpies)) spy.mockClear()
  engineSpies.getSoundingPadIds.mockReturnValue([])
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.history.replaceState(null, '', '/')
  await deleteProjectDatabase()
})

describe('App sampler workflow', () => {
  it('assigns the curated source, programs its lane, and plays it live without changing the pattern', async () => {
    render(createElement(App))
    const shareButton = screen.getByRole('button', { name: 'Share beat' })
    await waitFor(() => expect((shareButton as HTMLButtonElement).disabled).toBe(false))

    expect(screen.getByText('Warehouse Perc')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Assign Warehouse Perc to Pad 1' }))
    expect(screen.getByRole('button', { name: 'Play Pad 1 — Warehouse Perc' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Pad 1 step 1' }))
    expect(screen.getByRole('button', { name: 'Pad 1 step 1' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    await new Promise((resolve) => setTimeout(resolve, 450))
    const before = JSON.stringify(activePattern((await loadProjectState())!))

    fireEvent.keyDown(window, { code: 'Digit1', key: '1' })
    fireEvent.keyUp(window, { code: 'Digit1', key: '1' })

    expect(engineSpies.attackPad).toHaveBeenCalledWith('computer:Digit1', 'pad1')
    expect(engineSpies.releasePad).toHaveBeenCalledWith('computer:Digit1')
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(JSON.stringify(activePattern((await loadProjectState())!))).toBe(before)
  })

  it('keeps digits out of text entry while a focused tempo fader leaves pads playable', async () => {
    render(createElement(App))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Share beat' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    const input = document.createElement('input')
    input.type = 'text'
    document.body.append(input)

    fireEvent.keyDown(input, { code: 'Digit2', key: '2' })
    expect(engineSpies.attackPad).not.toHaveBeenCalled()

    const tempo = screen.getByRole('slider', { name: 'Tempo in beats per minute' })
    fireEvent.keyDown(tempo, { code: 'Digit2', key: '2' })
    expect(engineSpies.attackPad).toHaveBeenCalledWith('computer:Digit2', 'pad2')
    fireEvent.keyUp(tempo, { code: 'Digit2', key: '2' })
    input.remove()
  })

  it('plays pads and stabs together and releases each input independently', async () => {
    render(createElement(App))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Share beat' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )

    fireEvent.keyDown(window, { code: 'Digit3', key: '3' })
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' })
    expect(engineSpies.attackPad).toHaveBeenCalledWith('computer:Digit3', 'pad3')
    expect(engineSpies.attackStabNote).toHaveBeenCalledWith('computer:KeyA', 60)

    fireEvent.keyUp(window, { code: 'Digit3', key: '3' })
    expect(engineSpies.releasePad).toHaveBeenCalledWith('computer:Digit3')
    expect(engineSpies.releaseStabNote).not.toHaveBeenCalled()

    fireEvent.keyUp(window, { code: 'KeyA', key: 'a' })
    expect(engineSpies.releaseStabNote).toHaveBeenCalledWith('computer:KeyA')
  })

  it('lights live and sequenced pads from the engine clock on animation frames', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    render(createElement(App))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Share beat' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    const pad = screen.getByRole('button', { name: 'Play Pad 2 — empty' })

    engineSpies.getSoundingPadIds.mockReturnValue(['pad2'])
    for (const frame of [...frames]) frame(16)

    expect(pad.hasAttribute('data-sounding')).toBe(true)
    expect(pad.getAttribute('aria-pressed')).toBe('true')
  })
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

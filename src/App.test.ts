// @vitest-environment jsdom

import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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
import { MAX_SOURCE_BYTES, MAX_SOURCE_SECONDS } from './model/intake'
import { CURATED_SAMPLE_SOURCE } from './model/sampler'
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
  registerSampleSource: vi.fn(),
  getSoundingPadIds: vi.fn((): string[] => []),
}))

/**
 * Real decoding is never exercised: the decoder is injected and the tests
 * supply buffer-shaped fakes, which is the trade SP-04 records. Everything
 * between the file input and the pad is the real thing.
 */
const decoder = vi.hoisted(() => ({
  probeDuration: vi.fn(() => Promise.resolve(2)),
  decodeSample: vi.fn(() => Promise.resolve({ duration: 2, numberOfChannels: 2 })),
  newSourceId: vi.fn(() => 'upload-1'),
}))

vi.mock('./audio/sampleDecoder', () => decoder)

/** A file is a name and a size; its size is stated rather than allocated. */
function audioFile(name: string, size = 2_048): File {
  const file = new File(['fake audio bytes'], name, { type: 'audio/wav' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function chooseFile(file: File): void {
  const input = screen.getByLabelText('Load audio file')
  fireEvent.change(input, { target: { files: [file] } })
}

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
  decoder.probeDuration.mockClear().mockResolvedValue(2)
  decoder.decodeSample.mockClear().mockResolvedValue({ duration: 2, numberOfChannels: 2 })
  decoder.newSourceId.mockClear().mockReturnValue('upload-1')
  engineSpies.getSoundingPadIds.mockReturnValue([])
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.history.replaceState(null, '', '/')
  await deleteProjectDatabase()
})

/** The deck mounts on a placeholder document and swaps in the stored one. */
async function hydratedDeck(): Promise<void> {
  render(createElement(App))
  const shareButton = screen.getByRole('button', { name: 'Share beat' })
  await waitFor(() => expect((shareButton as HTMLButtonElement).disabled).toBe(false))
}

describe('App audio intake', () => {
  it('turns a chosen file into a source, and a source into a pad that sounds', async () => {
    await hydratedDeck()

    chooseFile(audioFile('Warehouse Break.wav'))

    // It is a source now: named after its file and listed with the shipped one.
    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    expect(await within(sourceList).findByText('Warehouse Break')).toBeTruthy()
    expect(within(sourceList).getByText('Warehouse Perc')).toBeTruthy()
    // Its audio reaches the engine under the id the document will store, which
    // is the whole audio-layer cost of a new source.
    expect(engineSpies.registerSampleSource).toHaveBeenCalledWith('upload-1', {
      duration: 2,
      numberOfChannels: 2,
    })

    fireEvent.change(screen.getByLabelText('Pad 1 sound source'), {
      target: { value: 'upload-1' },
    })

    expect(screen.getByRole('button', { name: 'Play Pad 1 — Warehouse Break' })).toBeTruthy()
    const settings = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
    expect(settings.pad1.region).toEqual({ sourceId: 'upload-1', start: 0, duration: 2 })
  })

  it('refuses an oversized file without decoding it, and leaves the project alone', async () => {
    const saved = setTransportBpm(cycleActivePatternStep(createInitialProjectState(), 'kick', 4), 133)
    await saveProjectState(saved)
    await hydratedDeck()

    chooseFile(audioFile('long-mix.wav', MAX_SOURCE_BYTES + 1))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('50 MB')
    expect(alert.textContent).toContain('long-mix.wav')
    expect(decoder.decodeSample).not.toHaveBeenCalled()
    expect(engineSpies.registerSampleSource).not.toHaveBeenCalled()

    // Experimenting with files is never risky: the document is byte-identical.
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(await loadProjectState()).toEqual(saved)

    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refuses an over-long file on the probe alone, before any decode', async () => {
    await hydratedDeck()
    decoder.probeDuration.mockResolvedValue(MAX_SOURCE_SECONDS + 30)

    chooseFile(audioFile('warehouse-set.mp3'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('6 minutes')
    expect(decoder.probeDuration).toHaveBeenCalledOnce()
    expect(decoder.decodeSample).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Pad 1 sound source')?.textContent).not.toContain(
      'warehouse-set',
    )
  })

  it('says the file is the problem when the browser cannot decode it', async () => {
    await hydratedDeck()
    decoder.decodeSample.mockRejectedValue(new Error('EncodingError'))

    chooseFile(audioFile('holiday-photo.heic'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('holiday-photo.heic')
    expect(alert.textContent).toContain('cannot play that file')
    expect(engineSpies.registerSampleSource).not.toHaveBeenCalled()
  })

  it('loads and assigns in one gesture when a file is dropped on a pad', async () => {
    await hydratedDeck()
    decoder.newSourceId.mockReturnValue('upload-dropped')

    const pad = screen.getByRole('button', { name: 'Play Pad 3 — empty' }).parentElement!
    fireEvent.drop(pad, { dataTransfer: { files: [audioFile('Rim Hit.wav')] } })

    expect(await screen.findByRole('button', { name: 'Play Pad 3 — Rim Hit' })).toBeTruthy()
    expect(engineSpies.registerSampleSource).toHaveBeenCalledWith('upload-dropped', {
      duration: 2,
      numberOfChannels: 2,
    })
    // One gesture, one source: the drop must not also reach the panel behind it.
    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    expect(within(sourceList).getAllByText('Rim Hit')).toHaveLength(1)
  })

  it('adds a source without assigning it when the drop lands on the panel', async () => {
    await hydratedDeck()

    const panel = screen.getByRole('button', { name: 'Play Pad 1 — empty' }).closest('section')!
    fireEvent.drop(panel, { dataTransfer: { files: [audioFile('Warehouse Break.wav')] } })

    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    expect(await within(sourceList).findByText('Warehouse Break')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play Pad 1 — empty' })).toBeTruthy()
  })

  it('shows which pad a dragged file would land on, not just the panel', async () => {
    await hydratedDeck()

    const strip = screen.getByRole('button', { name: 'Play Pad 2 — empty' }).parentElement!
    fireEvent.dragOver(strip, { dataTransfer: { files: [audioFile('Rim Hit.wav')] } })

    expect(strip.hasAttribute('data-drop-active')).toBe(true)
    // The panel is the pad's ancestor: if the drag reached it, its own
    // highlight would replace the pad's and hide where the sound is going.
    expect(strip.closest('section')!.hasAttribute('data-drop-active')).toBe(false)
  })

  it('swallows a stray drop rather than letting the tab navigate to the file', async () => {
    await hydratedDeck()

    const stray = createEvent.drop(document.body, {
      dataTransfer: { files: [audioFile('Warehouse Break.wav')] },
    })
    fireEvent(document.body, stray)

    // Navigating away would take an unsaved session with it.
    expect(stray.defaultPrevented).toBe(true)
    expect(decoder.probeDuration).not.toHaveBeenCalled()
  })
})

describe('App sampler workflow', () => {
  it('assigns the curated source, programs its lane, and plays it live without changing the pattern', async () => {
    render(createElement(App))
    const shareButton = screen.getByRole('button', { name: 'Share beat' })
    await waitFor(() => expect((shareButton as HTMLButtonElement).disabled).toBe(false))

    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    expect(within(sourceList).getByText('Warehouse Perc')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Pad 1 sound source'), {
      target: { value: CURATED_SAMPLE_SOURCE.id },
    })
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

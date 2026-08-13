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
  addSource,
  commitRegionToSamplerPad,
  createInitialProjectState,
  cycleActivePatternStep,
  setSamplerPadFit,
  setTransportBpm,
} from './model/projectState'
import { MAX_SOURCE_BYTES, MAX_SOURCE_SECONDS } from './model/intake'
import { CURATED_SAMPLE_SOURCE, type SampleRegion } from './model/sampler'
import { sliceKey } from './model/slice'
import { createShareUrl, readSharedBeat } from './model/share'
import { loadProjectState, saveProjectState } from './storage/projectStore'
import { loadSlice, loadSource, saveSlice, saveSource } from './storage/sampleStore'

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
  registerSourceBytes: vi.fn(),
  setStoredSourceLoader: vi.fn(),
  registerSlice: vi.fn(),
  renderPadSlice: vi.fn(() => sliceFake()),
  commitPadRegion: vi.fn(() => Promise.resolve(sliceFake())),
  openSourceAnalysis: vi.fn(() => Promise.resolve(analysisFake())),
  closeSourceAnalysis: vi.fn(),
  auditionRegion: vi.fn(),
  getSoundingPadIds: vi.fn((): string[] => []),
}))

/**
 * Real decoding is never exercised: the decoder is injected and the tests
 * supply buffer-shaped fakes, which is the trade SP-04 records. Everything
 * between the file input and the pad is the real thing.
 */
const decoder = vi.hoisted(() => ({
  probeDuration: vi.fn(() => Promise.resolve(2)),
  decodeSample: vi.fn(() => Promise.resolve(decodedFake(2))),
  newSourceId: vi.fn(() => 'upload-1'),
}))

/**
 * Buffer-shaped, because a decode is now what a region is rendered out of.
 * Real decoding is still never exercised — the decoder is injected and this is
 * the fake it hands back, which is the trade SP-04 records.
 */
function decodedFake(duration: number, sampleRate = 100) {
  const length = Math.round(duration * sampleRate)
  return {
    duration,
    sampleRate,
    length,
    numberOfChannels: 2,
    getChannelData: () => Float32Array.from({ length }, () => 0.5),
  }
}

/**
 * What an open editor reads. Four hits in three seconds, so the region handles
 * have real structure to announce a position within and the bracket keys have
 * somewhere to jump.
 */
function analysisFake(sampleRate = 1000, duration = 3) {
  const samples = new Float32Array(Math.round(sampleRate * duration))
  for (const at of [0.5, 1, 1.5, 2]) {
    const start = Math.round(at * sampleRate)
    for (let i = 0; i < sampleRate * 0.1 && start + i < samples.length; i += 1) {
      samples[start + i] =
        0.9 * Math.exp(-24 * (i / sampleRate)) * Math.sin((2 * Math.PI * 180 * i) / sampleRate)
    }
  }
  return { sampleRate, duration, samples }
}

vi.mock('./audio/sampleDecoder', () => decoder)

/**
 * What a render hands back and storage keeps. Small on purpose — these tests
 * are about the audio surviving, not about what it sounds like.
 */
function sliceFake() {
  return { sampleRate: 100, channels: 1, frames: 20, pcm: new Int16Array(20) }
}

/** The chop these fixtures share: a second out of an uploaded break. */
const REGION: SampleRegion = { sourceId: 'upload-1', start: 0.5, duration: 1 }

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
  decoder.decodeSample.mockClear().mockResolvedValue(decodedFake(2))
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
    // Its bytes are kept under the id the document will store, so the source
    // can be chopped later; nothing is decoded again until it is.
    expect(engineSpies.registerSourceBytes).toHaveBeenCalledWith('upload-1', expect.anything())

    fireEvent.change(screen.getByLabelText('Pad 1 sound source'), {
      target: { value: 'upload-1' },
    })

    // The slice is rendered before the document moves: a pad never claims a
    // sound it cannot make.
    expect(
      await screen.findByRole('button', { name: 'Play Pad 1 — Warehouse Break' }),
    ).toBeTruthy()
    expect(engineSpies.commitPadRegion).toHaveBeenCalledWith('pad1', {
      sourceId: 'upload-1',
      start: 0,
      duration: 2,
    })
    await waitFor(() => {
      const settings = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
      expect(settings.pad1.region).toEqual({ sourceId: 'upload-1', start: 0, duration: 2 })
    })
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
    expect(engineSpies.registerSourceBytes).not.toHaveBeenCalled()

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
    expect(engineSpies.registerSourceBytes).not.toHaveBeenCalled()
  })

  it('loads and assigns in one gesture when a file is dropped on a pad', async () => {
    await hydratedDeck()
    decoder.newSourceId.mockReturnValue('upload-dropped')

    const pad = screen.getByRole('button', { name: 'Play Pad 3 — empty' }).parentElement!
    fireEvent.drop(pad, { dataTransfer: { files: [audioFile('Rim Hit.wav')] } })

    expect(await screen.findByRole('button', { name: 'Play Pad 3 — Rim Hit' })).toBeTruthy()
    expect(engineSpies.registerSourceBytes).toHaveBeenCalledWith(
      'upload-dropped',
      expect.anything(),
    )
    // The decode it arrived with renders the pad's opening slice, and is then
    // dropped rather than held: that decode is the peak memory moment.
    expect(engineSpies.renderPadSlice).toHaveBeenCalledWith(
      'pad3',
      expect.objectContaining({ duration: 2 }),
      { sourceId: 'upload-dropped', start: 0, duration: 2 },
    )
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
    // Assignment renders the pad's slice before the document moves, so the pad
    // takes the name only once it can actually make the sound.
    expect(
      await screen.findByRole('button', { name: 'Play Pad 1 — Warehouse Perc' }),
    ).toBeTruthy()

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

/** Open the shipped source in the editor and wait for the dialog. */
async function openChopEditor(name = 'Chop Warehouse Perc'): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name }))
  return screen.findByRole('dialog')
}

function handle(edge: 'start' | 'end'): HTMLElement {
  return screen.getByRole('slider', { name: `Region ${edge}` })
}

describe('App region editor', () => {
  it('trims a region from the keyboard and commits it to a chosen pad', async () => {
    await hydratedDeck()
    const dialog = await openChopEditor()

    // Bracket keys move by structure rather than by pixel — the whole reason
    // the onsets are detected at all.
    fireEvent.keyDown(handle('start'), { key: ']' })
    fireEvent.keyDown(handle('end'), { key: '[' })

    expect(Number(handle('start').getAttribute('aria-valuenow'))).toBeCloseTo(0.5, 1)
    expect(Number(handle('end').getAttribute('aria-valuenow'))).toBeCloseTo(2, 1)

    fireEvent.change(within(dialog).getByLabelText('Assign to'), { target: { value: 'pad3' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Commit to pad' }))

    // The slice is rendered before the pad claims the sound, and the editor
    // gets out of the way once it has.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(engineSpies.commitPadRegion).toHaveBeenCalledWith(
      'pad3',
      expect.objectContaining({ sourceId: CURATED_SAMPLE_SOURCE.id }),
    )
    expect(screen.getByRole('button', { name: 'Play Pad 3 — Warehouse Perc' })).toBeTruthy()
  })

  it('reopens a pad on the edges it already has, so a move is a correction', async () => {
    await hydratedDeck()
    await openChopEditor()
    fireEvent.keyDown(handle('start'), { key: ']' })
    fireEvent.click(screen.getByRole('button', { name: 'Commit to pad' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Chop Pad 1' }))
    await screen.findByRole('dialog')

    // Not back at zero: the chop that was committed is what is on screen.
    expect(Number(handle('start').getAttribute('aria-valuenow'))).toBeCloseTo(0.5, 1)
  })

  it('cuts two regions from one source onto two pads, loading the source once', async () => {
    await hydratedDeck()
    chooseFile(audioFile('Warehouse Break.wav'))
    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    await within(sourceList).findByText('Warehouse Break')

    for (const [pad, key] of [
      ['pad1', ']'],
      ['pad2', '['],
    ] as const) {
      await openChopEditor('Chop Warehouse Break')
      fireEvent.keyDown(handle('start'), { key })
      fireEvent.change(screen.getByLabelText('Assign to'), { target: { value: pad } })
      fireEvent.click(screen.getByRole('button', { name: 'Commit to pad' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }

    // One upload, one decode, one source — and two pads pointing into it.
    expect(decoder.decodeSample).toHaveBeenCalledOnce()
    expect(within(sourceList).getAllByText('Warehouse Break')).toHaveLength(1)
    const settings = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
    expect(settings.pad1.region.sourceId).toBe('upload-1')
    expect(settings.pad2.region.sourceId).toBe('upload-1')
    expect(settings.pad1.region.start).not.toBe(settings.pad2.region.start)
  })

  it('is a modal over an inert deck that Escape releases, giving the audio back', async () => {
    await hydratedDeck()
    await openChopEditor()

    // Queried as an element rather than by role: the deck is out of the
    // accessibility tree entirely while the dialog owns the surface, which is
    // exactly what `screen.getByRole('main')` failing here would prove.
    const deck = document.querySelector('main')!
    expect(deck.hasAttribute('inert')).toBe(true)
    expect(deck.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('main')).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Closing is what releases the analysis decode — the residency the
    // two-decode split exists to bound.
    expect(engineSpies.closeSourceAnalysis).toHaveBeenCalled()
    expect(screen.getByRole('main').hasAttribute('inert')).toBe(false)
  })

  it('never lets a chop fire a stab or a pad underneath it', async () => {
    await hydratedDeck()
    await openChopEditor()

    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' })
    fireEvent.keyDown(window, { key: '1', code: 'Digit1' })

    expect(engineSpies.attackStabNote).not.toHaveBeenCalled()
    expect(engineSpies.attackPad).not.toHaveBeenCalled()
  })

  it('auditions the region on Enter without committing it', async () => {
    await hydratedDeck()
    await openChopEditor()

    fireEvent.keyDown(handle('start'), { key: 'Enter' })

    expect(engineSpies.auditionRegion).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: CURATED_SAMPLE_SOURCE.id }),
    )
    expect(engineSpies.commitPadRegion).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('leaves the pad untouched when a trim is abandoned', async () => {
    await hydratedDeck()
    await openChopEditor()
    fireEvent.keyDown(handle('start'), { key: ']' })

    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(engineSpies.commitPadRegion).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play Pad 1 — empty' })).toBeTruthy()
  })

  it('locks a chop to steps and says what that did to its speed and pitch', async () => {
    await hydratedDeck()
    fireEvent.change(screen.getByLabelText('Pad 1 sound source'), {
      target: { value: CURATED_SAMPLE_SOURCE.id },
    })
    await screen.findByRole('button', { name: 'Play Pad 1 — Warehouse Perc' })

    fireEvent.change(screen.getByLabelText('Pad 1 fit to steps'), { target: { value: '2' } })

    // The curated one-shot is 0.25 s; two 16ths at 130 BPM is 0.2308 s, so it
    // runs a little fast — and its pitch goes up with it, as pitching a record
    // does. There is no time-stretching anywhere in this feature.
    const settings = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
    expect(settings.pad1.fit).toBe(2)
    expect(screen.getByText('108 % speed, +1.4 st')).toBeTruthy()
  })
})

describe('App sample storage', () => {
  /** Let the debounced autosave land before the deck is torn down. */
  async function settleAutosave(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 450))
  }

  it('brings a chop back exactly as it was left, with nothing decoded on the way in', async () => {
    await hydratedDeck()
    chooseFile(audioFile('Warehouse Break.wav'))
    fireEvent.change(await screen.findByLabelText('Pad 1 sound source'), {
      target: { value: 'upload-1' },
    })
    await screen.findByRole('button', { name: 'Play Pad 1 — Warehouse Break' })
    await settleAutosave()

    cleanup()
    for (const spy of Object.values(engineSpies)) spy.mockClear()
    decoder.decodeSample.mockClear()
    await hydratedDeck()

    expect(
      await screen.findByRole('button', { name: 'Play Pad 1 — Warehouse Break' }),
    ).toBeTruthy()
    // The pad has its audio again, wrapped straight from stored PCM.
    await waitFor(() =>
      expect(engineSpies.registerSlice).toHaveBeenCalledWith(
        'pad1',
        expect.objectContaining({ frames: 20 }),
      ),
    )
    // Startup touches slices only. Rebuilding a slice from its source would put
    // a full-length decode on the load path and cost the first-click promise.
    expect(engineSpies.commitPadRegion).not.toHaveBeenCalled()
    expect(decoder.decodeSample).not.toHaveBeenCalled()
  })

  it('keeps no audio in the saved document, however much is loaded', async () => {
    await hydratedDeck()
    chooseFile(audioFile('Warehouse Break.wav'))
    fireEvent.change(await screen.findByLabelText('Pad 1 sound source'), {
      target: { value: 'upload-1' },
    })
    await screen.findByRole('button', { name: 'Play Pad 1 — Warehouse Break' })
    await settleAutosave()

    const saved = await loadProjectState()
    // Identifiers only: this is what keeps the document JSON, diffable,
    // migratable and cheap enough to autosave on a trailing debounce.
    expect(JSON.stringify(saved)).not.toContain('pcm')
    expect(saved!.instrumentSettings.sampler.pad1.region).toEqual({
      sourceId: 'upload-1',
      start: 0,
      duration: 2,
    })
    expect(saved!.sources.map((source) => source.id)).toEqual([
      CURATED_SAMPLE_SOURCE.id,
      'upload-1',
    ])
  })
})

describe('App missing audio', () => {
  /** A saved project whose pad 1 is chopped from an uploaded source. */
  function projectWithChop() {
    const uploaded = {
      id: 'upload-1',
      name: 'Warehouse Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    return commitRegionToSamplerPad(
      setSamplerPadFit(
        cycleActivePatternStep(addSource(createInitialProjectState(), uploaded), 'pad1', 4),
        'pad1',
        2,
      ),
      'pad1',
      REGION,
    )
  }

  it('keeps a pad sounding when only its original was cleared, and says re-chop is off', async () => {
    // Its slice is there; its source is not — the state the browser reclaiming
    // space leaves behind, and the one that must never be audible.
    await saveProjectState(projectWithChop())
    await saveSlice(sliceKey(REGION), sliceFake())

    await hydratedDeck()

    await waitFor(() =>
      expect(engineSpies.registerSlice).toHaveBeenCalledWith('pad1', expect.anything()),
    )
    expect(screen.getByRole('button', { name: 'Play Pad 1 — Warehouse Break' })).toBeTruthy()
    expect(screen.getByText(/cannot be re-chopped/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Chop Pad 1' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('offers a relink when the slice is gone, and restores the pad from a file', async () => {
    // Nothing to play, so the pad is silent — but its name, its tune, its fit
    // target and its programming are all still the user's.
    await saveProjectState(projectWithChop())
    await saveSource('upload-1', new Blob([Uint8Array.of(1)]))

    await hydratedDeck()

    expect(engineSpies.registerSlice).not.toHaveBeenCalled()
    const relink = screen.getByLabelText('Relink Pad 1')
    decoder.newSourceId.mockReturnValue('upload-relinked')

    fireEvent.change(relink, { target: { files: [audioFile('Warehouse Break again.wav')] } })

    await waitFor(() => {
      const settings = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
      expect(settings.pad1.region).toEqual({
        sourceId: 'upload-relinked',
        start: 0,
        duration: 2,
      })
    })
    const restored = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
    // Losing a file costs one click, not the beat: relinking is a repair, so
    // the pad keeps the name it had rather than taking the new file's.
    expect(restored.pad1.name).toBe('Warehouse Break')
    expect(restored.pad1.fit).toBe(2)
    const pattern = engineSpies.setPattern.mock.calls.at(-1)![0]
    expect(pattern.padLanes.find((lane: { id: string }) => lane.id === 'pad1').steps[4].on).toBe(
      true,
    )
  })

  it('warns which pads a source is under before deleting it, and leaves them sounding', async () => {
    await saveProjectState(projectWithChop())
    await saveSlice(sliceKey(REGION), sliceFake())
    await saveSource('upload-1', new Blob([Uint8Array.of(1)]))
    await hydratedDeck()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Warehouse Break' }))

    const warning = await screen.findByRole('alert')
    expect(warning.textContent).toContain('Warehouse Break')
    expect(warning.textContent).toContain('keeps')

    fireEvent.click(within(warning).getByRole('button', { name: 'Delete anyway' }))

    // The pad keeps its region, so it keeps its slice and keeps sounding; only
    // re-chopping is gone.
    expect(screen.getByRole('button', { name: 'Play Pad 1 — Warehouse Break' })).toBeTruthy()
    expect(await screen.findByText(/cannot be re-chopped/)).toBeTruthy()
    await waitFor(async () => expect(await loadSource('upload-1')).toBeUndefined())
    expect(await loadSlice(sliceKey(REGION))).toBeDefined()
  })

  it('loads the deck normally when a reference dangles, rather than failing', async () => {
    // Neither half was ever stored. Every pad resolves to a modelled state and
    // the deck opens exactly as usual.
    await saveProjectState(projectWithChop())

    await hydratedDeck()

    expect(screen.getByRole('button', { name: 'Play Pad 1 — Warehouse Break' })).toBeTruthy()
    expect(screen.getByLabelText('Relink Pad 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })
})

describe('App storage durability', () => {
  it('asks the browser to protect the audio at the first upload, and not before', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', Object.create(navigator, { storage: { value: { persist } } }))

    await hydratedDeck()

    // At startup there would be nothing to protect — it would be a permission
    // prompt about nothing.
    expect(persist).not.toHaveBeenCalled()

    chooseFile(audioFile('Warehouse Break.wav'))

    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
  })

  it('collects audio stranded by an abandoned share preview, keeping the recipient’s own', async () => {
    // The sharp orphan case: autosave is suspended during a preview, but audio
    // writes sit outside it, so a load made while previewing is referenced only
    // by a document that is never persisted.
    const uploaded = {
      id: 'upload-mine',
      name: 'My Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    const mine: SampleRegion = { sourceId: 'upload-mine', start: 0, duration: 1 }
    const recipient = commitRegionToSamplerPad(
      addSource(createInitialProjectState(), uploaded),
      'pad2',
      mine,
    )
    await saveProjectState(recipient)
    await saveSlice(sliceKey(mine), sliceFake())
    await saveSource('upload-mine', new Blob([Uint8Array.of(1)]))
    const shareUrl = await createShareUrl(
      setTransportBpm(createInitialProjectState(), 142),
      window.location.href,
    )
    window.history.replaceState(null, '', new URL(shareUrl).search)

    render(createElement(App))
    await screen.findByText('Shared beat preview')

    // Loading a sound while previewing writes audio the previewed document is
    // the only thing referencing.
    decoder.newSourceId.mockReturnValue('upload-stranded')
    chooseFile(audioFile('Borrowed.wav'))
    await waitFor(async () => expect(await loadSource('upload-stranded')).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: 'Back to my project' }))
    await waitFor(() => expect(screen.queryByText('Shared beat preview')).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 450))
    cleanup()

    await hydratedDeck()

    // The stranded source is gone; the recipient's own audio was never at risk,
    // because the sweep reads their document and not the preview.
    await waitFor(async () => expect(await loadSource('upload-stranded')).toBeUndefined())
    expect(await loadSlice(sliceKey(mine))).toBeDefined()
    expect(await loadSource('upload-mine')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Play Pad 2 — My Break' })).toBeTruthy()
  })
})

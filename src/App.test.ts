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
import { IDBObjectStore, indexedDB } from 'fake-indexeddb'
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
  type ProjectState,
} from './model/projectState'
import { MAX_SOURCE_BYTES, MAX_SOURCE_SECONDS } from './model/intake'
import {
  MICROPHONE_DENIED_MESSAGE,
  MIC_LIVE_ANNOUNCEMENT,
  MIC_OFF_ANNOUNCEMENT,
  RECORDING_FAILED_MESSAGE,
} from './model/recording'
import { RECORDER_UNAVAILABLE } from './audio/microphone'
import { CURATED_SAMPLE_SOURCE, type SampleRegion } from './model/sampler'
import { sliceKey } from './model/slice'
import { createBundle, readBundle } from './model/bundle'
import { createShareUrl, readSharedBeat } from './model/share'
import type { PadLane } from './model/types'
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
  clearSlice: vi.fn(),
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
 * The browser machinery, faked at exactly the boundary EB2-07 draws: a session
 * that hands back a blob and the inputs it opened. `getUserMedia` and
 * `MediaRecorder` themselves are left to manual verification, which is the
 * trade the issue records — everything above this line is the real thing.
 *
 * Its tracks behave like real ones, so releasing them is observable: `stop()`
 * ends a track and `readyState` says so, which is how a test can tell the
 * inputs were actually stopped rather than the stream merely dropped.
 */
const microphone = vi.hoisted(() => {
  interface FakeTrack {
    readyState: string
    stop(): void
  }
  const control = {
    /** What a finished recording hands back. */
    blob: new Blob(['recorded bytes'], { type: 'audio/webm;codecs=opus' }),
    /** Set to have the user refuse the permission prompt. */
    denial: null as Error | null,
    /** Set to have capture fail after the microphone opened. */
    failure: null as Error | null,
    /** Every input opened this session, so a test can check they all ended. */
    tracks: [] as FakeTrack[],
    /**
     * Set to leave the permission prompt unanswered, which a real one stays
     * until the user answers it — and the page keeps taking clicks throughout.
     */
    unanswered: null as Promise<void> | null,
  }
  const openMicrophone = vi.fn(async () => {
    if (control.unanswered) await control.unanswered
    if (control.denial) throw control.denial
    const opened = [1, 2].map(() => {
      const track: FakeTrack = {
        readyState: 'live',
        stop: () => {
          track.readyState = 'ended'
        },
      }
      return track
    })
    control.tracks = opened
    return {
      tracks: opened,
      finish: async () => {
        if (control.failure) throw control.failure
        return control.blob
      },
    }
  })
  return { openMicrophone, control }
})

// Only the browser call is replaced. Telling a refusal apart from a recorder
// that would not start is a pure decision, so the real one is kept.
vi.mock('./audio/microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audio/microphone')>()),
  openMicrophone: microphone.openMicrophone,
}))

/** Start a take and wait for the deck to show that the microphone is live. */
async function startRecording(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Record from microphone' }))
  await screen.findByRole('button', { name: 'Stop recording' })
}

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
  microphone.openMicrophone.mockClear()
  microphone.control.blob = new Blob(['recorded bytes'], { type: 'audio/webm;codecs=opus' })
  microphone.control.denial = null
  microphone.control.failure = null
  microphone.control.tracks = []
  microphone.control.unanswered = null
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
    expect(within(sourceList).getByText('Basement Break')).toBeTruthy()
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

describe('App microphone recording', () => {
  it('turns a take into a source that behaves exactly like an uploaded one', async () => {
    decoder.newSourceId.mockReturnValue('recording-1')
    await hydratedDeck()

    await startRecording()
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    // A source like any other: listed by name, and marked by what made it.
    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    const recorded = await within(sourceList).findByText('Recording 1')
    expect(within(recorded.closest('li')!).getByText('recording')).toBeTruthy()
    // Its bytes are kept under the same id the document stores, so it can be
    // chopped later exactly as an upload can.
    expect(engineSpies.registerSourceBytes).toHaveBeenCalledWith('recording-1', expect.anything())
    // Never probed: the clock that made it already measured it.
    expect(decoder.probeDuration).not.toHaveBeenCalled()

    // And from here it is indistinguishable — the same assignment gesture, the
    // same render-before-the-document-moves rule, the same pad.
    fireEvent.change(screen.getByLabelText('Pad 1 sound source'), {
      target: { value: 'recording-1' },
    })

    expect(await screen.findByRole('button', { name: 'Play Pad 1 — Recording 1' })).toBeTruthy()
  })

  it('says it will stop the loop, then stops it, and is unmistakable while it runs', async () => {
    await hydratedDeck()
    // The user is told before it happens, not after.
    expect(screen.getByText(/Recording stops the loop/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await screen.findByRole('button', { name: 'Stop' })

    await startRecording()

    // Stopped through the state the whole deck reads, not just at the engine:
    // the loop would otherwise be baked into the sample, unrecoverably.
    expect(engineSpies.stop).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    // Unmistakable, with elapsed time and a stop control.
    expect(screen.getByText('Recording')).toBeTruthy()
    expect(screen.getByText('0:00')).toBeTruthy()
    // And said out loud, for anyone not watching it.
    expect(screen.getByRole('status').textContent).toBe(MIC_LIVE_ANNOUNCEMENT)

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(MIC_OFF_ANNOUNCEMENT),
    )
    expect(screen.queryByText('Recording')).toBeNull()
  })

  it('will not start the loop while the microphone is live', async () => {
    await hydratedDeck()
    await startRecording()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    // Stopping the transport to record is pointless if the next click can put
    // it back: mic + speakers + master drive is the howl the rule exists for,
    // and the loop would be in the sample either way.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(engineSpies.play).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    // And it is offered back the moment the microphone is off.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-disabled')).toBeNull(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(engineSpies.play).toHaveBeenCalled())
  })

  it('will not start the loop while the permission prompt is still open', async () => {
    await hydratedDeck()
    let answerPrompt!: () => void
    microphone.control.unanswered = new Promise<void>((resolve) => {
      answerPrompt = resolve
    })

    fireEvent.click(screen.getByRole('button', { name: 'Record from microphone' }))
    await screen.findByRole('button', { name: 'Waiting for permission…' })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Asking is not capturing, so the microphone is not live here — but the
    // prompt is a long window the user controls, and answering it would open
    // the mic onto a loop they restarted while deciding. The transport has to
    // be held from the moment they ask, not from the moment the mic opens.
    expect(engineSpies.play).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-disabled')).toBe('true')

    answerPrompt()

    await screen.findByRole('button', { name: 'Stop recording' })
    expect(engineSpies.play).not.toHaveBeenCalled()
  })

  it('asks for the microphone only on record, and ends every input on stop', async () => {
    await hydratedDeck()

    // Never at startup, and never speculatively.
    expect(microphone.openMicrophone).not.toHaveBeenCalled()

    await startRecording()
    expect(microphone.control.tracks.map((track) => track.readyState)).toEqual(['live', 'live'])

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    // Ended by name rather than dropped by reference — this is what puts the
    // browser's own recording indicator out.
    await waitFor(() =>
      expect(microphone.control.tracks.map((track) => track.readyState)).toEqual([
        'ended',
        'ended',
      ]),
    )
  })

  it('releases the microphone even when the recording itself fails', async () => {
    await hydratedDeck()
    await startRecording()
    microphone.control.failure = new Error('the recorder gave up')

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('project is unchanged')
    // A failed take must not be a mic left open.
    expect(microphone.control.tracks.every((track) => track.readyState === 'ended')).toBe(true)
    expect(screen.getByRole('button', { name: 'Record from microphone' })).toBeTruthy()
  })

  it('explains a refused permission and leaves the project byte-identical', async () => {
    const saved = setTransportBpm(cycleActivePatternStep(createInitialProjectState(), 'kick', 4), 133)
    await saveProjectState(saved)
    await hydratedDeck()
    microphone.control.denial = new Error('NotAllowedError')

    fireEvent.click(screen.getByRole('button', { name: 'Record from microphone' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(MICROPHONE_DENIED_MESSAGE)
    // Nothing was captured, so nothing about the mic is claimed either way.
    expect(screen.queryByText('Recording')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')

    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(await loadProjectState()).toEqual(saved)

    // A normal, dismissible failure — the deck stays open and recordable.
    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Record from microphone' })).toBeTruthy()
  })

  it('does not blame the user when the microphone opened but would not record', async () => {
    const unavailable = new Error('MediaRecorder would not start')
    unavailable.name = RECORDER_UNAVAILABLE
    microphone.control.denial = unavailable
    await hydratedDeck()

    fireEvent.click(screen.getByRole('button', { name: 'Record from microphone' }))

    // Sending someone to grant permission they already granted points them at
    // a setting that is not the problem.
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(RECORDING_FAILED_MESSAGE)
    expect(alert.textContent).not.toContain('Allow microphone access')
  })

  it('refuses an over-long take at the same gate an over-long file hits', async () => {
    // A take long enough to refuse, without waiting six minutes for it.
    const clock = { now: 0 }
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
    await hydratedDeck()

    await startRecording()
    clock.now = (MAX_SOURCE_SECONDS + 1) * 1000
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('6 minutes')
    // The same refusal as a file: nothing decoded, nothing kept, no source.
    expect(decoder.decodeSample).not.toHaveBeenCalled()
    expect(engineSpies.registerSourceBytes).not.toHaveBeenCalled()
    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    expect(within(sourceList).queryByText('Recording 1')).toBeNull()
    // And the microphone still went off.
    expect(microphone.control.tracks.every((track) => track.readyState === 'ended')).toBe(true)
  })

  it('says nothing was captured when a take is stopped before it caught anything', async () => {
    microphone.control.blob = new Blob([], { type: 'audio/webm' })
    await hydratedDeck()

    await startRecording()
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    // The intake gate would call an empty take undecodable, which blames the
    // browser for something the user did. It is an empty recording, and the
    // deck says so.
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('too short to keep')
    expect(decoder.decodeSample).not.toHaveBeenCalled()
  })

  it('chops, tunes and sequences a take exactly as it does an upload', async () => {
    decoder.newSourceId.mockReturnValue('recording-1')
    await hydratedDeck()

    await startRecording()
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    await within(sourceList).findByText('Recording 1')

    // Chopping: the same editor, opened the same way, cutting a region out of
    // a take the way it cuts one out of a break.
    const dialog = await openChopEditor('Chop Recording 1')
    fireEvent.keyDown(handle('start'), { key: ']' })
    fireEvent.change(within(dialog).getByLabelText('Assign to'), { target: { value: 'pad2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Commit to pad' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(engineSpies.commitPadRegion).toHaveBeenCalledWith(
      'pad2',
      expect.objectContaining({ sourceId: 'recording-1' }),
    )
    expect(screen.getByRole('button', { name: 'Play Pad 2 — Recording 1' })).toBeTruthy()

    // Tuning: the pad's own knob, on the pad the take landed on.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Pad 2 Tune' }), { key: 'ArrowUp' })

    // Sequencing: a drum-shaped lane on the same sixteen steps as everything
    // else, reaching the engine as part of the same pattern.
    fireEvent.click(screen.getByRole('button', { name: 'Pad 2 step 5' }))

    await waitFor(() => {
      const settings = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
      expect(settings.pad2.region.sourceId).toBe('recording-1')
      expect(settings.pad2.tune).toBeGreaterThan(0)
    })
    const pattern = engineSpies.setPattern.mock.calls.at(-1)![0]
    expect(pattern.padLanes.find((lane: { id: string }) => lane.id === 'pad2').steps[4].on).toBe(
      true,
    )
    // And storage keeps it under the same key any other chop is kept under.
    await waitFor(async () =>
      expect(await loadSlice(sliceKey({ sourceId: 'recording-1', start: 0.5, duration: 2.5 }))).
        toBeTruthy(),
    )
  })
})

describe('App sampler workflow', () => {
  it('assigns the curated source, programs its lane, and plays it live without changing the pattern', async () => {
    render(createElement(App))
    const shareButton = screen.getByRole('button', { name: 'Share beat' })
    await waitFor(() => expect((shareButton as HTMLButtonElement).disabled).toBe(false))

    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    expect(within(sourceList).getByText('Basement Break')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Pad 1 sound source'), {
      target: { value: CURATED_SAMPLE_SOURCE.id },
    })
    // Assignment renders the pad's slice before the document moves, so the pad
    // takes the name only once it can actually make the sound.
    expect(
      await screen.findByRole('button', { name: 'Play Pad 1 — Basement Break' }),
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
  vi.restoreAllMocks()
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

  it('says how many sounds a link could not carry, and keeps its programming playable', async () => {
    // A recipient whose pads are silent with no explanation assumes the app is
    // broken. The programming is what did travel, so the beat is usable the
    // moment they put their own sounds in it.
    const uploaded = {
      id: 'upload-sender',
      name: 'Sender Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    let sender = addSource(createInitialProjectState(), uploaded)
    sender = commitRegionToSamplerPad(sender, 'pad1', {
      sourceId: 'upload-sender',
      start: 0,
      duration: 1,
    })
    sender = commitRegionToSamplerPad(sender, 'pad4', {
      sourceId: 'upload-sender',
      start: 2,
      duration: 1,
    })
    sender = cycleActivePatternStep(sender, 'pad1', 0)
    sender = setSamplerPadFit(sender, 'pad1', 4)
    await saveProjectState(createInitialProjectState())
    const shareUrl = await createShareUrl(sender, window.location.href)
    window.history.replaceState(null, '', new URL(shareUrl).search)

    render(createElement(App))

    const notice = await screen.findByText(/2 sounds could not travel/)
    expect(notice.textContent).toContain('Ask whoever sent it for a bundle file')
    // Pad programming, tune and fit all arrived, so loading their own audio is
    // all the recipient has to do.
    const pattern = engineSpies.setPattern.mock.calls.at(-1)![0]
    expect(pattern.padLanes.find((lane: PadLane) => lane.id === 'pad1').steps[0].on).toBe(true)
    const settings = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
    expect(settings.pad1.fit).toBe(4)
    expect(settings.pad1.name).toBe('Sender Break')
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

describe('App beat bundles', () => {
  const SENDER_SOURCE = {
    id: 'upload-sender',
    name: 'Sender Break',
    origin: 'upload' as const,
    duration: 4,
    channels: 2,
  }
  const SENDER_CHOP: SampleRegion = { sourceId: 'upload-sender', start: 0, duration: 1 }

  /** A beat that uses the sender's own audio, plus the slice that makes it sound. */
  function senderBeat(): ProjectState {
    let sender = addSource(setTransportBpm(createInitialProjectState(), 144), SENDER_SOURCE)
    sender = commitRegionToSamplerPad(sender, 'pad1', SENDER_CHOP)
    sender = cycleActivePatternStep(sender, 'pad1', 4)
    return sender
  }

  /** A bundle file, written the way the app writes one. */
  async function senderBundle(project = senderBeat()): Promise<File> {
    const bundle = await createBundle(
      project,
      new Map([[sliceKey(SENDER_CHOP), sliceFake()]]),
    )
    if (bundle.status !== 'ready') throw new Error('Expected a bundle fixture')
    return new File([bundle.blob], bundle.fileName)
  }

  function openBundle(file: File): void {
    fireEvent.change(screen.getByLabelText('Open a bundle'), { target: { files: [file] } })
  }

  /** Whatever the export action handed the browser to download. */
  function downloadedBlob(objectUrl: ReturnType<typeof vi.fn>): Blob {
    expect(objectUrl).toHaveBeenCalledOnce()
    return objectUrl.mock.calls[0][0] as Blob
  }

  it('exports a bundle that reproduces the beat, its pad audio included', async () => {
    const mine = senderBeat()
    await saveProjectState(mine)
    await saveSlice(sliceKey(SENDER_CHOP), sliceFake())
    const createObjectURL = vi.fn(() => 'blob:bundle')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))

    await hydratedDeck()
    fireEvent.click(screen.getByRole('button', { name: 'Export bundle' }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
    const opened = await readBundle(await downloadedBlob(createObjectURL).arrayBuffer())
    if (opened.status !== 'ready') throw new Error(`Expected a playable bundle, got ${opened.status}`)
    expect(activePattern(opened.project)).toEqual(activePattern(mine))
    expect(opened.project.transport.bpm).toBe(144)
    expect(opened.slices).toEqual(new Map([[sliceKey(SENDER_CHOP), sliceFake()]]))
    // The object URL is a handle on a megabyte of audio; holding it would leak.
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:bundle'))
  })

  it('refuses to export a beat whose own pad has lost its audio, naming that pad', async () => {
    // No slice was ever stored, so Pad 1 is silent here and would be silent
    // there. Saying so beats writing a file this build would refuse to open.
    await saveProjectState(senderBeat())
    const createObjectURL = vi.fn(() => 'blob:bundle')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))

    await hydratedDeck()
    fireEvent.click(screen.getByRole('button', { name: 'Export bundle' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Pad 1 (Sender Break) has no audio to put in a bundle')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('previews an opened bundle with its audio, and keeps it only when asked', async () => {
    const recipient = setTransportBpm(
      cycleActivePatternStep(createInitialProjectState(), 'kick', 2),
      121,
    )
    await saveProjectState(recipient)

    await hydratedDeck()
    openBundle(await senderBundle())

    await screen.findByText('Shared beat preview')
    const tempo = screen.getByRole('slider', { name: 'Tempo in beats per minute' })
    expect((tempo as HTMLInputElement).value).toBe('144')
    // The audio came with it, so the pad sounds rather than arriving silent.
    expect(engineSpies.registerSlice.mock.calls.at(-1)).toEqual(['pad1', sliceFake()])
    // And with no source behind it, the pad says re-chop is off — the state
    // sharing produces by design.
    expect(
      screen.getByText(/Original cleared — Sender Break still sounds/),
    ).toBeTruthy()

    // Autosave stays suspended: the recipient's project is untouched until they
    // say otherwise.
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(await loadProjectState()).toEqual(recipient)

    fireEvent.click(screen.getByRole('button', { name: 'Keep this beat' }))
    await waitFor(() => expect(screen.queryByText('Shared beat preview')).toBeNull())
    const kept = (await loadProjectState())!
    expect(activePattern(kept)).toEqual(activePattern(senderBeat()))
    expect(kept.transport.bpm).toBe(144)
    await new Promise((resolve) => setTimeout(resolve, 450))
  })

  it('gives the recipient their own beat and their own sounds back when they back out', async () => {
    // The sharp case a link never had: a bundle puts audio on the pads, so
    // restoring the document is not enough — the sound has to go back too, or
    // the sender's chop plays under the recipient's beat.
    const mine: SampleRegion = { sourceId: 'upload-mine', start: 0, duration: 1 }
    const myslice = { sampleRate: 100, channels: 1, frames: 8, pcm: Int16Array.of(1, 2, 3, 4, 5, 6, 7, 8) }
    let recipient = addSource(createInitialProjectState(), {
      id: 'upload-mine',
      name: 'My Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 1,
    })
    recipient = commitRegionToSamplerPad(recipient, 'pad2', mine)
    recipient = setTransportBpm(recipient, 118)
    await saveProjectState(recipient)
    await saveSlice(sliceKey(mine), myslice)
    await saveSource('upload-mine', new Blob([Uint8Array.of(1)]))

    await hydratedDeck()
    openBundle(await senderBundle())
    await screen.findByText('Shared beat preview')
    // The bundle fills Pad 1 and leaves Pad 2 empty — the reverse of this deck.
    expect(engineSpies.clearSlice.mock.calls.flat()).toContain('pad2')

    engineSpies.registerSlice.mockClear()
    engineSpies.clearSlice.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Back to my project' }))

    await waitFor(() => expect(engineSpies.registerSlice).toHaveBeenCalledTimes(1))
    // Compared through plain values: the slice came back out of IndexedDB, so
    // its `Int16Array` is a clone and not the very object saved.
    const [restoredPad, restored] = engineSpies.registerSlice.mock.calls[0]
    expect(restoredPad).toBe('pad2')
    expect({ ...restored, pcm: Array.from(restored.pcm) }).toEqual({
      ...myslice,
      pcm: Array.from(myslice.pcm),
    })
    // Pad 1 is the recipient's own empty pad again, and silent with it.
    expect(engineSpies.clearSlice.mock.calls.flat()).toContain('pad1')
    const tempo = screen.getByRole('slider', { name: 'Tempo in beats per minute' })
    expect((tempo as HTMLInputElement).value).toBe('118')
    expect(activePattern((await loadProjectState())!)).toEqual(activePattern(recipient))
    await new Promise((resolve) => setTimeout(resolve, 450))
  })

  it('collects the audio of a bundle preview that was backed out of', async () => {
    const recipient = createInitialProjectState()
    await saveProjectState(recipient)

    await hydratedDeck()
    openBundle(await senderBundle())
    await screen.findByText('Shared beat preview')
    // The bundle's audio is written where an upload's would be, so the deck
    // survives a reload if it is kept.
    await waitFor(async () => expect(await loadSlice(sliceKey(SENDER_CHOP))).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: 'Back to my project' }))
    await waitFor(() => expect(screen.queryByText('Shared beat preview')).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 450))
    cleanup()

    // Nothing references it now, so the next load sweeps it up rather than
    // leaving it stranded in storage forever.
    await hydratedDeck()
    await waitFor(async () => expect(await loadSlice(sliceKey(SENDER_CHOP))).toBeUndefined())
  })

  it('names what was wrong with a bundle it cannot open, and changes nothing', async () => {
    // A bundle cannot be opened and inspected the way an archive could, so this
    // message is the only diagnostic anyone will ever get.
    const recipient = setTransportBpm(createInitialProjectState(), 126)
    await saveProjectState(recipient)
    const whole = new Uint8Array(await (await senderBundle()).arrayBuffer())

    await hydratedDeck()
    openBundle(new File([whole.slice(0, Math.floor(whole.length / 2))], 'cut-short.ebpm'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('cut short before it finished')
    expect(screen.queryByText('Shared beat preview')).toBeNull()
    const tempo = screen.getByRole('slider', { name: 'Tempo in beats per minute' })
    expect((tempo as HTMLInputElement).value).toBe('126')

    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(await loadProjectState()).toEqual(recipient)
  })

})

/** Open the shipped source in the editor and wait for the dialog. */
async function openChopEditor(name = 'Chop Basement Break'): Promise<HTMLElement> {
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
    expect(screen.getByRole('button', { name: 'Play Pad 3 — Basement Break' })).toBeTruthy()
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
    await screen.findByRole('button', { name: 'Play Pad 1 — Basement Break' })

    fireEvent.change(screen.getByLabelText('Pad 1 fit to steps'), { target: { value: '16' } })

    // The curated break is two bars at 130 BPM; sixteen steps at 130 BPM is one
    // bar. Squeezing two bars into one is exactly double speed — and its pitch
    // goes up an octave with it, as pitching a record does. There is no
    // time-stretching anywhere in this feature.
    const settings = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
    expect(settings.pad1.fit).toBe(16)
    expect(screen.getByText('200 % speed, +12.0 st')).toBeTruthy()
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

  it('says there is not enough room, naming the pad, once giving up sources has failed', async () => {
    await hydratedDeck()
    // A browser with nothing left to give up: every audio write is refused, and
    // a deck with no stored sources has nothing to evict to make space. Project
    // document writes are left alone — the quota policy is about audio, and the
    // autosaver's own behaviour under pressure is not what this claims.
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: never[]) {
      if (this.name === 'slices' || this.name === 'sources') {
        throw new DOMException('no room', 'QuotaExceededError')
      }
      return put.apply(this, args as never)
    }

    try {
      const strip = screen.getByRole('button', { name: 'Play Pad 3 — empty' }).parentElement!
      fireEvent.drop(strip, { dataTransfer: { files: [audioFile('Too Big.wav')] } })

      const alert = await screen.findByRole('alert')
      // Naming the pad is the point: it is the thing the user can act on.
      expect(alert.textContent).toContain('Too Big')
      expect(alert.textContent).toContain('not enough room')
      // The chop sounds now and is honest about not surviving a reload.
      expect(screen.getByRole('button', { name: 'Play Pad 3 — Too Big' })).toBeTruthy()
      expect(await loadSlice(sliceKey({ sourceId: 'upload-1', start: 0, duration: 2 }))).toBeUndefined()

      fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      IDBObjectStore.prototype.put = put
    }
  })
})

describe('App curriculum tracks', () => {
  /** The track selector's own control, by the name a screen reader hears. */
  function track(name: 'Techno' | 'Sampling'): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^${name} track`) })
  }

  function switchTo(name: 'Techno' | 'Sampling'): void {
    fireEvent.click(track(name))
  }

  /** The lesson the panel is currently showing, by its position line. */
  function standingOn(): string {
    return screen.getByRole('button', { name: /^Lesson \d+/, current: 'step' }).getAttribute(
      'aria-label',
    )!
  }

  it('shows both paths with progress on each, and switches between them', async () => {
    await hydratedDeck()

    expect(track('Techno').getAttribute('aria-label')).toContain('0 of 14 complete')
    expect(track('Sampling').getAttribute('aria-label')).toContain('0 of 6 complete')
    expect(track('Techno').getAttribute('aria-pressed')).toBe('true')

    switchTo('Sampling')

    expect(track('Sampling').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('6')
    expect(standingOn()).toContain('Load a Sound')
  })

  it('keeps each track’s place, in the session and across a reload', async () => {
    await hydratedDeck()

    // Step off the path on each track, then leave and come back to both.
    fireEvent.click(screen.getByRole('button', { name: /^Lesson 9:/ }))
    expect(standingOn()).toContain('Sweep the Filter')
    switchTo('Sampling')
    fireEvent.click(screen.getByRole('button', { name: /^Lesson 4:/ }))
    expect(standingOn()).toContain('Fit the Break')

    switchTo('Techno')
    // With one pointer this is where the place would be silently gone: the
    // techno arc would fail to find a sampling lesson and fall through to
    // "first unfinished".
    expect(standingOn()).toContain('Sweep the Filter')
    switchTo('Sampling')
    expect(standingOn()).toContain('Fit the Break')

    await new Promise((resolve) => setTimeout(resolve, 450))
    cleanup()
    await hydratedDeck()

    expect(track('Sampling').getAttribute('aria-pressed')).toBe('true')
    expect(standingOn()).toContain('Fit the Break')
    switchTo('Techno')
    expect(standingOn()).toContain('Sweep the Filter')
  })

  it('leaves the sandbox byte-identical — switching tracks is not an edit', async () => {
    await hydratedDeck()
    fireEvent.click(screen.getByRole('button', { name: 'Kick step 1' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Tempo in beats per minute' }), {
      target: { value: '138' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(engineSpies.play).toHaveBeenCalled())
    const patternBefore = engineSpies.setPattern.mock.calls.at(-1)![0]
    const samplerBefore = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
    engineSpies.setBpm.mockClear()
    engineSpies.stop.mockClear()

    switchTo('Sampling')
    switchTo('Techno')
    switchTo('Sampling')

    // Same objects, not merely equal ones: navigation hands the deck's own
    // state straight back rather than rebuilding it.
    expect(engineSpies.setPattern.mock.calls.at(-1)![0]).toBe(patternBefore)
    expect(engineSpies.setSamplerSettings.mock.calls.at(-1)![0]).toBe(samplerBefore)
    expect(
      (screen.getByRole('slider', { name: 'Tempo in beats per minute' }) as HTMLInputElement)
        .value,
    ).toBe('138')
    // The loop never noticed.
    expect(engineSpies.stop).not.toHaveBeenCalled()
    expect(engineSpies.setBpm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
  })

  it('never credits a bundle’s recipient with the sampling work it arrived with', async () => {
    // A bundle carries real audio, so this is the most obviously unearned
    // completion the product could hand out: the sender's own uploaded source
    // arrives in the document and would otherwise earn "load a sound".
    const SENDER_SOURCE = {
      id: 'upload-sender',
      name: 'Sender Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    const chop: SampleRegion = { sourceId: 'upload-sender', start: 0, duration: 1 }
    const sender = commitRegionToSamplerPad(
      addSource(createInitialProjectState(), SENDER_SOURCE),
      'pad1',
      chop,
    )
    const bundle = await createBundle(sender, new Map([[sliceKey(chop), sliceFake()]]))
    if (bundle.status !== 'ready') throw new Error('Expected a bundle fixture')

    await saveProjectState(createInitialProjectState())
    await hydratedDeck()
    fireEvent.change(screen.getByLabelText('Open a bundle'), {
      target: { files: [new File([bundle.blob], bundle.fileName)] },
    })
    await screen.findByText('Shared beat preview')
    await new Promise((resolve) => setTimeout(resolve, 50))

    switchTo('Sampling')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
    expect(track('Sampling').getAttribute('aria-label')).toContain('0 of 6 complete')

    // And it becomes earnable the moment the inherited goal stops being met and
    // the recipient does the work themselves.
    fireEvent.click(screen.getByRole('button', { name: 'Keep this beat' }))
    await waitFor(() => expect(screen.queryByText('Shared beat preview')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Delete Sender Break' }))
    fireEvent.click(
      within(await screen.findByRole('alert')).getByRole('button', { name: 'Delete anyway' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0'),
    )

    chooseFile(audioFile('My Own Break.wav'))

    await waitFor(() =>
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1'),
    )
    await new Promise((resolve) => setTimeout(resolve, 450))
  })
})

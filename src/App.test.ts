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
import { computeAccessibleName } from 'dom-accessibility-api'
import { IDBObjectStore, indexedDB } from 'fake-indexeddb'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  activePattern,
  addSource,
  commitRegionToSamplerPad,
  createInitialProjectState,
  createDemoProjectState,
  cycleActivePatternStep,
  enterLesson as enterLessonIn,
  selectSlot,
  setSamplerPadFit,
  setTransportBpm,
  setTransportSwing,
  toggleActivePatternNoteStep,
  toggleVoiceSolo,
  updateLessonProgress,
  type ProjectState,
} from './model/projectState'
import { DEFAULT_ARC_ID } from './model/projectState'
import { CELEBRATION_MS } from './components/LessonPanel'
import fourOnTheFloor from './lessons/four-on-the-floor.json'
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
import { createShareUrl, PRACTICAL_SHARE_URL_LIMIT, readSharedBeat } from './model/share'
import { NOTE_LANES } from './model/note'
import { isPatternEmpty } from './model/bank'
import type { LaneId, PadLane, Pattern } from './model/types'
import { loadProjectState, saveProjectState } from './storage/projectStore'
import { loadSlice, loadSource, saveSlice, saveSource } from './storage/sampleStore'

const engineSpies = vi.hoisted(() => ({
  setBank: vi.fn(),
  getSlotLights: vi.fn(() => ({ playing: null, queued: null })),
  setMixer: vi.fn(),
  setBassSettings: vi.fn(),
  setMasterSettings: vi.fn(),
  setFxSettings: vi.fn(),
  setSamplerSettings: vi.fn(),
  setBpm: vi.fn(),
  setSwing: vi.fn(),
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

/** The selected slot's pattern from the bank the engine was last handed. */
function lastPatternHanded() {
  const [bank, selectedId] = engineSpies.setBank.mock.calls.at(-1)! as unknown as [
    Pattern[],
    string,
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return bank.find((pattern) => pattern.id === selectedId)! as any
}

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

/**
 * Every slot densely programmed and unrelated to the others — steps, accents
 * and pitches scattered by seed — so the bank is too big for one link.
 */
function withDenseUnrelatedSlots(project: ProjectState): ProjectState {
  let state = 7
  const roll = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const drumStep = () => {
    const r = roll()
    return { on: r < 0.6, accent: r < 0.3 }
  }
  const patterns = project.patterns.map((pattern) => ({
    ...pattern,
    lanes: pattern.lanes.map((lane) => ({ ...lane, steps: lane.steps.map(drumStep) })),
    padLanes: pattern.padLanes.map((lane) => ({ ...lane, steps: lane.steps.map(drumStep) })),
    noteLanes: pattern.noteLanes.map((lane) => {
      const { minPitch, maxPitch } = NOTE_LANES.find((spec) => spec.id === lane.id)!
      return {
        ...lane,
        steps: lane.steps.map(() => ({
          on: roll() < 0.7,
          pitch: minPitch + Math.floor(roll() * (maxPitch - minPitch + 1)),
          length: 1 + Math.floor(roll() * 4),
          slide: false,
          accent: false,
        })),
      }
    }),
  }))
  return { ...project, patterns }
}

/** Open the header's Share menu, unless it is already open. */
function openShareMenu(): void {
  const trigger = screen.getByRole('button', { name: 'Share' })
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger)
}

/** The deck mounts on a placeholder document and swaps in the stored one. */
/** A saved project with a programmed step on each of the given pads, so every one renders as a full strip and lane. */
async function savePadsProgrammed(padIds: LaneId[] = ['pad1', 'pad2', 'pad3', 'pad4']): Promise<void> {
  let state = createInitialProjectState()
  for (const id of padIds) state = cycleActivePatternStep(state, id, 0)
  await saveProjectState(state)
}

async function hydratedDeck(): Promise<void> {
  render(createElement(App))
  const shareButton = screen.getByRole('button', { name: 'Share' })
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

    const pad = screen.getByRole('group', { name: 'Pad 3: load a sound' })
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

    const panel = screen.getByRole('group', { name: 'Pad 1: load a sound' }).closest('section')!
    fireEvent.drop(panel, { dataTransfer: { files: [audioFile('Warehouse Break.wav')] } })

    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    expect(await within(sourceList).findByText('Warehouse Break')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Pad 1: load a sound' })).toBeTruthy()
  })

  it('shows which pad a dragged file would land on, not just the panel', async () => {
    await hydratedDeck()

    const strip = screen.getByRole('group', { name: 'Pad 2: load a sound' })
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
    const pattern = lastPatternHanded()
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
    const shareButton = screen.getByRole('button', { name: 'Share' })
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
        (screen.getByRole('button', { name: 'Share' }) as HTMLButtonElement).disabled,
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
        (screen.getByRole('button', { name: 'Share' }) as HTMLButtonElement).disabled,
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
    await savePadsProgrammed(['pad2'])
    render(createElement(App))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Share' }) as HTMLButtonElement).disabled,
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

    // The whole Share menu waits for the real project, so nothing in it can
    // reach the placeholder.
    const shareMenu = screen.getByRole('button', { name: 'Share' })
    expect((shareMenu as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() => expect((shareMenu as HTMLButtonElement).disabled).toBe(false))
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

  it('persists an incoming bank only after the recipient explicitly keeps it', async () => {
    const recipient = cycleActivePatternStep(createInitialProjectState(), 'kick', 2)
    // Slots A and D programmed, B and C empty, D selected.
    const opening = cycleActivePatternStep(createInitialProjectState(), 'kick', 8)
    const sender = setTransportBpm(
      cycleActivePatternStep(selectSlot(opening, opening.patterns[3].id), 'kick', 12),
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
    expect(kept.patterns[0]).toEqual(sender.patterns[0])
    expect(kept.patterns[3]).toEqual(sender.patterns[3])
    expect(isPatternEmpty(kept.patterns[1]) && isPatternEmpty(kept.patterns[2])).toBe(true)
    expect(activePattern(kept).name).toBe('D')
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
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Share' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    )

    openShareMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Share beat' }))

    await screen.findByText('Share URL copied to your clipboard.')
    expect(writeText).toHaveBeenCalledOnce()
    const shared = await readSharedBeat(writeText.mock.calls[0][0])
    expect(shared.status).toBe('ready')
    if (shared.status === 'ready') {
      expect(activePattern(shared.project)).toEqual(activePattern(source))
      expect(shared.project.transport.bpm).toBe(139)
    }
    // The whole bank fit, so there is nothing to own up to.
    expect(screen.queryByText(/This link holds pattern/)).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 450))
  })

  it('tells the sender a bank too big for a link went as the playing slot alone', async () => {
    const source = withDenseUnrelatedSlots(createInitialProjectState())
    await saveProjectState(source)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    // A is selected, but the loop is still sounding C: that is what the sender hears.
    engineSpies.getSlotLights.mockReturnValue({ playing: source.patterns[2].id, queued: null } as never)

    await hydratedDeck()
    openShareMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Share beat' }))

    const copied = await screen.findByText('Share URL copied to your clipboard.')
    const notice = screen.getByText(
      'This link holds pattern C only — export a bundle to send all four.',
    )
    // Announced with the result it qualifies, not left for the sender to find.
    expect(notice.closest('[role="status"]')).toBe(copied.closest('[role="status"]'))
    const url = writeText.mock.calls[0][0] as string
    expect(url.length).toBeLessThanOrEqual(PRACTICAL_SHARE_URL_LIMIT)
    const shared = await readSharedBeat(url)
    if (shared.status !== 'ready') throw new Error(`Expected a playable beat, got ${shared.status}`)
    expect(activePattern(shared.project)).toEqual(source.patterns[2])
    engineSpies.getSlotLights.mockReturnValue({ playing: null, queued: null })
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
    const pattern = lastPatternHanded()
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

describe('App pattern bank', () => {
  /** What a screen reader announces for an element, whitespace tidied. */
  function accessibleName(element: Element): string {
    return computeAccessibleName(element).replace(/\s+/g, ' ').trim()
  }

  /** The bank's slot buttons, A to D. */
  function slots(): HTMLElement[] {
    return within(screen.getByRole('group', { name: 'Pattern bank' }))
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('data-slot-id'))
  }

  it('puts four slots in the transport strip: A holds the demo and is selected, B–D are empty', async () => {
    await hydratedDeck()

    const transport = screen.getByRole('region', { name: 'Transport' })
    expect(within(transport).getByRole('group', { name: 'Pattern bank' })).toBeTruthy()
    expect(slots().map(accessibleName)).toEqual([
      'Slot A, selected',
      'Slot B, empty',
      'Slot C, empty',
      'Slot D, empty',
    ])
    expect(slots().map((slot) => slot.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ])
  })

  it('switches grid and sound at once when a slot is pressed while stopped', async () => {
    await hydratedDeck()
    const [slotA, slotB] = slots()
    // The demo's closed hat on step 3 is slot A's programming.
    expect(screen.getByRole('button', { name: 'Closed Hat step 3' }).getAttribute('aria-pressed'))
      .toBe('true')

    fireEvent.click(slotB)

    expect(slotB.getAttribute('aria-pressed')).toBe('true')
    expect(slotA.getAttribute('aria-pressed')).toBe('false')
    expect(accessibleName(slotB)).toBe('Slot B, selected, empty')
    expect(screen.getByRole('button', { name: 'Closed Hat step 3' }).getAttribute('aria-pressed'))
      .toBe('false')
    expect(lastPatternHanded().name).toBe('B')

    // Edits go to the selected slot; A keeps the demo.
    fireEvent.click(screen.getByRole('button', { name: 'Kick step 1' }))
    expect(lastPatternHanded().lanes[0].steps[0].on).toBe(true)
    expect(accessibleName(slotB)).toBe('Slot B, selected')
    fireEvent.click(slotA)
    expect(screen.getByRole('button', { name: 'Kick step 1' }).getAttribute('aria-pressed'))
      .toBe('false')
  })

  it('lights the playing slot and blinks the queued one from animation frames, naming both', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    await hydratedDeck()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(engineSpies.play).toHaveBeenCalled())
    const [slotA, slotB] = slots()
    const bank = engineSpies.setBank.mock.calls.at(-1)![0] as Pattern[]

    fireEvent.click(slotB)
    engineSpies.getSlotLights.mockReturnValue({ playing: bank[0].id, queued: bank[1].id } as never)
    for (const frame of [...frames]) frame(16)

    // Selected at once — the grid already shows B — but A is still what is heard.
    expect(slotB.getAttribute('aria-pressed')).toBe('true')
    expect(slotA.hasAttribute('data-playing')).toBe(true)
    expect(slotB.hasAttribute('data-queued')).toBe(true)
    expect(accessibleName(slotA)).toBe('Slot A, playing')
    expect(accessibleName(slotB)).toBe('Slot B, selected, queued, empty')
    expect(screen.getByText(/Editing B · hearing A/)).toBeTruthy()

    // The bar turns over: B is heard, nothing is queued.
    engineSpies.getSlotLights.mockReturnValue({ playing: bank[1].id, queued: null } as never)
    for (const frame of [...frames]) frame(32)
    expect(slotA.hasAttribute('data-playing')).toBe(false)
    expect(slotB.hasAttribute('data-playing')).toBe(true)
    expect(slotB.hasAttribute('data-queued')).toBe(false)
    expect(accessibleName(slotB)).toBe('Slot B, selected, playing, empty')
    expect(screen.queryByText(/Editing B · hearing A/)).toBeNull()
    engineSpies.getSlotLights.mockReturnValue({ playing: null, queued: null })
  })

  it('remembers the selected slot across a reload', async () => {
    await hydratedDeck()
    fireEvent.click(slots()[2])
    await new Promise((resolve) => setTimeout(resolve, 450))
    cleanup()

    await hydratedDeck()
    expect(slots()[2].getAttribute('aria-pressed')).toBe('true')
    expect(activePattern((await loadProjectState())!).name).toBe('C')
  })

  it('holds back a lesson any slot of an incoming bank already meets, whichever slot is selected', async () => {
    await saveProjectState(createInitialProjectState())
    // The sender built the four-on-the-floor in slot B, and is looking at A.
    const sender = createInitialProjectState()
    let built = selectSlot(sender, sender.patterns[1].id)
    for (const step of [0, 4, 8, 12]) built = cycleActivePatternStep(built, 'kick', step)
    built = selectSlot(built, built.patterns[0].id)
    window.history.replaceState(null, '', new URL(await createShareUrl(built, window.location.href)).search)

    render(createElement(App))
    await screen.findByText('Shared beat preview')
    await new Promise((resolve) => setTimeout(resolve, 50))
    const [slotA, slotB] = slots()

    // Over to B, where the work is: theirs, not the recipient's.
    fireEvent.click(slotB)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
    // Away to the empty A and back again is not taking the work apart.
    fireEvent.click(slotA)
    fireEvent.click(slotB)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
  })

  it('still credits a lesson the learner builds in a slot of their own while the shared slot meets it', async () => {
    await saveProjectState(createInitialProjectState())
    const sender = createInitialProjectState()
    let built = selectSlot(sender, sender.patterns[1].id)
    for (const step of [0, 4, 8, 12]) built = cycleActivePatternStep(built, 'kick', step)
    window.history.replaceState(null, '', new URL(await createShareUrl(built, window.location.href)).search)

    render(createElement(App))
    await screen.findByText('Shared beat preview')
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Slot C is empty: a four-on-the-floor built there is the learner's own.
    fireEvent.click(slots()[2])
    for (const step of [1, 5, 9, 13]) {
      fireEvent.click(screen.getByRole('button', { name: `Kick step ${step}` }))
    }

    await waitFor(() =>
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1'),
    )
  })

  describe('Copy and Clear', () => {
    const bankGroup = () => screen.getByRole('group', { name: 'Pattern bank' })
    const closedHat3 = () =>
      screen.getByRole('button', { name: 'Closed Hat step 3' }).getAttribute('aria-pressed')
    const kick1 = () => screen.getByRole('button', { name: 'Kick step 1' }).getAttribute('aria-pressed')

    /** The demo in A, a kick on step 1 of B, and A selected again. */
    async function deckWithKickInB() {
      await hydratedDeck()
      fireEvent.click(slots()[1])
      fireEvent.click(screen.getByRole('button', { name: 'Kick step 1' }))
      fireEvent.click(slots()[0])
    }

    let browserConfirm: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      browserConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    })
    afterEach(() => {
      // Never a browser dialog: it would block the session.
      expect(browserConfirm).not.toHaveBeenCalled()
      browserConfirm.mockRestore()
    })

    it('arms Copy, then copies the selected slot onto an empty slot and selects it', async () => {
      await hydratedDeck()
      const copy = screen.getByRole('button', { name: 'Copy slot A' })

      fireEvent.click(copy)
      expect(copy.getAttribute('aria-pressed')).toBe('true')
      expect(bankGroup().hasAttribute('data-copy-armed')).toBe(true)

      fireEvent.click(slots()[1])

      expect(slots()[1].getAttribute('aria-pressed')).toBe('true')
      expect(accessibleName(slots()[1])).toBe('Slot B, selected')
      expect(closedHat3()).toBe('true')
      expect(lastPatternHanded().name).toBe('B')
      expect(lastPatternHanded().lanes[2].steps[2].on).toBe(true)
      // Disarmed, and the Copy key now names the slot it would copy.
      expect(bankGroup().hasAttribute('data-copy-armed')).toBe(false)
      expect(
        screen.getByRole('button', { name: 'Copy slot B' }).getAttribute('aria-pressed'),
      ).toBe('false')
    })

    it('makes a copy that editing never reaches back through', async () => {
      await hydratedDeck()
      fireEvent.click(screen.getByRole('button', { name: 'Copy slot A' }))
      fireEvent.click(slots()[1])

      fireEvent.click(screen.getByRole('button', { name: 'Kick step 1' }))
      expect(kick1()).toBe('true')
      fireEvent.click(slots()[0])
      expect(kick1()).toBe('false')
      expect(closedHat3()).toBe('true')
    })

    it('queues the copy while playing, like any other press: A plays on, C waits for the bar', async () => {
      const frames: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      })
      await hydratedDeck()
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
      await waitFor(() => expect(engineSpies.play).toHaveBeenCalledTimes(1))
      const before = engineSpies.setBank.mock.calls.at(-1)![0] as Pattern[]

      fireEvent.click(screen.getByRole('button', { name: 'Copy slot A' }))
      fireEvent.click(slots()[2])

      // The copy is a document edit handed to the running engine — C selected,
      // A's programming untouched — never a restart, so the engine's queue
      // rule (step 0 only) is what brings C in.
      const [bank, selectedId] = engineSpies.setBank.mock.calls.at(-1)! as unknown as [
        Pattern[],
        string,
      ]
      expect(selectedId).toBe(before[2].id)
      expect(bank[0]).toBe(before[0])
      expect(bank[2].lanes).toEqual(before[0].lanes)
      expect(engineSpies.stop).not.toHaveBeenCalled()
      expect(engineSpies.play).toHaveBeenCalledTimes(1)

      // Until the bar turns, the engine reports A playing and C queued, and the
      // bank says so.
      engineSpies.getSlotLights.mockReturnValue({ playing: before[0].id, queued: before[2].id } as never)
      for (const frame of [...frames]) frame(16)
      const [slotA, , slotC] = slots()
      expect(slotC.getAttribute('aria-pressed')).toBe('true')
      expect(slotA.hasAttribute('data-playing')).toBe(true)
      expect(slotC.hasAttribute('data-queued')).toBe(true)
      expect(accessibleName(slotA)).toBe('Slot A, playing')
      expect(accessibleName(slotC)).toBe('Slot C, selected, queued')
      expect(screen.getByText(/Editing C · hearing A/)).toBeTruthy()
      engineSpies.getSlotLights.mockReturnValue({ playing: null, queued: null })
    })

    it('asks inline before overwriting a slot with programming; Cancel leaves it intact', async () => {
      await deckWithKickInB()
      fireEvent.click(screen.getByRole('button', { name: 'Copy slot A' }))
      fireEvent.click(slots()[1])

      const confirm = within(bankGroup()).getByRole('group', { name: 'Overwrite B?' })
      expect(confirm.textContent).toContain('Overwrite B?')
      const cancel = within(confirm).getByRole('button', { name: 'Cancel' })
      // The safe answer has focus, so Enter never wipes a pattern by accident.
      expect(document.activeElement).toBe(cancel)
      // Nothing has happened yet.
      expect(lastPatternHanded().name).toBe('A')

      fireEvent.click(cancel)

      expect(within(bankGroup()).queryByRole('group', { name: 'Overwrite B?' })).toBeNull()
      expect(slots()[0].getAttribute('aria-pressed')).toBe('true')
      expect(document.activeElement).toBe(slots()[1])
      fireEvent.click(slots()[1])
      expect(kick1()).toBe('true')
      expect(closedHat3()).toBe('false')
    })

    it('overwrites the slot once the inline confirm is answered', async () => {
      await deckWithKickInB()
      fireEvent.click(screen.getByRole('button', { name: 'Copy slot A' }))
      fireEvent.click(slots()[1])

      fireEvent.click(screen.getByRole('button', { name: 'Overwrite B' }))

      expect(slots()[1].getAttribute('aria-pressed')).toBe('true')
      expect(kick1()).toBe('false')
      expect(closedHat3()).toBe('true')
      expect(document.activeElement).toBe(slots()[1])
    })

    it('cancels an armed copy with Escape or by pressing Copy again', async () => {
      await hydratedDeck()
      const copy = screen.getByRole('button', { name: 'Copy slot A' })

      fireEvent.click(copy)
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
      expect(copy.getAttribute('aria-pressed')).toBe('false')
      // A slot pressed now is an ordinary press, not a copy.
      fireEvent.click(slots()[1])
      expect(accessibleName(slots()[1])).toBe('Slot B, selected, empty')

      fireEvent.click(slots()[0])
      fireEvent.click(copy)
      fireEvent.click(copy)
      expect(copy.getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(slots()[2])
      expect(accessibleName(slots()[2])).toBe('Slot C, selected, empty')
    })

    it('lets Escape close an open Share menu without also disarming Copy', async () => {
      await hydratedDeck()
      const copy = screen.getByRole('button', { name: 'Copy slot A' })
      fireEvent.click(copy)
      const share = screen.getByRole('button', { name: 'Share' })
      // A real press focuses the trigger; fireEvent does not.
      share.focus()
      fireEvent.click(share)
      expect(share.getAttribute('aria-expanded')).toBe('true')

      // Escape is the menu's: it closes, focus goes back to its trigger, and
      // the armed copy is still waiting for a slot.
      fireEvent.keyDown(share, { key: 'Escape' })
      expect(share.getAttribute('aria-expanded')).toBe('false')
      expect(copy.getAttribute('aria-pressed')).toBe('true')

      // With nothing else open, the next Escape backs out of the copy.
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
      expect(copy.getAttribute('aria-pressed')).toBe('false')
    })

    it('cancels an open overwrite confirm with Escape', async () => {
      await deckWithKickInB()
      fireEvent.click(screen.getByRole('button', { name: 'Copy slot A' }))
      fireEvent.click(slots()[1])

      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

      expect(within(bankGroup()).queryByRole('group', { name: 'Overwrite B?' })).toBeNull()
      expect(slots()[0].getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(slots()[1])
      expect(kick1()).toBe('true')
    })

    it('does nothing when the armed copy lands on its own slot', async () => {
      await hydratedDeck()
      const before = engineSpies.setBank.mock.calls.length
      fireEvent.click(screen.getByRole('button', { name: 'Copy slot A' }))

      fireEvent.click(slots()[0])

      expect(engineSpies.setBank.mock.calls.length).toBe(before)
      expect(within(bankGroup()).queryByRole('group')).toBeNull()
      expect(bankGroup().hasAttribute('data-copy-armed')).toBe(false)
      expect(slots()[0].getAttribute('aria-pressed')).toBe('true')
    })

    it('clears only the selected slot, after asking inline', async () => {
      await deckWithKickInB()
      fireEvent.click(slots()[1])
      const clear = screen.getByRole('button', { name: 'Clear slot B' })

      fireEvent.click(clear)
      const confirm = within(bankGroup()).getByRole('group', { name: 'Clear B?' })
      expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }))

      fireEvent.click(within(confirm).getByRole('button', { name: 'Clear B' }))

      expect(kick1()).toBe('false')
      expect(accessibleName(slots()[1])).toBe('Slot B, selected, empty')
      expect(accessibleName(slots()[0])).toBe('Slot A')
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear slot B' }))
      fireEvent.click(slots()[0])
      expect(closedHat3()).toBe('true')
    })

    it('keeps the slot when Clear is cancelled, by button or by Escape', async () => {
      await hydratedDeck()

      fireEvent.click(screen.getByRole('button', { name: 'Clear slot A' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(closedHat3()).toBe('true')
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear slot A' }))

      fireEvent.click(screen.getByRole('button', { name: 'Clear slot A' }))
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
      expect(within(bankGroup()).queryByRole('group', { name: 'Clear A?' })).toBeNull()
      expect(closedHat3()).toBe('true')
    })

    it('carries a held shared slot’s hold onto its copy, so copying never earns credit', async () => {
      await saveProjectState(createInitialProjectState())
      const sender = createInitialProjectState()
      let built = selectSlot(sender, sender.patterns[1].id)
      for (const step of [0, 4, 8, 12]) built = cycleActivePatternStep(built, 'kick', step)
      window.history.replaceState(null, '', new URL(await createShareUrl(built, window.location.href)).search)

      render(createElement(App))
      await screen.findByText('Shared beat preview')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // The sender's B, copied onto the empty C, is still the sender's work.
      fireEvent.click(screen.getByRole('button', { name: 'Copy slot B' }))
      fireEvent.click(slots()[2])
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(accessibleName(slots()[2])).toBe('Slot C, selected')
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
    })
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
    openShareMenu()
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
    openShareMenu()
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
    openShareMenu()
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
    expect(screen.getByRole('group', { name: 'Pad 1: load a sound' })).toBeTruthy()
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
    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    await within(sourceList).findByText('Warehouse Break')
    fireEvent.change(screen.getByLabelText('Pad 1 sound source'), {
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
    const sourceList = screen.getByRole('group', { name: 'Sample sources' })
    await within(sourceList).findByText('Warehouse Break')
    fireEvent.change(screen.getByLabelText('Pad 1 sound source'), {
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

describe('App sampler compaction', () => {
  it('shows an empty pad as a compact card, and its lane as soon as it has a sound', async () => {
    await hydratedDeck()

    // A fresh deck's pads have neither a sound nor programming.
    expect(screen.getByRole('group', { name: 'Pad 1: load a sound' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pad 1 step 1' })).toBeNull()
    expect(screen.queryByRole('slider', { name: /Pad 1 Tune/ })).toBeNull()

    fireEvent.change(screen.getByLabelText('Pad 1 sound source'), {
      target: { value: CURATED_SAMPLE_SOURCE.id },
    })

    expect(await screen.findByRole('button', { name: 'Pad 1 step 1' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Pad 1: load a sound' })).toBeNull()
    // The other three pads are still cards.
    expect(screen.getByRole('group', { name: 'Pad 2: load a sound' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pad 2 step 1' })).toBeNull()
  })

  it('keeps the lane of a pad that lost its audio but has programming', async () => {
    const uploaded = {
      id: 'upload-1',
      name: 'Warehouse Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    // Chopped and programmed, but no slice was ever stored: the pad is silent.
    await saveProjectState(
      commitRegionToSamplerPad(
        cycleActivePatternStep(addSource(createInitialProjectState(), uploaded), 'pad1', 4),
        'pad1',
        REGION,
      ),
    )

    await hydratedDeck()

    expect(screen.getByRole('button', { name: /^Pad 1 step 5/ }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.queryByRole('group', { name: 'Pad 1: load a sound' })).toBeNull()
  })

  it('keeps a silent pad drawn even with no steps, so its relink is never folded away', async () => {
    const uploaded = {
      id: 'upload-1',
      name: 'Warehouse Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    // A region but no stored slice, and nothing programmed.
    await saveProjectState(
      commitRegionToSamplerPad(addSource(createInitialProjectState(), uploaded), 'pad1', REGION),
    )

    await hydratedDeck()

    expect(screen.getByRole('button', { name: 'Pad 1 step 1' })).toBeTruthy()
    expect(screen.getByText('Relink Pad 1')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Pad 1: load a sound' })).toBeNull()
  })

  it('folds a soundless lane back into a card when its last step is cleared, keeping focus', async () => {
    // Programming without a sound: the lane is shown for the steps alone.
    await saveProjectState(cycleActivePatternStep(createInitialProjectState(), 'pad2', 2))
    await hydratedDeck()

    const step = screen.getByRole('button', { name: /^Pad 2 step 3/ })
    expect(screen.queryByRole('group', { name: 'Pad 2: load a sound' })).toBeNull()

    step.focus()
    fireEvent.click(step) // on → accented
    fireEvent.click(screen.getByRole('button', { name: /^Pad 2 step 3/ })) // accented → off

    expect(screen.queryByRole('button', { name: /^Pad 2 step 3/ })).toBeNull()
    expect(screen.getByRole('group', { name: 'Pad 2: load a sound' })).toBeTruthy()
    // The control the user pressed is gone; focus lands on the card, not the page.
    expect(document.activeElement).toBe(screen.getByLabelText('Pad 2 sound source'))
  })

  it('keeps a soloed soundless lane on the deck when its last step is cleared', async () => {
    await saveProjectState(
      toggleVoiceSolo(cycleActivePatternStep(createInitialProjectState(), 'pad2', 2), 'pad2'),
    )
    await hydratedDeck()

    fireEvent.click(screen.getByRole('button', { name: /^Pad 2 step 3/ })) // on → accented
    fireEvent.click(screen.getByRole('button', { name: /^Pad 2 step 3/ })) // accented → off

    // Still soloed, so still silencing every other voice: its S has to stay in reach.
    expect(screen.getByRole('button', { name: /^Pad 2 step 3/ }).getAttribute('aria-pressed')).toBe(
      'false',
    )
    expect(screen.queryByRole('group', { name: 'Pad 2: load a sound' })).toBeNull()
  })

  it("spotlights an empty pad's card when the lesson points at that pad's Tune", async () => {
    await saveProjectState(enterLessonIn(createInitialProjectState(), 'sampling', 'tune-a-pad'))
    await hydratedDeck()

    // No sound yet, so no Tune knob: the card is where the lesson starts.
    const card = screen.getByRole('group', { name: 'Pad 1: load a sound' })
    expect(card.hasAttribute('data-spotlit')).toBe(true)
    expect(
      screen.getByRole('group', { name: 'Pad 2: load a sound' }).hasAttribute('data-spotlit'),
    ).toBe(false)
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
    const pattern = lastPatternHanded()
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
      const strip = screen.getByRole('group', { name: 'Pad 3: load a sound' })
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

  /** Unfold the curriculum line's numbered path, unless it already is. */
  function showPath(): void {
    const toggle = screen.getByRole('button', { name: 'Path' })
    if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  }

  /** The lesson the panel is currently showing, by its position line. */
  function standingOn(): string {
    showPath()
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

  it('folds the path into one line that names the lesson, and unfolds it on request', async () => {
    await hydratedDeck()

    const toggle = screen.getByRole('button', { name: 'Path' })
    const line = screen.getByRole('navigation', { name: 'Curriculum' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: /^Lesson \d+:/ })).toBeNull()
    // Folded, the line still says where the learner is and how far along.
    expect(within(line).getByText('Four on the Floor')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Lessons complete' })).toBeTruthy()

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('button', { name: /^Lesson \d+:/ })).toHaveLength(14)
    // Unfolded, every lesson is one click away.
    fireEvent.click(screen.getByRole('button', { name: /^Lesson 3:/ }))
    expect(within(line).getByText('Clap on 2 and 4')).toBeTruthy()

    fireEvent.click(toggle)
    expect(screen.queryByRole('button', { name: /^Lesson \d+:/ })).toBeNull()
  })

  it('keeps the path’s unfolding to this session, out of the saved project', async () => {
    await hydratedDeck()

    fireEvent.click(screen.getByRole('button', { name: 'Path' }))
    // Moving along the path is a document edit, so a save follows it.
    fireEvent.click(screen.getByRole('button', { name: /^Lesson 2:/ }))
    await new Promise((resolve) => setTimeout(resolve, 450))

    const saved = await loadProjectState()
    expect(saved?.prefs).toEqual({})
  })

  it('keeps each track’s place, in the session and across a reload', async () => {
    await hydratedDeck()

    // Step off the path on each track, then leave and come back to both.
    showPath()
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
    const patternBefore = lastPatternHanded()
    const samplerBefore = engineSpies.setSamplerSettings.mock.calls.at(-1)![0]
    engineSpies.setBpm.mockClear()
    engineSpies.stop.mockClear()

    switchTo('Sampling')
    switchTo('Techno')
    switchTo('Sampling')

    // Same objects, not merely equal ones: navigation hands the deck's own
    // state straight back rather than rebuilding it.
    expect(lastPatternHanded()).toBe(patternBefore)
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

  /** A sender who has loaded audio of their own and chopped it onto a pad. */
  function senderWithOwnSound(): { project: ProjectState; chop: SampleRegion } {
    const source = {
      id: 'upload-sender',
      name: 'Sender Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    const chop: SampleRegion = { sourceId: 'upload-sender', start: 0, duration: 1 }
    return {
      project: commitRegionToSamplerPad(
        addSource(createInitialProjectState(), source),
        'pad1',
        chop,
      ),
      chop,
    }
  }

  it('never credits a link’s recipient with the sampling work it arrived with', async () => {
    // A link drops the audio but still carries the source metadata and the
    // pad's region, so it can arrive with "load a sound" already met.
    await saveProjectState(createInitialProjectState())
    const shareUrl = await createShareUrl(senderWithOwnSound().project, window.location.href)
    window.history.replaceState(null, '', new URL(shareUrl).search)

    render(createElement(App))
    await screen.findByText('Shared beat preview')
    await new Promise((resolve) => setTimeout(resolve, 50))

    switchTo('Sampling')

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
    expect(track('Sampling').getAttribute('aria-label')).toContain('0 of 6 complete')
  })

  it('never credits a bundle’s recipient with the sampling work it arrived with', async () => {
    // A bundle carries real audio, so this is the most obviously unearned
    // completion the product could hand out: the sender's own uploaded source
    // arrives in the document and would otherwise earn "load a sound".
    const { project: sender, chop } = senderWithOwnSound()
    const bundle = await createBundle(sender, new Map([[sliceKey(chop), sliceFake()]]))
    if (bundle.status !== 'ready') throw new Error('Expected a bundle fixture')

    await saveProjectState(createInitialProjectState())
    await hydratedDeck()
    openShareMenu()
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

describe('App swing', () => {
  function swingKnob(): HTMLElement {
    return screen.getByRole('slider', { name: 'Swing' })
  }

  it('puts a Swing knob beside tempo that reads 50–75% and drives the sequencer', async () => {
    await hydratedDeck()

    const knob = swingKnob()
    // Beside the tempo fader, in the transport.
    expect(
      knob.closest('.transport')?.contains(
        screen.getByRole('slider', { name: 'Tempo in beats per minute' }),
      ),
    ).toBe(true)
    expect(knob.getAttribute('aria-valuemin')).toBe('50')
    expect(knob.getAttribute('aria-valuemax')).toBe('75')
    expect(knob.getAttribute('aria-valuetext')).toBe('50 %')
    expect(engineSpies.setSwing).toHaveBeenLastCalledWith(0.5)

    fireEvent.keyDown(knob, { key: 'End' })
    expect(knob.getAttribute('aria-valuetext')).toBe('75 %')
    expect(engineSpies.setSwing).toHaveBeenLastCalledWith(0.75)

    fireEvent.keyDown(knob, { key: 'Home' })
    expect(knob.getAttribute('aria-valuetext')).toBe('50 %')
    expect(engineSpies.setSwing).toHaveBeenLastCalledWith(0.5)

    // Page jumps a tenth of the travel (2.5%), arrows nudge a fiftieth (0.5%).
    fireEvent.keyDown(knob, { key: 'PageUp' })
    expect(engineSpies.setSwing.mock.calls.at(-1)![0]).toBeCloseTo(0.525, 12)
    fireEvent.keyDown(knob, { key: 'ArrowUp' })
    expect(knob.getAttribute('aria-valuetext')).toBe('53 %')
    expect(engineSpies.setSwing.mock.calls.at(-1)![0]).toBeCloseTo(0.53, 12)
  })

  it('opens a saved project at its own swing, and gives it to the sequencer', async () => {
    await saveProjectState(setTransportSwing(createInitialProjectState(), 0.62))

    await hydratedDeck()

    expect(swingKnob().getAttribute('aria-valuetext')).toBe('62 %')
    expect(engineSpies.setSwing).toHaveBeenLastCalledWith(0.62)
  })

  it('saves a swing move, so it survives a reload', async () => {
    await hydratedDeck()

    fireEvent.keyDown(swingKnob(), { key: 'End' })

    await waitFor(async () => expect((await loadProjectState())?.transport.swing).toBe(0.75))
  })
})

describe('App voice mixer', () => {
  const lastMixer = () => engineSpies.setMixer.mock.calls.at(-1)![0] as ProjectState['mixer']

  it('gives all eleven voices a Level knob beside their M and S, resting at 0 dB', async () => {
    await savePadsProgrammed()
    await hydratedDeck()

    const voices = [
      'Kick',
      'Clap',
      'Closed Hat',
      'Open Hat',
      'Perc',
      'Pad 1',
      'Pad 2',
      'Pad 3',
      'Pad 4',
      'Bass',
      'Stab',
    ]
    for (const voice of voices) {
      const level = screen.getByRole('slider', { name: `${voice} Level` })
      expect(level.getAttribute('aria-valuetext')).toBe('0.0 dB')
      expect(screen.getByRole('button', { name: `Mute ${voice}` })).toBeTruthy()
      expect(screen.getByRole('button', { name: `Solo ${voice}` })).toBeTruthy()
    }
  })

  it('puts the bass and stab strips in their panel headers', async () => {
    await hydratedDeck()

    const bass = screen.getByRole('region', { name: 'Bass Line' })
    const stab = screen.getByRole('region', { name: 'Chord Stab' })
    for (const [panel, voice] of [
      [bass, 'Bass'],
      [stab, 'Stab'],
    ] as const) {
      const header = panel.querySelector('.panel-title')!
      expect(within(header as HTMLElement).getByRole('button', { name: `Mute ${voice}` })).toBeTruthy()
      expect(within(header as HTMLElement).getByRole('button', { name: `Solo ${voice}` })).toBeTruthy()
      expect(within(header as HTMLElement).getByRole('slider', { name: `${voice} Level` })).toBeTruthy()
    }
  })

  it('solos the bass and mutes the stab through the one mixer the engine reads', async () => {
    await hydratedDeck()

    fireEvent.click(screen.getByRole('button', { name: 'Solo Bass' }))
    expect(lastMixer().bass).toEqual({ muted: false, soloed: true, level: 1 })
    expect(screen.getByRole('button', { name: 'Solo Bass' }).getAttribute('aria-pressed')).toBe('true')
    // Every un-soloed voice shows as silenced, drums included.
    expect(screen.getByRole('group', { name: 'Kick steps' }).closest('.is-silenced')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Chord Stab' }).classList).toContain('is-silenced')
    expect(screen.getByRole('region', { name: 'Bass Line' }).classList).not.toContain('is-silenced')

    fireEvent.click(screen.getByRole('button', { name: 'Solo Bass' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mute Stab' }))
    expect(lastMixer().stab).toEqual({ muted: true, soloed: false, level: 1 })
    expect(screen.getByRole('region', { name: 'Chord Stab' }).classList).toContain('is-silenced')
  })

  it('turns a Level from the keyboard, reads it out in dB, and saves it', async () => {
    await hydratedDeck()
    const hats = screen.getByRole('slider', { name: 'Closed Hat Level' })

    fireEvent.keyDown(hats, { key: 'End' })
    expect(hats.getAttribute('aria-valuetext')).toBe('+6.0 dB')
    fireEvent.keyDown(hats, { key: 'Home' })
    expect(hats.getAttribute('aria-valuetext')).toBe('−∞ dB')
    expect(lastMixer().closedHat).toEqual({ muted: false, soloed: false, level: 0 })
    fireEvent.keyDown(hats, { key: 'PageUp' })
    fireEvent.keyDown(hats, { key: 'PageUp' })
    const level = lastMixer().closedHat!.level
    expect(level).toBeGreaterThan(0)
    expect(level).toBeLessThan(1)

    const stab = screen.getByRole('slider', { name: 'Stab Level' })
    fireEvent.keyDown(stab, { key: 'ArrowDown' })
    expect(lastMixer().stab!.level).toBeLessThan(1)

    await new Promise((resolve) => setTimeout(resolve, 450))
    const saved = (await loadProjectState())!
    expect(saved.mixer.closedHat?.level).toBe(level)
    expect(saved.mixer.stab?.level).toBe(lastMixer().stab!.level)
  })
})

describe('App progress chips', () => {
  /** The lesson card's chip list, by the name a screen reader hears. */
  function chips(): HTMLElement[] {
    return within(screen.getByRole('list', { name: 'Goal progress' })).getAllByRole('listitem')
  }

  /** The deck's one polite live region for lesson progress. */
  function announcer(): HTMLElement {
    const region = document.querySelector<HTMLElement>('.lesson-announcer')
    expect(region?.getAttribute('aria-live')).toBe('polite')
    return region!
  }

  function kick(step: number): void {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Kick step ${step}( |$)`) }))
  }

  function enterLesson(position: number): void {
    const toggle = screen.getByRole('button', { name: 'Path' })
    if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Lesson ${position}:`) }))
  }

  it('shows a chip per assertion that counts placement and extras, never positions', async () => {
    await hydratedDeck()

    expect(chips().map((chip) => chip.textContent)).toEqual(['Kick 0/4'])
    kick(1)
    expect(chips()[0].textContent).toBe('Kick 1/4')
    kick(2)
    expect(chips()[0].textContent).toBe('Kick 1/4 · 1 extra')
  })

  it('turns a met chip into a ✓ with accessible text, and lists the capstone as a checklist', async () => {
    await hydratedDeck()
    enterLesson(14)

    expect(chips().map((chip) => chip.textContent)).toEqual([
      'Kick 0/4',
      'Clap 1/2',
      'Closed Hat 3/4',
      'Bass notes 0/4',
      'Stab notes 0/2',
    ])
    for (const step of [1, 5, 9, 13]) kick(step)

    const [kickChip, clapChip] = chips()
    expect(kickChip.classList.contains('is-met')).toBe(true)
    expect(kickChip.textContent).toBe('✓Kick 4/4, done')
    expect(within(kickChip).getByText('✓').getAttribute('aria-hidden')).toBe('true')
    expect(clapChip.classList.contains('is-met')).toBe(false)
  })

  it('announces a chip becoming met, and nothing for count changes', async () => {
    await hydratedDeck()
    enterLesson(14)

    for (const step of [1, 5, 9]) kick(step)
    expect(announcer().textContent).toBe('')

    kick(13)
    expect(announcer().textContent).toBe('Kick 4/4 done')
    const firstSaid = announcer().firstElementChild

    kick(2)
    expect(announcer().firstElementChild).toBe(firstSaid)
    kick(2)
    kick(2)
    // Undone and redone: met again, said again — as a new node, so the same
    // words are heard a second time rather than left unchanged.
    expect(announcer().textContent).toBe('Kick 4/4 done')
    expect(announcer().firstElementChild).not.toBe(firstSaid)
  })

  it('announces the lesson completing once, instead of the chip that completed it', async () => {
    await hydratedDeck()

    for (const step of [1, 5, 9]) kick(step)
    expect(announcer().textContent).toBe('')
    kick(13)

    await waitFor(() =>
      expect(announcer().textContent).toBe('Lesson complete: Four on the Floor'),
    )
    expect(screen.getByText('Lesson complete')).toBeTruthy()
    // The celebration is no second live region.
    const celebration = screen.getByText(/^Locked in/)
    expect(celebration.getAttribute('role')).toBeNull()
    expect(celebration.closest('[aria-live]')).toBeNull()
    // An earned card says it is done; the chips step aside (EB3-04b).
    expect(screen.queryByRole('list', { name: 'Goal progress' })).toBeNull()
  })

  it('says nothing for work that was already done on arrival or on reload', async () => {
    let saved = createInitialProjectState()
    for (const step of [0, 4, 8, 12]) saved = cycleActivePatternStep(saved, 'kick', step)
    await saveProjectState(saved)

    await hydratedDeck()

    // Lesson 1 is earned by the saved beat as the deck opens, silently.
    await waitFor(() => expect(screen.getByText('Lesson complete')).toBeTruthy())
    expect(announcer().textContent).toBe('')

    // Walking onto a lesson whose chip is already met is not meeting it.
    enterLesson(14)
    expect(chips()[0].classList.contains('is-met')).toBe(true)
    expect(announcer().textContent).toBe('')
  })
})

describe('App lesson strip and scroll to spotlight', () => {
  /** Where every box sits, as the browser would report it. */
  let boxOf: (element: Element) => { top: number; bottom: number }
  const scrolled = vi.fn()

  beforeEach(() => {
    // By default every spotlit control is far below the fold.
    boxOf = (element) =>
      element.matches('.is-spotlit, [data-spotlit]')
        ? { top: 1400, bottom: 1480 }
        : { top: 0, bottom: 0 }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const { top, bottom } = boxOf(this)
      return {
        top,
        bottom,
        left: 0,
        right: 0,
        x: 0,
        y: top,
        width: 0,
        height: bottom - top,
        toJSON: () => ({}),
      } as DOMRect
    })
    scrolled.mockClear()
    // jsdom has no scrolling; this is the one call the deck makes to scroll.
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrolled,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  function lessonCard(): HTMLElement {
    return screen.getByRole('complementary', { name: 'Lesson' })
  }

  function pickLesson(position: number): void {
    const toggle = screen.getByRole('button', { name: 'Path' })
    if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Lesson ${position}:`) }))
  }

  function kick(step: number): void {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Kick step ${step}( |$)`) }))
  }

  /** The knob wrapper a slider sits in — the element its spotlight ring is drawn on. */
  function knobOf(name: string): Element {
    return screen.getByRole('slider', { name }).closest('.knob')!
  }

  /** A saved project whose lesson 1 was earned in an earlier session. */
  async function savedWithLessonOneEarned(): Promise<void> {
    let saved = createInitialProjectState()
    for (const step of [0, 4, 8, 12]) saved = cycleActivePatternStep(saved, 'kick', step)
    saved = updateLessonProgress(saved, 'four-on-the-floor', { completed: true })
    await saveProjectState(saved)
  }

  describe('completed strip', () => {
    it(
      'celebrates a lesson just earned, then shrinks it to a strip with ✓, Next ▸ and Reopen',
      async () => {
        await hydratedDeck()
        for (const step of [1, 5, 9, 13]) kick(step)

        // The celebration first, with the way on already offered. An earned
        // lesson says it is done, so its chips step aside.
        await waitFor(() => expect(screen.getByText(/^Locked in/)).toBeTruthy())
        expect(within(lessonCard()).queryByRole('list', { name: 'Goal progress' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Next: Offbeat Hats' })).toBeTruthy()

        await waitFor(
          () => expect(lessonCard().classList.contains('is-strip')).toBe(true),
          { timeout: CELEBRATION_MS + 1500 },
        )
        const card = lessonCard()
        expect(within(card).getByText('✓').getAttribute('aria-hidden')).toBe('true')
        expect(within(card).getByText('Lesson complete')).toBeTruthy()
        expect(within(card).getByRole('heading', { name: 'Four on the Floor' })).toBeTruthy()
        expect(within(card).getByRole('button', { name: 'Next: Offbeat Hats' })).toBeTruthy()
        expect(
          within(card).getByRole('button', { name: 'Reopen lesson' }).getAttribute('aria-expanded'),
        ).toBe('false')
        // Earned is said by the strip; the chips step aside.
        expect(within(card).queryByRole('list', { name: 'Goal progress' })).toBeNull()
        expect(screen.queryByText(/^Locked in/)).toBeNull()
      },
      CELEBRATION_MS + 5000,
    )

    it('lands on the strip, not a replayed celebration, for a lesson earned before the reload', async () => {
      await savedWithLessonOneEarned()
      await hydratedDeck()

      await waitFor(() => expect(lessonCard().classList.contains('is-strip')).toBe(true))
      expect(screen.queryByText(/^Locked in/)).toBeNull()
    })

    it('reopens the full lesson text from the strip, and folds it back', async () => {
      await savedWithLessonOneEarned()
      await hydratedDeck()
      await waitFor(() => expect(lessonCard().classList.contains('is-strip')).toBe(true))

      fireEvent.click(screen.getByRole('button', { name: 'Reopen lesson' }))

      expect(lessonCard().classList.contains('is-strip')).toBe(false)
      expect(within(lessonCard()).getByText(fourOnTheFloor.intro)).toBeTruthy()
      expect(within(lessonCard()).queryByRole('list', { name: 'Goal progress' })).toBeNull()
      const collapse = screen.getByRole('button', { name: 'Collapse lesson' })
      expect(collapse.getAttribute('aria-expanded')).toBe('true')
      // Still earned, still waiting on the learner to move on.
      expect(screen.getByRole('button', { name: 'Next: Offbeat Hats' })).toBeTruthy()

      fireEvent.click(collapse)
      expect(lessonCard().classList.contains('is-strip')).toBe(true)
    })

    it(
      'holds the celebration behind a finale until the finale is closed',
      async () => {
        // The Techno capstone, one kick short of done.
        let saved = createDemoProjectState()
        for (const step of [0, 4, 8]) saved = cycleActivePatternStep(saved, 'kick', step)
        saved = cycleActivePatternStep(saved, 'snare', 4)
        saved = cycleActivePatternStep(saved, 'closedHat', 14)
        for (const step of [1, 3, 9, 11]) saved = toggleActivePatternNoteStep(saved, 'bass', step)
        for (const step of [2, 10]) saved = toggleActivePatternNoteStep(saved, 'stab', step)
        await saveProjectState(enterLessonIn(saved, DEFAULT_ARC_ID, 'your-first-techno-groove'))
        await hydratedDeck()
        await waitFor(() =>
          expect(
            within(lessonCard()).getByRole('heading', { name: 'Your First Techno Groove' }),
          ).toBeTruthy(),
        )

        kick(13)
        const close = await screen.findByRole('button', { name: /Keep it rolling/ })
        await new Promise((resolve) => setTimeout(resolve, CELEBRATION_MS + 300))
        fireEvent.click(close)

        // The learner has not seen the celebration yet, so it has not ended.
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(lessonCard().classList.contains('is-strip')).toBe(false)
        expect(screen.getByText(/^Locked in/)).toBeTruthy()
      },
      CELEBRATION_MS + 5000,
    )

    it('waits for Next ▸ before moving the path on', async () => {
      await savedWithLessonOneEarned()
      await hydratedDeck()
      await waitFor(() => expect(lessonCard().classList.contains('is-strip')).toBe(true))

      // Working on the groove does not move the path.
      kick(2)
      kick(2)
      kick(2)
      expect(within(lessonCard()).getByRole('heading', { name: 'Four on the Floor' })).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Next: Offbeat Hats' }))

      expect(within(lessonCard()).getByRole('heading', { name: 'Offbeat Hats' })).toBeTruthy()
      expect(lessonCard().classList.contains('is-complete')).toBe(false)
    })
  })

  describe('scroll to spotlight', () => {
    it('brings an off-screen spotlight into view when a lesson is picked on the path', async () => {
      await hydratedDeck()
      expect(scrolled).not.toHaveBeenCalled()

      pickLesson(9)

      expect(within(lessonCard()).getByRole('heading', { name: 'Sweep the Filter' })).toBeTruthy()
      expect(scrolled).toHaveBeenCalledTimes(1)
      expect(scrolled.mock.contexts[0]).toBe(knobOf('Cutoff'))
      expect(scrolled).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    it('never scrolls on load, or on any edit while the lesson is open', async () => {
      // Saved standing on the filter sweep, whose Cutoff knob is off-screen.
      await saveProjectState(
        enterLessonIn(createInitialProjectState(), DEFAULT_ARC_ID, 'filter-sweep'),
      )
      await hydratedDeck()
      await waitFor(() =>
        expect(within(lessonCard()).getByRole('heading', { name: 'Sweep the Filter' })).toBeTruthy(),
      )

      const cutoff = screen.getByRole('slider', { name: 'Cutoff' })
      fireEvent.keyDown(cutoff, { key: 'ArrowDown' })
      fireEvent.keyDown(cutoff, { key: 'PageDown' })
      kick(1)
      kick(5)
      fireEvent.change(screen.getByRole('slider', { name: 'Tempo in beats per minute' }), {
        target: { value: '128' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
      await waitFor(() => expect(engineSpies.play).toHaveBeenCalled())

      expect(scrolled).not.toHaveBeenCalled()
    })

    it('does not scroll into a lesson whose goal is already met on arrival', async () => {
      // Four on the floor already programmed, but saved standing on lesson 2.
      let saved = createInitialProjectState()
      for (const step of [0, 4, 8, 12]) saved = cycleActivePatternStep(saved, 'kick', step)
      await saveProjectState(enterLessonIn(saved, DEFAULT_ARC_ID, 'offbeat-hats'))
      await hydratedDeck()
      await waitFor(() =>
        expect(within(lessonCard()).getByRole('heading', { name: 'Offbeat Hats' })).toBeTruthy(),
      )

      pickLesson(1)

      // It is earned the moment it opens, so its spotlight is already resting.
      await waitFor(() => expect(lessonCard().classList.contains('is-strip')).toBe(true))
      expect(scrolled).not.toHaveBeenCalled()
    })

    it('leaves a spotlight that is already fully visible where it is', async () => {
      boxOf = (element) =>
        element.matches('.is-spotlit, [data-spotlit]')
          ? { top: 300, bottom: 380 }
          : { top: 0, bottom: 0 }
      await hydratedDeck()

      pickLesson(2)

      expect(within(lessonCard()).getByRole('heading', { name: 'Offbeat Hats' })).toBeTruthy()
      expect(scrolled).not.toHaveBeenCalled()
    })

    it('treats a spotlight inside the sticky transport strip as always in view', async () => {
      await hydratedDeck()

      pickLesson(6)

      expect(lessonCard().textContent).toMatch(/tempo/i)
      expect(scrolled).not.toHaveBeenCalled()
    })

    it('scrolls when a dismissed lesson is resumed, and when Next ▸ enters the next one', async () => {
      await savedWithLessonOneEarned()
      await hydratedDeck()
      await waitFor(() => expect(lessonCard().classList.contains('is-strip')).toBe(true))

      fireEvent.click(screen.getByRole('button', { name: 'Next: Offbeat Hats' }))
      expect(scrolled).toHaveBeenCalledTimes(1)
      expect(scrolled.mock.contexts[0]).toBe(
        screen.getByRole('button', { name: /^Closed Hat step 1( |$)/ }).closest('.step-row'),
      )

      fireEvent.click(within(lessonCard()).getByRole('button', { name: 'Dismiss lesson' }))
      expect(scrolled).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: /^Resume lesson/ }))
      expect(scrolled).toHaveBeenCalledTimes(2)
    })

    it('offers "Show me" on the lesson card to scroll there on demand', async () => {
      await hydratedDeck()
      expect(scrolled).not.toHaveBeenCalled()

      fireEvent.click(within(lessonCard()).getByRole('button', { name: 'Show me' }))

      expect(scrolled).toHaveBeenCalledTimes(1)
      expect(scrolled.mock.contexts[0]).toBe(
        screen.getByRole('button', { name: /^Kick step 1( |$)/ }).closest('.step-row'),
      )
    })

    it('jumps instead of gliding under reduced motion', async () => {
      vi.stubGlobal(
        'matchMedia',
        (query: string) =>
          ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
          }) as unknown as MediaQueryList,
      )
      await hydratedDeck()

      pickLesson(9)

      expect(scrolled).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
    })
  })
})

describe('App bass Accent row and Env Mod', () => {
  const accentRow = () => screen.getByRole('group', { name: 'Bass accent steps' })
  const accentStep = (step: number) =>
    within(accentRow()).getByRole('button', { name: new RegExp(`^Bass accent, step ${step},`) })

  it('puts 16 named accent toggles under the bass lane, and none under the stab', async () => {
    await hydratedDeck()

    const bass = screen.getByRole('region', { name: 'Bass Line' })
    const toggles = within(accentRow()).getAllByRole('button')
    expect(toggles).toHaveLength(16)
    expect(toggles.map((toggle) => toggle.getAttribute('aria-label'))).toEqual(
      Array.from({ length: 16 }, (_, i) => `Bass accent, step ${i + 1}, off`),
    )
    expect(toggles.every((toggle) => toggle.getAttribute('aria-pressed') === 'false')).toBe(true)
    // Under the lane: the note steps come first in the panel, then the row.
    const firstNote = within(bass).getByRole('button', { name: 'Bass step 1, empty' })
    expect(
      firstNote.compareDocumentPosition(toggles[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const stab = screen.getByRole('region', { name: 'Chord Stab' })
    expect(within(stab).queryByRole('group', { name: /accent/i })).toBeNull()
  })

  it('keeps an accent set on an empty step, and says the step has no note', async () => {
    await hydratedDeck()

    fireEvent.click(accentStep(3))
    expect(accentStep(3).getAttribute('aria-pressed')).toBe('true')
    expect(accentStep(3).getAttribute('aria-label')).toBe('Bass accent, step 3, on (no note)')

    // Placing the note under it makes it a playing accent; clearing the note keeps it.
    fireEvent.click(screen.getByRole('button', { name: 'Bass step 3, empty' }))
    expect(accentStep(3).getAttribute('aria-label')).toBe('Bass accent, step 3, on')
    fireEvent.click(screen.getByRole('button', { name: /^Bass step 3, C2/ }))
    expect(accentStep(3).getAttribute('aria-label')).toBe('Bass accent, step 3, on (no note)')

    fireEvent.click(accentStep(3))
    expect(accentStep(3).getAttribute('aria-label')).toBe('Bass accent, step 3, off')
  })

  it('saves the accent in the selected slot, where the engine reads it', async () => {
    await hydratedDeck()

    fireEvent.click(screen.getByRole('button', { name: 'Bass step 5, empty' }))
    fireEvent.click(accentStep(5))

    const [bank, selected] = engineSpies.setBank.mock.calls.at(-1)! as [Pattern[], string]
    const slot = bank.find((pattern) => pattern.id === selected)!
    expect(slot.noteLanes.find((lane) => lane.id === 'bass')!.steps[4]).toMatchObject({
      on: true,
      accent: true,
    })
  })

  it('turns Env Mod on the bass panel into the patch the engine plays', async () => {
    await hydratedDeck()

    const envMod = within(screen.getByRole('region', { name: 'Bass Line' })).getByRole('slider', {
      name: 'Env Mod',
    })
    expect(envMod.getAttribute('aria-valuetext')).toBe('0 %')

    fireEvent.keyDown(envMod, { key: 'End' })

    expect(envMod.getAttribute('aria-valuetext')).toBe('100 %')
    expect(engineSpies.setBassSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ envMod: 100 }),
    )
  })
})

describe('App bass Slide row and ties', () => {
  const bass = () => screen.getByRole('region', { name: 'Bass Line' })
  const slideRow = () => screen.getByRole('group', { name: 'Bass slide steps' })
  const slideStep = (step: number) =>
    within(slideRow()).getByRole('button', { name: new RegExp(`^Bass slide, step ${step},`) })
  const noteStep = (step: number) =>
    within(screen.getByRole('group', { name: 'Bass steps' })).getByRole('button', {
      name: new RegExp(`^Bass step ${step},`),
    })

  it('puts 16 named slide toggles under the Accent row, and none under the stab', async () => {
    await hydratedDeck()

    const toggles = within(slideRow()).getAllByRole('button')
    expect(toggles.map((toggle) => toggle.getAttribute('aria-label'))).toEqual(
      Array.from({ length: 16 }, (_, i) => `Bass slide, step ${i + 1}, off`),
    )
    expect(toggles.every((toggle) => toggle.getAttribute('aria-pressed') === 'false')).toBe(true)
    const lastAccent = within(bass()).getByRole('button', { name: 'Bass accent, step 16, off' })
    expect(
      lastAccent.compareDocumentPosition(toggles[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const stab = screen.getByRole('region', { name: 'Chord Stab' })
    expect(within(stab).queryByRole('group', { name: /slide/i })).toBeNull()
  })

  it('keeps a slide set on an empty step, and says the step has no note', async () => {
    await hydratedDeck()

    fireEvent.click(slideStep(5))
    expect(slideStep(5).getAttribute('aria-pressed')).toBe('true')
    expect(slideStep(5).getAttribute('aria-label')).toBe('Bass slide, step 5, on (no note)')

    fireEvent.click(noteStep(5))
    expect(slideStep(5).getAttribute('aria-label')).toBe('Bass slide, step 5, on')
    fireEvent.click(noteStep(5))
    expect(slideStep(5).getAttribute('aria-label')).toBe('Bass slide, step 5, on (no note)')
  })

  it('operates from the keyboard like any button', async () => {
    await hydratedDeck()

    slideStep(2).focus()
    expect(document.activeElement).toBe(slideStep(2))
    fireEvent.click(document.activeElement!) // Enter and Space activate a native button
    expect(slideStep(2).getAttribute('aria-pressed')).toBe('true')
  })

  it('saves the slide in the selected slot, where the engine reads it', async () => {
    await hydratedDeck()

    fireEvent.click(noteStep(5))
    fireEvent.click(slideStep(5))

    const [bank, selected] = engineSpies.setBank.mock.calls.at(-1)! as [Pattern[], string]
    const slot = bank.find((pattern) => pattern.id === selected)!
    expect(slot.noteLanes.find((lane) => lane.id === 'bass')!.steps[4]).toMatchObject({
      on: true,
      slide: true,
    })
  })

  it('draws a tie on the bass row from a slid note into the note it glides to', async () => {
    await hydratedDeck()

    fireEvent.click(noteStep(5))
    fireEvent.click(noteStep(6))
    fireEvent.click(slideStep(5))

    expect(noteStep(5).getAttribute('aria-label')).toBe(
      'Bass step 5, C2, 1 step long, slides into step 6',
    )
    expect(noteStep(5).hasAttribute('data-tie-out')).toBe(true)
    expect(noteStep(6).hasAttribute('data-tie-in')).toBe(true)

    // With the note it reached cleared, the slide holds through the rest: nothing to tie into.
    fireEvent.click(noteStep(6))
    expect(noteStep(5).getAttribute('aria-label')).toBe('Bass step 5, C2, 1 step long')
    expect(noteStep(5).hasAttribute('data-tie-out')).toBe(false)
    expect(noteStep(6).hasAttribute('data-tie-in')).toBe(false)
  })
})

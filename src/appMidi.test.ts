// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { indexedDB } from 'fake-indexeddb'
import { computeAccessibleName } from 'dom-accessibility-api'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MidiInputHandlers } from './audio/midiInput'

/**
 * MIDI at the mounted-deck seam: a hardware note-on becomes a sounding note
 * indistinguishable from a computer key.
 *
 * `requestMIDIAccess` itself is never exercised — it is behind an injected
 * adapter and left to verification on real hardware, which is the deliberate
 * gap EB2-10 records. Everything above that line is the real thing.
 */

const engineSpies = vi.hoisted(() => ({
  attackStabNote: vi.fn(),
  releaseStabNote: vi.fn(),
  attackPad: vi.fn(),
  releasePad: vi.fn(),
  setPattern: vi.fn(),
}))

vi.mock('./audio/engine', async () => {
  const transport = await import('./model/transport')
  return {
    DEFAULT_BPM: transport.DEFAULT_BPM,
    MIN_BPM: transport.MIN_BPM,
    MAX_BPM: transport.MAX_BPM,
    TICKS_PER_16TH: 48,
    ...engineSpies,
    setMixer: () => undefined,
    setBassSettings: () => undefined,
    setMasterSettings: () => undefined,
    setFxSettings: () => undefined,
    setSamplerSettings: () => undefined,
    setBpm: () => undefined,
    unlockAudio: () => Promise.resolve(),
    play: () => Promise.resolve(),
    stop: () => undefined,
    setStoredSourceLoader: () => undefined,
    registerSlice: () => undefined,
    clearSlice: () => undefined,
    registerSourceBytes: () => undefined,
    getSoundingStabNotes: () => [],
    getSoundingPadIds: () => [],
    getSpectrum: () => null,
    getCurrentStep: () => -1,
    getTransportTicks: () => -1,
  }
})

/**
 * The browser machinery, faked at exactly the boundary the issue draws: a
 * session that reports devices and pushes messages. What those messages *mean*
 * is real code all the way down from here.
 */
const midi = vi.hoisted(() => {
  const control = {
    /** Set false to be a browser with no Web MIDI at all. */
    supported: true,
    /** Set to have the browser or the user refuse the request. */
    refusal: null as Error | null,
    /** What is plugged in when access is granted. */
    devices: [{ id: 'keys', name: 'Keystation 49' }] as { id: string; name: string }[],
    handlers: null as MidiInputHandlers | null,
    closed: 0,
  }
  const isMidiSupported = vi.fn(() => control.supported)
  const openMidiInputs = vi.fn(async (handlers: MidiInputHandlers) => {
    if (control.refusal) throw control.refusal
    control.handlers = handlers
    return {
      devices: control.devices,
      close: () => {
        control.closed += 1
      },
    }
  })
  return { isMidiSupported, openMidiInputs, control }
})

vi.mock('./audio/midiInput', () => ({
  isMidiSupported: midi.isMidiSupported,
  openMidiInputs: midi.openMidiInputs,
}))

const { default: App } = await import('./App')

/**
 * The MIDI panel's connection line. Scoped to its own panel because the deck
 * has other live regions — the recording announcement among them.
 */
function midiStatus(): HTMLElement {
  return within(screen.getByRole('region', { name: 'MIDI' })).getByRole('status')
}

/** Push raw bytes from a device, the way a controller does. */
function send(deviceId: string, status: number, note: number, velocity: number): void {
  midi.control.handlers!.onMessage(deviceId, Uint8Array.from([status, note, velocity]))
}

const noteOn = (deviceId: string, note: number, velocity = 100) =>
  send(deviceId, 0x90, note, velocity)
const noteOff = (deviceId: string, note: number) => send(deviceId, 0x80, note, 0)

/** Plug something in or pull it out while the app is open. */
function setDevices(devices: { id: string; name: string }[]): void {
  midi.control.handlers!.onDevices(devices)
}

function unplug(deviceId: string, remaining: { id: string; name: string }[] = []): void {
  midi.control.handlers!.onDisconnect(deviceId)
  midi.control.handlers!.onDevices(remaining)
}

async function renderDeck(): Promise<void> {
  render(createElement(App))
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Share beat' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  )
}

/** Mount the deck and grant MIDI access the way a user does — by asking for it. */
async function connectMidi(): Promise<void> {
  await renderDeck()
  fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI controller' }))
  await waitFor(() => expect(midi.control.handlers).not.toBeNull())
  await screen.findByLabelText('MIDI device')
}

beforeEach(() => {
  vi.clearAllMocks()
  midi.control.supported = true
  midi.control.refusal = null
  midi.control.devices = [{ id: 'keys', name: 'Keystation 49' }]
  midi.control.handlers = null
  midi.control.closed = 0
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('playing the deck from a controller', () => {
  it('plays a stab from a MIDI key exactly as a computer key does', async () => {
    await connectMidi()

    noteOn('keys', 60, 127)
    fireEvent.keyDown(window, { code: 'KeyA' })

    const [fromMidi, fromComputer] = engineSpies.attackStabNote.mock.calls
    // Same entry point, same pitch — which is what makes the on-screen keys
    // light for hardware without a line of new lighting code.
    expect(fromMidi[1]).toBe(60)
    expect(fromComputer[1]).toBe(60)
    expect(fromMidi[0]).toBe('midi:keys:60')
    expect(fromComputer[0]).toBe('computer:KeyA')
    // …and it arrives with the dynamics the hardware reported.
    expect(fromMidi[2]).toBeCloseTo(1)
  })

  it('releases a MIDI note on its note-off', async () => {
    await connectMidi()

    noteOn('keys', 64)
    noteOff('keys', 64)

    expect(engineSpies.releaseStabNote).toHaveBeenCalledWith('midi:keys:64')
  })

  it('holds a pitch until the last input lets go of it', async () => {
    // A MIDI key and a computer key on one note: the deck must not go quiet
    // when the first of them is released.
    await connectMidi()

    fireEvent.keyDown(window, { code: 'KeyA' })
    noteOn('keys', 60)
    fireEvent.keyUp(window, { code: 'KeyA' })

    // Both holds reach the engine's hold model, which resolves the shared
    // pitch — the release the computer key sends is its own source, not the note.
    expect(engineSpies.releaseStabNote).toHaveBeenCalledWith('computer:KeyA')
    expect(engineSpies.releaseStabNote).not.toHaveBeenCalledWith('midi:keys:60')

    noteOff('keys', 60)
    expect(engineSpies.releaseStabNote).toHaveBeenCalledWith('midi:keys:60')
  })

  it('plays pads 1–4 from the General MIDI drum notes', async () => {
    await connectMidi()

    for (const note of [36, 37, 38, 39]) noteOn('keys', note, 127)

    expect(engineSpies.attackPad.mock.calls.map((call) => call[1])).toEqual([
      'pad1',
      'pad2',
      'pad3',
      'pad4',
    ])
  })

  it('reads a hard pad hit as an accent and a soft one as an ordinary hit', async () => {
    await connectMidi()

    noteOn('keys', 36, 127)
    noteOn('keys', 37, 40)

    expect(engineSpies.attackPad).toHaveBeenNthCalledWith(1, 'midi:keys:36', 'pad1', true)
    expect(engineSpies.attackPad).toHaveBeenNthCalledWith(2, 'midi:keys:37', 'pad2', false)
  })

  it('ignores everything it has no map for, in silence', async () => {
    await connectMidi()

    send('keys', 0xb0, 74, 64) // a filter knob the deck has no map for
    send('keys', 0xe0, 0, 64) // pitch bend
    midi.control.handlers!.onMessage('keys', Uint8Array.from([0xf8])) // clock, constantly
    noteOn('keys', 24) // a bass key far below the octave on screen

    expect(engineSpies.attackStabNote).not.toHaveBeenCalled()
    expect(engineSpies.attackPad).not.toHaveBeenCalled()
  })

  it('leaves the pattern untouched — live play is performance only', async () => {
    await connectMidi()
    const before = screen.getByRole('button', { name: 'Pad 1 step 1' }).getAttribute('aria-label')
    engineSpies.setPattern.mockClear()

    noteOn('keys', 36, 127)
    noteOn('keys', 60)
    noteOff('keys', 36)

    // The engine is never handed a new pattern, because there is not one: a
    // MIDI hit sounds and lights and writes nothing.
    expect(engineSpies.setPattern).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pad 1 step 1' }).getAttribute('aria-label')).toBe(
      before,
    )
  })
})

describe('a chord played on hardware', () => {
  it('earns the lesson that asks for one, exactly as the computer keys do', async () => {
    // This is *why* MIDI routes through the deck's own live-play handlers
    // rather than straight into the engine. Attacking the engine directly
    // would sound the notes and light the keys while skipping the chord
    // observation that lives in the handler — and this lesson would sit
    // unearned for someone playing a real instrument into it.
    await connectMidi()

    fireEvent.click(screen.getByRole('button', { name: /^Lesson 13: Play a Chord/ }))
    await screen.findByRole('heading', { name: /Play a Chord/ })

    noteOn('keys', 60)
    noteOn('keys', 64)
    noteOn('keys', 67)

    expect(
      await screen.findByText(/Locked in — goal complete/),
    ).toBeTruthy()
  })

  it('does not earn it from three notes played one at a time', async () => {
    // The goal is notes held *together*; an arpeggio is not a chord.
    await connectMidi()

    fireEvent.click(screen.getByRole('button', { name: /^Lesson 13: Play a Chord/ }))
    await screen.findByRole('heading', { name: /Play a Chord/ })

    for (const note of [60, 64, 67]) {
      noteOn('keys', note)
      noteOff('keys', note)
    }

    await waitFor(() => expect(screen.queryByText(/Locked in — goal complete/)).toBeNull())
  })
})

describe('devices', () => {
  it('asks for access only when the user asks for it', async () => {
    await renderDeck()

    expect(midi.openMidiInputs).not.toHaveBeenCalled()
    expect(midiStatus().textContent).toMatch(/Not connected/)

    fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI controller' }))

    await waitFor(() => expect(midi.openMidiInputs).toHaveBeenCalledTimes(1))
  })

  it('opens one request however many times the button is pressed', async () => {
    // A permission prompt leaves the page interactive. A second request would
    // replace the first session without ever closing it, leaving ports open.
    let answer = () => {}
    midi.control.refusal = null
    const pending = new Promise<void>((resolve) => {
      answer = resolve
    })
    midi.openMidiInputs.mockImplementationOnce(async (handlers) => {
      await pending
      midi.control.handlers = handlers
      return { devices: midi.control.devices, close: () => undefined }
    })
    await renderDeck()

    const connect = screen.getByRole('button', { name: /Connect MIDI controller|Connecting/ })
    fireEvent.click(connect)
    fireEvent.click(connect)
    fireEvent.click(connect)
    answer()

    await screen.findByLabelText('MIDI device')
    expect(midi.openMidiInputs).toHaveBeenCalledTimes(1)
  })

  it('names the device it is playing from', async () => {
    await connectMidi()

    expect(midiStatus().textContent).toBe('Playing from Keystation 49.')
  })

  it('updates the list when a device is plugged in, without a reload', async () => {
    await connectMidi()

    setDevices([
      { id: 'keys', name: 'Keystation 49' },
      { id: 'pads', name: 'MPD218' },
    ])

    const select = (await screen.findByLabelText('MIDI device')) as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Keystation 49',
      'MPD218',
    ])
    // The first device found keeps playing; a new one arriving does not move
    // the user's choice out from under them.
    expect(select.value).toBe('keys')
  })

  it('plays the device the user selected, and only that one', async () => {
    await connectMidi()
    setDevices([
      { id: 'keys', name: 'Keystation 49' },
      { id: 'pads', name: 'MPD218' },
    ])

    fireEvent.change(await screen.findByLabelText('MIDI device'), { target: { value: 'pads' } })
    noteOn('pads', 60)
    noteOn('keys', 64)

    expect(engineSpies.attackStabNote).toHaveBeenCalledTimes(1)
    expect(engineSpies.attackStabNote.mock.calls[0][0]).toBe('midi:pads:60')
  })

  it('lets go of a held note when the user switches device', async () => {
    await connectMidi()
    setDevices([
      { id: 'keys', name: 'Keystation 49' },
      { id: 'pads', name: 'MPD218' },
    ])
    noteOn('keys', 60)

    fireEvent.change(await screen.findByLabelText('MIDI device'), { target: { value: 'pads' } })

    // Nothing will ever send that note-off now, so switching has to be it.
    expect(engineSpies.releaseStabNote).toHaveBeenCalledWith('midi:keys:60')
  })

  it('releases everything a device held when it is unplugged mid-note', async () => {
    // The classic stuck note: a controller pulled out while keys are down.
    await connectMidi()
    noteOn('keys', 60)
    noteOn('keys', 64)
    noteOn('keys', 36, 127)

    unplug('keys')

    expect(engineSpies.releaseStabNote).toHaveBeenCalledWith('midi:keys:60')
    expect(engineSpies.releaseStabNote).toHaveBeenCalledWith('midi:keys:64')
    expect(engineSpies.releasePad).toHaveBeenCalledWith('midi:keys:36')
    await waitFor(() => expect(midiStatus().textContent).toMatch(/No MIDI controllers found/))
  })

  it('says so when access is refused, and keeps the deck working', async () => {
    midi.control.refusal = new Error('NotAllowedError')
    await renderDeck()

    fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI controller' }))

    await waitFor(() => expect(midiStatus().textContent).toMatch(/refused/))
    fireEvent.click(screen.getByRole('button', { name: 'Kick step 1' }))
    expect(engineSpies.setPattern).toHaveBeenCalled()
  })
})

describe('a browser without Web MIDI', () => {
  it('says MIDI is unavailable and offers nothing to connect', async () => {
    midi.control.supported = false
    await renderDeck()

    expect(midiStatus().textContent).toBe(
      'This browser does not support MIDI input.',
    )
    expect(screen.queryByRole('button', { name: 'Connect MIDI controller' })).toBeNull()
    expect(midi.openMidiInputs).not.toHaveBeenCalled()
  })

  it('leaves the rest of the deck completely unaffected', async () => {
    midi.control.supported = false
    await renderDeck()

    // The deck loads, plays and edits exactly as it does anywhere else — a
    // missing API is a normal state, never a broken app.
    fireEvent.click(screen.getByRole('button', { name: 'Kick step 1' }))
    expect(engineSpies.setPattern).toHaveBeenCalled()

    // A velocity-less input leaves the dynamics alone; the engine's own
    // default is what a pointer or a computer key has always played at.
    fireEvent.keyDown(window, { code: 'KeyA' })
    expect(engineSpies.attackStabNote.mock.calls[0].slice(0, 2)).toEqual(['computer:KeyA', 60])

    fireEvent.keyDown(window, { code: 'Digit1' })
    expect(engineSpies.attackPad.mock.calls[0].slice(0, 2)).toEqual(['computer:Digit1', 'pad1'])
  })
})

describe('the device panel', () => {
  it('gives every control a non-empty accessible name', async () => {
    // The deck-wide contract in `src/a11y.test.ts` cannot reach these: jsdom
    // has no Web MIDI, so it only ever sees the unsupported state and neither
    // control is on screen. Connected, they are — and they are checked here.
    await connectMidi()
    setDevices([
      { id: 'keys', name: 'Keystation 49' },
      { id: 'pads', name: 'MPD218' },
    ])

    const panel = screen.getByRole('region', { name: 'MIDI' })
    const controls = [...panel.querySelectorAll<HTMLElement>('button, select, input, a[href]')]

    expect(controls.length).toBeGreaterThan(0)
    expect(controls.filter((control) => computeAccessibleName(control).trim() === '')).toEqual([])
  })

  it('is titled by a real heading, so it joins the document outline', async () => {
    await renderDeck()

    const heading = screen.getByRole('heading', { level: 2, name: 'MIDI' })
    expect(screen.getByRole('region', { name: 'MIDI' }).getAttribute('aria-labelledby')).toBe(
      heading.id,
    )
  })
})

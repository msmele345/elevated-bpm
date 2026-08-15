import { describe, expect, it } from 'vitest'
import {
  MIDI_PAD_NOTES,
  PAD_ACCENT_VELOCITY,
  createMidiRouter,
  midiConnectionMessage,
  midiTargetForNote,
  padAccentForVelocity,
  readMidiNote,
  resolveSelectedDevice,
  stabVelocity,
  type MidiDevice,
} from './midi'
import { createStabNoteHolds } from './stab'

/** A three-byte channel message, the shape a controller actually sends. */
function message(status: number, data1: number, data2: number): Uint8Array {
  return Uint8Array.from([status, data1, data2])
}

describe('reading a MIDI message', () => {
  it('reads a note-on and a note-off on any channel', () => {
    expect(readMidiNote(message(0x90, 60, 100))).toEqual({
      kind: 'noteOn',
      note: 60,
      velocity: 100,
    })
    expect(readMidiNote(message(0x80, 60, 64))).toEqual({
      kind: 'noteOff',
      note: 60,
      velocity: 64,
    })
    // Channel lives in the low nibble. A controller set to channel 10 — where
    // drum pads conventionally sit — must play the deck like any other.
    expect(readMidiNote(message(0x99, 36, 127))?.kind).toBe('noteOn')
    expect(readMidiNote(message(0x8f, 36, 0))?.kind).toBe('noteOff')
  })

  it('reads a note-on at velocity zero as a note-off', () => {
    // The classic stuck-note bug: most controllers release a key this way
    // rather than sending an 0x80, so a note-on read literally never ends.
    expect(readMidiNote(message(0x90, 60, 0))).toEqual({
      kind: 'noteOff',
      note: 60,
      velocity: 0,
    })
  })

  it('ignores everything that is not a note', () => {
    const notNotes = [
      message(0xb0, 74, 64), // control change — a knob the deck has no map for
      message(0xa0, 60, 90), // polyphonic aftertouch
      message(0xd0, 90, 0), // channel aftertouch
      message(0xe0, 0, 64), // pitch bend
      Uint8Array.from([0xf8]), // transport: MIDI clock, sent constantly
      Uint8Array.from([0xfa]), // transport: start
      Uint8Array.from([0x90, 60]), // truncated, missing its velocity
      Uint8Array.from([]),
    ]

    expect(notNotes.map(readMidiNote)).toEqual(notNotes.map(() => null))
    // A message event can carry no data at all; a missing API is a normal
    // state on this feature, never a crash.
    expect(readMidiNote(null)).toBeNull()
    expect(readMidiNote(undefined)).toBeNull()
  })
})

describe('the routing table', () => {
  it('lands the General MIDI drum region on pads 1–4', () => {
    // 36–39 is what a Push, an MPD or an LPD sends out of the box, so a pad
    // controller plays the pads with nothing to configure.
    expect(MIDI_PAD_NOTES).toEqual([36, 37, 38, 39])
    expect(MIDI_PAD_NOTES.map(midiTargetForNote)).toEqual([
      { kind: 'pad', padId: 'pad1' },
      { kind: 'pad', padId: 'pad2' },
      { kind: 'pad', padId: 'pad3' },
      { kind: 'pad', padId: 'pad4' },
    ])
  })

  it('lands the stab keyboard’s own octave on stab notes', () => {
    expect(midiTargetForNote(60)).toEqual({ kind: 'stab', midi: 60 })
    expect(midiTargetForNote(66)).toEqual({ kind: 'stab', midi: 66 })
    expect(midiTargetForNote(72)).toEqual({ kind: 'stab', midi: 72 })
  })

  it('resolves an unmapped note to nothing', () => {
    // Silence, not noise: a full-size keyboard reaches far outside the octave
    // the deck shows, and those keys must simply do nothing.
    expect(midiTargetForNote(35)).toBeNull()
    expect(midiTargetForNote(40)).toBeNull()
    expect(midiTargetForNote(59)).toBeNull()
    expect(midiTargetForNote(73)).toBeNull()
  })
})

describe('velocity', () => {
  it('gives stabs a continuous velocity, as their synth already takes', () => {
    expect(stabVelocity(127)).toBeCloseTo(1)
    expect(stabVelocity(64)).toBeCloseTo(64 / 127)
    // A note-on at zero is a note-off and never reaches here; a stray one must
    // still not attack a silent note that then hangs.
    expect(stabVelocity(0)).toBeGreaterThan(0)
    expect(stabVelocity(300)).toBeCloseTo(1)
  })

  it('reads a hard pad hit as an accent, through the model pads already have', () => {
    // Deliberately the existing two-level model rather than a parallel
    // continuous one: accent is what a pad's dynamics already mean here, and
    // it is what an accented step sounds like.
    expect(padAccentForVelocity(127)).toBe(true)
    expect(padAccentForVelocity(PAD_ACCENT_VELOCITY)).toBe(true)
    expect(padAccentForVelocity(PAD_ACCENT_VELOCITY - 1)).toBe(false)
    expect(padAccentForVelocity(40)).toBe(false)
  })
})

describe('routing a device’s messages', () => {
  it('sounds a stab note-on and releases it on the note-off', () => {
    const router = createMidiRouter()

    expect(router.receive('device-a', message(0x90, 60, 127))).toEqual([
      { kind: 'stabAttack', source: 'midi:device-a:60', midi: 60, velocity: 1 },
    ])
    expect(router.receive('device-a', message(0x80, 60, 0))).toEqual([
      { kind: 'stabRelease', source: 'midi:device-a:60' },
    ])
  })

  it('fires a pad from the drum region and frees it to retrigger', () => {
    const router = createMidiRouter()

    expect(router.receive('device-a', message(0x99, 36, 127))).toEqual([
      { kind: 'padAttack', source: 'midi:device-a:36', padId: 'pad1', accent: true },
    ])
    // …and a gentler one lands on the same pad without the accent.
    expect(router.receive('device-a', message(0x99, 37, 50))).toEqual([
      { kind: 'padAttack', source: 'midi:device-a:37', padId: 'pad2', accent: false },
    ])
    expect(router.receive('device-a', message(0x89, 36, 0))).toEqual([
      { kind: 'padRelease', source: 'midi:device-a:36' },
    ])
  })

  it('stays silent for anything it has no map for', () => {
    const router = createMidiRouter()

    expect(router.receive('device-a', message(0xb0, 74, 64))).toEqual([])
    expect(router.receive('device-a', message(0x90, 24, 100))).toEqual([])
    // …and a note-off for a note that never sounded releases nothing, so an
    // unmapped key cannot cut a note some other input is holding.
    expect(router.receive('device-a', message(0x80, 24, 0))).toEqual([])
  })

  it('keeps two devices’ holds apart, so one letting go never cuts the other', () => {
    const router = createMidiRouter()
    router.receive('keys', message(0x90, 60, 100))
    router.receive('pads', message(0x90, 60, 100))

    expect(router.receive('keys', message(0x80, 60, 0))).toEqual([
      { kind: 'stabRelease', source: 'midi:keys:60' },
    ])
    // Distinct sources, so the note itself stays held by the other device —
    // the shared-hold rule the stab model already resolves.
    expect(router.receive('pads', message(0x80, 60, 0))).toEqual([
      { kind: 'stabRelease', source: 'midi:pads:60' },
    ])
  })

  it('names its sources so a MIDI key and a computer key share one held pitch', () => {
    // The whole reason MIDI is a small feature: a device is just another
    // opaque source string into the hold model the keyboard already uses.
    const holds = createStabNoteHolds()
    const router = createMidiRouter()
    const [attack] = router.receive('keys', message(0x90, 60, 100))

    expect(holds.press('computer:KeyA', 60)).not.toBeNull()
    // Second hold on a sounding pitch: silent, because it is already sounding.
    expect(holds.press((attack as { source: string }).source, 60)).toBeNull()
    // The computer key lets go first and the note must keep ringing.
    expect(holds.release('computer:KeyA')).toBeNull()
    expect(holds.release('midi:keys:60')).toEqual({ midi: 60 })
  })

  it('releases everything a device was holding when it is unplugged', () => {
    // A controller pulled out mid-note is the classic stuck note. Nothing else
    // will ever send the note-offs, so the disconnect has to be them.
    const router = createMidiRouter()
    router.receive('keys', message(0x90, 60, 100))
    router.receive('keys', message(0x90, 64, 100))
    router.receive('keys', message(0x90, 36, 127))
    router.receive('other', message(0x90, 67, 100))

    expect(router.releaseDevice('keys')).toEqual([
      { kind: 'stabRelease', source: 'midi:keys:60' },
      { kind: 'stabRelease', source: 'midi:keys:64' },
      { kind: 'padRelease', source: 'midi:keys:36' },
    ])
    // Only that device's, and only once: a second unplug of the same device
    // must not release notes another input has since taken over.
    expect(router.releaseDevice('keys')).toEqual([])
    expect(router.releaseDevice('other')).toEqual([
      { kind: 'stabRelease', source: 'midi:other:67' },
    ])
  })

  it('ignores a repeated note-on, so a held note cannot be released twice', () => {
    const router = createMidiRouter()
    router.receive('keys', message(0x90, 60, 100))

    expect(router.receive('keys', message(0x90, 60, 100))).toEqual([])
    expect(router.receive('keys', message(0x80, 60, 0))).toEqual([
      { kind: 'stabRelease', source: 'midi:keys:60' },
    ])
    expect(router.receive('keys', message(0x80, 60, 0))).toEqual([])
  })
})

describe('choosing a device', () => {
  const keys: MidiDevice = { id: 'keys', name: 'Keystation 49' }
  const pads: MidiDevice = { id: 'pads', name: 'MPD218' }

  it('plays the first controller found, so plugging one in is enough', () => {
    expect(resolveSelectedDevice([keys, pads], null)).toBe('keys')
  })

  it('keeps the chosen device when another is plugged in beside it', () => {
    // Hot-plug updates the list; it must not quietly move the user's choice.
    expect(resolveSelectedDevice([keys, pads], 'pads')).toBe('pads')
  })

  it('falls back to what is left when the chosen device is unplugged', () => {
    expect(resolveSelectedDevice([pads], 'keys')).toBe('pads')
    expect(resolveSelectedDevice([], 'keys')).toBeNull()
  })
})

describe('what the panel says', () => {
  const keys: MidiDevice = { id: 'keys', name: 'Keystation 49' }

  it('states an unsupported browser as a normal condition, not a failure', () => {
    // Safari's support is recent and Firefox's was behind a flag for years.
    // Absence is a state this app expects to be in, and it says so plainly.
    expect(midiConnectionMessage({ status: 'unsupported' }, null)).toBe(
      'This browser does not support MIDI input.',
    )
  })

  it('names the device it is playing from', () => {
    expect(midiConnectionMessage({ status: 'ready', devices: [keys] }, 'keys')).toBe(
      'Playing from Keystation 49.',
    )
  })

  it('says a controller is still wanted when access is granted but nothing is plugged in', () => {
    expect(midiConnectionMessage({ status: 'ready', devices: [] }, null)).toBe(
      'Connected. No MIDI controllers found — plug one in and it will appear here.',
    )
  })

  it('distinguishes not asked yet, waiting, and refused', () => {
    expect(midiConnectionMessage({ status: 'idle' }, null)).toBe(
      'Not connected. Play the pads and stabs from a MIDI controller.',
    )
    expect(midiConnectionMessage({ status: 'connecting' }, null)).toBe(
      'Waiting for permission to use MIDI…',
    )
    expect(midiConnectionMessage({ status: 'refused' }, null)).toBe(
      'MIDI access was refused. Allow it in your browser settings to play from a controller.',
    )
  })
})

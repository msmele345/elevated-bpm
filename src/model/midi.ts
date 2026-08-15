import { PAD_LANES } from './sampler'
import { STAB_KEYS } from './stab'
import type { PadLaneId } from './types'

/**
 * What a MIDI controller means, in the deck's own terms.
 *
 * Everything here is pure: a message is bytes, a target is a lane or a pitch,
 * and a hold is a source string. The browser half — `requestMIDIAccess`, ports,
 * and their events — sits behind the adapter in `src/audio/midiInput.ts`, so a
 * hardware note-on is decided here and is testable without any hardware.
 */

/** Status nibbles. Channel lives in the low nibble and the deck listens to all. */
const NOTE_ON = 0x90
const NOTE_OFF = 0x80

export interface MidiNoteMessage {
  kind: 'noteOn' | 'noteOff'
  note: number
  velocity: number
}

/**
 * Read a note message out of raw MIDI bytes, or nothing.
 *
 * **A note-on at velocity zero is a note-off.** Most controllers release a key
 * that way rather than sending an 0x80, so reading it literally is the stuck
 * note this feature is most likely to ship — it is resolved here, once, rather
 * than in every caller.
 *
 * Everything else — control change, aftertouch, pitch bend, and the clock a
 * controller sends twenty-four times a beat whether anyone asked or not —
 * resolves to null and is dropped in silence.
 */
export function readMidiNote(data: Uint8Array | null | undefined): MidiNoteMessage | null {
  if (!data || data.length < 3) return null
  const status = data[0] & 0xf0
  const note = data[1]
  const velocity = data[2]
  if (status === NOTE_ON) {
    return { kind: velocity === 0 ? 'noteOff' : 'noteOn', note, velocity }
  }
  if (status === NOTE_OFF) return { kind: 'noteOff', note, velocity }
  return null
}

/** A connected controller, named the way a user would pick it out of a list. */
export interface MidiDevice {
  id: string
  name: string
}

export type MidiTarget =
  | { kind: 'stab'; midi: number }
  | { kind: 'pad'; padId: PadLaneId }

/**
 * The first of the four General MIDI drum notes. 36–39 is what a Push, an MPD
 * or an LPD sends out of the box, which is what lets a pad controller land on
 * the pads with no configuration at all.
 */
const GM_DRUM_NOTE_BASE = 36

export const MIDI_PAD_NOTES: readonly number[] = PAD_LANES.map(
  (_, index) => GM_DRUM_NOTE_BASE + index,
)

interface MidiNoteBinding {
  note: number
  target: MidiTarget
}

/**
 * One table from an incoming note to a place on the deck, kept as data beside
 * the key maps it mirrors (`STAB_KEYS`, `PAD_LANES`) so a second convention is
 * a line here rather than a branch somewhere.
 *
 * The stab half is derived from the on-screen keys rather than restated, so the
 * pitches hardware plays and the pitches the keyboard shows cannot drift apart.
 */
export const MIDI_NOTE_BINDINGS: readonly MidiNoteBinding[] = [
  ...PAD_LANES.map((pad, index) => ({
    note: GM_DRUM_NOTE_BASE + index,
    target: { kind: 'pad', padId: pad.id } as const,
  })),
  ...STAB_KEYS.map((key) => ({
    note: key.midi,
    target: { kind: 'stab', midi: key.midi } as const,
  })),
]

const TARGETS_BY_NOTE = new Map(MIDI_NOTE_BINDINGS.map(({ note, target }) => [note, target]))

/** Where a note plays, or nowhere. An unmapped note is ignored silently. */
export function midiTargetForNote(note: number): MidiTarget | null {
  return TARGETS_BY_NOTE.get(note) ?? null
}

const MAX_VELOCITY = 127

/**
 * How hard a pad must be hit to read as an accent — three quarters up the
 * scale, so a deliberately hard hit accents and ordinary playing does not.
 */
export const PAD_ACCENT_VELOCITY = 96

/**
 * Velocity for a live stab, on the 0–1 scale its synth already takes. Continuous
 * rather than thresholded, because a polyphonic synth voice has the dynamics to
 * use it.
 */
export function stabVelocity(velocity: number): number {
  return Math.min(Math.max(velocity, 1), MAX_VELOCITY) / MAX_VELOCITY
}

/**
 * Whether a pad hit that hard is an accent.
 *
 * Deliberately a threshold onto the two-level model pads already have rather
 * than a continuous gain of its own: accent is what dynamics *mean* on this
 * instrument, so a hard hit sounds exactly like an accented step instead of
 * introducing a second, parallel notion of loudness. What those two levels are
 * worth stays in the audio layer that owns them.
 */
export function padAccentForVelocity(velocity: number): boolean {
  return velocity >= PAD_ACCENT_VELOCITY
}

/**
 * What a message should do, in the verbs the deck's live-play handlers already
 * take. Returning instructions rather than calling anything is what keeps the
 * whole routing decision — including the unplug — pure and hardware-free.
 */
export type MidiInstruction =
  | { kind: 'stabAttack'; source: string; midi: number; velocity: number }
  | { kind: 'stabRelease'; source: string }
  | { kind: 'padAttack'; source: string; padId: PadLaneId; accent: boolean }
  | { kind: 'padRelease'; source: string }

export interface MidiRouter {
  /** Turn one device's raw message into what the deck should do about it. */
  receive(deviceId: string, data: Uint8Array | null | undefined): MidiInstruction[]
  /**
   * Let go of everything a device is holding — because it was unplugged, or
   * because the user selected a different one.
   */
  releaseDevice(deviceId: string): MidiInstruction[]
}

/**
 * A device's notes, and what to do when one ends.
 *
 * The source string is the entire integration: `midi:<device>:<note>` is opaque
 * to the hold models that consume it, so a MIDI key and a computer key holding
 * one pitch resolve through `createStabNoteHolds` with no new logic — the note
 * releases when the last of them lets go.
 *
 * Held notes are tracked *per device* for one reason: a controller unplugged
 * mid-note will never send its note-offs, so something has to send them on its
 * behalf, and that something needs to know exactly what that device had down.
 */
export function createMidiRouter(): MidiRouter {
  /** deviceId → note → the instruction that ends it. */
  const held = new Map<string, Map<number, MidiInstruction>>()

  const sourceFor = (deviceId: string, note: number) => `midi:${deviceId}:${note}`

  return {
    receive(deviceId, data) {
      const message = readMidiNote(data)
      if (!message) return []

      const target = midiTargetForNote(message.note)
      if (!target) return []

      const notes = held.get(deviceId) ?? new Map<number, MidiInstruction>()
      const source = sourceFor(deviceId, message.note)

      if (message.kind === 'noteOff') {
        const release = notes.get(message.note)
        // A note-off for something never held releases nothing: an unmapped or
        // duplicated one must never cut a note another input is holding.
        if (!release) return []
        notes.delete(message.note)
        if (notes.size === 0) held.delete(deviceId)
        return [release]
      }

      // A repeated note-on with no note-off between is a malformed stream.
      // Ignoring it keeps one hold per note, so its release cannot fire twice.
      if (notes.has(message.note)) return []

      const attack: MidiInstruction =
        target.kind === 'stab'
          ? {
              kind: 'stabAttack',
              source,
              midi: target.midi,
              velocity: stabVelocity(message.velocity),
            }
          : {
              kind: 'padAttack',
              source,
              padId: target.padId,
              accent: padAccentForVelocity(message.velocity),
            }

      notes.set(
        message.note,
        target.kind === 'stab'
          ? { kind: 'stabRelease', source }
          : { kind: 'padRelease', source },
      )
      held.set(deviceId, notes)
      return [attack]
    },

    releaseDevice(deviceId) {
      const notes = held.get(deviceId)
      if (!notes) return []
      held.delete(deviceId)
      return [...notes.values()]
    },
  }
}

/**
 * Where the deck stands with MIDI.
 *
 * `unsupported` is deliberately one of these rather than an error: Web MIDI is
 * absent in browsers people really use, and a missing API is a state the deck
 * reports and otherwise ignores completely.
 */
export type MidiConnection =
  | { status: 'unsupported' }
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'ready'; devices: readonly MidiDevice[] }
  | { status: 'refused' }

/**
 * Which device plays the deck, given what is plugged in now.
 *
 * Two rules, both about the user never having to think about this: the first
 * controller found is chosen, so plugging one in is the whole setup; and a
 * choice already made survives another device arriving beside it. When the
 * chosen one is unplugged the deck falls back to whatever is left rather than
 * going quietly dead.
 */
export function resolveSelectedDevice(
  devices: readonly MidiDevice[],
  selectedId: string | null,
): string | null {
  if (selectedId !== null && devices.some((device) => device.id === selectedId)) {
    return selectedId
  }
  return devices[0]?.id ?? null
}

/** The connection state in one line, for the panel and for a screen reader. */
export function midiConnectionMessage(
  connection: MidiConnection,
  selectedId: string | null,
): string {
  switch (connection.status) {
    case 'unsupported':
      return 'This browser does not support MIDI input.'
    case 'idle':
      return 'Not connected. Play the pads and stabs from a MIDI controller.'
    case 'connecting':
      return 'Waiting for permission to use MIDI…'
    case 'refused':
      return 'MIDI access was refused. Allow it in your browser settings to play from a controller.'
    case 'ready': {
      const selected = connection.devices.find((device) => device.id === selectedId)
      if (selected) return `Playing from ${selected.name}.`
      return 'Connected. No MIDI controllers found — plug one in and it will appear here.'
    }
  }
}

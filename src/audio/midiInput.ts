/**
 * The browser half of MIDI input: `requestMIDIAccess`, the ports it hands back,
 * and their events. Nothing decision-shaped lives here — what a message means,
 * where a note lands, and what an unplug has to let go of are all pure code in
 * `src/model/midi.ts`.
 *
 * That is what makes this module the deliberate coverage gap EB2-10 records:
 * tests stop at this boundary, and everything above it is exercised for real.
 *
 * **Input only.** Nothing here opens an output port or sends a byte, and the
 * access request asks for no sysex — a narrower permission prompt, and note
 * input has never needed it.
 */

import type { MidiDevice } from '../model/midi'

export interface MidiInputHandlers {
  /** Raw bytes from one device, still unread. */
  onMessage(deviceId: string, data: Uint8Array | null): void
  /** The connected list changed — a device arrived or left. */
  onDevices(devices: readonly MidiDevice[]): void
  /**
   * One device went away. Separate from `onDevices` because it is not a list
   * update: whatever that controller was holding will never be released by the
   * controller itself, so someone above has to do it.
   */
  onDisconnect(deviceId: string): void
}

export interface MidiInputSession {
  /** Everything connected the moment access was granted. */
  readonly devices: readonly MidiDevice[]
  /** Stop listening and let every port go. */
  close(): void
}

/**
 * Whether this browser has Web MIDI at all.
 *
 * Absence is a **normal state, not an error**: Safari's support is recent and
 * Firefox's was behind a flag for years. The deck says MIDI is unavailable here
 * and is otherwise completely untouched — a missing API never breaks a load.
 */
export function isMidiSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as Partial<Navigator>).requestMIDIAccess === 'function'
  )
}

function deviceName(input: MIDIInput): string {
  const name = input.name?.trim()
  if (name) return name
  const maker = input.manufacturer?.trim()
  // A port with nothing to call itself is still selectable; its id is ugly but
  // it is the only thing that distinguishes it from another anonymous port.
  return maker ? `${maker} input` : `MIDI input ${input.id}`
}

/**
 * Ask for MIDI access and start listening to every input.
 *
 * Called only when the user opens the device panel — never at startup and
 * never speculatively — and rejects when the browser or the user refuses.
 *
 * Every input is subscribed rather than just the chosen one, and each message
 * carries the device that sent it. Choosing a device is then a filter above
 * this line rather than a re-subscription, so switching devices and hot-plug
 * are the same cheap thing.
 */
export async function openMidiInputs(
  handlers: MidiInputHandlers,
): Promise<MidiInputSession> {
  const access = await navigator.requestMIDIAccess()
  const attached = new Map<string, { input: MIDIInput; listener: (event: Event) => void }>()

  const connectedInputs = () =>
    [...access.inputs.values()].filter((input) => input.state === 'connected')

  /** The connected list as the deck names it: what both callers report. */
  const connectedDevices = (): MidiDevice[] =>
    connectedInputs().map((input) => ({ id: input.id, name: deviceName(input) }))

  const attach = (input: MIDIInput) => {
    const listener = (event: Event) =>
      handlers.onMessage(input.id, (event as MIDIMessageEvent).data)
    input.addEventListener('midimessage', listener)
    // A port must be open to deliver messages. Adding the handler opens it
    // implicitly in every implementation, but asking plainly costs nothing and
    // a port that refuses to open must not take the rest of the list with it.
    void Promise.resolve(input.open()).catch(() => undefined)
    attached.set(input.id, { input, listener })
  }

  const detach = (id: string) => {
    const held = attached.get(id)
    if (!held) return
    held.input.removeEventListener('midimessage', held.listener)
    attached.delete(id)
  }

  const sync = () => {
    const inputs = connectedInputs()
    const present = new Set(inputs.map((input) => input.id))
    for (const id of [...attached.keys()]) {
      if (present.has(id)) continue
      detach(id)
      // Reported before the new list, so a stuck note is released in the same
      // turn the device leaves rather than a render later.
      handlers.onDisconnect(id)
    }
    for (const input of inputs) {
      if (!attached.has(input.id)) attach(input)
    }
    handlers.onDevices(connectedDevices())
  }

  const onStateChange = () => sync()
  access.addEventListener('statechange', onStateChange)

  for (const input of connectedInputs()) attach(input)

  return {
    devices: connectedDevices(),
    close() {
      access.removeEventListener('statechange', onStateChange)
      for (const id of [...attached.keys()]) detach(id)
    },
  }
}

import { memo, type ChangeEvent } from 'react'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'
import { MIDI_PAD_NOTES, midiConnectionMessage, type MidiConnection } from '../model/midi'
import { PanelTitle } from './PanelTitle'

interface MidiPanelProps {
  connection: MidiConnection
  selectedDeviceId: string | null
  onConnect: () => void
  onSelectDevice: (deviceId: string) => void
}

/**
 * The MIDI device panel: connect, choose a controller, and see where the deck
 * stands with one.
 *
 * Small on purpose. Note input is the whole feature — CC mapping, clock sync
 * and MIDI out are all deliberately elsewhere — so this is a button, a select
 * and a line of state, and it earns no skip link at that size (the contract
 * suite in `src/a11y.test.ts` is what decides that, not this comment: it stubs
 * MIDI support on so it can see this panel connected).
 *
 * **Access is asked for here and only here.** Nothing requests MIDI at startup:
 * a permission prompt the user did not ask for is exactly what a deck that is
 * playable on first click should not open with.
 */
function MidiDevices({
  connection,
  selectedDeviceId,
  onConnect,
  onSelectDevice,
}: MidiPanelProps) {
  const devices = connection.status === 'ready' ? connection.devices : []
  const connecting = connection.status === 'connecting'

  return (
    <section
      className="panel midi-panel"
      id={DECK_SECTION_IDS.midi}
      tabIndex={-1}
      aria-labelledby={sectionTitleId(DECK_SECTION_IDS.midi)}
    >
      <PanelTitle sectionId={DECK_SECTION_IDS.midi} name="MIDI" model="CONTROL IN · MIDI" />

      <div className="midi-controls">
        {/* A browser with no Web MIDI is offered nothing to press: there is
            nothing behind it, and a dead control is worse than none. */}
        {connection.status !== 'unsupported' && connection.status !== 'ready' && (
          <button
            type="button"
            className="midi-connect"
            onClick={onConnect}
            aria-disabled={connecting || undefined}
          >
            {connecting ? 'Connecting…' : 'Connect MIDI controller'}
          </button>
        )}

        {devices.length > 0 && (
          <label className="midi-device">
            <span className="midi-device-label">MIDI device</span>
            <select
              value={selectedDeviceId ?? ''}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onSelectDevice(event.target.value)
              }
            >
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Live, because the state changes without the user doing anything: a
          controller plugged in or pulled out has to announce itself. */}
      <p className="midi-status" role="status">
        {midiConnectionMessage(connection, selectedDeviceId)}
      </p>

      <p className="panel-hint">
        Pads 1–4 play from notes {MIDI_PAD_NOTES[0]}–{MIDI_PAD_NOTES[MIDI_PAD_NOTES.length - 1]} ·
        the stab octave plays C4–C5 · a hard pad hit accents.
      </p>
    </section>
  )
}

export const MidiPanel = memo(MidiDevices)

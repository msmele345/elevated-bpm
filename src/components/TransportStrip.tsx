import { memo } from 'react'
import { MAX_BPM, MIN_BPM } from '../audio/engine'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'
import { SWING_PARAM, swingToPercent, type TransportParamId } from '../model/transport'
import { Knob } from './Knob'
import type { BankSlot } from '../model/bank'
import { PatternBank } from './PatternBank'

interface TransportStripProps {
  isPlaying: boolean
  bpm: number
  /** The Transport's swing, as the stored 0.50–0.75 fraction. */
  swing: number
  /** The active lesson is pointing at the tempo fader. */
  spotlitTempo?: boolean
  /** The active lesson is pointing at the Swing knob. */
  spotlitSwing?: boolean
  /** The loop is not offered while the microphone is open. */
  heldForRecording?: boolean
  onTogglePlay: () => void
  onBpmChange: (bpm: number) => void
  /** Called with the knob's own reading, in percent — the Transport stores the fraction. */
  onSwingChange: (id: TransportParamId, percent: number) => void
  /** The pattern bank's four slots, A–D. */
  slots: readonly BankSlot[]
  selectedSlotId: string
  onSelectSlot: (slotId: string) => void
}

/**
 * The transport strip: the deck's clock in one sticky bar at the top of the
 * screen — Play, tempo and Swing — so starting, stopping and nudging the
 * groove never means scrolling back up from the bass or the stab. It is its
 * own deck section, with a heading and a skip link like every other block.
 *
 * Kept to one slim row on desktop, with the pattern bank's slots at its
 * right-hand end. Being sticky, the strip is also where the deck says when the
 * slot being edited is not the one being heard: the notice hangs under it and
 * is written from rAF by `useSlotLights`, never rendered by React.
 */
function Transport({
  isPlaying,
  bpm,
  swing,
  spotlitTempo = false,
  spotlitSwing = false,
  heldForRecording = false,
  onTogglePlay,
  onBpmChange,
  onSwingChange,
  slots,
  selectedSlotId,
  onSelectSlot,
}: TransportStripProps) {
  return (
    <section
      className="transport-strip"
      id={DECK_SECTION_IDS.transport}
      tabIndex={-1}
      aria-labelledby={sectionTitleId(DECK_SECTION_IDS.transport)}
    >
      {/* The strip's controls name themselves; the heading is for the outline. */}
      <h2 className="visually-hidden" id={sectionTitleId(DECK_SECTION_IDS.transport)}>
        Transport
      </h2>
      <div className="transport">
        <button
          type="button"
          className="transport-play"
          aria-pressed={isPlaying}
          // `aria-disabled` rather than `disabled`: disabling a focused control
          // drops focus to the document, and this deck is 163 tab stops deep.
          // The handler refuses too, so the control cannot be talked into it.
          aria-disabled={heldForRecording || undefined}
          onClick={onTogglePlay}
        >
          <span className="transport-play-led" aria-hidden="true" />
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        <label className={spotlitTempo ? 'transport-tempo is-spotlit' : 'transport-tempo'}>
          <span className="transport-tempo-label">Tempo</span>
          <input
            type="range"
            className="transport-tempo-fader"
            min={MIN_BPM}
            max={MAX_BPM}
            step={1}
            value={bpm}
            onChange={(e) => onBpmChange(Number(e.target.value))}
            aria-label="Tempo in beats per minute"
          />
        </label>
        <div className="transport-bpm" aria-hidden="true">
          <span className="transport-bpm-value">{bpm}</span>
          <span className="transport-bpm-unit">BPM</span>
        </div>
        {/* Swing sits beside tempo: the two together are the groove's clock.
            The strip's height budget only fits the compact dial, so its name
            is printed beside it — the knob's accessible name already says it. */}
        <div className={spotlitSwing ? 'transport-swing is-spotlit' : 'transport-swing'}>
          <span className="transport-swing-label" aria-hidden="true">
            {SWING_PARAM.label}
          </span>
          <Knob
            spec={SWING_PARAM}
            value={swingToPercent(swing)}
            size="small"
            spotlit={spotlitSwing}
            onChange={onSwingChange}
          />
        </div>
        <PatternBank slots={slots} selectedId={selectedSlotId} onSelect={onSelectSlot} />
      </div>
      <p className="bank-notice" data-bank-notice="" hidden />
    </section>
  )
}

export const TransportStrip = memo(Transport)

import { memo } from 'react'
import { BASS_PARAMS, type BassParamId, type BassSettings } from '../model/bass'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'
import type { NoteLane, NoteLaneId } from '../model/types'
import { Knob } from './Knob'
import { NoteRow } from './NoteRow'
import { PanelTitle } from './PanelTitle'

interface BassPanelProps {
  lane: NoteLane
  settings: BassSettings
  /** The active lesson is pointing at the bass note lane. */
  spotlitLane?: boolean
  /** Knob ids the active lesson is pointing at. */
  spotlitParams: string[]
  onToggleStep: (laneId: NoteLaneId, stepIndex: number) => void
  onTranspose: (laneId: NoteLaneId, stepIndex: number, semitones: number) => void
  onResize: (laneId: NoteLaneId, stepIndex: number, steps: number) => void
  onParamChange: (id: BassParamId, value: number) => void
}

/**
 * The bass instrument's surface: the note lane on top, its filter and envelope
 * knobs below — the 303 layout, and the sound-design vocabulary the curriculum
 * teaches (cutoff, resonance, decay).
 *
 * The lane and the knobs both name themselves in their callbacks, so this
 * panel forwards the deck's handlers untouched rather than wrapping them in
 * fresh closures the memoized children would have to re-render for.
 */
function BassInstrument({
  lane,
  settings,
  spotlitLane = false,
  spotlitParams,
  onToggleStep,
  onTranspose,
  onResize,
  onParamChange,
}: BassPanelProps) {
  return (
    <section
      className="panel bass-panel"
      id={DECK_SECTION_IDS.bass}
      tabIndex={-1}
      aria-labelledby={sectionTitleId(DECK_SECTION_IDS.bass)}
    >
      <PanelTitle sectionId={DECK_SECTION_IDS.bass} name="Bass Line" model="MONO SYNTH · BL-303" />
      <NoteRow
        lane={lane}
        spotlit={spotlitLane}
        onToggleStep={onToggleStep}
        onTranspose={onTranspose}
        onResize={onResize}
      />
      <div className="knob-row">
        {BASS_PARAMS.map((param) => (
          <Knob
            key={param.id}
            spec={param}
            value={settings[param.id]}
            spotlit={spotlitParams.includes(param.id)}
            onChange={onParamChange}
          />
        ))}
      </div>
      <p className="panel-hint">
        Tap a bass step to place a note · ↑↓ transposes (shift for octaves) · ←→ sets its
        length · knobs drag or take arrow keys
      </p>
    </section>
  )
}

export const BassPanel = memo(BassInstrument)

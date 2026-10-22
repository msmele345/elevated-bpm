import { memo } from 'react'
import { BASS_PARAMS, type BassParamId, type BassSettings } from '../model/bass'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'
import { levelParamForVoice, type LevelParamId, type VoiceId } from '../model/mixer'
import type { NoteLane, NoteLaneId } from '../model/types'
import { Knob } from './Knob'
import { NoteRow } from './NoteRow'
import { PanelTitle } from './PanelTitle'
import { VoiceMixStrip } from './VoiceMixStrip'

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
  /** The bass voice's mixer strip, in the panel header. */
  muted: boolean
  soloed: boolean
  /** Not sounding right now (muted, or un-soloed while another voice solos). */
  silenced: boolean
  level: number
  onToggleMute: (voiceId: VoiceId) => void
  onToggleSolo: (voiceId: VoiceId) => void
  onLevelChange: (id: LevelParamId, value: number) => void
}

const BASS_LEVEL = levelParamForVoice('bass')

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
  muted,
  soloed,
  silenced,
  level,
  onToggleMute,
  onToggleSolo,
  onLevelChange,
}: BassPanelProps) {
  return (
    <section
      className={silenced ? 'panel bass-panel is-silenced' : 'panel bass-panel'}
      id={DECK_SECTION_IDS.bass}
      tabIndex={-1}
      aria-labelledby={sectionTitleId(DECK_SECTION_IDS.bass)}
    >
      <PanelTitle sectionId={DECK_SECTION_IDS.bass} name="Bass Line" model="MONO SYNTH · BL-303">
        <VoiceMixStrip
          voiceId="bass"
          label={lane.label}
          muted={muted}
          soloed={soloed}
          level={level}
          levelSpotlit={spotlitParams.includes(BASS_LEVEL.id)}
          onToggleMute={onToggleMute}
          onToggleSolo={onToggleSolo}
          onLevelChange={onLevelChange}
        />
      </PanelTitle>
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
        Tap an empty bass step to place and focus a note · ↑↓ transposes (shift for octaves) ·
        ←→ sets its length · tap a lit note to clear it
      </p>
    </section>
  )
}

export const BassPanel = memo(BassInstrument)

import { BASS_PARAMS, type BassParamId, type BassSettings } from '../model/bass'
import type { NoteLane } from '../model/types'
import { Knob } from './Knob'
import { NoteRow } from './NoteRow'

interface BassPanelProps {
  lane: NoteLane
  settings: BassSettings
  /** Knob ids the active lesson is pointing at. */
  spotlitParams: string[]
  onToggleStep: (stepIndex: number) => void
  onTranspose: (stepIndex: number, semitones: number) => void
  onResize: (stepIndex: number, steps: number) => void
  onParamChange: (id: BassParamId, value: number) => void
}

/**
 * The bass instrument's surface: the note lane on top, its filter and envelope
 * knobs below — the 303 layout, and the sound-design vocabulary the curriculum
 * teaches (cutoff, resonance, decay).
 */
export function BassPanel({
  lane,
  settings,
  spotlitParams,
  onToggleStep,
  onTranspose,
  onResize,
  onParamChange,
}: BassPanelProps) {
  return (
    <section className="panel bass-panel" aria-label="Bass synth">
      <div className="panel-title">
        <span className="panel-title-name">Bass Line</span>
        <span className="panel-title-model">MONO SYNTH · BL-303</span>
      </div>
      <NoteRow
        lane={lane}
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
            onChange={(value) => onParamChange(param.id, value)}
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

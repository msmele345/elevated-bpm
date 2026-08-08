import { memo, useEffect, useRef } from 'react'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'
import type { Mixer } from '../model/mixer'
import {
  PAD_LANES,
  samplerParamForPad,
  padForKeyboardInput,
  type SampleSource,
  type SamplerParamId,
  type SamplerSettings,
} from '../model/sampler'
import type { LaneId, PadLane, PadLaneId } from '../model/types'
import { Knob } from './Knob'
import { PanelTitle } from './PanelTitle'
import { SamplerPad } from './SamplerPad'
import { StepRow } from './StepRow'

interface SamplerPanelProps {
  lanes: PadLane[]
  settings: SamplerSettings
  sources: readonly SampleSource[]
  mixer: Mixer
  soloing: boolean
  onAssign: (padId: PadLaneId, sourceId: string) => void
  onTuneChange: (id: SamplerParamId, value: number) => void
  onAttack: (inputSourceId: string, padId: PadLaneId) => void
  onRelease: (inputSourceId: string) => void
  getSoundingPadIds: () => readonly PadLaneId[]
  onCycleStep: (laneId: LaneId, stepIndex: number) => void
  onToggleMute: (laneId: LaneId) => void
  onToggleSolo: (laneId: LaneId) => void
}

/** Four live pads plus four drum-shaped sequencer lanes, all on one audio clock. */
function SamplerInstrument({
  lanes,
  settings,
  sources,
  mixer,
  soloing,
  onAssign,
  onTuneChange,
  onAttack,
  onRelease,
  getSoundingPadIds,
  onCycleStep,
  onToggleMute,
  onToggleSolo,
}: SamplerPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const heldComputerSources = useRef(new Set<string>())

  // Pad lights are an audio-clock view, never React state. Live and scheduled
  // attacks share the engine registry this animation-frame reader observes.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    let frame = 0
    let previous = ''
    const renderSoundingPads = () => {
      const ids = getSoundingPadIds()
      const signature = ids.join(',')
      if (signature !== previous) {
        const sounding = new Set(ids)
        panel.querySelectorAll<HTMLButtonElement>('.sampler-pad').forEach((button) => {
          const active = sounding.has(button.dataset.padId as PadLaneId)
          button.toggleAttribute('data-sounding', active)
          button.setAttribute('aria-pressed', String(active))
        })
        previous = signature
      }
      frame = requestAnimationFrame(renderSoundingPads)
    }
    frame = requestAnimationFrame(renderSoundingPads)
    return () => {
      cancelAnimationFrame(frame)
      panel.querySelectorAll<HTMLButtonElement>('.sampler-pad').forEach((button) => {
        button.removeAttribute('data-sounding')
        button.setAttribute('aria-pressed', 'false')
      })
    }
  }, [getSoundingPadIds])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const pad = padForKeyboardInput(event)
      const inputSourceId = `computer:${event.code}`
      if (!pad || heldComputerSources.current.has(inputSourceId)) return
      event.preventDefault()
      heldComputerSources.current.add(inputSourceId)
      onAttack(inputSourceId, pad.id)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      const inputSourceId = `computer:${event.code}`
      if (!heldComputerSources.current.delete(inputSourceId)) return
      event.preventDefault()
      onRelease(inputSourceId)
    }
    const releaseAll = () => {
      for (const inputSourceId of heldComputerSources.current) onRelease(inputSourceId)
      heldComputerSources.current.clear()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseAll()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      releaseAll()
    }
  }, [onAttack, onRelease])

  return (
    <section
      ref={panelRef}
      className="panel sampler-panel"
      id={DECK_SECTION_IDS.sampler}
      tabIndex={-1}
      aria-labelledby={sectionTitleId(DECK_SECTION_IDS.sampler)}
    >
      <PanelTitle sectionId={DECK_SECTION_IDS.sampler} name="Sampler" model="4-PAD SAMPLER · SP-04" />

      <div className="sampler-source-bank" role="group" aria-label="Sample sources">
        <span className="sampler-source-label">Sources</span>
        <ul>
          {sources.map((source) => (
            <li key={source.id}>
              <span>{source.name}</span>
              <span className="sampler-source-origin">{source.origin}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="sampler-pad-bank" role="group" aria-label="Live sampler pads">
        {PAD_LANES.map((pad) => {
          const sampleSource = sources[0]
          return (
            <div className="sampler-pad-strip" key={pad.id}>
              <SamplerPad
                pad={pad}
                settings={settings[pad.id]}
                onAttack={onAttack}
                onRelease={onRelease}
              />
              <Knob
                spec={samplerParamForPad(pad.id)}
                value={settings[pad.id].tune}
                onChange={onTuneChange}
              />
              {sampleSource && (
                <button
                  type="button"
                  className="sampler-assign"
                  aria-label={`Assign ${sampleSource.name} to ${pad.label}`}
                  onClick={() => onAssign(pad.id, sampleSource.id)}
                >
                  Assign source
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="sampler-sequencer">
        {lanes.map((lane) => {
          const mix = mixer[lane.id]
          const silenced = soloing ? !mix?.soloed : (mix?.muted ?? false)
          return (
            <StepRow
              key={lane.id}
              lane={lane}
              muted={mix?.muted ?? false}
              soloed={mix?.soloed ?? false}
              silenced={silenced}
              onCycleStep={onCycleStep}
              onToggleMute={onToggleMute}
              onToggleSolo={onToggleSolo}
            />
          )
        })}
      </div>
      <p className="panel-hint">
        Assign the shipped source · play pads with 1–4 · tap a step twice to accent
      </p>
    </section>
  )
}

export const SamplerPanel = memo(SamplerInstrument)

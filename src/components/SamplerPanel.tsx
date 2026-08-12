import { memo, useEffect, useRef, useState, type DragEvent } from 'react'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'
import { INTAKE_LIMITS_HINT } from '../model/intake'
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
  intakeError: string | null
  onAssign: (padId: PadLaneId, sourceId: string) => void
  onLoadFile: (file: File, padId: PadLaneId | null) => void
  onDismissIntakeError: () => void
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
  intakeError,
  onAssign,
  onLoadFile,
  onDismissIntakeError,
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
  // Which surface a dragged file is currently over, so the deck shows where
  // the sound would land. A drag is not the audio clock, and this never
  // leaves the panel.
  const [dropTarget, setDropTarget] = useState<PadLaneId | 'panel' | null>(null)

  const handleDragOver = (target: PadLaneId | 'panel') => (event: DragEvent) => {
    // Without this the browser refuses the drop and navigates to the file.
    event.preventDefault()
    setDropTarget((current) => (current === target ? current : target))
  }

  const handleDrop = (padId: PadLaneId | null) => (event: DragEvent) => {
    event.preventDefault()
    // A pad is inside the panel: without this the same file would arrive
    // twice and become two sources.
    event.stopPropagation()
    setDropTarget(null)
    const file = event.dataTransfer?.files?.[0]
    if (file) onLoadFile(file, padId)
  }

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
      data-drop-active={dropTarget === 'panel' || undefined}
      onDragOver={handleDragOver('panel')}
      onDragLeave={() => setDropTarget(null)}
      onDrop={handleDrop(null)}
    >
      <PanelTitle sectionId={DECK_SECTION_IDS.sampler} name="Sampler" model="4-PAD SAMPLER · SP-04" />

      <div className="sampler-intake">
        <label className="sampler-load">
          <span className="sampler-load-label">Load audio file</span>
          <input
            type="file"
            accept="audio/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Clear the control either way, so choosing the same file again
              // is still a change the browser will report.
              event.target.value = ''
              if (file) onLoadFile(file, null)
            }}
          />
        </label>
        {/* The limits are stated before the user waits on anything. */}
        <p className="sampler-intake-hint">{INTAKE_LIMITS_HINT} Drop one on a pad to load it there.</p>
      </div>

      {intakeError && (
        <div className="sampler-notice is-error" role="alert">
          <p>{intakeError}</p>
          <button type="button" className="sampler-notice-dismiss" onClick={onDismissIntakeError}>
            Dismiss
          </button>
        </div>
      )}

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
        {PAD_LANES.map((pad) => (
          <div
            className="sampler-pad-strip"
            key={pad.id}
            data-drop-active={dropTarget === pad.id || undefined}
            onDragOver={handleDragOver(pad.id)}
            onDragLeave={() => setDropTarget(null)}
            onDrop={handleDrop(pad.id)}
          >
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
            <select
              className="sampler-assign"
              aria-label={`${pad.label} sound source`}
              value={settings[pad.id].region?.sourceId ?? ''}
              onChange={(event) => onAssign(pad.id, event.target.value)}
            >
              {/* Present so an empty pad has something to show; clearing a pad
                  is storage lifecycle work, not an assignment. */}
              <option value="" disabled>
                No sound
              </option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>
        ))}
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
        Pick a sound per pad · play pads with 1–4 · tap a step twice to accent
      </p>
    </section>
  )
}

export const SamplerPanel = memo(SamplerInstrument)

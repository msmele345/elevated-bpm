import { memo, useEffect, useRef, useState, type DragEvent } from 'react'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'
import { INTAKE_LIMITS_HINT } from '../model/intake'
import type { Mixer } from '../model/mixer'
import {
  PAD_LANES,
  formatPadRate,
  padAudioState,
  padsUsingSource,
  padPlaybackRate,
  samplerParamForPad,
  padForKeyboardInput,
  type AvailableAudio,
  type SampleSource,
  type SamplerParamId,
  type SamplerSettings,
} from '../model/sampler'
import {
  RECORDING_HINT,
  elapsedSeconds,
  formatElapsed,
  isMicrophoneLive,
  type RecordingState,
} from '../model/recording'
import { secondsPerStep } from '../model/transport'
import type { LaneId, PadLane, PadLaneId } from '../model/types'
import { Knob } from './Knob'
import { PanelTitle } from './PanelTitle'
import { SamplerPad } from './SamplerPad'
import { StepRow } from './StepRow'

/**
 * Fit targets offered on the pad strip. Every step count from 1 to 16 is legal
 * in the document, but a chop is locked to a musical length in practice, and a
 * sixteen-item menu per pad would be four times the noise for no more reach.
 */
const FIT_TARGETS = [1, 2, 4, 8, 16] as const

/**
 * What deleting a source costs, said before it happens. Naming the pads is the
 * whole point of the warning — and so is saying they keep sounding, because the
 * consequence is milder than "delete" suggests.
 */
function deleteWarning(settings: SamplerSettings, source: SampleSource): string {
  const pads = padsUsingSource(settings, source.id)
  if (pads.length === 0) return `Delete ${source.name}? No pad is using it.`
  return `${pads.join(' and ')} ${pads.length === 1 ? 'uses' : 'use'} ${source.name}. ${
    pads.length === 1 ? 'That pad keeps' : 'Those pads keep'
  } sounding, but can no longer be re-chopped.`
}

/**
 * How often the elapsed readout is redrawn. Display time, not musical time —
 * the deck's clock rule is about note scheduling, and nothing here is heard.
 */
const ELAPSED_TICK_MS = 500

/**
 * The elapsed readout, which ticks itself. It is its own component so a running
 * clock redraws four characters twice a second instead of the whole panel,
 * keeping the render discipline Phase 9 set.
 */
function RecordingElapsed({ state }: { state: RecordingState }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(performance.now()), ELAPSED_TICK_MS)
    return () => window.clearInterval(tick)
  }, [])
  return (
    <span className="sampler-recording-elapsed">{formatElapsed(elapsedSeconds(state, now))}</span>
  )
}

interface SamplerPanelProps {
  lanes: PadLane[]
  settings: SamplerSettings
  sources: readonly SampleSource[]
  /** What survived in storage; a pad's state is derived from it. */
  audio: AvailableAudio
  mixer: Mixer
  soloing: boolean
  intakeError: string | null
  storageNotice: { message: string; severity: 'info' | 'error' } | null
  /** A delete asked for but not yet confirmed, so the warning can name its pads. */
  sourceToDelete: string | null
  /** Pads the active lesson is pointing at. */
  spotlitPads: readonly PadLaneId[]
  /** Knob ids the active lesson is pointing at — the pad Tune knobs, here. */
  spotlitParams: readonly string[]
  /** Whether the active lesson is pointing at the source bank. */
  spotlitSources: boolean
  /** Fit is a fraction of the bar, so its readout moves with the tempo. */
  bpm: number
  /** The one authority on whether the microphone is live. */
  recording: RecordingState
  onStartRecording: () => void
  onStopRecording: () => void
  onAssign: (padId: PadLaneId, sourceId: string) => void
  onOpenEditor: (sourceId: string, padId: PadLaneId | null) => void
  onFitChange: (padId: PadLaneId, fit: number | null) => void
  onLoadFile: (file: File, padId: PadLaneId | null) => void
  onRelinkPad: (file: File, padId: PadLaneId) => void
  onAskDeleteSource: (sourceId: string | null) => void
  onDeleteSource: (sourceId: string) => void
  onDismissStorageNotice: () => void
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
  audio,
  mixer,
  soloing,
  intakeError,
  storageNotice,
  sourceToDelete,
  spotlitPads,
  spotlitParams,
  spotlitSources,
  bpm,
  recording,
  onStartRecording,
  onStopRecording,
  onAssign,
  onOpenEditor,
  onFitChange,
  onLoadFile,
  onRelinkPad,
  onAskDeleteSource,
  onDeleteSource,
  onDismissStorageNotice,
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
    // A pad is inside the panel, so this has to stop here too: left to bubble,
    // the panel would overwrite the pad's highlight on every dragover and the
    // user would never be shown which pad the sound is about to land on.
    event.stopPropagation()
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

      <div className="sampler-intake" data-spotlit={spotlitSources || undefined}>
        <label className="sampler-load">
          <span className="sampler-load-label">Load audio file</span>
          {/* Deliberately unfiltered: the browser is the authority on what it
              can play, and an `accept` list would grey out a file it could
              have decoded, with no message and no way to override. */}
          <input
            type="file"
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

        <div className="sampler-record">
          {/*
            One button through every state rather than three that swap. Pressing
            Record would otherwise unmount the control the user just activated
            and drop focus to the document — 163 tab stops from where they were.
            It also puts the stop control exactly where the record control was.

            `aria-disabled` rather than `disabled` for the same reason: making a
            focused control disabled drops focus too. The handlers refuse the
            press themselves, so the button cannot be talked into anything.
          */}
          <button
            type="button"
            className={isMicrophoneLive(recording) ? 'sampler-record-stop' : 'sampler-record-start'}
            aria-disabled={
              recording.status === 'requesting' || recording.status === 'stopping' || undefined
            }
            onClick={isMicrophoneLive(recording) ? onStopRecording : onStartRecording}
          >
            {isMicrophoneLive(recording)
              ? 'Stop recording'
              : recording.status === 'requesting'
                ? // A browser prompt the user has not answered yet reads as
                  // waiting on them rather than as a frozen deck. There is no
                  // cancel because the prompt itself is the cancel.
                  'Waiting for permission…'
                : 'Record from microphone'}
          </button>
          {isMicrophoneLive(recording) && (
            <div className="sampler-recording">
              <span className="sampler-recording-dot" aria-hidden="true" />
              <span className="sampler-recording-label">Recording</span>
              <RecordingElapsed state={recording} />
            </div>
          )}
          {/* Said before it happens, once, quietly. */}
          <p className="sampler-intake-hint">{RECORDING_HINT}</p>
        </div>
      </div>

      {/*
        Whether the mic is live, for anyone not watching the indicator. It
        carries the state change alone and never the ticking clock, which
        would otherwise be read aloud twice a second.
      */}
      <p className="sampler-recording-announcement" role="status">
        {recording.announcement}
      </p>

      {intakeError && (
        <div className="sampler-notice is-error" role="alert">
          <p>{intakeError}</p>
          <button type="button" className="sampler-notice-dismiss" onClick={onDismissIntakeError}>
            Dismiss
          </button>
        </div>
      )}

      {storageNotice && (
        <div
          className={`sampler-notice${storageNotice.severity === 'error' ? ' is-error' : ''}`}
          role={storageNotice.severity === 'error' ? 'alert' : 'status'}
        >
          <p>{storageNotice.message}</p>
          <button
            type="button"
            className="sampler-notice-dismiss"
            onClick={onDismissStorageNotice}
          >
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
              <button
                type="button"
                className="sampler-chop"
                onClick={() => onOpenEditor(source.id, null)}
              >
                Chop {source.name}
              </button>
              {/* The shipped source is a static asset rather than the user's
                  own audio, so there is nothing of theirs to reclaim. */}
              {source.origin !== 'shipped' && (
                <button
                  type="button"
                  className="sampler-source-delete"
                  onClick={() => onAskDeleteSource(source.id)}
                >
                  Delete {source.name}
                </button>
              )}
              {sourceToDelete === source.id && (
                <div className="sampler-delete-warning" role="alert">
                  {/* Naming the pads first is the point: the user learns the
                      consequence before it happens, and it is a mild one —
                      those pads keep sounding and lose re-editability. */}
                  <p>{deleteWarning(settings, source)}</p>
                  <button
                    type="button"
                    className="sampler-source-delete"
                    onClick={() => onDeleteSource(source.id)}
                  >
                    Delete anyway
                  </button>
                  <button
                    type="button"
                    className="sampler-notice-dismiss"
                    onClick={() => onAskDeleteSource(null)}
                  >
                    Keep {source.name}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="sampler-pad-bank" role="group" aria-label="Live sampler pads">
        {PAD_LANES.map((pad) => {
          const settingsForPad = settings[pad.id]
          const region = settingsForPad.region
          // A slice is exactly its region's audio, so the region's own
          // duration is what the rate arithmetic measures against.
          const rate = region
            ? padPlaybackRate(settingsForPad, region.duration, secondsPerStep(bpm))
            : 1
          const state = padAudioState(settingsForPad, audio)
          return (
            <div
              className="sampler-pad-strip"
              key={pad.id}
              data-spotlit={spotlitPads.includes(pad.id) || undefined}
              data-drop-active={dropTarget === pad.id || undefined}
              onDragOver={handleDragOver(pad.id)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={handleDrop(pad.id)}
            >
              <SamplerPad
                pad={pad}
                settings={settingsForPad}
                onAttack={onAttack}
                onRelease={onRelease}
              />
              <Knob
                spec={samplerParamForPad(pad.id)}
                value={settingsForPad.tune}
                spotlit={spotlitParams.includes(samplerParamForPad(pad.id).id)}
                onChange={onTuneChange}
              />
              <select
                className="sampler-assign"
                aria-label={`${pad.label} sound source`}
                value={region?.sourceId ?? ''}
                onChange={(event) => onAssign(pad.id, event.target.value)}
              >
                {/* Present so an empty pad has something to show; clearing a
                    pad is storage lifecycle work, not an assignment. */}
                <option value="" disabled>
                  No sound
                </option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
              <select
                className="sampler-fit"
                aria-label={`${pad.label} fit to steps`}
                value={settingsForPad.fit ?? ''}
                onChange={(event) =>
                  onFitChange(pad.id, event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">One-shot</option>
                {FIT_TARGETS.map((steps) => (
                  <option key={steps} value={steps}>
                    {steps} {steps === 1 ? 'step' : 'steps'}
                  </option>
                ))}
              </select>
              {/* What fitting did, in the two terms it is heard in. Speed and
                  pitch are one number: there is no time-stretching here. */}
              <span className="sampler-pad-rate">{formatPadRate(rate)}</span>
              <button
                type="button"
                className="sampler-chop"
                // Without its original there is nothing to re-trim against. The
                // pad keeps sounding; only the editing is gone, and it says so.
                disabled={!region || state === 'sourceMissing'}
                onClick={() => region && onOpenEditor(region.sourceId, pad.id)}
              >
                Chop {pad.label}
              </button>
              {state === 'sourceMissing' && (
                <p className="sampler-pad-state">
                  Original cleared — {settingsForPad.name} still sounds, but cannot be re-chopped.
                </p>
              )}
              {state === 'silent' && (
                <label className="sampler-relink">
                  {/* One action: point a silent pad at a file and it comes back
                      with its name, its tune, its fit and its programming. */}
                  <span>Relink {pad.label}</span>
                  <input
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) onRelinkPad(file, pad.id)
                    }}
                  />
                </label>
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
        Pick a sound per pad · play pads with 1–4 · tap a step twice to accent
      </p>
    </section>
  )
}

export const SamplerPanel = memo(SamplerInstrument)

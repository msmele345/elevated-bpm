import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisAudio } from '../audio/engine'
import { detectOnsets } from '../model/onset'
import {
  formatTimecode,
  jumpRegionEdgeToOnset,
  moveRegionEdge,
  regionEdgeAnnouncement,
  regionEnd,
  type RegionEdge,
} from '../model/region'
import { regionEditorKeyAction } from '../model/regionEditor'
import { PAD_LANES, type SampleRegion, type SampleSource } from '../model/sampler'
import type { PadLaneId } from '../model/types'
import { RegionHandle } from './RegionHandle'
import { WaveformView } from './WaveformView'

interface RegionEditorProps {
  source: SampleSource
  analysis: AnalysisAudio
  region: SampleRegion
  /** The pad this was opened from, if it was opened from one. */
  padId: PadLaneId | null
  onRegionChange: (region: SampleRegion) => void
  onAudition: (region: SampleRegion) => void
  onCommit: (padId: PadLaneId, region: SampleRegion) => void
  onClose: () => void
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The chopping surface: a source's shape, its detected hits, and two edges to
 * trim between.
 *
 * A modal dialog rather than an inline panel, and that decides the
 * accessibility work. It scopes the editor's keys for free — nothing else is
 * reachable while it is open, so chopping can never fire a stab or a pad
 * underneath it and no new global bindings are introduced. And it solves the
 * bypass problem: the sampler panel alone is roughly eighty controls, so an
 * inline editor would put the region handles ninety Tab stops deep, which is
 * the exact barrier Phase 9 measured and fixed. Here they are two Tabs from
 * opening it.
 *
 * Escape always releases the dialog, which is what makes containing Tab fair.
 */
export function RegionEditor({
  source,
  analysis,
  region,
  padId,
  onRegionChange,
  onAudition,
  onCommit,
  onClose,
}: RegionEditorProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [target, setTarget] = useState<PadLaneId>(padId ?? 'pad1')

  // Onsets are the source's structure, so they are found once per source
  // rather than per edit — this is the one genuinely expensive computation in
  // the editor, and nothing about moving an edge changes its answer.
  const onsets = useMemo(
    () => detectOnsets(analysis.samples, analysis.sampleRate),
    [analysis],
  )

  useEffect(() => {
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      // Focus containment, kept here rather than in the routing rule because
      // it is about what is on screen rather than about what a key means.
      if (event.key === 'Tab') {
        const stops = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
        )
        if (stops.length === 0) return
        const edge = event.shiftKey ? stops[0] : stops[stops.length - 1]
        if (document.activeElement === edge) {
          event.preventDefault()
          ;(event.shiftKey ? stops[stops.length - 1] : stops[0]).focus()
        }
        return
      }
      const action = regionEditorKeyAction(event)
      if (action === 'pass') return
      event.preventDefault()
      event.stopPropagation()
      if (action === 'close') onClose()
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [onClose])

  // The deck behind is inert while this is open, so focus is handed back to
  // whatever opened the editor rather than left on an unreachable element.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    return () => previousFocus?.focus()
  }, [])

  const moveEdge = (edge: RegionEdge, seconds: number) => {
    onRegionChange(moveRegionEdge(region, edge, seconds, analysis.duration))
  }

  const jumpEdge = (edge: RegionEdge, direction: 'next' | 'previous') => {
    onRegionChange(
      jumpRegionEdgeToOnset(region, edge, direction, onsets, analysis.duration),
    )
  }

  return (
    <div
      className="region-editor"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="region-editor-title"
      aria-describedby="region-editor-summary"
    >
      <div className="region-editor-card">
        <header className="region-editor-head">
          <h2 id="region-editor-title">Chop · {source.name}</h2>
          <button
            ref={closeRef}
            type="button"
            className="region-editor-close"
            onClick={onClose}
          >
            Close editor
          </button>
        </header>

        <p id="region-editor-summary" className="region-editor-summary">
          {formatTimecode(region.duration)} selected from {formatTimecode(analysis.duration)} ·{' '}
          {onsets.length} onsets detected. Drag an edge, or use the arrow keys; brackets jump
          between onsets and Enter auditions.
        </p>

        <div className="region-editor-track" ref={trackRef}>
          <WaveformView analysis={analysis} onsets={onsets} region={region} />
          <div
            className="region-editor-selection"
            aria-hidden="true"
            style={{
              left: `${(region.start / Math.max(analysis.duration, 1e-6)) * 100}%`,
              width: `${(region.duration / Math.max(analysis.duration, 1e-6)) * 100}%`,
            }}
          />
          {(['start', 'end'] as const).map((edge) => (
            <RegionHandle
              key={edge}
              edge={edge}
              region={region}
              sourceDuration={analysis.duration}
              onsets={onsets}
              trackRef={trackRef}
              onMove={moveEdge}
              onJump={jumpEdge}
              onAudition={() => onAudition(region)}
            />
          ))}
        </div>

        <dl className="region-editor-edges">
          <div>
            <dt>Start</dt>
            <dd>{regionEdgeAnnouncement(region.start, onsets)}</dd>
          </div>
          <div>
            <dt>End</dt>
            <dd>{regionEdgeAnnouncement(regionEnd(region), onsets)}</dd>
          </div>
        </dl>

        <div className="region-editor-actions">
          <button type="button" className="region-editor-audition" onClick={() => onAudition(region)}>
            Audition region
          </button>
          <label className="region-editor-target">
            <span>Assign to</span>
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value as PadLaneId)}
            >
              {PAD_LANES.map((pad) => (
                <option key={pad.id} value={pad.id}>
                  {pad.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="region-editor-commit"
            onClick={() => onCommit(target, region)}
          >
            Commit to pad
          </button>
        </div>
      </div>
    </div>
  )
}

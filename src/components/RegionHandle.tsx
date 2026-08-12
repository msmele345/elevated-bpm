import { memo, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import {
  REGION_JUMP_SECONDS,
  REGION_NUDGE_SECONDS,
  fractionOfSource,
  regionEdgeAnnouncement,
  regionEdgeRange,
  regionEdgeValue,
  type RegionEdge,
} from '../model/region'
import type { SampleRegion } from '../model/sampler'

interface RegionHandleProps {
  edge: RegionEdge
  region: SampleRegion
  sourceDuration: number
  onsets: readonly number[]
  /** The waveform the handle sits over; a drag reads its geometry. */
  trackRef: RefObject<HTMLElement | null>
  onMove: (edge: RegionEdge, seconds: number) => void
  onJump: (edge: RegionEdge, direction: 'next' | 'previous') => void
  onAudition: () => void
}

const EDGE_LABELS: Record<RegionEdge, string> = {
  start: 'Region start',
  end: 'Region end',
}

/**
 * One edge of the region, as a real slider.
 *
 * The waveform beside it is decorative to assistive technology; these two
 * controls carry every bit of the editor's meaning, exactly as the knob's SVG
 * is decorative and its `role="slider"` is not. That is why the announcement
 * carries the position among the onsets as well as the timecode: a waveform
 * describes audio the user can already hear, and structure is what makes the
 * region navigable without it.
 *
 * Space is deliberately unbound. It natively activates a focused button and
 * this deck has roughly 160 of them, so a shortcut there would double-fire.
 */
function RegionEdgeHandle({
  edge,
  region,
  sourceDuration,
  onsets,
  trackRef,
  onMove,
  onJump,
  onAudition,
}: RegionHandleProps) {
  const dragging = useRef(false)
  const value = regionEdgeValue(region, edge)
  const { min, max } = regionEdgeRange(region, edge, sourceDuration)
  const announcement = regionEdgeAnnouncement(value, onsets)

  const moveToClientX = (clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const bounds = track.getBoundingClientRect()
    if (bounds.width === 0) return
    onMove(edge, ((clientX - bounds.left) / bounds.width) * sourceDuration)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    // Arm the drag first, exactly as the knob does. Capture keeps a drag alive
    // once the pointer leaves the thumb, which is most of a drag — but it is
    // only an enhancement, and a pointer that refuses to be captured must
    // still trim rather than throwing the whole gesture away.
    dragging.current = true
    event.currentTarget.focus()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // No capture: the drag ends when the pointer leaves the thumb.
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    event.preventDefault()
    moveToClientX(event.clientX)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragging.current = false
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nudge = (delta: number) => {
      event.preventDefault()
      onMove(edge, value + delta)
    }
    const park = (at: number) => {
      event.preventDefault()
      onMove(edge, at)
    }
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        return nudge(REGION_NUDGE_SECONDS)
      case 'ArrowLeft':
      case 'ArrowDown':
        return nudge(-REGION_NUDGE_SECONDS)
      case 'PageUp':
        return nudge(REGION_JUMP_SECONDS)
      case 'PageDown':
        return nudge(-REGION_JUMP_SECONDS)
      case 'Home':
        return park(min)
      case 'End':
        return park(max)
      case '[':
        event.preventDefault()
        return onJump(edge, 'previous')
      case ']':
        event.preventDefault()
        return onJump(edge, 'next')
      case 'Enter':
        // A slider is not a button, so Enter is free here — and auditioning is
        // what a user reaches for the instant an edge lands somewhere.
        event.preventDefault()
        return onAudition()
      default:
        return
    }
  }

  return (
    <div
      className="region-handle"
      role="slider"
      tabIndex={0}
      aria-label={EDGE_LABELS[edge]}
      aria-valuemin={Number(min.toFixed(3))}
      aria-valuemax={Number(max.toFixed(3))}
      aria-valuenow={Number(value.toFixed(3))}
      aria-valuetext={announcement}
      data-edge={edge}
      style={{ left: `${fractionOfSource(value, sourceDuration) * 100}%` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={handleKeyDown}
    >
      <span className="region-handle-grip" aria-hidden="true" />
    </div>
  )
}

export const RegionHandle = memo(RegionEdgeHandle)

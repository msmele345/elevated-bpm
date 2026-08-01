import { memo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import {
  denormalizeParam,
  formatParam,
  normalizeParam,
  nudgeParam,
  type ParamSpec,
} from '../model/knob'

interface KnobProps<Id extends string> {
  spec: ParamSpec & { id: Id }
  value: number
  /** Highlighted while a lesson is pointing the user at this knob. */
  spotlit?: boolean
  /** The knob names itself, so a panel can hand every knob one stable handler. */
  onChange: (id: Id, value: number) => void
}

/** Full travel of the knob: dragging this far vertically sweeps min to max. */
const DRAG_TRAVEL_PX = 160
/** Holding shift slows the drag for fine tuning, like a hardware fine control. */
const FINE_DRAG_FACTOR = 0.25
/** Arrow keys nudge; Page keys jump — both as fractions of the knob's travel. */
const KEY_NUDGE = 0.02
const KEY_JUMP = 0.1

/** Knob sweep: -135° (min) to +135° (max), the classic hardware 270°. */
const SWEEP_DEGREES = 270
const RADIUS = 17
const CENTER = 24

function pointOnDial(normalized: number, radius: number): [number, number] {
  const angle = ((normalized * SWEEP_DEGREES - SWEEP_DEGREES / 2 - 90) * Math.PI) / 180
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)]
}

/** SVG arc from the minimum of the sweep to `normalized`. */
function dialArc(normalized: number): string {
  const [x0, y0] = pointOnDial(0, RADIUS)
  const [x1, y1] = pointOnDial(normalized, RADIUS)
  const largeArc = normalized * SWEEP_DEGREES > 180 ? 1 : 0
  return `M ${x0} ${y0} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x1} ${y1}`
}

/**
 * A hardware-style knob, drawn as SVG (per the rendering split: knobs and
 * faders are SVG). It is a real slider to assistive tech and to the keyboard —
 * arrows nudge, Page jumps, Home/End park at the ends — so sound design never
 * requires a mouse. Values move in knob-travel space, so a log-tapered
 * parameter like cutoff responds evenly across its whole range.
 */
function KnobDial<Id extends string>({ spec, value, spotlit = false, onChange }: KnobProps<Id>) {
  const dragRef = useRef<{ startY: number; startNormalized: number } | null>(null)
  const normalized = normalizeParam(spec, value)
  const [pointerX, pointerY] = pointOnDial(normalized, RADIUS - 5)
  const readout = formatParam(spec, value)

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Arm the drag first: capture is an enhancement — it keeps a drag tracking
    // once the pointer leaves the knob, like a real one — and a pointer that
    // refuses to be captured must still turn the knob rather than throw the
    // whole gesture away.
    dragRef.current = { startY: event.clientY, startNormalized: normalized }
    event.currentTarget.focus()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // No capture: the drag simply ends when the pointer leaves the knob.
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    // Up is louder/brighter: screen Y grows downward, so invert it.
    const travelled = (drag.startY - event.clientY) / DRAG_TRAVEL_PX
    const scaled = event.shiftKey ? travelled * FINE_DRAG_FACTOR : travelled
    onChange(spec.id, denormalizeParam(spec, drag.startNormalized + scaled))
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nudge = (delta: number) => {
      event.preventDefault()
      onChange(spec.id, nudgeParam(spec, value, delta))
    }
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        return nudge(KEY_NUDGE)
      case 'ArrowDown':
      case 'ArrowLeft':
        return nudge(-KEY_NUDGE)
      case 'PageUp':
        return nudge(KEY_JUMP)
      case 'PageDown':
        return nudge(-KEY_JUMP)
      case 'Home':
        event.preventDefault()
        return onChange(spec.id, spec.min)
      case 'End':
        event.preventDefault()
        return onChange(spec.id, spec.max)
      default:
        return
    }
  }

  return (
    <div className={spotlit ? 'knob is-spotlit' : 'knob'}>
      <div
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={spec.label}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={Number(value.toFixed(2))}
        aria-valuetext={readout}
        data-param={spec.id}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path className="knob-track" d={dialArc(1)} />
          <path className="knob-value" d={dialArc(normalized)} />
          <circle className="knob-cap" cx={CENTER} cy={CENTER} r={RADIUS - 4} />
          <line
            className="knob-pointer"
            x1={CENTER}
            y1={CENTER}
            x2={pointerX}
            y2={pointerY}
          />
        </svg>
      </div>
      <span className="knob-label">{spec.label}</span>
      <span className="knob-readout">{readout}</span>
    </div>
  )
}

/**
 * A dragged knob emits a change per pointer move; every other knob on the deck
 * must sit that storm out. `memo` drops the generic call signature, so the cast
 * hands it back — the runtime component is the memoized one either way.
 */
export const Knob = memo(KnobDial) as typeof KnobDial

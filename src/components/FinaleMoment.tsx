import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { finaleKeyAction } from '../model/finale'

interface FinaleMomentProps {
  onClose: () => void
}

const FINALE_STEPS = Array.from({ length: 16 }, (_, index) => index)

/**
 * The one graduation beat in the curriculum. It sits over the still-running
 * deck rather than replacing it: the user's groove is the reason this exists,
 * and closing it drops them straight back into their instrument.
 */
export function FinaleMoment({ onClose }: FinaleMomentProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = finaleKeyAction(event)
      if (action === 'pass') return
      event.preventDefault()
      event.stopPropagation()
      if (action === 'close') onClose()
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      previousFocus?.focus()
    }
  }, [onClose])

  return (
    <section
      className="finale"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finale-title"
      aria-describedby="finale-copy"
    >
      <div className="finale-glow" aria-hidden="true" />
      <div className="finale-card">
        <p className="finale-kicker">Final challenge complete · EB-01 certified</p>
        <div className="finale-step-run" aria-hidden="true">
          {FINALE_STEPS.map((step) => (
            <span key={step} style={{ '--finale-step': step } as CSSProperties} />
          ))}
        </div>
        <h2 className="finale-title" id="finale-title">
          <span>You made</span>
          techno
        </h2>
        <p className="finale-copy" id="finale-copy">
          That groove is not a preset. You built the kick, the lift, the bass movement and the
          stabs — one machine, speaking in your voice.
        </p>
        <button ref={closeRef} type="button" className="finale-close" onClick={onClose}>
          <span className="finale-close-led" aria-hidden="true" />
          Keep it rolling
        </button>
      </div>
    </section>
  )
}

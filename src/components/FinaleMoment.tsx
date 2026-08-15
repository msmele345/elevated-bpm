import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { finaleKeyAction, finaleStepCount, type ArcFinale } from '../model/finale'

interface FinaleMomentProps {
  finale: ArcFinale
  onClose: () => void
}

/**
 * A track's graduation beat. It sits over the still-running deck rather than
 * replacing it: the user's groove is the reason this exists, and closing it
 * drops them straight back into their instrument.
 *
 * Every word of it comes from the arc that was finished, so a second track can
 * have an ending of its own without claiming the first one's.
 */
export function FinaleMoment({ finale, onClose }: FinaleMomentProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const steps = Array.from({ length: finaleStepCount(finale) }, (_, index) => index)

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
      data-scale={finale.scale}
      role="dialog"
      aria-modal="true"
      aria-labelledby="finale-title"
      aria-describedby="finale-copy"
    >
      <div className="finale-glow" aria-hidden="true" />
      <div className="finale-card">
        <p className="finale-kicker">{finale.kicker}</p>
        <div className="finale-step-run" aria-hidden="true">
          {steps.map((step) => (
            <span key={step} style={{ '--finale-step': step } as CSSProperties} />
          ))}
        </div>
        <h2 className="finale-title" id="finale-title">
          <span>{finale.lead}</span>
          {finale.headline}
        </h2>
        <p className="finale-copy" id="finale-copy">
          {finale.copy}
        </p>
        <button ref={closeRef} type="button" className="finale-close" onClick={onClose}>
          <span className="finale-close-led" aria-hidden="true" />
          {finale.close}
        </button>
      </div>
    </section>
  )
}

import {
  memo,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { PadLaneSpec, PadSettings } from '../model/sampler'
import type { PadLaneId } from '../model/types'

interface SamplerPadProps {
  pad: PadLaneSpec
  settings: PadSettings
  onAttack: (inputSourceId: string, padId: PadLaneId) => void
  onRelease: (inputSourceId: string) => void
}

/** A numbered, live-playable one-shot pad. Sequencing lives in the lane below it. */
function SamplerPadButton({ pad, settings, onAttack, onRelease }: SamplerPadProps) {
  const heldSources = useRef(new Set<string>())

  // A Space held while focus moves away sends its keyup to whatever took focus,
  // so listen globally. A hold that outlived its key would make the early return
  // in attack() permanent and leave this pad's Space and Enter dead.
  useEffect(() => {
    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return
      const inputSourceId = `button:${pad.id}:${event.code}`
      if (!heldSources.current.delete(inputSourceId)) return
      event.preventDefault()
      onRelease(inputSourceId)
    }

    const releaseAll = () => {
      for (const inputSourceId of heldSources.current) onRelease(inputSourceId)
      heldSources.current.clear()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseAll()
    }

    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      releaseAll()
    }
  }, [onRelease, pad.id])

  const attack = (inputSourceId: string) => {
    if (heldSources.current.has(inputSourceId)) return
    heldSources.current.add(inputSourceId)
    onAttack(inputSourceId, pad.id)
  }

  const release = (inputSourceId: string) => {
    if (!heldSources.current.delete(inputSourceId)) return
    onRelease(inputSourceId)
  }

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    const inputSourceId = `pointer:${event.pointerId}`
    // Perform the hit before capture. Capture is only an enhancement; a browser
    // refusing it must never turn a playable pad into silence.
    attack(inputSourceId)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // No capture: pointerup on the pad still releases the input source.
    }
  }

  const handlePointerRelease = (event: PointerEvent<HTMLButtonElement>) => {
    release(`pointer:${event.pointerId}`)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return
    event.preventDefault()
    attack(`button:${pad.id}:${event.code}`)
  }

  const soundName = settings.region ? settings.name : 'empty'

  return (
    <button
      type="button"
      className="sampler-pad"
      data-pad-id={pad.id}
      aria-pressed={false}
      aria-label={`Play ${pad.label} — ${soundName}`}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      onLostPointerCapture={handlePointerRelease}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="sampler-pad-led" aria-hidden="true" />
      <span className="sampler-pad-number" aria-hidden="true">
        {pad.keyLabel}
      </span>
      <span className="sampler-pad-name" aria-hidden="true">
        {soundName}
      </span>
    </button>
  )
}

export const SamplerPad = memo(SamplerPadButton)

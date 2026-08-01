import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from 'react'
import { DECK_SECTION_IDS, sectionTitleId } from '../model/deckSections'
import { midiToNoteName } from '../model/note'
import { STAB_KEYS, stabKeyForKeyboardInput, type StabKey } from '../model/stab'
import type { NoteLane, NoteLaneId } from '../model/types'
import { NoteRow } from './NoteRow'
import { PanelTitle } from './PanelTitle'

interface StabKeyboardProps {
  lane: NoteLane
  /** The active lesson is pointing at the sequenced stab lane. */
  spotlitLane?: boolean
  /** The active lesson is pointing at the live keyboard. */
  spotlitKeys?: boolean
  onAttack: (source: string, midi: number) => void
  onRelease: (source: string) => void
  getSoundingNotes: () => readonly number[]
  onToggleStep: (laneId: NoteLaneId, stepIndex: number) => void
  onTranspose: (laneId: NoteLaneId, stepIndex: number, semitones: number) => void
  onResize: (laneId: NoteLaneId, stepIndex: number, steps: number) => void
}

const WHITE_KEY_COUNT = STAB_KEYS.filter((key) => key.kind === 'white').length
const WHITE_KEY_WIDTH = 100 / WHITE_KEY_COUNT

function keyStyle(key: StabKey): CSSProperties {
  const whitesBefore = STAB_KEYS.filter(
    (candidate) => candidate.kind === 'white' && candidate.midi < key.midi,
  ).length
  return key.kind === 'white'
    ? { left: `${whitesBefore * WHITE_KEY_WIDTH}%`, width: `${WHITE_KEY_WIDTH}%` }
    : { left: `${whitesBefore * WHITE_KEY_WIDTH}%` }
}

const STAB_KEY_LAYOUT = STAB_KEYS.map((key) => ({ key, style: keyStyle(key) }))

/**
 * One live octave of the stab synth. Pointer contacts and physical keyboard
 * codes are tracked separately, so several held keys form a chord and each
 * note releases only when its own input ends.
 *
 * Memoized like the lanes: thirteen keys plus a note row is too much to
 * rebuild because a knob moved somewhere else on the deck.
 */
function StabInstrument({
  lane,
  spotlitLane = false,
  spotlitKeys = false,
  onAttack,
  onRelease,
  getSoundingNotes,
  onToggleStep,
  onTranspose,
  onResize,
}: StabKeyboardProps) {
  const heldSources = useRef(new Set<string>())
  const keyboardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const keyboard = keyboardRef.current
    if (!keyboard) return

    let frame = 0
    let previous = ''

    const renderSoundingKeys = () => {
      const notes = getSoundingNotes()
      const signature = notes.join(',')
      if (signature !== previous) {
        const sounding = new Set(notes)
        keyboard.querySelectorAll<HTMLButtonElement>('.stab-key').forEach((key) => {
          const active = sounding.has(Number(key.dataset.midi))
          key.toggleAttribute('data-sounding', active)
          key.setAttribute('aria-pressed', String(active))
        })
        previous = signature
      }
      frame = requestAnimationFrame(renderSoundingKeys)
    }

    frame = requestAnimationFrame(renderSoundingKeys)
    return () => {
      cancelAnimationFrame(frame)
      keyboard.querySelectorAll<HTMLButtonElement>('.stab-key').forEach((key) => {
        key.removeAttribute('data-sounding')
        key.setAttribute('aria-pressed', 'false')
      })
    }
  }, [getSoundingNotes])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = stabKeyForKeyboardInput(event)
      const source = `computer:${event.code}`
      if (!key || heldSources.current.has(source)) return
      event.preventDefault()
      heldSources.current.add(source)
      onAttack(source, key.midi)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const computerSource = `computer:${event.code}`
      if (heldSources.current.delete(computerSource)) {
        event.preventDefault()
        onRelease(computerSource)
      }

      const buttonSource = `button:${event.code}`
      if (heldSources.current.delete(buttonSource)) {
        event.preventDefault()
        onRelease(buttonSource)
      }
    }

    const releaseAll = () => {
      for (const source of heldSources.current) onRelease(source)
      heldSources.current.clear()
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

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, midi: number) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const source = `pointer:${event.pointerId}`
    if (heldSources.current.has(source)) return
    event.preventDefault()
    heldSources.current.add(source)
    // Sound first, then reach for capture. Capture is an enhancement — it keeps
    // a held key alive when the pointer slides off it — and a pointer that
    // refuses to be captured must still play the note: silence is the one
    // outcome an instrument cannot have.
    onAttack(source, midi)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // No capture: the key releases on pointerup wherever that lands.
    }
  }

  const handlePointerRelease = (event: PointerEvent<HTMLButtonElement>) => {
    const source = `pointer:${event.pointerId}`
    if (!heldSources.current.delete(source)) return
    onRelease(source)
  }

  const handleButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, midi: number) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return
    const source = `button:${event.code}`
    if (heldSources.current.has(source)) return
    event.preventDefault()
    heldSources.current.add(source)
    onAttack(source, midi)
  }

  return (
    <section
      className="panel stab-panel"
      id={DECK_SECTION_IDS.stabs}
      tabIndex={-1}
      aria-labelledby={sectionTitleId(DECK_SECTION_IDS.stabs)}
    >
      <PanelTitle sectionId={DECK_SECTION_IDS.stabs} name="Chord Stab" model="POLY SYNTH · CS-08" />
      <NoteRow
        lane={lane}
        spotlit={spotlitLane}
        onToggleStep={onToggleStep}
        onTranspose={onTranspose}
        onResize={onResize}
      />
      <div
        ref={keyboardRef}
        className={spotlitKeys ? 'stab-keyboard is-spotlit' : 'stab-keyboard'}
        // A bare div takes no accessible name: without a role the label below
        // is dropped and the keys arrive unannounced, one loose button after
        // another, with nothing saying they are one instrument.
        role="group"
        aria-label="Live stab keyboard"
      >
        {STAB_KEY_LAYOUT.map(({ key, style }) => (
          <button
            key={key.code}
            type="button"
            className={`stab-key stab-key-${key.kind}`}
            style={style}
            data-midi={key.midi}
            aria-pressed={false}
            aria-label={`${midiToNoteName(key.midi)} — ${key.label} key`}
            onKeyDown={(event) => handleButtonKeyDown(event, key.midi)}
            onPointerDown={(event) => handlePointerDown(event, key.midi)}
            onPointerUp={handlePointerRelease}
            onPointerCancel={handlePointerRelease}
            onLostPointerCapture={handlePointerRelease}
            onContextMenu={(event) => event.preventDefault()}
          >
            <span className="stab-note-name">{midiToNoteName(key.midi)}</span>
            <span className="stab-computer-key">{key.label}</span>
          </button>
        ))}
      </div>
      <p className="panel-hint">
        Tap a stab step to sequence it · use arrows to shape it · play A–K live, with W E T Y
        U for sharps
      </p>
    </section>
  )
}

export const StabKeyboard = memo(StabInstrument)

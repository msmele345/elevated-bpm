import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BankSlot } from '../model/bank'

interface PatternBankProps {
  slots: readonly BankSlot[]
  /** The selected slot — the one the grid shows and edits go to. */
  selectedId: string
  onSelect: (slotId: string) => void
  /** Copy the selected slot onto this one, which then becomes selected. */
  onCopy: (targetId: string) => void
  /** Empty the selected slot. */
  onClear: () => void
}

/**
 * Where the bank is between presses. Copy arms a mode in which the next slot
 * pressed is a copy target, and anything that would destroy programming asks
 * first. This is the strip's own business: it is never saved, shared or seen
 * by the rest of the deck, so arming Copy re-renders nothing but the bank.
 */
type BankMode =
  | { kind: 'idle' }
  | { kind: 'arming' }
  | { kind: 'confirmCopy'; targetId: string }
  | { kind: 'confirmClear' }

const IDLE: BankMode = { kind: 'idle' }

/**
 * The pattern bank in the transport strip: the four slot buttons, A–D, then
 * Copy and Clear.
 *
 * Selected is React's to show (`aria-pressed`), because pressing a slot is an
 * ordinary document edit. Playing and queued are not: they change on the audio
 * clock, so `useSlotLights` writes them from rAF — the `data-playing` and
 * `data-queued` LEDs and the empty state span inside each button, which React
 * renders without children and so never reconciles. The accessible name is the
 * button's text: "Slot B, selected, queued, empty".
 *
 * Overwriting or clearing programming asks with an inline confirm in place of
 * the slots, Copy and Clear — never a browser dialog, which would block the session.
 * Focus goes to Cancel when it opens, so a stray Enter can never wipe a
 * pattern, and comes back to the control the question was about when it
 * closes; with the deck this many tab stops deep, focus must never fall to the
 * page. Escape backs out of an armed copy or an open confirm.
 */
function Bank({ slots, selectedId, onSelect, onCopy, onClear }: PatternBankProps) {
  const [mode, setMode] = useState<BankMode>(IDLE)
  const rootRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  /** Where focus goes once the bank settles: a slot id, or 'clear'. */
  const refocus = useRef<string | null>(null)

  const selected = slots.find((slot) => slot.id === selectedId)
  const letterOf = (id: string) => slots.find((slot) => slot.id === id)?.letter ?? ''

  const settle = (focusOn: string | null) => {
    refocus.current = focusOn
    setMode(IDLE)
  }

  const pressSlot = (slot: BankSlot) => {
    if (mode.kind !== 'arming') {
      onSelect(slot.id)
      return
    }
    if (slot.id === selectedId) {
      // Copying a slot onto itself would change nothing, so nothing happens.
      setMode(IDLE)
    } else if (slot.empty) {
      setMode(IDLE)
      onCopy(slot.id)
    } else {
      setMode({ kind: 'confirmCopy', targetId: slot.id })
    }
  }

  const pressClear = () => {
    // An empty slot has nothing to lose, and nothing to clear.
    if (!selected || selected.empty) return
    setMode({ kind: 'confirmClear' })
  }

  const answerYes = () => {
    if (mode.kind === 'confirmCopy') {
      onCopy(mode.targetId)
      settle(mode.targetId)
    } else if (mode.kind === 'confirmClear') {
      onClear()
      settle('clear')
    }
  }

  const answerNo = () => settle(mode.kind === 'confirmCopy' ? mode.targetId : 'clear')

  // The confirm takes the place of the focused Copy or slot, so focus moves
  // into it; when the bank settles, focus returns to what was asked about.
  useLayoutEffect(() => {
    if (mode.kind === 'confirmCopy' || mode.kind === 'confirmClear') {
      cancelRef.current?.focus()
      return
    }
    const target = refocus.current
    refocus.current = null
    if (target === null) return
    const selector = target === 'clear' ? '[data-bank-clear]' : `[data-slot-id="${target}"]`
    rootRef.current?.querySelector<HTMLElement>(selector)?.focus()
  }, [mode])

  // Escape is listened for only while there is something to back out of, so
  // it never competes with the Share menu, the region editor or the finale.
  useEffect(() => {
    if (mode.kind === 'idle') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (mode.kind === 'arming') setMode(IDLE)
      else settle(mode.kind === 'confirmCopy' ? mode.targetId : 'clear')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mode])

  const confirming = mode.kind === 'confirmCopy' || mode.kind === 'confirmClear'
  const question =
    mode.kind === 'confirmCopy'
      ? `Overwrite ${letterOf(mode.targetId)}?`
      : `Clear ${selected?.letter ?? ''}?`

  return (
    <div
      ref={rootRef}
      className="bank"
      role="group"
      aria-label="Pattern bank"
      data-copy-armed={mode.kind === 'arming' || undefined}
    >
      {/* Hidden rather than unmounted while a confirm is open: the confirm
          takes the slots' room too, so asking never widens the strip, and the
          buttons stay for useSlotLights and for focus to come back to. */}
      <div className="bank-slots" hidden={confirming}>
        {slots.map((slot) => {
          const isSelected = slot.id === selectedId
          return (
            <button
              key={slot.id}
              type="button"
              className="bank-slot"
              data-slot-id={slot.id}
              data-slot-letter={slot.letter}
              data-empty={slot.empty || undefined}
              data-copy-target={
                (mode.kind === 'confirmCopy' && mode.targetId === slot.id) || undefined
              }
              aria-pressed={isSelected}
              onClick={() => pressSlot(slot)}
            >
              <span className="bank-slot-led" aria-hidden="true" />
              <span className="visually-hidden">{`Slot ${slot.letter}`}</span>
              <span className="bank-slot-letter" aria-hidden="true">
                {slot.letter}
              </span>
              <span className="visually-hidden">{isSelected ? ', selected' : ''}</span>
              <span className="visually-hidden" data-slot-state="" />
              <span className="visually-hidden">{slot.empty ? ', empty' : ''}</span>
            </button>
          )
        })}
      </div>
      {confirming ? (
        <div className="bank-confirm" role="group" aria-labelledby="bank-confirm-question">
          <span className="bank-confirm-question" id="bank-confirm-question">
            {question}
          </span>
          <button
            type="button"
            className="bank-key bank-key-danger"
            aria-label={
              mode.kind === 'confirmCopy'
                ? `Overwrite ${letterOf(mode.targetId)}`
                : `Clear ${selected?.letter ?? ''}`
            }
            onClick={answerYes}
          >
            {mode.kind === 'confirmCopy' ? 'Overwrite' : 'Clear'}
          </button>
          <button type="button" className="bank-key" ref={cancelRef} onClick={answerNo}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="bank-actions">
          <button
            type="button"
            className="bank-key"
            aria-label={`Copy slot ${selected?.letter ?? ''}`}
            aria-pressed={mode.kind === 'arming'}
            onClick={() => setMode(mode.kind === 'arming' ? IDLE : { kind: 'arming' })}
          >
            Copy
          </button>
          <button
            type="button"
            className="bank-key"
            data-bank-clear=""
            // An empty slot has nothing to clear. `aria-disabled` rather than
            // `disabled`, so Clear keeps focus after the slot it just emptied.
            aria-label={`Clear slot ${selected?.letter ?? ''}`}
            aria-disabled={selected?.empty || undefined}
            onClick={pressClear}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

export const PatternBank = memo(Bank)

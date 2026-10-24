import { memo } from 'react'

/** One slot as the bank renders it: which pattern, its letter, and whether it is empty. */
export interface BankSlot {
  id: string
  letter: string
  empty: boolean
}

interface PatternBankProps {
  slots: readonly BankSlot[]
  /** The selected slot — the one the grid shows and edits go to. */
  selectedId: string
  onSelect: (slotId: string) => void
}

/**
 * The pattern bank's four slot buttons, A–D, in the transport strip.
 *
 * Selected is React's to show (`aria-pressed`), because pressing a slot is an
 * ordinary document edit. Playing and queued are not: they change on the audio
 * clock, so `useSlotLights` writes them from rAF — the `data-playing` and
 * `data-queued` LEDs and the empty state span inside each button, which React
 * renders without children and so never reconciles. The accessible name is the
 * button's text: "Slot B, selected, queued, empty".
 */
function Bank({ slots, selectedId, onSelect }: PatternBankProps) {
  return (
    <div className="bank" role="group" aria-label="Pattern bank">
      {slots.map((slot) => {
        const selected = slot.id === selectedId
        return (
          <button
            key={slot.id}
            type="button"
            className="bank-slot"
            data-slot-id={slot.id}
            data-slot-letter={slot.letter}
            data-empty={slot.empty || undefined}
            aria-pressed={selected}
            onClick={() => onSelect(slot.id)}
          >
            <span className="bank-slot-led" aria-hidden="true" />
            <span className="visually-hidden">{`Slot ${slot.letter}`}</span>
            <span className="bank-slot-letter" aria-hidden="true">
              {slot.letter}
            </span>
            <span className="visually-hidden">{selected ? ', selected' : ''}</span>
            <span className="visually-hidden" data-slot-state="" />
            <span className="visually-hidden">{slot.empty ? ', empty' : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

export const PatternBank = memo(Bank)

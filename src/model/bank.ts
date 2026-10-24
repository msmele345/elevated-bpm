import { createInitialPattern } from './pattern'
import type { Pattern } from './types'

/**
 * The pattern bank: four slots, A to D, each holding one Pattern's
 * programming. The document's `patterns` list *is* the bank — always four
 * patterns, in slot order, each named by its letter — so a slot is found by
 * its position and its name says which one it is.
 *
 * Only programming lives in a slot. Tempo, swing, the mixer, the patches and
 * the pad sounds belong to the Deck, so switching slots changes what is
 * played and never how the Deck sounds.
 */

export const SLOT_LETTERS = ['A', 'B', 'C', 'D'] as const

export type SlotLetter = (typeof SLOT_LETTERS)[number]

export function isSlotLetter(value: unknown): value is SlotLetter {
  return (SLOT_LETTERS as readonly unknown[]).includes(value)
}

/**
 * An empty slot: no step on in any lane. A pitch or length parked on a step
 * that is off is not programming — it makes no sound — so it does not count.
 */
export function isPatternEmpty(pattern: Pattern): boolean {
  return [...pattern.lanes, ...pattern.padLanes, ...pattern.noteLanes].every((lane) =>
    lane.steps.every((step) => !step.on),
  )
}

/**
 * A fresh, empty pattern for one slot, under an id no pattern in `taken`
 * already has. The slot's natural id is tried first so documents stay
 * readable; a clash — a pattern that happened to take it — gets a suffix.
 */
function emptySlot(letter: SlotLetter, taken: ReadonlySet<string>): Pattern {
  const natural = `pattern-${letter.toLowerCase()}`
  let id = natural
  for (let n = 2; taken.has(id); n++) id = `${natural}-${n}`
  return { ...createInitialPattern(), id, name: letter }
}

/**
 * Lay patterns out as a full bank: each one in the slot its letter names, and
 * every letter nobody claimed filled with an empty slot under a fresh id. This
 * is what keeps the four-slot rule true of anything the deck loads, whether a
 * saved document or a shared bank that carried only the slots with programming.
 */
export function bankWithSlots(patterns: readonly Pattern[]): Pattern[] {
  const taken = new Set(patterns.map((pattern) => pattern.id))
  return SLOT_LETTERS.map((letter) => {
    const placed = patterns.find((pattern) => pattern.name === letter)
    if (placed) return placed
    const slot = emptySlot(letter, taken)
    taken.add(slot.id)
    return slot
  })
}

/**
 * `target` holding a deep copy of `source`'s programming: every lane and every
 * step is a fresh object, so editing either slot afterwards never reaches the
 * other. The target keeps its own id and letter — it is still the same slot.
 */
export function withProgrammingOf(target: Pattern, source: Pattern): Pattern {
  return {
    ...target,
    lanes: source.lanes.map((lane) => ({ ...lane, steps: lane.steps.map((step) => ({ ...step })) })),
    padLanes: source.padLanes.map((lane) => ({
      ...lane,
      steps: lane.steps.map((step) => ({ ...step })),
    })),
    noteLanes: source.noteLanes.map((lane) => ({
      ...lane,
      steps: lane.steps.map((step) => ({ ...step })),
    })),
  }
}

/** `pattern` with every lane started over, keeping its id and letter. */
export function emptiedPattern(pattern: Pattern): Pattern {
  return withProgrammingOf(pattern, createInitialPattern())
}

/** A bank with `pattern` in slot A — keeping its id — and B–D empty. */
export function createBank(pattern: Pattern): Pattern[] {
  return bankWithSlots([{ ...pattern, name: 'A' }])
}

/** One slot as its button shows it: which pattern, its letter, and whether it is empty. */
export interface BankSlot {
  id: string
  letter: SlotLetter
  empty: boolean
}

/** What the slot buttons show of a bank. */
export function bankSlots(bank: readonly Pattern[]): BankSlot[] {
  return bank.map((pattern) => ({
    id: pattern.id,
    letter: pattern.name as SlotLetter,
    empty: isPatternEmpty(pattern),
  }))
}

/**
 * Whether two bank descriptions show the same buttons. Most step taps change
 * a slot's programming without making it empty or not, and the strip they are
 * handed to is memoized, so they should hand it the same array.
 */
export function sameBankSlots(a: readonly BankSlot[], b: readonly BankSlot[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (slot, i) => slot.id === b[i].id && slot.letter === b[i].letter && slot.empty === b[i].empty,
    )
  )
}

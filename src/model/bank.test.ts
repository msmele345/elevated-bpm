import { describe, expect, it } from 'vitest'
import {
  bankSlots,
  bankWithSlots,
  createBank,
  isPatternEmpty,
  sameBankSlots,
  SLOT_LETTERS,
} from './bank'
import { toggleNoteStep, transposeNoteStep } from './note'
import { createDemoPattern, createInitialPattern, cycleStep } from './pattern'

describe('the pattern bank', () => {
  it('has four slots, A to D', () => {
    expect(SLOT_LETTERS).toEqual(['A', 'B', 'C', 'D'])
  })

  it('puts a pattern in slot A, keeping its id and programming, with B–D empty', () => {
    const demo = createDemoPattern()
    const bank = createBank(demo)

    expect(bank.map((slot) => slot.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(bank[0]).toEqual({ ...demo, name: 'A' })
    expect(bank.slice(1).every(isPatternEmpty)).toBe(true)
  })

  it('gives every slot its own id, never the one slot A kept', () => {
    // A document whose pattern happened to take a slot's natural id must still
    // come out with four distinct slots.
    const bank = createBank({ ...createInitialPattern(), id: 'pattern-b' })
    expect(new Set(bank.map((slot) => slot.id)).size).toBe(4)
    expect(bank[0].id).toBe('pattern-b')
  })
})

describe('bankWithSlots', () => {
  it('puts each pattern back in the slot its letter names and fills the gaps empty', () => {
    const b = { ...createDemoPattern(), id: 'shared-b', name: 'B' }
    const d = { ...createDemoPattern(), id: 'shared-d', name: 'D' }

    const bank = bankWithSlots([d, b])

    expect(bank.map((slot) => slot.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(bank[1]).toBe(b)
    expect(bank[3]).toBe(d)
    expect(isPatternEmpty(bank[0])).toBe(true)
    expect(isPatternEmpty(bank[2])).toBe(true)
    expect(new Set(bank.map((slot) => slot.id)).size).toBe(4)
  })

  it('hands a complete bank back slot for slot', () => {
    const bank = createBank(createDemoPattern())
    expect(bankWithSlots(bank)).toEqual(bank)
  })
})

describe('isPatternEmpty', () => {
  it('is true of a pattern with no step on in any lane', () => {
    expect(isPatternEmpty(createInitialPattern())).toBe(true)
  })

  it('is false of a pattern with a drum, pad or note step on', () => {
    const initial = createInitialPattern()
    expect(isPatternEmpty(createDemoPattern())).toBe(false)
    expect(isPatternEmpty(cycleStep(initial, 'pad3', 9))).toBe(false)
    expect(isPatternEmpty(toggleNoteStep(initial, 'bass', 0))).toBe(false)
  })

  it('ignores a pitch or length parked on a step that is off', () => {
    const parked = toggleNoteStep(
      transposeNoteStep(toggleNoteStep(createInitialPattern(), 'stab', 4), 'stab', 4, 5),
      'stab',
      4,
    )
    expect(parked.noteLanes.find((lane) => lane.id === 'stab')!.steps[4].on).toBe(false)
    expect(isPatternEmpty(parked)).toBe(true)
  })
})

describe('bankSlots', () => {
  it('describes each slot for its button: id, letter and whether it is empty', () => {
    const bank = createBank({ ...createDemoPattern(), id: 'odd:id|"quoted"' })
    expect(bankSlots(bank)).toEqual([
      { id: 'odd:id|"quoted"', letter: 'A', empty: false },
      { id: bank[1].id, letter: 'B', empty: true },
      { id: bank[2].id, letter: 'C', empty: true },
      { id: bank[3].id, letter: 'D', empty: true },
    ])
  })

  it('reads a step tap that leaves every slot as full as it was as no change', () => {
    const bank = createBank(createDemoPattern())
    const tapped = [cycleStep(bank[0], 'kick', 0), ...bank.slice(1)]
    expect(sameBankSlots(bankSlots(bank), bankSlots(tapped))).toBe(true)
    const filled = [bank[0], cycleStep(bank[1], 'kick', 0), ...bank.slice(2)]
    expect(sameBankSlots(bankSlots(bank), bankSlots(filled))).toBe(false)
  })
})

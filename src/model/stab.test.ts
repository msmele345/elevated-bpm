import { describe, expect, it } from 'vitest'
import { STAB_KEYS, createStabNoteHolds, stabKeyForCode } from './stab'

describe('stab keyboard', () => {
  it('maps a playable C4–C5 keyboard to the A–K row and its sharp keys', () => {
    expect(STAB_KEYS.map(({ code, label, midi, kind }) => ({ code, label, midi, kind }))).toEqual([
      { code: 'KeyA', label: 'A', midi: 60, kind: 'white' },
      { code: 'KeyW', label: 'W', midi: 61, kind: 'black' },
      { code: 'KeyS', label: 'S', midi: 62, kind: 'white' },
      { code: 'KeyE', label: 'E', midi: 63, kind: 'black' },
      { code: 'KeyD', label: 'D', midi: 64, kind: 'white' },
      { code: 'KeyF', label: 'F', midi: 65, kind: 'white' },
      { code: 'KeyT', label: 'T', midi: 66, kind: 'black' },
      { code: 'KeyG', label: 'G', midi: 67, kind: 'white' },
      { code: 'KeyY', label: 'Y', midi: 68, kind: 'black' },
      { code: 'KeyH', label: 'H', midi: 69, kind: 'white' },
      { code: 'KeyU', label: 'U', midi: 70, kind: 'black' },
      { code: 'KeyJ', label: 'J', midi: 71, kind: 'white' },
      { code: 'KeyK', label: 'K', midi: 72, kind: 'white' },
    ])
  })

  it('resolves mapped physical keys without claiming unrelated keyboard input', () => {
    expect(stabKeyForCode('KeyA')?.midi).toBe(60)
    expect(stabKeyForCode('KeyU')?.midi).toBe(70)
    expect(stabKeyForCode('Space')).toBeUndefined()
  })
})

describe('stab note holds', () => {
  it('ignores key repeat from a source that is already held', () => {
    const holds = createStabNoteHolds()

    expect(holds.press('computer:KeyA', 60)).toEqual({ midi: 60, request: 1 })
    expect(holds.press('computer:KeyA', 60)).toBeNull()
  })

  it('keeps the other notes in a chord current when one note is released', () => {
    const holds = createStabNoteHolds()
    const c = holds.press('computer:KeyA', 60)!
    const e = holds.press('computer:KeyD', 64)!
    const g = holds.press('computer:KeyG', 67)!

    expect(holds.release('computer:KeyD')).toEqual({ midi: 64 })
    expect(holds.isCurrent(c)).toBe(true)
    expect(holds.isCurrent(e)).toBe(false)
    expect(holds.isCurrent(g)).toBe(true)
  })

  it('releases a pitch only after every input source holding it lets go', () => {
    const holds = createStabNoteHolds()
    const attack = holds.press('computer:KeyA', 60)!

    expect(holds.press('pointer:7', 60)).toBeNull()
    expect(holds.release('computer:KeyA')).toBeNull()
    expect(holds.isCurrent(attack)).toBe(true)
    expect(holds.release('pointer:7')).toEqual({ midi: 60 })
    expect(holds.isCurrent(attack)).toBe(false)
  })

  it('invalidates a pending attack when a quick tap releases before startup finishes', () => {
    const holds = createStabNoteHolds()
    const pending = holds.press('pointer:3', 72)!

    expect(holds.release('pointer:3')).toEqual({ midi: 72 })
    expect(holds.isCurrent(pending)).toBe(false)
  })
})

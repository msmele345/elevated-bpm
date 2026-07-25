import { describe, expect, it } from 'vitest'
import {
  STAB_KEYS,
  createStabNoteHolds,
  createStabSoundingNotes,
  stabKeyForCode,
  stabKeyForKeyboardInput,
} from './stab'

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
    expect(stabKeyForKeyboardInput({ code: 'KeyA', target: null })?.midi).toBe(60)
    expect(stabKeyForCode('KeyU')?.midi).toBe(70)
    expect(stabKeyForCode('Space')).toBeUndefined()
  })

  it('does not map notes while focus belongs to a text-entry control', () => {
    const editableTargets = [
      { tagName: 'INPUT' },
      { tagName: 'INPUT', type: 'text' },
      // A number field takes "e" as an exponent, so it is text entry too.
      { tagName: 'INPUT', type: 'number' },
      { tagName: 'INPUT', type: 'search' },
      { tagName: 'textarea' },
      // Letter keys type-ahead through a select's options.
      { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true },
    ]

    expect(
      editableTargets.map((target) =>
        stabKeyForKeyboardInput({
          code: 'KeyA',
          target,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
        }),
      ),
    ).toEqual(editableTargets.map(() => undefined))
  })

  it('keeps playing while focus rests on a deck control that ignores letter keys', () => {
    // Nudging the tempo fader or a checkbox focuses it. Those controls have no
    // use for A–K, so the instrument must stay live rather than going silent
    // until the player clicks elsewhere.
    const playableTargets = [
      { tagName: 'INPUT', type: 'range' },
      { tagName: 'INPUT', type: 'checkbox' },
      { tagName: 'INPUT', type: 'radio' },
      { tagName: 'BUTTON' },
      { tagName: 'DIV', isContentEditable: false },
    ]

    expect(
      playableTargets.map((target) =>
        stabKeyForKeyboardInput({
          code: 'KeyA',
          target,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
        })?.midi,
      ),
    ).toEqual(playableTargets.map(() => 60))
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

describe('stab sounding notes', () => {
  it('reports live notes for exactly as long as they are held', () => {
    const sounding = createStabSoundingNotes()

    sounding.attackLive(67)
    sounding.attackLive(60)
    expect(sounding.atTime(10)).toEqual([60, 67])

    sounding.releaseLive(60)
    expect(sounding.atTime(10.1)).toEqual([67])
  })

  it('reports a sequenced note only inside its scheduled audio window', () => {
    const sounding = createStabSoundingNotes()
    sounding.schedule(64, 20, 20.25)

    expect(sounding.atTime(19.99)).toEqual([])
    expect(sounding.atTime(20)).toEqual([64])
    expect(sounding.atTime(20.249)).toEqual([64])
    expect(sounding.atTime(20.25)).toEqual([])
  })

  it('keeps a live key lit when a sequenced hit on the same pitch ends', () => {
    const sounding = createStabSoundingNotes()
    sounding.attackLive(60)
    sounding.schedule(60, 4, 4.1)

    expect(sounding.atTime(4.05)).toEqual([60])
    expect(sounding.atTime(4.2)).toEqual([60])
  })

  it('clears sequenced highlights on transport stop without clearing live keys', () => {
    const sounding = createStabSoundingNotes()
    sounding.attackLive(72)
    sounding.schedule(64, 4, 8)

    sounding.clearSequenced()

    expect(sounding.atTime(5)).toEqual([72])
  })
})

import { describe, expect, it } from 'vitest'
import { NO_CHORD_PLAY, observeChordAttack, observeChordRelease } from './chordPlay'

describe('observeChordAttack / observeChordRelease', () => {
  it('starts from a session that has played nothing', () => {
    expect(NO_CHORD_PLAY.maxNotes).toBe(0)
  })

  it('records how many notes were held at once, not how many were played', () => {
    const chord = ['key:KeyA', 'key:KeyD', 'key:KeyG'].reduce(
      (play, source, i) => observeChordAttack(play, source, 60 + i * 4),
      NO_CHORD_PLAY,
    )
    expect(chord.maxNotes).toBe(3)
  })

  it('does not build a chord out of notes played one at a time', () => {
    const first = observeChordAttack(NO_CHORD_PLAY, 'key:KeyA', 60)
    const released = observeChordRelease(first, 'key:KeyA')
    const second = observeChordAttack(released, 'key:KeyD', 64)
    expect(second.maxNotes).toBe(1)
  })

  it('chords across input sources — a held mouse key plus a held computer key', () => {
    const mouse = observeChordAttack(NO_CHORD_PLAY, 'pointer:1', 65)
    const both = observeChordAttack(mouse, 'key:KeyK', 72)
    expect(both.maxNotes).toBe(2)
  })

  it('counts a pitch once however many inputs are holding it', () => {
    const mouse = observeChordAttack(NO_CHORD_PLAY, 'pointer:1', 60)
    const doubled = observeChordAttack(mouse, 'key:KeyA', 60)
    expect(doubled.maxNotes).toBe(1)
  })

  it('keeps the high-water mark once the keys are let go', () => {
    const sources = ['pointer:1', 'key:KeyD', 'key:KeyG']
    const chord = sources.reduce(
      (play, source, i) => observeChordAttack(play, source, 60 + i * 4),
      NO_CHORD_PLAY,
    )
    const cleared = sources.reduce(observeChordRelease, chord)
    expect(cleared.held).toEqual({})
    expect(cleared.maxNotes).toBe(3)
  })

  it('ignores a release for a source that is not holding anything', () => {
    const held = observeChordAttack(NO_CHORD_PLAY, 'key:KeyA', 60)
    expect(observeChordRelease(held, 'key:KeyZ')).toBe(held)
  })

  it('ignores an attack a source is already holding, so key repeat cannot inflate a chord', () => {
    const held = observeChordAttack(NO_CHORD_PLAY, 'key:KeyA', 60)
    expect(observeChordAttack(held, 'key:KeyA', 60)).toBe(held)
  })

  it('does not mutate the record it is given', () => {
    const held = observeChordAttack(NO_CHORD_PLAY, 'key:KeyA', 60)
    observeChordAttack(held, 'key:KeyD', 64)
    expect(Object.keys(held.held)).toEqual(['key:KeyA'])
    expect(NO_CHORD_PLAY.held).toEqual({})
  })
})

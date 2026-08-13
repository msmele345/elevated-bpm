import { describe, expect, it } from 'vitest'
import { regionEditorKeyAction } from './regionEditor'

/** A region handle: a slider that owns arrows and brackets, not letters. */
const HANDLE = { tagName: 'DIV' }
const TEXT_FIELD = { tagName: 'INPUT', type: 'text' }

describe('regionEditorKeyAction', () => {
  it('lets Escape out of the editor', () => {
    expect(regionEditorKeyAction({ key: 'Escape', code: 'Escape', target: HANDLE })).toBe(
      'close',
    )
  })

  it('stops a chop from firing a stab or a pad', () => {
    // The editor is a modal over a live instrument. Without this, trimming a
    // region would play notes and hits underneath it.
    expect(regionEditorKeyAction({ key: 'a', code: 'KeyA', target: HANDLE })).toBe('block')
    expect(regionEditorKeyAction({ key: '1', code: 'Digit1', target: HANDLE })).toBe('block')
  })

  it('never binds Space, because Space activates the focused button', () => {
    // The deck has roughly 160 buttons. A shortcut on Space would double-fire
    // on every one of them.
    expect(regionEditorKeyAction({ key: ' ', code: 'Space', target: HANDLE })).toBe('pass')
  })

  it('leaves Tab alone, so focus can move between the editor’s own controls', () => {
    expect(regionEditorKeyAction({ key: 'Tab', code: 'Tab', target: HANDLE })).toBe('pass')
  })

  it('gives typing back to a control that wants letters', () => {
    expect(regionEditorKeyAction({ key: 'a', code: 'KeyA', target: TEXT_FIELD })).toBe('pass')
  })

  it('leaves browser and system shortcuts alone', () => {
    expect(
      regionEditorKeyAction({ key: 'a', code: 'KeyA', target: HANDLE, metaKey: true }),
    ).toBe('pass')
  })
})

import { describe, expect, it } from 'vitest'
import { finaleKeyAction } from './finale'

describe('finaleKeyAction', () => {
  it('closes on Escape and blocks live stab keys from reaching the deck', () => {
    expect(finaleKeyAction({ key: 'Escape', code: 'Escape' })).toBe('close')
    expect(finaleKeyAction({ key: 'a', code: 'KeyA' })).toBe('block')
    expect(finaleKeyAction({ key: 'u', code: 'KeyU' })).toBe('block')
  })

  it('passes native button keys and browser shortcuts through', () => {
    expect(finaleKeyAction({ key: 'Enter', code: 'Enter' })).toBe('pass')
    expect(finaleKeyAction({ key: ' ', code: 'Space' })).toBe('pass')
    expect(finaleKeyAction({ key: 'w', code: 'KeyW', metaKey: true })).toBe('pass')
    expect(finaleKeyAction({ key: 'w', code: 'KeyW', ctrlKey: true })).toBe('pass')
  })
})

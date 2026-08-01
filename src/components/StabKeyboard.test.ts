// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoPattern } from '../model/pattern'
import { StabKeyboard } from './StabKeyboard'

const noop = () => undefined
const stabLane = createDemoPattern().noteLanes.find((lane) => lane.id === 'stab')!

function renderKeyboard() {
  const attacks: [string, number][] = []
  const releases: string[] = []
  render(
    createElement(StabKeyboard, {
      lane: stabLane,
      onAttack: (source: string, midi: number) => attacks.push([source, midi]),
      onRelease: (source: string) => releases.push(source),
      getSoundingNotes: () => [],
      onToggleStep: noop,
      onTranspose: noop,
      onResize: noop,
    }),
  )
  return { attacks, releases }
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('live stab keys', () => {
  it('still sounds a key whose pointer cannot be captured', () => {
    const { attacks, releases } = renderKeyboard()
    const key = screen.getByRole('button', { name: 'C4 — A key' })
    // Capture keeps a held key alive when the pointer slides off it — an
    // enhancement. A pointer that refuses to be captured must still play the
    // note: silence is the one outcome an instrument cannot have.
    key.setPointerCapture = () => {
      throw new DOMException('No active pointer with the given id is found.', 'NotFoundError')
    }

    fireEvent.pointerDown(key, { pointerId: 1, button: 0, pointerType: 'mouse' })

    expect(attacks).toEqual([['pointer:1', 60]])

    fireEvent.pointerUp(key, { pointerId: 1 })

    expect(releases).toEqual(['pointer:1'])
  })
})

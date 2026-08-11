// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { PAD_LANES, createSamplerSettings } from '../model/sampler'
import { SamplerPad } from './SamplerPad'

afterEach(cleanup)

describe('live sampler pad', () => {
  it('still sounds when pointer capture is unavailable', () => {
    const attacks: Array<[string, string]> = []
    const releases: string[] = []
    render(
      createElement(SamplerPad, {
        pad: PAD_LANES[0],
        settings: createSamplerSettings().pad1,
        onAttack: (source, padId) => attacks.push([source, padId]),
        onRelease: (source) => releases.push(source),
      }),
    )
    const button = screen.getByRole('button', { name: 'Play Pad 1 — empty' })
    button.setPointerCapture = () => {
      throw new DOMException('No active pointer with the given id is found.', 'NotFoundError')
    }

    fireEvent.pointerDown(button, { pointerId: 7, button: 0, pointerType: 'mouse' })

    expect(attacks).toEqual([['pointer:7', 'pad1']])

    fireEvent.pointerUp(button, { pointerId: 7 })
    expect(releases).toEqual(['pointer:7'])
  })

  it('releases a Space held across a focus change, so the pad is never left dead', () => {
    const attacks: Array<[string, string]> = []
    const releases: string[] = []
    render(
      createElement(SamplerPad, {
        pad: PAD_LANES[0],
        settings: createSamplerSettings().pad1,
        onAttack: (source, padId) => attacks.push([source, padId]),
        onRelease: (source) => releases.push(source),
      }),
    )
    const button = screen.getByRole('button', { name: 'Play Pad 1 — empty' })

    fireEvent.keyDown(button, { code: 'Space' })
    expect(attacks).toEqual([['button:pad1:Space', 'pad1']])

    // Tab away mid-hold: the keyup lands on whatever took focus, never on the pad.
    fireEvent.keyUp(document.body, { code: 'Space' })
    expect(releases).toEqual(['button:pad1:Space'])

    // A surviving hold would make this pad's Space and Enter dead until unmount.
    fireEvent.keyDown(button, { code: 'Space' })
    expect(attacks).toHaveLength(2)
  })

  it('drops every hold when the window loses focus', () => {
    const releases: string[] = []
    render(
      createElement(SamplerPad, {
        pad: PAD_LANES[1],
        settings: createSamplerSettings().pad2,
        onAttack: () => {},
        onRelease: (source) => releases.push(source),
      }),
    )
    const button = screen.getByRole('button', { name: 'Play Pad 2 — empty' })

    fireEvent.keyDown(button, { code: 'Enter' })
    fireEvent.blur(window)

    expect(releases).toEqual(['button:pad2:Enter'])
  })
})

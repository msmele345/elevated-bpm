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
})

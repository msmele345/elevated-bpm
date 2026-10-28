// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BASS_SETTINGS } from '../model/bass'
import { createInitialPattern } from '../model/pattern'
import { BassPanel } from './BassPanel'

afterEach(cleanup)

function renderBassPanel(spotlight: { accentRow?: boolean; params?: string[] }) {
  const lane = createInitialPattern().noteLanes.find((candidate) => candidate.id === 'bass')!
  render(
    createElement(BassPanel, {
      lane,
      settings: DEFAULT_BASS_SETTINGS,
      spotlitAccentRow: spotlight.accentRow,
      spotlitParams: spotlight.params ?? [],
      onToggleStep: vi.fn(),
      onTranspose: vi.fn(),
      onResize: vi.fn(),
      onToggleAccent: vi.fn(),
      onParamChange: vi.fn(),
      muted: false,
      soloed: false,
      silenced: false,
      level: 1,
      onToggleMute: vi.fn(),
      onToggleSolo: vi.fn(),
      onLevelChange: vi.fn(),
    }),
  )
}

const SPOTLIT = '.is-spotlit, [data-spotlit]'

describe('BassPanel spotlights', () => {
  it('rings the Accent row when a lesson points at accentRow:bass', () => {
    renderBassPanel({ accentRow: true })

    const row = screen.getByRole('group', { name: 'Bass accent steps' })
    expect(row.closest(SPOTLIT)).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Bass steps' }).closest(SPOTLIT)).toBeNull()
  })

  it('rings the Env Mod knob when a lesson points at knob:envMod', () => {
    renderBassPanel({ params: ['envMod'] })

    expect(screen.getByRole('slider', { name: 'Env Mod' }).closest(SPOTLIT)).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Bass accent steps' }).closest(SPOTLIT)).toBeNull()
  })
})

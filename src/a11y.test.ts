// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { computeAccessibleName } from 'dom-accessibility-api'
import { indexedDB } from 'fake-indexeddb'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { DECK_SECTIONS } from './model/deckSections'

vi.mock('./audio/engine', async () => {
  const transport = await import('./model/transport')
  return {
    DEFAULT_BPM: transport.DEFAULT_BPM,
    MIN_BPM: transport.MIN_BPM,
    MAX_BPM: transport.MAX_BPM,
    TICKS_PER_16TH: 48,
    setPattern: () => undefined,
    setMixer: () => undefined,
    setBassSettings: () => undefined,
    setMasterSettings: () => undefined,
    setFxSettings: () => undefined,
    setSamplerSettings: () => undefined,
    setBpm: () => undefined,
    unlockAudio: () => Promise.resolve(),
    play: () => Promise.resolve(),
    stop: () => undefined,
    attackStabNote: () => undefined,
    releaseStabNote: () => undefined,
    attackPad: () => undefined,
    releasePad: () => undefined,
    registerSampleSource: () => undefined,
    getSoundingStabNotes: () => [],
    getSoundingPadIds: () => [],
    getSpectrum: () => null,
    getCurrentStep: () => -1,
    getTransportTicks: () => -1,
  }
})

/**
 * Everything the browser will put a Tab stop on. `[tabindex="-1"]` is
 * deliberately excluded: those are programmatic focus targets (the section
 * anchors a skip link jumps to), not places Tab should stop.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** A block big enough that a keyboard user needs a way past it. */
const BYPASS_THRESHOLD = 8

function focusable(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
}

function identify(el: Element): string {
  return `${el.tagName.toLowerCase()}.${el.className || '(no class)'}`
}

async function renderDeck(): Promise<HTMLElement> {
  render(createElement(App))
  // The deck mounts against a placeholder document and swaps in the stored one;
  // wait for hydration so the assertions see the real, populated deck.
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Share beat' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  )
  return screen.getByRole('main')
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('deck accessibility', () => {
  it('gives every focusable control an accessible name', async () => {
    const deck = await renderDeck()

    const unnamed = focusable(deck).filter(
      (element) => computeAccessibleName(element).trim() === '',
    )

    expect(unnamed.map(identify)).toEqual([])
  })

  it('opens on skip links, so no section is reached only by tabbing through the one before it', async () => {
    const deck = await renderDeck()

    const links = focusable(deck).slice(0, DECK_SECTIONS.length)
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      DECK_SECTIONS.map((section) => `#${section.id}`),
    )
    for (const section of DECK_SECTIONS) {
      const target = document.getElementById(section.id)
      expect(target, `no element for skip target #${section.id}`).not.toBeNull()
      // Landing focus on the section itself is what lets the next Tab continue
      // from there rather than from the top of the deck.
      expect(target!.getAttribute('tabindex')).toBe('-1')
    }
  })

  it('bypasses every block of controls big enough to be a barrier', async () => {
    const deck = await renderDeck()

    const bypassed = new Set(DECK_SECTIONS.map((section) => section.id))
    const barriers = Array.from(deck.querySelectorAll<HTMLElement>('section, aside, nav'))
      .filter((block) => focusable(block).length > BYPASS_THRESHOLD)
      .filter((block) => !bypassed.has(block.id))

    expect(barriers.map(identify)).toEqual([])
  })

  it('moves focus into the section a skip link names', async () => {
    const deck = await renderDeck()

    for (const section of DECK_SECTIONS) {
      const link = deck.querySelector<HTMLAnchorElement>(`a[href="#${section.id}"]`)!
      link.click()
      expect(document.activeElement).toBe(document.getElementById(section.id))
    }
  })

  it('names each panel with a heading, so the deck has a real document outline', async () => {
    await renderDeck()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    for (const section of DECK_SECTIONS) {
      const target = document.getElementById(section.id)!
      const labelledBy = target.getAttribute('aria-labelledby')
      expect(labelledBy, `${section.id} is not labelled by anything`).not.toBeNull()
      const label = document.getElementById(labelledBy!)
      expect(label, `${section.id} points at a missing label`).not.toBeNull()
      expect(computeAccessibleName(target).trim()).not.toBe('')
    }
    // Panel titles are headings, not decorative spans — the outline is what a
    // screen reader user navigates the deck by.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(
      expect.arrayContaining(['Master', 'Drum Machine', 'Sampler', 'Bass Line', 'Chord Stab']),
    )
  })

  it('exposes the live stab keyboard as a named group', async () => {
    await renderDeck()

    expect(screen.getByRole('group', { name: 'Live stab keyboard' })).toBeTruthy()
  })

  it('exposes the four live sampler pads as a named group', async () => {
    await renderDeck()

    expect(screen.getByRole('group', { name: 'Live sampler pads' })).toBeTruthy()
  })
})

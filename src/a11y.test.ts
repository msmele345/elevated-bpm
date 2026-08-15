// @vitest-environment jsdom

import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { computeAccessibleName } from 'dom-accessibility-api'
import { indexedDB } from 'fake-indexeddb'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { DECK_SECTIONS } from './model/deckSections'

/**
 * What an open editor reads: four hits in three seconds, so a region edge has
 * real structure to announce its position within.
 */
function analysisFake(sampleRate = 1000, duration = 3) {
  const samples = new Float32Array(Math.round(sampleRate * duration))
  for (const at of [0.5, 1, 1.5, 2]) {
    const start = Math.round(at * sampleRate)
    for (let i = 0; i < sampleRate * 0.1 && start + i < samples.length; i += 1) {
      samples[start + i] =
        0.9 * Math.exp(-24 * (i / sampleRate)) * Math.sin((2 * Math.PI * 180 * i) / sampleRate)
    }
  }
  return { sampleRate, duration, samples }
}

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
    registerSourceBytes: () => undefined,
    setStoredSourceLoader: () => undefined,
    registerSlice: () => undefined,
    clearSlice: () => undefined,
    renderPadSlice: () => ({ sampleRate: 100, channels: 1, frames: 20, pcm: new Int16Array(20) }),
    commitPadRegion: () =>
      Promise.resolve({ sampleRate: 100, channels: 1, frames: 20, pcm: new Int16Array(20) }),
    openSourceAnalysis: () => Promise.resolve(analysisFake()),
    closeSourceAnalysis: () => undefined,
    auditionRegion: () => undefined,
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

describe('region editor accessibility', () => {
  async function openEditor(): Promise<HTMLElement> {
    await renderDeck()
    fireEvent.click(screen.getByRole('button', { name: 'Chop Basement Break' }))
    return screen.findByRole('dialog')
  }

  it('carries the editor’s whole meaning on two sliders, not on the waveform', async () => {
    // The waveform is decorative — it describes audio the user can already
    // hear. These two controls are the editor as far as assistive technology
    // is concerned, exactly as the knob's SVG is decorative and its slider is
    // not.
    const dialog = await openEditor()

    for (const edge of ['start', 'end']) {
      const thumb = within(dialog).getByRole('slider', { name: `Region ${edge}` })
      expect(thumb.getAttribute('aria-valuemin')).not.toBeNull()
      expect(thumb.getAttribute('aria-valuemax')).not.toBeNull()
      expect(thumb.getAttribute('aria-valuenow')).not.toBeNull()
      expect(thumb.tabIndex).toBe(0)
    }
    expect(dialog.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('announces an edge by its timecode and its place among the onsets', async () => {
    // The announcement *is* the feature: it is what makes the audio navigable
    // by structure rather than by looking at it. Assert the content, not just
    // that something is there.
    const dialog = await openEditor()
    const start = within(dialog).getByRole('slider', { name: 'Region start' })

    expect(start.getAttribute('aria-valuetext')).toBe('0.000 s, before onset 1 of 4')

    fireEvent.keyDown(start, { key: ']' })
    expect(start.getAttribute('aria-valuetext')).toBe('0.500 s, onset 1 of 4')

    fireEvent.keyDown(start, { key: 'ArrowRight' })
    expect(start.getAttribute('aria-valuetext')).toBe('0.510 s, between onsets 1 and 2 of 4')
  })

  it('parks an edge at the source’s bound on Home and End', async () => {
    const dialog = await openEditor()
    const end = within(dialog).getByRole('slider', { name: 'Region end' })

    fireEvent.keyDown(end, { key: 'End' })

    expect(end.getAttribute('aria-valuetext')).toBe('3.000 s, after onset 4 of 4')
  })

  it('is reachable in a couple of keystrokes, not ninety', async () => {
    // The sampler panel alone is roughly eighty controls. Inline, the handles
    // would sit behind all of them — the exact barrier Phase 9 measured. In a
    // dialog they are the second and third stops.
    const dialog = await openEditor()

    const stops = focusable(dialog)
    expect(document.activeElement).toBe(stops[0])
    expect(stops.slice(1, 3).map((stop) => computeAccessibleName(stop))).toEqual([
      'Region start',
      'Region end',
    ])
  })

  it('gives every editor control an accessible name', async () => {
    const dialog = await openEditor()

    const unnamed = focusable(dialog).filter(
      (element) => computeAccessibleName(element).trim() === '',
    )

    expect(unnamed.map(identify)).toEqual([])
  })
})

describe('region editor focus containment', () => {
  async function openEditor(): Promise<HTMLElement> {
    await renderDeck()
    fireEvent.click(screen.getByRole('button', { name: 'Chop Basement Break' }))
    const dialog = await screen.findByRole('dialog')
    // The dialog's passive effect installs the focus trap and moves focus to
    // its first stop. Waiting for that public contract removes the race where
    // CI can observe the markup before the effect is ready.
    await waitFor(() => expect(document.activeElement).toBe(focusable(dialog)[0]))
    return dialog
  }

  it('keeps Tab inside the dialog, wrapping at both ends', async () => {
    // Containing Tab is only fair because Escape always releases the dialog —
    // and the deck behind is inert, so a Tab that escaped would land focus on
    // a control the user cannot reach or see.
    const dialog = await openEditor()
    const stops = focusable(dialog)
    const first = stops[0]
    const last = stops[stops.length - 1]

    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(computeAccessibleName(document.activeElement!)).toBe('Close editor')

    first.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(computeAccessibleName(document.activeElement!)).toBe('Commit to pad')
  })

  it('lets Tab move normally between the controls in between', async () => {
    const dialog = await openEditor()
    const stops = focusable(dialog)

    stops[1].focus()
    const event = createEvent.keyDown(window, { key: 'Tab' })
    fireEvent(window, event)

    // Not ours to handle: the browser's own Tab order takes it from here.
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(stops[1])
  })
})

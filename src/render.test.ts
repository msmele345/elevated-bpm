// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { indexedDB } from 'fake-indexeddb'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The performance rule from the plan says React re-renders on user edits only,
 * never on the audio clock — but a knob drag *is* a user edit, and it arrives
 * at pointer rate. A single deck holds ~150 controls; rebuilding all of them
 * between two frames while the transport runs is exactly the dropped frame
 * this AC forbids. These tests hold the two halves of the defence: the panels
 * bail out on unchanged props, and the deck actually hands them unchanged
 * props when something unrelated to them moves.
 */

const recorded = vi.hoisted(() => ({
  stepRow: [] as Record<string, unknown>[],
  noteRow: [] as Record<string, unknown>[],
  panel: [] as { name: string; props: Record<string, unknown> }[],
}))

vi.mock('./components/StepRow', async () => {
  const actual = await vi.importActual<typeof import('./components/StepRow')>(
    './components/StepRow',
  )
  return {
    StepRow: (props: Record<string, unknown>) => {
      recorded.stepRow.push(props)
      return createElement(actual.StepRow as never, props as never)
    },
  }
})

vi.mock('./components/NoteRow', async () => {
  const actual = await vi.importActual<typeof import('./components/NoteRow')>(
    './components/NoteRow',
  )
  return {
    NoteRow: (props: Record<string, unknown>) => {
      recorded.noteRow.push(props)
      return createElement(actual.NoteRow as never, props as never)
    },
  }
})

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
    setBpm: () => undefined,
    unlockAudio: () => Promise.resolve(),
    play: () => Promise.resolve(),
    stop: () => undefined,
    attackStabNote: () => undefined,
    releaseStabNote: () => undefined,
    getSoundingStabNotes: () => [],
    getSpectrum: () => null,
    getCurrentStep: () => -1,
    getTransportTicks: () => -1,
  }
})

/**
 * The panels themselves, not just their lanes: a knob move that rebuilt the
 * bass panel would rebuild its three knobs with it.
 */
vi.mock('./components/BassPanel', async () => {
  const actual = await vi.importActual<typeof import('./components/BassPanel')>(
    './components/BassPanel',
  )
  return {
    BassPanel: (props: Record<string, unknown>) => {
      recorded.panel.push({ name: 'BassPanel', props })
      return createElement(actual.BassPanel as never, props as never)
    },
  }
})

vi.mock('./components/StabKeyboard', async () => {
  const actual = await vi.importActual<typeof import('./components/StabKeyboard')>(
    './components/StabKeyboard',
  )
  return {
    StabKeyboard: (props: Record<string, unknown>) => {
      recorded.panel.push({ name: 'StabKeyboard', props })
      return createElement(actual.StabKeyboard as never, props as never)
    },
  }
})

/** Import after the mocks are in place, so App picks up the recorders. */
const { default: App } = await import('./App')

type Records = Record<string, unknown>[]

function laneId(props: Record<string, unknown>): string {
  return (props.lane as { id: string }).id
}

/**
 * What each lane was handed across an interaction: its last render before, and
 * every render it did after. A lane that did not render at all afterwards is
 * the best possible outcome, and reports no changed props.
 */
function changedPropsPerLane(records: Records, mark: number): Map<string, string[]> {
  const before = new Map<string, Record<string, unknown>>()
  for (const props of records.slice(0, mark)) before.set(laneId(props), props)

  const changed = new Map<string, string[]>()
  for (const id of before.keys()) changed.set(id, [])
  for (const props of records.slice(mark)) {
    const id = laneId(props)
    const previous = before.get(id)
    expect(previous, `lane ${id} rendered without ever rendering before`).toBeDefined()
    const keys = Object.keys(props).filter((key) => !Object.is(props[key], previous![key]))
    changed.set(id, [...new Set([...(changed.get(id) ?? []), ...keys])])
  }
  return changed
}

/** The same comparison as above, for whole panels rather than single lanes. */
function changedPropsPerPanel(mark: number): Map<string, string[]> {
  const before = new Map<string, Record<string, unknown>>()
  for (const { name, props } of recorded.panel.slice(0, mark)) before.set(name, props)

  const changed = new Map<string, string[]>()
  for (const name of before.keys()) changed.set(name, [])
  for (const { name, props } of recorded.panel.slice(mark)) {
    const previous = before.get(name)
    expect(previous, `panel ${name} rendered without ever rendering before`).toBeDefined()
    const keys = Object.keys(props).filter((key) => !Object.is(props[key], previous![key]))
    changed.set(name, [...new Set([...(changed.get(name) ?? []), ...keys])])
  }
  return changed
}

beforeEach(() => {
  recorded.stepRow.length = 0
  recorded.noteRow.length = 0
  recorded.panel.length = 0
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('deck render cost', () => {
  it('leaves every drum and note lane on identical props when a master knob moves mid-playback', async () => {
    render(createElement(App))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Share beat' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    fireEvent.click(screen.getByRole('button', { name: /^Play$/ }))
    await screen.findByRole('button', { name: /^Stop$/ })

    const drumMark = recorded.stepRow.length
    const noteMark = recorded.noteRow.length
    const masterFilter = screen.getByRole('slider', { name: 'Filter' })
    fireEvent.keyDown(masterFilter, { key: 'ArrowDown' })
    fireEvent.keyDown(masterFilter, { key: 'ArrowDown' })

    for (const [id, changed] of changedPropsPerLane(recorded.stepRow, drumMark)) {
      expect(changed, `drum lane ${id}`).toEqual([])
    }
    for (const [id, changed] of changedPropsPerLane(recorded.noteRow, noteMark)) {
      expect(changed, `note lane ${id}`).toEqual([])
    }
    // Five drum lanes and two note lanes were on the deck before the knob moved.
    expect(changedPropsPerLane(recorded.stepRow, drumMark).size).toBe(5)
    expect(changedPropsPerLane(recorded.noteRow, noteMark).size).toBe(2)
  })

  it('leaves every drum and note lane on identical props when an FX knob moves mid-playback', async () => {
    // The FX knobs are new props flowing through App onto the Master strip.
    // A send dragged over a running loop must not rebuild the instrument it is
    // sending — that is the dropped frame the deck is not allowed to have.
    render(createElement(App))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Share beat' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    fireEvent.click(screen.getByRole('button', { name: /^Play$/ }))
    await screen.findByRole('button', { name: /^Stop$/ })

    const drumMark = recorded.stepRow.length
    const noteMark = recorded.noteRow.length
    const panelMark = recorded.panel.length
    const drumSend = screen.getByRole('slider', { name: 'Drum Send' })
    fireEvent.keyDown(drumSend, { key: 'ArrowUp' })
    fireEvent.keyDown(drumSend, { key: 'ArrowUp' })

    for (const [id, changed] of changedPropsPerLane(recorded.stepRow, drumMark)) {
      expect(changed, `drum lane ${id}`).toEqual([])
    }
    for (const [id, changed] of changedPropsPerLane(recorded.noteRow, noteMark)) {
      expect(changed, `note lane ${id}`).toEqual([])
    }
    for (const [name, changed] of changedPropsPerPanel(panelMark)) {
      expect(changed, `panel ${name}`).toEqual([])
    }
    expect(changedPropsPerLane(recorded.stepRow, drumMark).size).toBe(5)
    expect(changedPropsPerLane(recorded.noteRow, noteMark).size).toBe(2)
    // The bass panel and the stab keyboard were both on the deck beforehand.
    expect(changedPropsPerPanel(panelMark).size).toBe(2)
  })

  it('leaves the other lanes on identical props when one lane is edited', async () => {
    render(createElement(App))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Share beat' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )

    const mark = recorded.stepRow.length
    fireEvent.click(screen.getByRole('button', { name: 'Kick step 1' }))

    const changed = changedPropsPerLane(recorded.stepRow, mark)
    // The edited lane is the one thing that legitimately changed.
    expect(changed.get('kick')).toEqual(['lane'])
    for (const [id, keys] of changed) {
      if (id !== 'kick') expect(keys, `drum lane ${id}`).toEqual([])
    }
  })
})

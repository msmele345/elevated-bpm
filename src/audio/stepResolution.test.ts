import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PITCH,
  MIN_NOTE_LENGTH,
  STAB_DEFAULT_PITCH,
  midiToFrequency,
  resizeNoteStep,
  toggleNoteStep,
  transposeNoteStep,
} from '../model/note'
import { createInitialPattern, cycleStep } from '../model/pattern'
import type { Mixer } from '../model/mixer'
import type { Pattern } from '../model/types'
import { ACCENT_GAIN, UNACCENTED_GAIN, resolveStep } from './stepResolution'

/** Turn steps on (one click) or on+accented (two clicks). */
function program(
  pattern: Pattern,
  edits: Array<[laneId: Parameters<typeof cycleStep>[1], step: number, accented?: boolean]>,
): Pattern {
  return edits.reduce((p, [laneId, step, accented]) => {
    const on = cycleStep(p, laneId, step)
    return accented ? cycleStep(on, laneId, step) : on
  }, pattern)
}

/** Resolve one 16th the way the transport callback does. */
function resolveAt(pattern: Pattern, stepIndex: number, mixer: Mixer = {}) {
  return resolveStep({ pattern, mixer, stepIndex })
}

/** Just the drum/pad starts of one resolved 16th. */
function startsAt(pattern: Pattern, stepIndex: number, mixer: Mixer = {}) {
  return resolveAt(pattern, stepIndex, mixer).starts
}

describe('resolveStep — drum and pad starts', () => {
  it('fires every lane that has that step on, and only those lanes', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0],
      ['closedHat', 0],
      ['snare', 4],
    ])

    expect(startsAt(pattern, 0).map((hit) => hit.laneId)).toEqual(['kick', 'closedHat'])
    expect(startsAt(pattern, 4).map((hit) => hit.laneId)).toEqual(['snare'])
    expect(startsAt(pattern, 1)).toEqual([])
  })

  it('gives accented steps more gain than unaccented ones', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0, true],
      ['kick', 8],
    ])

    expect(startsAt(pattern, 0)[0].gain).toBe(ACCENT_GAIN)
    expect(startsAt(pattern, 8)[0].gain).toBe(UNACCENTED_GAIN)
    expect(ACCENT_GAIN).toBeGreaterThan(UNACCENTED_GAIN)
  })

  it('accents one lane without affecting another lane on the same step', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0, true],
      ['closedHat', 0],
    ])

    const hits = startsAt(pattern, 0)
    expect(hits).toEqual([
      { laneId: 'kick', gain: ACCENT_GAIN },
      { laneId: 'closedHat', gain: UNACCENTED_GAIN },
    ])
  })

  it('does not fire a muted lane', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0],
      ['closedHat', 0],
    ])

    const hits = startsAt(pattern, 0, { closedHat: { muted: true, soloed: false } })
    expect(hits.map((h) => h.laneId)).toEqual(['kick'])
  })

  it('with a lane soloed, only the soloed lane fires', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0],
      ['closedHat', 0],
    ])

    const hits = startsAt(pattern, 0, { closedHat: { muted: false, soloed: true } })
    expect(hits.map((h) => h.laneId)).toEqual(['closedHat'])
  })

  it('voices pad lanes on the same step and with the same accent gain as the kit', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 3],
      ['pad1', 3, true],
      ['pad4', 3],
    ])

    expect(startsAt(pattern, 3)).toEqual([
      { laneId: 'kick', gain: UNACCENTED_GAIN },
      { laneId: 'pad1', gain: ACCENT_GAIN },
      { laneId: 'pad4', gain: UNACCENTED_GAIN },
    ])
  })

  it('applies one solo rule across kit and pad lanes', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0],
      ['pad2', 0],
    ])

    expect(
      startsAt(pattern, 0, { kick: { muted: false, soloed: true } }).map(
        (hit) => hit.laneId,
      ),
    ).toEqual(['kick'])
    expect(
      startsAt(pattern, 0, { pad2: { muted: false, soloed: true } }).map(
        (hit) => hit.laneId,
      ),
    ).toEqual(['pad2'])
  })
})

describe('resolveStep — open-hat choke (909 behavior)', () => {
  it('cuts a ringing open hat when the closed hat fires on a later step', () => {
    // open hat on step 0, closed hat on step 2 — at step 2 the still-ringing
    // open hat must be choked even though it is not firing then.
    const pattern = program(createInitialPattern(), [
      ['openHat', 0],
      ['closedHat', 2],
    ])

    expect(resolveAt(pattern, 2).chokes).toContain('openHat')
    expect(resolveAt(pattern, 2).starts.map((h) => h.laneId)).toEqual(['closedHat'])
  })

  it('when closed and open hat share a step, the closed hat wins and the open hat does not sound', () => {
    const pattern = program(createInitialPattern(), [
      ['closedHat', 4],
      ['openHat', 4],
    ])

    const { starts, chokes } = resolveAt(pattern, 4)
    expect(starts.map((h) => h.laneId)).toEqual(['closedHat'])
    expect(chokes).toContain('openHat')
  })

  it('lets the open hat ring when no closed hat fires', () => {
    const pattern = program(createInitialPattern(), [['openHat', 0]])

    const { starts, chokes } = resolveAt(pattern, 0)
    expect(starts.map((h) => h.laneId)).toEqual(['openHat'])
    expect(chokes).toEqual([])
  })

  it('does not choke the open hat when the closed hat is muted', () => {
    const pattern = program(createInitialPattern(), [
      ['closedHat', 4],
      ['openHat', 4],
    ])

    const { starts, chokes } = resolveAt(pattern, 4, {
      closedHat: { muted: true, soloed: false },
    })
    expect(starts.map((h) => h.laneId)).toEqual(['openHat'])
    expect(chokes).toEqual([])
  })
})

describe('resolveStep — note events', () => {
  it('returns bass and stab events from the same sequencer step', () => {
    const bassAndStab = toggleNoteStep(
      toggleNoteStep(createInitialPattern(), 'bass', 8),
      'stab',
      8,
    )

    expect(resolveStep({ pattern: bassAndStab, mixer: {}, stepIndex: 8 }).notes).toEqual([
      {
        laneId: 'bass',
        midi: DEFAULT_PITCH,
        frequency: midiToFrequency(DEFAULT_PITCH),
        lengthSteps: MIN_NOTE_LENGTH,
      },
      {
        laneId: 'stab',
        midi: STAB_DEFAULT_PITCH,
        frequency: midiToFrequency(STAB_DEFAULT_PITCH),
        lengthSteps: MIN_NOTE_LENGTH,
      },
    ])
  })
})

describe('resolveStep — one 16th, every sound', () => {
  it('returns drum starts with gains, a choke and bass + stab notes in one result', () => {
    // Step 5 (index 4): an accented kick, a closed hat cutting the open hat on
    // the same step, a perc, a two-step bass note and a stab.
    let pattern = program(createInitialPattern(), [
      ['kick', 4, true],
      ['closedHat', 4],
      ['openHat', 4],
      ['perc', 4],
    ])
    pattern = resizeNoteStep(toggleNoteStep(pattern, 'bass', 4), 'bass', 4, 1)
    pattern = transposeNoteStep(toggleNoteStep(pattern, 'stab', 4), 'stab', 4, 4)

    expect(resolveStep({ pattern, mixer: {}, stepIndex: 4 })).toEqual({
      starts: [
        { laneId: 'kick', gain: ACCENT_GAIN },
        { laneId: 'closedHat', gain: UNACCENTED_GAIN },
        { laneId: 'perc', gain: UNACCENTED_GAIN },
      ],
      chokes: ['openHat'],
      notes: [
        {
          laneId: 'bass',
          midi: DEFAULT_PITCH,
          frequency: midiToFrequency(DEFAULT_PITCH),
          lengthSteps: 2,
        },
        {
          laneId: 'stab',
          midi: STAB_DEFAULT_PITCH + 4,
          frequency: midiToFrequency(STAB_DEFAULT_PITCH + 4),
          lengthSteps: MIN_NOTE_LENGTH,
        },
      ],
    })
  })

  it('resolves a silent step to an empty result', () => {
    expect(resolveStep({ pattern: createInitialPattern(), mixer: {}, stepIndex: 7 })).toEqual({
      starts: [],
      chokes: [],
      notes: [],
    })
  })

  it('leaves note events out of the mixer for now: a drum solo does not silence bass or stab', () => {
    // Bass/stab mute and solo arrive with EB3-02; until then note lanes
    // ignore the mixer, exactly as the engine did before step resolution.
    let pattern = program(createInitialPattern(), [['kick', 0]])
    pattern = toggleNoteStep(toggleNoteStep(pattern, 'bass', 0), 'stab', 0)

    const result = resolveStep({
      pattern,
      mixer: { kick: { muted: false, soloed: true } },
      stepIndex: 0,
    })
    expect(result.starts.map((hit) => hit.laneId)).toEqual(['kick'])
    expect(result.notes.map((note) => note.laneId)).toEqual(['bass', 'stab'])
  })
})

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
import { secondsPerStep, type TransportSettings } from '../model/transport'
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

/** A straight transport at the deck's default tempo. */
const STRAIGHT: TransportSettings = { bpm: 130, swing: 0.5 }

/** Resolve one 16th the way the transport callback does. */
function resolveAt(
  pattern: Pattern,
  stepIndex: number,
  mixer: Mixer = {},
  transport: TransportSettings = STRAIGHT,
) {
  return resolveStep({ pattern, mixer, transport, stepIndex })
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

    const hits = startsAt(pattern, 0, { closedHat: { muted: true, soloed: false, level: 1 } })
    expect(hits.map((h) => h.laneId)).toEqual(['kick'])
  })

  it('with a lane soloed, only the soloed lane fires', () => {
    const pattern = program(createInitialPattern(), [
      ['kick', 0],
      ['closedHat', 0],
    ])

    const hits = startsAt(pattern, 0, { closedHat: { muted: false, soloed: true, level: 1 } })
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
      startsAt(pattern, 0, { kick: { muted: false, soloed: true, level: 1 } }).map(
        (hit) => hit.laneId,
      ),
    ).toEqual(['kick'])
    expect(
      startsAt(pattern, 0, { pad2: { muted: false, soloed: true, level: 1 } }).map(
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
      closedHat: { muted: true, soloed: false, level: 1 },
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

    expect(resolveStep({ pattern: bassAndStab, mixer: {}, transport: STRAIGHT, stepIndex: 8 }).notes).toEqual([
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

    expect(resolveStep({ pattern, mixer: {}, transport: STRAIGHT, stepIndex: 4 })).toEqual({
      starts: [
        { laneId: 'kick', gain: ACCENT_GAIN },
        { laneId: 'closedHat', gain: UNACCENTED_GAIN },
        { laneId: 'perc', gain: UNACCENTED_GAIN },
      ],
      chokes: ['openHat'],
      swingOffset: 0,
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
    expect(resolveStep({ pattern: createInitialPattern(), mixer: {}, transport: STRAIGHT, stepIndex: 7 })).toEqual({
      starts: [],
      chokes: [],
      swingOffset: 0,
      notes: [],
    })
  })
})

describe('resolveStep — one mixer rule across all eleven voices', () => {
  /** Kick, a pad, bass and stab all on step 1. */
  function everyKind(): Pattern {
    let pattern = program(createInitialPattern(), [['kick', 0], ['pad2', 0]])
    return toggleNoteStep(toggleNoteStep(pattern, 'bass', 0), 'stab', 0)
  }
  const strip = (fields: Partial<{ muted: boolean; soloed: boolean; level: number }>) => ({
    muted: false,
    soloed: false,
    level: 1,
    ...fields,
  })
  const sounding = (mixer: Mixer) => {
    const result = resolveAt(everyKind(), 0, mixer)
    return [...result.starts.map((hit) => hit.laneId), ...result.notes.map((n) => n.laneId)]
  }

  it('silences a muted bass or stab, leaving everything else', () => {
    expect(sounding({ bass: strip({ muted: true }) })).toEqual(['kick', 'pad2', 'stab'])
    expect(sounding({ stab: strip({ muted: true }) })).toEqual(['kick', 'pad2', 'bass'])
  })

  it('a drum solo silences the bass and stab', () => {
    expect(sounding({ kick: strip({ soloed: true }) })).toEqual(['kick'])
  })

  it('a bass solo silences every drum and pad hit and the stab', () => {
    expect(sounding({ bass: strip({ soloed: true }) })).toEqual(['bass'])
  })

  it('allows several solos across kinds, and solo overrides mute on a note voice', () => {
    expect(
      sounding({ pad2: strip({ soloed: true }), stab: strip({ muted: true, soloed: true }) }),
    ).toEqual(['pad2', 'stab'])
  })

  it('keeps accented hits louder than unaccented ones at any Level: Level is not a hit gain', () => {
    const pattern = program(createInitialPattern(), [['kick', 0, true], ['closedHat', 0]])
    for (const level of [0, 0.1, 0.5, 1, 2]) {
      const { starts } = resolveAt(pattern, 0, {
        kick: strip({ level }),
        closedHat: strip({ level }),
      })
      expect(starts).toEqual([
        { laneId: 'kick', gain: ACCENT_GAIN },
        { laneId: 'closedHat', gain: UNACCENTED_GAIN },
      ])
    }
  })

  it('does not treat a voice at −∞ as muted: Level is a gain, mute and solo decide events', () => {
    expect(sounding({ bass: strip({ level: 0 }) })).toEqual(['kick', 'pad2', 'bass', 'stab'])
  })
})

describe('resolveStep — swing', () => {
  const step = secondsPerStep(130)

  it('leaves every 16th on the grid when straight', () => {
    for (let stepIndex = 0; stepIndex < 16; stepIndex += 1) {
      expect(resolveAt(createInitialPattern(), stepIndex).swingOffset).toBe(0)
    }
  })

  it('delays only the odd 16ths, by (swing − 0.5) × 2 × one step, at 66% and 75%', () => {
    for (const swing of [0.66, 0.75]) {
      for (let stepIndex = 0; stepIndex < 16; stepIndex += 1) {
        const { swingOffset } = resolveAt(createInitialPattern(), stepIndex, {}, { bpm: 130, swing })
        if (stepIndex % 2 === 0) expect(swingOffset).toBe(0)
        else expect(swingOffset).toBeCloseTo((swing - 0.5) * 2 * step, 12)
      }
    }
    // 66% is (almost) the triplet position, 75% the dotted one.
    expect(resolveAt(createInitialPattern(), 1, {}, { bpm: 130, swing: 0.66 }).swingOffset).toBeCloseTo(
      0.32 * step,
      12,
    )
    expect(resolveAt(createInitialPattern(), 1, {}, { bpm: 130, swing: 0.75 }).swingOffset).toBeCloseTo(
      0.5 * step,
      12,
    )
  })

  it('never shifts the step index: each 16th sounds its own programming at 50, 66 and 75%', () => {
    // A different sound on each of three neighbouring 16ths, so a step that
    // resolved as its neighbour would be heard as the wrong instrument.
    let pattern = program(createInitialPattern(), [
      ['kick', 1],
      ['closedHat', 2],
      ['snare', 3],
      ['pad2', 15],
      ['perc', 0],
    ])
    pattern = toggleNoteStep(toggleNoteStep(pattern, 'bass', 1), 'stab', 3)

    for (const swing of [0.5, 0.66, 0.75]) {
      const transport = { bpm: 130, swing }
      expect(resolveAt(pattern, 1, {}, transport).starts.map((hit) => hit.laneId)).toEqual(['kick'])
      expect(resolveAt(pattern, 1, {}, transport).notes.map((note) => note.laneId)).toEqual(['bass'])
      expect(resolveAt(pattern, 2, {}, transport).starts.map((hit) => hit.laneId)).toEqual([
        'closedHat',
      ])
      expect(resolveAt(pattern, 2, {}, transport).notes).toEqual([])
      expect(resolveAt(pattern, 3, {}, transport).starts.map((hit) => hit.laneId)).toEqual(['snare'])
      expect(resolveAt(pattern, 3, {}, transport).notes.map((note) => note.laneId)).toEqual(['stab'])
      // The last 16th of the bar is odd too, and must not wrap into step 1.
      expect(resolveAt(pattern, 15, {}, transport).starts.map((hit) => hit.laneId)).toEqual(['pad2'])
      expect(resolveAt(pattern, 0, {}, transport).starts.map((hit) => hit.laneId)).toEqual(['perc'])
    }
  })

  it('swings a whole odd 16th as one — its drums, pads, chokes, bass and stab share the offset', () => {
    let pattern = program(createInitialPattern(), [
      ['closedHat', 5, true],
      ['openHat', 5],
      ['pad1', 5],
    ])
    pattern = toggleNoteStep(toggleNoteStep(pattern, 'bass', 5), 'stab', 5)

    const swung = resolveAt(pattern, 5, {}, { bpm: 130, swing: 0.75 })
    const straight = resolveAt(pattern, 5)

    // Swing changes when the 16th lands, never what is on it.
    expect({ ...swung, swingOffset: 0 }).toEqual(straight)
    expect(swung.swingOffset).toBeCloseTo(0.5 * step, 12)
  })

  it('keeps note lengths in whole steps, measured from the delayed start', () => {
    const pattern = resizeNoteStep(toggleNoteStep(createInitialPattern(), 'bass', 3), 'bass', 3, 2)

    const [note] = resolveAt(pattern, 3, {}, { bpm: 130, swing: 0.75 }).notes
    expect(note.lengthSteps).toBe(3)
  })

  it('reads the tempo it is given, so the offset follows BPM', () => {
    expect(resolveAt(createInitialPattern(), 7, {}, { bpm: 90, swing: 0.75 }).swingOffset).toBeCloseTo(
      0.5 * secondsPerStep(90),
      12,
    )
  })
})

import { describe, expect, it } from 'vitest'
import { audibleLaneIds, laneIsAudible, type Mixer } from './mixer'
import type { DrumLaneId, LaneId } from './types'

const ALL: DrumLaneId[] = ['kick', 'snare', 'closedHat', 'openHat', 'perc']

describe('audibleLaneIds', () => {
  it('with no mutes or solos, every lane is audible', () => {
    expect(audibleLaneIds(ALL, {})).toEqual(ALL)
  })

  it('a muted lane is silenced; the rest still sound', () => {
    const mixer: Mixer = { closedHat: { muted: true, soloed: false } }
    expect(audibleLaneIds(ALL, mixer)).toEqual(['kick', 'snare', 'openHat', 'perc'])
  })

  it('when any lane is soloed, only soloed lanes sound (multiple solos allowed)', () => {
    const mixer: Mixer = {
      kick: { muted: false, soloed: true },
      perc: { muted: false, soloed: true },
    }
    expect(audibleLaneIds(ALL, mixer)).toEqual(['kick', 'perc'])
  })

  it('solo overrides mute: a lane that is both muted and soloed still sounds', () => {
    const mixer: Mixer = { kick: { muted: true, soloed: true } }
    expect(audibleLaneIds(ALL, mixer)).toEqual(['kick'])
  })

  it('resolves drums and pads against one global solo rule', () => {
    const lanes: LaneId[] = [...ALL, 'pad1', 'pad2', 'pad3', 'pad4']

    expect(audibleLaneIds(lanes, { kick: { muted: false, soloed: true } })).toEqual([
      'kick',
    ])
    expect(audibleLaneIds(lanes, { pad3: { muted: false, soloed: true } })).toEqual([
      'pad3',
    ])
  })
})

describe('laneIsAudible', () => {
  it('applies the global mixer rule to a live pad before it reaches its voice', () => {
    expect(laneIsAudible('pad1', { pad1: { muted: true, soloed: false } })).toBe(false)
    expect(laneIsAudible('pad1', { kick: { muted: false, soloed: true } })).toBe(false)
    expect(laneIsAudible('pad1', { pad1: { muted: true, soloed: true } })).toBe(true)
  })
})

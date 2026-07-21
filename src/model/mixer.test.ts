import { describe, expect, it } from 'vitest'
import { audibleLaneIds, type Mixer } from './mixer'
import type { DrumLaneId } from './types'

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
})

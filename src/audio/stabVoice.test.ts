import { describe, expect, it } from 'vitest'
import { createStabVoices, type StabSynthPool } from './stabVoice'

type RecordedEvent =
  | {
      type: 'attack' | 'release' | 'sequence'
      note: number
    }
  | { type: 'dispose' }

function recordingPool(events: RecordedEvent[]): StabSynthPool {
  return {
    triggerAttack(note) {
      events.push({ type: 'attack', note })
    },
    triggerRelease(note) {
      events.push({ type: 'release', note })
    },
    triggerAttackRelease(note) {
      events.push({ type: 'sequence', note })
    },
    dispose() {
      events.push({ type: 'dispose' })
    },
  }
}

describe('stab voices', () => {
  it('keeps live note releases isolated from sequenced hits on the same pitch', () => {
    const pools: RecordedEvent[][] = []
    const voices = createStabVoices(() => {
      const events: RecordedEvent[] = []
      pools.push(events)
      return recordingPool(events)
    })

    voices.attackLive(261.63, 1, 0.82)
    voices.triggerSequenced(261.63, 0.25, 1.1, 0.72)
    voices.releaseLive(261.63, 1.2)

    expect(pools).toHaveLength(2)
    expect(pools[0]).toEqual([
      { type: 'attack', note: 261.63 },
      { type: 'release', note: 261.63 },
    ])
    expect(pools[1]).toEqual([{ type: 'sequence', note: 261.63 }])
  })

  it('cancels active and queued sequenced notes on stop without replacing the live pool', () => {
    const pools: RecordedEvent[][] = []
    const voices = createStabVoices(() => {
      const events: RecordedEvent[] = []
      pools.push(events)
      return recordingPool(events)
    })

    voices.triggerSequenced(261.63, 0.5, 1, 0.72)
    voices.stopSequenced()
    voices.attackLive(329.63, 1.1, 0.82)
    voices.triggerSequenced(392, 0.25, 1.2, 0.72)

    expect(pools).toEqual([
      [{ type: 'attack', note: 329.63 }],
      [
        { type: 'sequence', note: 261.63 },
        { type: 'dispose' },
      ],
      [{ type: 'sequence', note: 392 }],
    ])
  })
})

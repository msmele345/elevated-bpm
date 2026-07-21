import type { DrumLaneId, Pattern } from '../model/types'

/**
 * What the sequencer should sound on one 16th, derived purely from the
 * pattern. Keeping this out of the Tone.js callback means lane independence
 * and accent dynamics are testable without any audio context — the engine
 * only has to turn hits into player starts.
 */

/** Unaccented steps sit below unity so accents have headroom to hit harder. */
export const UNACCENTED_GAIN = 0.62
/** ~4 dB above unaccented — the classic 909 accent step, clearly audible. */
export const ACCENT_GAIN = 1

export interface Hit {
  laneId: DrumLaneId
  gain: number
}

/** Every lane sounding on `stepIndex`, in deck order, with its velocity. */
export function hitsAtStep(pattern: Pattern, stepIndex: number): Hit[] {
  const hits: Hit[] = []
  for (const lane of pattern.lanes) {
    const step = lane.steps[stepIndex]
    if (!step?.on) continue
    hits.push({ laneId: lane.id, gain: step.accent ? ACCENT_GAIN : UNACCENTED_GAIN })
  }
  return hits
}

import { audibleLaneIds, type Mixer } from '../model/mixer'
import type { LaneId, Pattern } from '../model/types'

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
  laneId: LaneId
  gain: number
}

/**
 * Choke groups: firing the key lane cuts the ringing value lane. The classic
 * 909 has one — a closed hat chokes the open hat — but the map keeps the rule
 * as data so more voices (e.g. a rim/clave pair) are a one-line addition.
 */
const CHOKES: Partial<Record<LaneId, LaneId>> = {
  closedHat: 'openHat',
}

/**
 * Every lane sounding on `stepIndex`, in deck order, with its velocity. The
 * mixer filters the result so muted lanes stay silent and, when any lane is
 * soloed, only soloed lanes sound (defaults to an all-audible mixer).
 */
export function hitsAtStep(pattern: Pattern, stepIndex: number, mixer: Mixer = {}): Hit[] {
  const lanes = [...pattern.lanes, ...pattern.padLanes]
  const audible = new Set(audibleLaneIds(lanes.map((lane) => lane.id), mixer))
  const hits: Hit[] = []
  for (const lane of lanes) {
    if (!audible.has(lane.id)) continue
    const step = lane.steps[stepIndex]
    if (!step?.on) continue
    hits.push({ laneId: lane.id, gain: step.accent ? ACCENT_GAIN : UNACCENTED_GAIN })
  }
  return hits
}

/** How a single 16th should be voiced: what to trigger and what ring to cut. */
export interface StepVoicing {
  /** Lanes to trigger this step, each at its velocity, choked lanes removed. */
  starts: Hit[]
  /** Ringing lanes to silence at this step because a choker fired. */
  chokes: LaneId[]
}

/**
 * Resolve one 16th into starts and chokes. When a choker lane fires (after the
 * mixer is applied), its choke target is cut — silencing a still-ringing voice
 * from an earlier step and preventing a same-step target from sounding, so the
 * open hat behaves like real 909 hardware under the closed hat.
 */
export function voiceStep(pattern: Pattern, stepIndex: number, mixer: Mixer = {}): StepVoicing {
  const hits = hitsAtStep(pattern, stepIndex, mixer)
  const firing = new Set(hits.map((hit) => hit.laneId))
  const chokes: LaneId[] = []
  for (const [choker, target] of Object.entries(CHOKES) as [LaneId, LaneId][]) {
    if (firing.has(choker)) chokes.push(target)
  }
  const choked = new Set(chokes)
  return { starts: hits.filter((hit) => !choked.has(hit.laneId)), chokes }
}

import { audibleVoiceIds, type Mixer } from '../model/mixer'
import { NOTE_LANES, noteEventAtStep, type LaneNoteEvent } from '../model/note'
import { swingOffsetSeconds, type TransportSettings } from '../model/transport'
import type { LaneId, Pattern } from '../model/types'

/**
 * Step resolution: what the sequencer sounds on one 16th, decided purely from
 * the document. This is the one place that decision is made — the Tone.js
 * callback only applies the result — so lane independence, accent dynamics,
 * chokes and note lengths are testable without any audio context, and every
 * later rule (swing, levels, the queued bank switch, 303 flags) grows this
 * one result instead of the callback.
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

/** What the resolver reads to decide one 16th. An object, so it can grow. */
export interface StepResolutionInput {
  pattern: Pattern
  mixer: Mixer
  /** Tempo and swing: together they decide how late an off-beat 16th lands. */
  transport: TransportSettings
  /** The 16th on the straight grid. Swing never changes which step this is. */
  stepIndex: number
}

/** Everything that sounds on one 16th. */
export interface StepResolution {
  /** Drum and pad lanes to trigger, each at its velocity, choked lanes removed. */
  starts: Hit[]
  /** Ringing lanes to silence at this step because a choker fired. */
  chokes: LaneId[]
  /** Bass and stab notes starting on this step, in deck order. */
  notes: LaneNoteEvent[]
  /**
   * Seconds to add to the scheduled time of everything above: zero on even
   * 16ths, and the swing delay on odd ones. One offset for the whole 16th, so
   * every sequenced voice shuffles together and the bass never drifts off the
   * kick. Note lengths stay in whole steps, measured from the delayed start.
   */
  swingOffset: number
}

/**
 * Resolve one 16th. Every voice — drum, pad, bass and stab — passes through
 * the one mixer rule: muted voices stay silent and, when any voice is soloed,
 * only soloed voices sound. When a choker lane fires its target is cut,
 * silencing a still-ringing voice from an earlier step and preventing a
 * same-step target from sounding, so the open hat behaves like real 909
 * hardware under the closed hat. Level is not decided here: it is the voice's
 * channel gain, applied after the accent gain, so a hit's gain stays its
 * accent alone and accents keep their headroom at any Level. Swing moves when
 * the 16th lands, never what is on it: the step index comes from the straight
 * grid.
 */
export function resolveStep({
  pattern,
  mixer,
  transport,
  stepIndex,
}: StepResolutionInput): StepResolution {
  const hits = hitsAtStep(pattern, stepIndex, mixer)
  const firing = new Set(hits.map((hit) => hit.laneId))
  const chokes: LaneId[] = []
  for (const [choker, target] of Object.entries(CHOKES) as [LaneId, LaneId][]) {
    if (firing.has(choker)) chokes.push(target)
  }
  const choked = new Set(chokes)
  return {
    starts: hits.filter((hit) => !choked.has(hit.laneId)),
    chokes,
    notes: notesAtStep(pattern, stepIndex, mixer),
    swingOffset: swingOffsetSeconds(stepIndex, transport.bpm, transport.swing),
  }
}

/** Every audible drum and pad lane sounding on `stepIndex`, in deck order, with its velocity. */
function hitsAtStep(pattern: Pattern, stepIndex: number, mixer: Mixer): Hit[] {
  const lanes = [...pattern.lanes, ...pattern.padLanes]
  const audible = new Set(audibleVoiceIds(lanes.map((lane) => lane.id), mixer))
  const hits: Hit[] = []
  for (const lane of lanes) {
    if (!audible.has(lane.id)) continue
    const step = lane.steps[stepIndex]
    if (!step?.on) continue
    hits.push({ laneId: lane.id, gain: step.accent ? ACCENT_GAIN : UNACCENTED_GAIN })
  }
  return hits
}

/** Every audible melodic event starting on this 16th, one at most per note lane. */
function notesAtStep(pattern: Pattern, stepIndex: number, mixer: Mixer): LaneNoteEvent[] {
  const audible = audibleVoiceIds(
    NOTE_LANES.map(({ id }) => id),
    mixer,
  )
  return audible.flatMap((id) => {
    const event = noteEventAtStep(pattern, id, stepIndex)
    return event ? [{ laneId: id, ...event }] : []
  })
}

import type { BassSettings } from '../model/bass'
import { audibleVoiceIds, type Mixer } from '../model/mixer'
import { NOTE_FLAG_LANES, NOTE_LANES, noteEventAtStep, type LaneNoteEvent } from '../model/note'
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

/** How far the filter opens above Cutoff on a note at Env Mod 100 %. */
export const ENV_MOD_MAX_OCTAVES = 4
/** The extra filter opening an accent adds, whatever Env Mod is set to. */
export const ACCENT_ENV_OCTAVES = 2
/** An accent's filter closes this much faster than the Decay knob's. */
const ACCENT_DECAY_RATIO = 0.5

/**
 * How one bass note is voiced: a gain into the bass channel, and a filter
 * envelope that jumps `filterOctaves` above Cutoff on the note and falls back
 * to it over `filterDecay` seconds. The envelope rides on top of Cutoff rather
 * than replacing it, so the Cutoff knob still moves the base live, mid-note.
 */
export interface BassVoicing {
  gain: number
  filterOctaves: number
  filterDecay: number
}

/**
 * Voice a bass note from the patch. An unaccented note at Env Mod 0 is unity
 * gain with no envelope — the bass exactly as it was before either existed.
 * An accent is the 303's: louder by the drum accent gap (about +4 dB, through
 * a gain stage, because a synth's velocity tops out at 1), plus a fixed extra
 * filter opening that closes faster. It stacks on Env Mod and does not need
 * it, so the Accent row is never a dead control.
 */
export function bassVoicing(settings: BassSettings, accent: boolean): BassVoicing {
  const envOctaves = (settings.envMod / 100) * ENV_MOD_MAX_OCTAVES
  if (!accent) return { gain: 1, filterOctaves: envOctaves, filterDecay: settings.decay }
  return {
    gain: ACCENT_GAIN / UNACCENTED_GAIN,
    filterOctaves: envOctaves + ACCENT_ENV_OCTAVES,
    filterDecay: settings.decay * ACCENT_DECAY_RATIO,
  }
}

/**
 * A note one lane starts on a 16th. Only the bass reads the 303 flags, so only
 * a bass note carries a voicing; a stab note's accent is always off.
 */
export type SequencedNote =
  | (LaneNoteEvent & { laneId: 'bass'; voicing: BassVoicing })
  | (LaneNoteEvent & { laneId: 'stab' })

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
  /** The pattern bank, slots A–D. */
  bank: readonly Pattern[]
  /** The slot the user selected — the one the grid shows. */
  selectedSlotId: string
  /** The slot the engine was sounding going into this 16th. */
  playingSlotId: string
  mixer: Mixer
  /** The bass patch, which voices each bass note: Env Mod and Decay shape its filter. */
  bass: BassSettings
  /** Tempo and swing: together they decide how late an off-beat 16th lands. */
  transport: TransportSettings
  /** The 16th on the straight grid. Swing never changes which step this is. */
  stepIndex: number
}

/** Everything that sounds on one 16th. */
export interface StepResolution {
  /**
   * The slot sounding after this 16th. A selected slot that differs is queued:
   * it takes over on step 0 — the end of the bar, like hardware — and this 16th
   * is then already the new slot's.
   */
  playingSlotId: string
  /** Drum and pad lanes to trigger, each at its velocity, choked lanes removed. */
  starts: Hit[]
  /** Ringing lanes to silence at this step because a choker fired. */
  chokes: LaneId[]
  /** Bass and stab notes starting on this step, in deck order, the bass voiced. */
  notes: SequencedNote[]
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
 * grid. The bank switch is decided here too: the playing slot follows the
 * selected one only on step 0, so a press mid-bar is queued, never heard
 * mid-bar.
 */
export function resolveStep({
  bank,
  selectedSlotId,
  playingSlotId,
  mixer,
  bass,
  transport,
  stepIndex,
}: StepResolutionInput): StepResolution {
  const selected = bank.find((slot) => slot.id === selectedSlotId) ?? bank[0]
  // A playing slot the bank no longer holds (a shared beat replaced the bank)
  // has nothing left to finish, so the selected slot comes in at once.
  const playing =
    stepIndex === 0 ? selected : (bank.find((slot) => slot.id === playingSlotId) ?? selected)
  const hits = hitsAtStep(playing, stepIndex, mixer)
  const firing = new Set(hits.map((hit) => hit.laneId))
  const chokes: LaneId[] = []
  for (const [choker, target] of Object.entries(CHOKES) as [LaneId, LaneId][]) {
    if (firing.has(choker)) chokes.push(target)
  }
  const choked = new Set(chokes)
  return {
    playingSlotId: playing.id,
    starts: hits.filter((hit) => !choked.has(hit.laneId)),
    chokes,
    notes: notesAtStep(playing, stepIndex, mixer, bass),
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
function notesAtStep(
  pattern: Pattern,
  stepIndex: number,
  mixer: Mixer,
  bass: BassSettings,
): SequencedNote[] {
  const audible = audibleVoiceIds(
    NOTE_LANES.map(({ id }) => id),
    mixer,
  )
  return audible.flatMap((id): SequencedNote[] => {
    const event = noteEventAtStep(pattern, id, stepIndex)
    if (!event) return []
    // A lane without the 303 flags (the stab) keeps any it is given, unplayed.
    const accent = NOTE_FLAG_LANES.includes(id) && event.accent
    if (id === 'bass') return [{ laneId: id, ...event, accent, voicing: bassVoicing(bass, accent) }]
    return [{ laneId: id, ...event, accent }]
  })
}

/**
 * The room: beat-synced club light behind the deck. Pure math only — the rAF
 * loop in hooks/useRoomLight reads the transport clock and feeds these
 * functions, then writes the results into CSS variables. Model code never
 * imports the engine (which drags in Tone/Web Audio); clocks arrive as args.
 */

/**
 * How hard the swell falls through one pulse period: e^-2.75 ≈ 0.06 by the
 * next beat. Soft enough that light carries through the beat (a swell the
 * eye can rest on) rather than snapping off (a strobe that demands it).
 */
const STROBE_DECAY = 2.75

/**
 * Strobe envelope: full on the pulse, decaying exponentially through the
 * beat. phase is 0..1 within the pulse period.
 */
export function strobeAtPhase(phase: number): number {
  return Math.exp(-STROBE_DECAY * phase)
}

/** One slow inhale/exhale of the idle room, in seconds. */
export const BREATHE_PERIOD_S = 6

/**
 * Idle breathe for a stopped deck: a slow dim sinusoid, 0..1. The CSS scales
 * it far below the strobe's range, so a silent deck stays calm but never dead.
 */
export function breatheAtTime(nowSeconds: number): number {
  return (1 - Math.cos((2 * Math.PI * nowSeconds) / BREATHE_PERIOD_S)) / 2
}

/**
 * Photosafety cap on the strobe rate (WCAG 2.3.1: no more than three flashes
 * per second). At 130 BPM a quarter-note pulse is ~2.2 Hz; past 180 BPM the
 * room drops to half-note pulses so the cap holds at every tempo the deck
 * can reach (MAX_BPM 200 would otherwise flash at 3.3 Hz).
 */
export const MAX_FLASH_HZ = 3

/** How many quarter notes one strobe pulse spans at this tempo: 1 or 2. */
export function beatsPerPulseForBpm(bpm: number): number {
  return bpm / 60 > MAX_FLASH_HZ ? 2 : 1
}

const BEATS_PER_BAR = 4

/**
 * Swell depth per beat in a 4/4 bar: full on the 1, a secondary lift on the
 * 3, light nods on the 2 and 4 — the room breathes with the phrase instead
 * of flashing metronomically, which is what lets the eye rest on the grid.
 */
const BAR_ACCENT = [1, 0.4, 0.6, 0.4] as const

/** Swell depth for a beat index (any integer; wraps per bar). */
export function accentAtBeatInBar(beatInBar: number): number {
  return BAR_ACCENT[((beatInBar % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR]
}

/** One full wander from the deck's warm palette out to club colors and back. */
export const COOL_PERIOD_S = 36

/**
 * Color mood, 0..1: 0 is the deck's own warm palette, 1 is full club color
 * (magenta / cyan / violet). A smooth cosine so the drift never jumps at the
 * wrap — the room's hue wanders; it never cuts.
 */
export function coolMixAtTime(nowSeconds: number): number {
  return (1 - Math.cos((2 * Math.PI * nowSeconds) / COOL_PERIOD_S)) / 2
}

/** What the room is doing right now, as 0..1 signals the CSS blends. */
export interface RoomLight {
  /** Bar-accented swell: 1 on the 1, softer nods on the other beats. 0 when stopped. */
  pulse: number
  /** Idle breathe: always running, scaled low in CSS so it calms a stopped room. */
  breathe: number
  /** Color mood: 0 warm (the deck's palette), 1 full club color. Always drifting. */
  cool: number
}

/**
 * Sample the room light for this frame. `ticks` is the transport position in
 * ticks, or a negative number when the transport is stopped (the same
 * convention as the engine's getCurrentStep). Pure: no Tone, no DOM — the
 * hook owns both clocks.
 */
export function roomLightAt(args: {
  ticks: number
  ticksPerBeat: number
  bpm: number
  nowSeconds: number
}): RoomLight {
  const breathe = breatheAtTime(args.nowSeconds)
  const cool = coolMixAtTime(args.nowSeconds)
  if (args.ticks < 0) return { pulse: 0, breathe, cool }
  const periodTicks = args.ticksPerBeat * beatsPerPulseForBpm(args.bpm)
  const phase = (args.ticks % periodTicks) / periodTicks
  // The accent is sampled where the pulse period starts, so a multi-beat
  // period holds one depth through the whole swell instead of dipping
  // mid-swell when the bar position changes.
  const periodStartBeat = Math.floor(args.ticks / periodTicks) * beatsPerPulseForBpm(args.bpm)
  const accent = accentAtBeatInBar(periodStartBeat)
  return { pulse: accent * strobeAtPhase(phase), breathe, cool }
}

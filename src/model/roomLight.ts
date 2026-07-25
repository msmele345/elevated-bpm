/**
 * The room: beat-synced club light behind the deck. Pure math only — the rAF
 * loop in hooks/useRoomLight reads the transport clock and feeds these
 * functions, then writes the results into CSS variables. Model code never
 * imports the engine (which drags in Tone/Web Audio); clocks arrive as args.
 */

/** How hard the strobe falls through one pulse period: e^-4 ≈ 0.02 by the next beat. */
const STROBE_DECAY = 4

/**
 * Strobe envelope: a full flash on the pulse, decaying exponentially so the
 * room hits hard on the beat and falls away through it — the club-pulse feel.
 * phase is 0..1 within the pulse period.
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

/** What the room is doing right now, as two 0..1 intensities the CSS blends. */
export interface RoomLight {
  /** Strobe envelope: 1 on the pulse, decaying to ~0 by the next. 0 when stopped. */
  pulse: number
  /** Idle breathe: always running, scaled low in CSS so it calms a stopped room. */
  breathe: number
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
  if (args.ticks < 0) return { pulse: 0, breathe }
  const periodTicks = args.ticksPerBeat * beatsPerPulseForBpm(args.bpm)
  const phase = (args.ticks % periodTicks) / periodTicks
  return { pulse: strobeAtPhase(phase), breathe }
}

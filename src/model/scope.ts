/**
 * Pure math for the master spectrum scope: how an analyser's FFT frame becomes
 * the 16 bars drawn on the canvas. Log-spaced frequency grouping (so the bass
 * end gets as much visual room as the top), dB normalization against a fixed
 * window, and a per-frame fall so bars drop smoothly instead of flickering.
 * No Tone, no canvas — the drawing loop consumes these from rAF.
 */

export interface ScopeSpec {
  /** Bars drawn on the scope. */
  barCount: number
  /** Bins the analyser reports (its FFT size / 2). */
  binCount: number
  /** Audio context sample rate the bin → Hz mapping assumes. */
  sampleRate: number
  /** Bottom of the displayed band. */
  minHz: number
  /** Top of the displayed band. */
  maxHz: number
}

export interface BinRange {
  /** First analyser bin of the bar (inclusive). */
  start: number
  /** One past the last bin of the bar (exclusive). */
  end: number
}

/**
 * The shipped scope: 16 bars — one per step, wearing the same quad colors —
 * over a 1024-bin analyser, spanning the kick's fundamental to the hats' air.
 * The sample rate is nominal; at 48 kHz the band edges shift by a few percent,
 * which the eye cannot tell on a 16-bar display.
 */
export const SCOPE_SPEC: ScopeSpec = {
  barCount: 16,
  binCount: 1024,
  sampleRate: 44100,
  minHz: 35,
  maxHz: 14000,
}

/** Display window: analyser dB mapped onto the bar's 0..1 travel. */
export const SCOPE_FLOOR_DB = -78
export const SCOPE_CEIL_DB = -8

/** How much of a bar's travel it may fall per frame (rise is instant). */
export const SCOPE_FALL_PER_FRAME = 0.06

/**
 * Group analyser bins into log-spaced bars over [minHz, maxHz]. Every bar owns
 * at least one bin, bins stay in range (the DC bin is never read), and starts
 * ascend — narrow groups at the bottom, wide at the top, like the ear.
 */
export function barBinRanges(spec: ScopeSpec): BinRange[] {
  const hzPerBin = spec.sampleRate / 2 / spec.binCount
  const logMin = Math.log(spec.minHz)
  const logStep = (Math.log(spec.maxHz) - logMin) / spec.barCount
  const edgeBin = (bar: number) =>
    Math.exp(logMin + logStep * bar) / hzPerBin

  const ranges: BinRange[] = []
  let previousEnd = Math.max(1, Math.floor(edgeBin(0)))
  for (let bar = 1; bar <= spec.barCount; bar += 1) {
    const start = previousEnd
    const end = Math.min(
      spec.binCount,
      Math.max(start + 1, Math.round(edgeBin(bar))),
    )
    ranges.push({ start, end })
    previousEnd = end
  }
  return ranges
}

/**
 * One FFT frame (dB per bin) → one 0..1 level per bar. A bar shows its
 * loudest bin — an average would let one hot partial drown in quiet
 * neighbours — clamped into the floor..ceiling display window, so silence
 * (-Infinity) rests at exactly 0.
 */
export function barLevels(
  fft: ArrayLike<number>,
  ranges: readonly BinRange[],
  floorDb: number,
  ceilDb: number,
): number[] {
  return ranges.map(({ start, end }) => {
    let peak = -Infinity
    for (let bin = start; bin < end; bin += 1) {
      if (fft[bin] > peak) peak = fft[bin]
    }
    const level = (peak - floorDb) / (ceilDb - floorDb)
    return Math.min(1, Math.max(0, level))
  })
}

/**
 * Frame-to-frame motion: a bar jumps up instantly (attacks must read) but
 * falls no faster than `fall` per frame, landing exactly on the target.
 */
export function decayLevels(
  previous: readonly number[],
  target: readonly number[],
  fall: number,
): number[] {
  return target.map((level, bar) =>
    level >= previous[bar] ? level : Math.max(level, previous[bar] - fall),
  )
}

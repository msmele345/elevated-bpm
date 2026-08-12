import type { SampleRegion } from './sampler'
import { MIN_BPM, secondsPerStep } from './transport'
import { STEP_COUNT } from './types'

/**
 * The geometry of trimming: where a region's two edges may sit inside a source
 * and how they move. A region is a *reference* into a source rather than a
 * copy, which is what makes a chop re-editable and lets one break supply four
 * pads — so every edit here is a small immutable change to two numbers.
 *
 * Pure, and deliberately unaware of pointers and keys: the two-thumb slider,
 * the bracket keys and the announcement all speak this one vocabulary.
 */

/** Which end of the region is being moved. */
export type RegionEdge = 'start' | 'end'

/**
 * The shortest region the deck will hold. A zero-length chop is silence that
 * divides by zero in the fit-to-steps rate, so the edges are never allowed to
 * meet.
 */
export const MIN_REGION_SECONDS = 0.01

/**
 * Keyboard travel per press. Fine is around one analysis frame, which is the
 * precision a chop is actually judged at; coarse covers a tenth of a second.
 * Neither is scaled to source length — crossing a long recording is what the
 * bracket keys are for, and a nudge that meant different things in different
 * sources would be unusable.
 */
export const REGION_NUDGE_SECONDS = 0.01
export const REGION_JUMP_SECONDS = 0.1

/**
 * The longest a chop may be, derived rather than picked: a full bar at the
 * transport's slowest tempo is the longest a fit-to-steps target can ever ask
 * for, and twice that leaves room for a one-shot with a long tail.
 *
 * It exists because a slice is *rendered* audio which EB2-06 keeps and never
 * evicts, so "slices are small" has to be enforced rather than assumed —
 * committing an untrimmed six-minute region would render tens of megabytes and
 * put back exactly the residency the slice architecture removes.
 */
export const MAX_SLICE_SECONDS = STEP_COUNT * secondsPerStep(MIN_BPM) * 2

/** Where the region ends — the value the second thumb carries. */
export function regionEnd(region: SampleRegion): number {
  return region.start + region.duration
}

/**
 * How near a detected hit an edge has to be to count as sitting on it. One
 * analysis frame: closer than the detector itself can resolve.
 */
const ONSET_MATCH_SECONDS = 0.005

/** A time as an engineer reads it — milliseconds matter when trimming a chop. */
export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds)
  if (safe < 60) return `${safe.toFixed(3)} s`
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${(safe - minutes * 60).toFixed(3).padStart(6, '0')}`
}

/**
 * What a region edge announces: its timecode *and* where it stands among the
 * detected hits. The second half is the accessibility feature — a waveform
 * describes audio the user can already hear, so structure is what makes the
 * editor operable without sight, and it makes chopping faster for everyone
 * else as a side effect.
 */
export function regionEdgeAnnouncement(seconds: number, onsets: readonly number[]): string {
  const timecode = formatTimecode(seconds)
  if (onsets.length === 0) return timecode
  const total = onsets.length
  const on = onsets.findIndex((onset) => Math.abs(onset - seconds) <= ONSET_MATCH_SECONDS)
  if (on !== -1) return `${timecode}, onset ${on + 1} of ${total}`
  // Between two hits is where a dragged edge nearly always lands, so it has to
  // say as much about where the user is as landing on one does.
  const next = onsets.findIndex((onset) => onset > seconds)
  if (next === 0) return `${timecode}, before onset 1 of ${total}`
  if (next === -1) return `${timecode}, after onset ${total} of ${total}`
  return `${timecode}, between onsets ${next} and ${next + 1} of ${total}`
}

/**
 * Where a time sits along the source, 0..1 — what every part of the editor
 * positions against. The guard is here rather than at four call sites.
 */
export function fractionOfSource(seconds: number, sourceDuration: number): number {
  return seconds / Math.max(sourceDuration, 1e-6)
}

/** Where the region's current value sits along its own edge. */
export function regionEdgeValue(region: SampleRegion, edge: RegionEdge): number {
  return edge === 'start' ? region.start : regionEnd(region)
}

/**
 * How far one edge may travel: out to the source's bound on its own side, and
 * up to the other edge on the inside. This is a real range rather than a
 * derived detail — it is what each thumb reports as its minimum and maximum,
 * and what Home and End park against.
 */
export function regionEdgeRange(
  region: SampleRegion,
  edge: RegionEdge,
  sourceDuration: number,
): { min: number; max: number } {
  return edge === 'start'
    ? { min: 0, max: Math.max(0, regionEnd(region) - MIN_REGION_SECONDS) }
    : {
        min: Math.min(sourceDuration, region.start + MIN_REGION_SECONDS),
        max: sourceDuration,
      }
}

/**
 * Pull a region back inside the source it references. A document can name a
 * region longer than the audio behind it — a hand-edited save, or a relinked
 * file that turned out shorter — and the editor has to open on something real.
 */
export function clampRegionToSource(
  region: SampleRegion,
  sourceDuration: number,
): SampleRegion {
  const start = Math.min(Math.max(0, region.start), Math.max(0, sourceDuration - MIN_REGION_SECONDS))
  const duration = Math.min(region.duration, sourceDuration - start, MAX_SLICE_SECONDS)
  return start === region.start && duration === region.duration
    ? region
    : { ...region, start, duration }
}

/**
 * Move the focused edge to the detected hit either side of it — what the
 * bracket keys do. This is navigation, so an onset the edge cannot legally
 * reach is not a target: the edge stays exactly where it was rather than
 * clamping to its bound and quietly retrimming the chop.
 */
export function jumpRegionEdgeToOnset(
  region: SampleRegion,
  edge: RegionEdge,
  direction: 'next' | 'previous',
  onsets: readonly number[],
  sourceDuration: number,
): SampleRegion {
  const { min, max } = regionEdgeRange(region, edge, sourceDuration)
  const from = regionEdgeValue(region, edge)
  const reachable = onsets.filter((onset) => onset >= min && onset <= max)
  const target =
    direction === 'next'
      ? reachable.find((onset) => onset > from)
      : reachable.reduce<number | undefined>(
          (best, onset) => (onset < from ? onset : best),
          undefined,
        )
  return target === undefined ? region : moveRegionEdge(region, edge, target, sourceDuration)
}

/**
 * Move one edge to a time. The other edge holds still — unless that would make
 * the chop longer than `MAX_SLICE_SECONDS`, in which case it follows, so the
 * region behaves as a window of at most that width.
 *
 * Dragging the far edge along rather than clamping the near one is what keeps
 * Home and End meaning what they say on a long source: the window slides to
 * the top or the tail of the file instead of stranding the user in the middle
 * of a six-minute recording with no way back to its beginning.
 */
export function moveRegionEdge(
  region: SampleRegion,
  edge: RegionEdge,
  seconds: number,
  sourceDuration: number,
): SampleRegion {
  const { min, max } = regionEdgeRange(region, edge, sourceDuration)
  const at = Math.min(max, Math.max(min, seconds))
  if (edge === 'start') {
    const end = Math.min(regionEnd(region), at + MAX_SLICE_SECONDS)
    return { ...region, start: at, duration: end - at }
  }
  const start = Math.max(region.start, at - MAX_SLICE_SECONDS)
  return { ...region, start, duration: at - start }
}

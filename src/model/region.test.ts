import { describe, expect, it } from 'vitest'
import type { SampleRegion } from './sampler'
import {
  MAX_SLICE_SECONDS,
  MIN_REGION_SECONDS,
  clampRegionToSource,
  jumpRegionEdgeToOnset,
  moveRegionEdge,
  regionEdgeAnnouncement,
  regionEdgeValue,
  regionEnd,
} from './region'

const SOURCE_DURATION = 8

function region(start: number, duration: number): SampleRegion {
  return { sourceId: 'src-1', start, duration }
}

describe('moveRegionEdge', () => {
  it('trims from the front without moving the end of the region', () => {
    const trimmed = moveRegionEdge(region(1, 4), 'start', 2, SOURCE_DURATION)

    expect(trimmed.start).toBeCloseTo(2)
    expect(trimmed.start + trimmed.duration).toBeCloseTo(5)
  })

  it('never lets one edge reach the other, so a region is never silence', () => {
    const start = moveRegionEdge(region(1, 4), 'start', 9, SOURCE_DURATION)
    const end = moveRegionEdge(region(1, 4), 'end', 0, SOURCE_DURATION)

    expect(regionEnd(start) - start.start).toBeCloseTo(MIN_REGION_SECONDS)
    expect(start.start).toBeCloseTo(5 - MIN_REGION_SECONDS)
    expect(regionEnd(end) - end.start).toBeCloseTo(MIN_REGION_SECONDS)
    expect(end.start).toBeCloseTo(1)
  })

  it('holds both edges inside the source', () => {
    const start = moveRegionEdge(region(1, 4), 'start', -3, SOURCE_DURATION)
    const end = moveRegionEdge(region(1, 4), 'end', 99, SOURCE_DURATION)

    expect(start.start).toBe(0)
    expect(regionEnd(start)).toBeCloseTo(5)
    expect(regionEnd(end)).toBe(SOURCE_DURATION)
  })
})

describe('the longest a chop may be', () => {
  /** Six minutes: the longest source intake accepts. */
  const LONG_SOURCE = 360

  it('drags the far edge along rather than letting a chop outgrow the cap', () => {
    // A slice is rendered audio that EB2-06 treats as precious and never
    // evicts, so "slices are small" has to be enforced rather than assumed:
    // an untrimmed six-minute region would render tens of megabytes and put
    // back exactly the residency the slice architecture removes.
    const wide = moveRegionEdge(region(100, 1), 'end', 200, LONG_SOURCE)

    expect(regionEnd(wide) - wide.start).toBeCloseTo(MAX_SLICE_SECONDS)
    expect(regionEnd(wide)).toBeCloseTo(200)
    expect(wide.start).toBeCloseTo(200 - MAX_SLICE_SECONDS)
  })

  it('still parks an edge at the source’s own bounds', () => {
    // Because the far edge follows, Home and End keep meaning what they say —
    // the window slides to the top or the tail of the file instead of the
    // user being stranded in the middle of a long recording.
    const atTop = moveRegionEdge(region(300, 4), 'start', 0, LONG_SOURCE)
    const atTail = moveRegionEdge(region(10, 4), 'end', LONG_SOURCE, LONG_SOURCE)

    expect(atTop.start).toBe(0)
    expect(regionEnd(atTop)).toBeCloseTo(MAX_SLICE_SECONDS)
    expect(regionEnd(atTail)).toBe(LONG_SOURCE)
    expect(atTail.start).toBeCloseTo(LONG_SOURCE - MAX_SLICE_SECONDS)
  })

  it('leaves a chop already inside the cap exactly where it is', () => {
    const modest = moveRegionEdge(region(2, 1), 'end', 5, LONG_SOURCE)

    expect(modest.start).toBeCloseTo(2)
    expect(regionEnd(modest)).toBeCloseTo(5)
  })

  it('pulls an over-long region from a document back to the cap', () => {
    const clamped = clampRegionToSource(region(10, 300), LONG_SOURCE)

    expect(clamped.start).toBeCloseTo(10)
    expect(clamped.duration).toBeCloseTo(MAX_SLICE_SECONDS)
  })
})

describe('jumpRegionEdgeToOnset', () => {
  const ONSETS = [0.2, 0.9, 1.4, 2]

  it('lands the edge on the hit either side of where it stands', () => {
    const at = region(1, 4)

    const forward = jumpRegionEdgeToOnset(at, 'start', 'next', ONSETS, SOURCE_DURATION)
    const back = jumpRegionEdgeToOnset(at, 'start', 'previous', ONSETS, SOURCE_DURATION)

    expect(regionEdgeValue(forward, 'start')).toBeCloseTo(1.4)
    expect(regionEdgeValue(back, 'start')).toBeCloseTo(0.9)
  })

  it('stays put when there is no hit that way', () => {
    const at = region(2, 4)

    const past = jumpRegionEdgeToOnset(at, 'start', 'next', ONSETS, SOURCE_DURATION)

    expect(past).toEqual(at)
  })

  it('will not jump an edge through the other one', () => {
    // The end sits at 1.2, so the hits at 1.4 and 2 are not the start's to
    // reach: a jump is navigation, and it must never quietly retrim the chop.
    const at = region(0.95, 0.25)

    const past = jumpRegionEdgeToOnset(at, 'start', 'next', ONSETS, SOURCE_DURATION)

    expect(past).toEqual(at)
  })
})

describe('regionEdgeAnnouncement', () => {
  // Nineteen hits, so the announcement has a real structure to place an edge in.
  const ONSETS = Array.from({ length: 19 }, (_, index) => 0.4 + index * 0.5)

  it('names the hit an edge is sitting on', () => {
    // The announcement *is* the feature: it is how the audio is navigable by
    // structure rather than by looking at the waveform.
    expect(regionEdgeAnnouncement(ONSETS[3], ONSETS)).toBe('1.900 s, onset 4 of 19')
  })

  it('places an edge that is between hits, before them all, or past them all', () => {
    // Dragging lands between hits far more often than on one, so "between"
    // has to say as much about where you are as landing on one does.
    expect(regionEdgeAnnouncement(2.1, ONSETS)).toBe('2.100 s, between onsets 4 and 5 of 19')
    expect(regionEdgeAnnouncement(0.1, ONSETS)).toBe('0.100 s, before onset 1 of 19')
    expect(regionEdgeAnnouncement(9.8, ONSETS)).toBe('9.800 s, after onset 19 of 19')
  })

  it('gives the timecode alone when the source has no detected hits', () => {
    expect(regionEdgeAnnouncement(1.482, [])).toBe('1.482 s')
  })

  it('counts minutes once a source is longer than one', () => {
    expect(regionEdgeAnnouncement(83.25, [])).toBe('1:23.250')
  })
})

describe('clampRegionToSource', () => {
  it('pulls a region that outruns its source back inside it', () => {
    // A document can name a region longer than the audio behind it — a
    // hand-edited save, or a relinked file that turned out shorter. The editor
    // has to open on something real rather than on nonsense.
    const clamped = clampRegionToSource(region(7, 6), SOURCE_DURATION)

    expect(clamped.start).toBeCloseTo(7)
    expect(regionEnd(clamped)).toBe(SOURCE_DURATION)
  })

  it('keeps a region that already fits exactly as it is', () => {
    const inside = region(1, 4)

    expect(clampRegionToSource(inside, SOURCE_DURATION)).toEqual(inside)
  })
})

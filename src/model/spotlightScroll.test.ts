import { describe, expect, it } from 'vitest'
import { spotlightNeedsScroll, spotlightScrollBehavior } from './spotlightScroll'

// The band a learner can actually see: below the sticky transport strip, above
// the bottom of the viewport.
const VISIBLE = { top: 120, bottom: 720 }

describe('spotlightNeedsScroll', () => {
  it('leaves a control that is wholly in view alone', () => {
    expect(spotlightNeedsScroll({ top: 200, bottom: 300 }, VISIBLE)).toBe(false)
    // Edges touching the band still count as in view.
    expect(spotlightNeedsScroll({ top: 120, bottom: 720 }, VISIBLE)).toBe(false)
  })

  it('scrolls to a control below the fold, even one only partly cut off', () => {
    expect(spotlightNeedsScroll({ top: 1400, bottom: 1480 }, VISIBLE)).toBe(true)
    expect(spotlightNeedsScroll({ top: 680, bottom: 760 }, VISIBLE)).toBe(true)
  })

  it('treats a control hidden under the sticky strip as off-screen', () => {
    expect(spotlightNeedsScroll({ top: 60, bottom: 150 }, VISIBLE)).toBe(true)
    expect(spotlightNeedsScroll({ top: -400, bottom: -300 }, VISIBLE)).toBe(true)
  })
})

describe('spotlightScrollBehavior', () => {
  it('glides by default and jumps under reduced motion', () => {
    expect(spotlightScrollBehavior(false)).toBe('smooth')
    expect(spotlightScrollBehavior(true)).toBe('auto')
  })
})

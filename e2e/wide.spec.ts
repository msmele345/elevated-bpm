import { expect, test, type Page } from '@playwright/test'
import { openFreshDeck } from './helpers/project'

// Two columns on a wide monitor (spec story 40): from 1600px the instruments
// split — Drums and Sampler on the left, Bass and Stab on the right — so most
// of the Deck fits on screen at once. Below 1600px the single column stays,
// which the fold spec holds at 1280×720.

async function boxOf(page: Page, name: string) {
  const box = await page.getByRole('region', { name }).boundingBox()
  expect(box, `the ${name} panel has no box`).not.toBeNull()
  return box!
}

test.describe('at 1600×900', () => {
  test.use({ viewport: { width: 1600, height: 900 } })

  test('the Bass panel sits beside the Drums panel, the Stab beside the Sampler', async ({
    page,
  }) => {
    await openFreshDeck(page)

    const drums = await boxOf(page, 'Drum Machine')
    const bass = await boxOf(page, 'Bass Line')
    expect(Math.abs(bass.y - drums.y)).toBeLessThanOrEqual(1)
    expect(bass.x).toBeGreaterThanOrEqual(drums.x + drums.width)

    // Each column is its own stack: the Sampler under the Drums, the Stab
    // under the Bass, whatever the two top panels measure.
    const sampler = await boxOf(page, 'Sampler')
    const stab = await boxOf(page, 'Chord Stab')
    expect(Math.abs(sampler.x - drums.x)).toBeLessThanOrEqual(1)
    expect(sampler.y).toBeGreaterThanOrEqual(drums.y + drums.height)
    expect(Math.abs(stab.x - bass.x)).toBeLessThanOrEqual(1)
    expect(stab.y).toBeGreaterThanOrEqual(bass.y + bass.height)

    // The Master still spans the width, under both columns.
    const master = await boxOf(page, 'Master')
    expect(master.y).toBeGreaterThanOrEqual(
      Math.max(sampler.y + sampler.height, stab.y + stab.height),
    )
    expect(master.width).toBeGreaterThanOrEqual(bass.x + bass.width - drums.x - 1)

    // Two columns must not cost the page a sideways scroll.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('at 1599×900', () => {
  test.use({ viewport: { width: 1599, height: 900 } })

  test('the instruments stay one column', async ({ page }) => {
    await openFreshDeck(page)

    const drums = await boxOf(page, 'Drum Machine')
    const bass = await boxOf(page, 'Bass Line')
    expect(Math.abs(bass.x - drums.x)).toBeLessThanOrEqual(1)
    expect(bass.y).toBeGreaterThan(drums.y + drums.height)
  })
})

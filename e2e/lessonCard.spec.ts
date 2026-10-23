import { expect, test, type Page } from '@playwright/test'
import {
  createDemoProjectState,
  cycleActivePatternStep,
  updateLessonProgress,
} from '../src/model/projectState'
import { seedProjectState, wipeProjectStorage } from './helpers/project'

// The lesson card's layout facts (EB3-04b): the completed strip's height, and
// scroll to spotlight clearing the sticky transport strip. jsdom can't measure
// either.

/** Wait until the stored project has replaced the placeholder deck, fonts and all. */
async function hydrated(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
}

test('entering the filter sweep from the top of the page brings Cutoff into view below the strip', async ({
  page,
}) => {
  await wipeProjectStorage(page)
  await page.goto('/')
  await hydrated(page)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await page.getByRole('button', { name: 'Path' }).click()
  // Clicked by script: Playwright's own click would scroll on its way to a control.
  await page.getByRole('button', { name: /^Lesson 9:/ }).evaluate((b: HTMLElement) => b.click())

  const cutoff = page.locator('.knob.is-spotlit')
  await expect(cutoff.getByRole('slider', { name: 'Cutoff' })).toBeVisible()
  // Smooth: wait for the glide to settle, then measure.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await expect(cutoff).toBeInViewport({ ratio: 1 })
  const strip = await page.getByRole('region', { name: 'Transport' }).boundingBox()
  const knob = await cutoff.boundingBox()
  expect(knob!.y).toBeGreaterThanOrEqual(strip!.y + strip!.height)
})

test('an earned lesson opens as a slim strip with Next ▸ and Reopen', async ({ page }) => {
  let state = createDemoProjectState()
  for (const step of [0, 4, 8, 12]) state = cycleActivePatternStep(state, 'kick', step)
  await seedProjectState(page, updateLessonProgress(state, 'four-on-the-floor', { completed: true }))
  await page.goto('/')
  await hydrated(page)

  const card = page.getByRole('complementary', { name: 'Lesson' })
  await expect(card.getByRole('button', { name: 'Next lesson: Offbeat Hats' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Reopen lesson' })).toBeVisible()
  const box = await card.boundingBox()
  expect(box!.height).toBeLessThanOrEqual(48)
})

import { expect, test, type Page } from '@playwright/test'
import { wipeProjectStorage } from './helpers/project'

// The fold guarantee (spec story 24): on a fresh load at 1280×720, Play, the
// tempo and all five drum lanes are on screen before anything is scrolled.
// The viewport is the project default in `playwright.config.ts`.
const FOLD_PX = 720

/** Open a fresh project and wait until it is the hydrated deck, fonts and all. */
async function openFreshDeck(page: Page): Promise<void> {
  await wipeProjectStorage(page)
  await page.goto('/')
  // The Share menu opens only once the stored project has replaced the
  // placeholder, so an enabled trigger means the deck is the real one.
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeEnabled()
  // Line wraps depend on the webfonts; measure after they have swapped in.
  await page.evaluate(() => document.fonts.ready)
}

function drumLanes(page: Page) {
  return page.getByRole('region', { name: 'Drum Machine' }).locator('.step-row')
}

test('a fresh project shows Play, the tempo and all five drum lanes above the fold', async ({
  page,
}) => {
  await openFreshDeck(page)

  // The fresh-project scenario the budget was measured in: lesson 1's card open.
  await expect(page.getByRole('complementary', { name: 'Lesson' })).toBeVisible()

  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeInViewport()
  await expect(page.getByRole('slider', { name: 'Tempo in beats per minute' })).toBeInViewport()

  await expect(drumLanes(page)).toHaveCount(5)
  const fifth = await drumLanes(page).nth(4).boundingBox()
  expect(fifth, 'the fifth drum lane has no box').not.toBeNull()
  expect(fifth!.y + fifth!.height).toBeLessThanOrEqual(FOLD_PX)
})

test('the transport strip stays pinned while working on the stab, and Play still answers', async ({
  page,
}) => {
  await openFreshDeck(page)

  const keyboard = page.getByRole('group', { name: 'Live stab keyboard' })
  await keyboard.scrollIntoViewIfNeeded()
  await expect(keyboard).toBeInViewport()

  // Measured before any click: Playwright scrolls a control into view before
  // clicking it, which would let a strip that scrolled away pass anyway.
  const strip = page.getByRole('region', { name: 'Transport' })
  const box = await strip.boundingBox()
  expect(box, 'the transport strip has no box').not.toBeNull()
  expect(Math.abs(box!.y)).toBeLessThanOrEqual(1)

  const play = page.getByRole('button', { name: 'Play', exact: true })
  await play.click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // Pressing Play from the strip must not have dragged the page back up to it.
  await expect(keyboard).toBeInViewport()
})

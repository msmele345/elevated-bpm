import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  DEFAULT_ARC_ID,
  createDemoProjectState,
  cycleActivePatternStep,
  enterLesson,
  toggleActivePatternNoteStep,
} from '../src/model/projectState'
import { openFreshDeck, seedProjectState } from './helpers/project'

// Phone reflow (EB3-06, WCAG 1.4.10): nothing on the Deck scrolls the page
// sideways from 320px up. jsdom can't lay anything out, so the claim is held
// here, in a real browser, at the two widths the issue names.

const PHONES = [
  { name: '390×844', width: 390, height: 844 },
  { name: '320×640', width: 320, height: 640 },
]

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The 16 step buttons of the lane's `.step-grid`, as boxes in step order. */
async function stepBoxes(grid: Locator): Promise<Box[]> {
  return grid.locator('.step').evaluateAll((steps) =>
    steps.map((el) => {
      const { x, y, width, height } = el.getBoundingClientRect()
      return { x, y, width, height }
    }),
  )
}

/**
 * One lane, wrapped: 16 steps in two rows of 8 under its header line, every
 * step one width, step n over step n + 8, and quads whole.
 */
async function expectWrappedLane(row: Locator): Promise<void> {
  const name = (await row.locator('.lane-label').innerText()).split('\n')[0]
  const label = await row.locator('.lane-label').boundingBox()
  const steps = await stepBoxes(row.locator('.step-grid'))
  expect(steps, `${name}: 16 steps`).toHaveLength(16)

  // Two rows: 1–8 share one line, 9–16 the next, the header above both.
  const first = steps.slice(0, 8)
  const second = steps.slice(8)
  for (const step of first) expect(Math.abs(step.y - first[0].y), name).toBeLessThanOrEqual(1)
  for (const step of second) expect(Math.abs(step.y - second[0].y), name).toBeLessThanOrEqual(1)
  expect(second[0].y, `${name}: second row below the first`).toBeGreaterThan(
    first[0].y + first[0].height - 1,
  )
  expect(label!.y + label!.height, `${name}: header above the steps`).toBeLessThanOrEqual(
    first[0].y + 1,
  )

  // Step n sits directly over step n + 8, and every step is one width.
  for (let i = 0; i < 8; i++) {
    expect(Math.abs(first[i].x - second[i].x), `${name}: step ${i + 1} over ${i + 9}`)
      .toBeLessThanOrEqual(1)
  }
  for (const step of steps) {
    expect(Math.abs(step.width - steps[0].width), `${name}: equal widths`).toBeLessThanOrEqual(1)
  }

  // Quads stay whole: the gap inside a group is the small one, and the
  // wider gap falls after step 4 in each row, between steps 4 and 5.
  for (const r of [first, second]) {
    const gap = (i: number) => r[i + 1].x - (r[i].x + r[i].width)
    expect(gap(3), `${name}: quad gap after step 4`).toBeGreaterThan(gap(0) + 3)
    expect(Math.abs(gap(0) - gap(1)), `${name}: even gaps inside a quad`).toBeLessThanOrEqual(1)
    expect(Math.abs(gap(1) - gap(2)), `${name}: even gaps inside a quad`).toBeLessThanOrEqual(1)
    expect(Math.abs(gap(4) - gap(5)), `${name}: even gaps inside a quad`).toBeLessThanOrEqual(1)
  }

  // Nothing but the 16 steps leaks past the right edge of the grid.
  const grid = await row.locator('.step-grid').boundingBox()
  for (const step of steps) expect(step.x + step.width).toBeLessThanOrEqual(grid!.x + grid!.width + 1)
}

/** How far the document's scrollable width runs past the viewport, in px. */
function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

/**
 * How far an overlay's content runs past the viewport, in px: its own
 * scrollable width, or the right edge of the widest thing drawn inside it. A
 * fixed overlay never widens the document, so the page check alone would pass
 * a finale whose card spills off the screen. Fixed decoration (the finale's
 * light bloom is deliberately larger than the screen) never scrolls anything,
 * so it is not content.
 */
function overlayOverflow(page: Page, selector: string): Promise<number> {
  return page.evaluate((root) => {
    const overlay = document.querySelector(root)
    if (!overlay) throw new Error(`no ${root} on the page`)
    const limit = document.documentElement.clientWidth
    let right = overlay.getBoundingClientRect().right
    overlay.querySelectorAll('*').forEach((el) => {
      if (getComputedStyle(el).position === 'fixed') return
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      right = Math.max(right, box.right)
    })
    return Math.max(right - limit, overlay.scrollWidth - overlay.clientWidth)
  }, selector)
}

/** A capstone one edit short, with the lesson on screen: the last stab note is missing. */
function capstoneOneEditShort() {
  let state = createDemoProjectState()
  for (const step of [0, 4, 8, 12]) state = cycleActivePatternStep(state, 'kick', step)
  state = cycleActivePatternStep(state, 'snare', 4) // the demo already has 13
  state = cycleActivePatternStep(state, 'closedHat', 14) // the demo stops a step short
  for (const step of [0, 3, 6, 9]) state = toggleActivePatternNoteStep(state, 'bass', step)
  state = toggleActivePatternNoteStep(state, 'stab', 0)
  return enterLesson(state, DEFAULT_ARC_ID, 'your-first-techno-groove')
}

for (const phone of PHONES) {
  test.describe(`at ${phone.name}`, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } })

    test('a fresh load never scrolls sideways', async ({ page }) => {
      await openFreshDeck(page)
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
    })

    test('every lane wraps into two rows of 8 under its header line, quads intact', async ({
      page,
    }) => {
      await openFreshDeck(page)

      const lanes = page.locator('.step-row')
      // Five drum lanes, then bass and stab. The fresh deck's pads are empty
      // cards with no lane (EB3-05).
      await expect(lanes).toHaveCount(7)

      for (let lane = 0; lane < 7; lane++) await expectWrappedLane(lanes.nth(lane))
    })

    test('a pad lane wraps like the rest', async ({ page }) => {
      // A pad shows its lane once it has a sound or any programmed step
      // (EB3-05), so one step on an unloaded pad is enough to draw it.
      await seedProjectState(page, cycleActivePatternStep(createDemoProjectState(), 'pad1', 0))
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeEnabled()
      await page.evaluate(() => document.fonts.ready)

      const lanes = page.locator('.sampler-sequencer .step-row')
      await expect(lanes).toHaveCount(1)
      await expectWrappedLane(lanes.first())
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
    })

    test('a drum lane keeps its label, M, S and Level on one line', async ({ page }) => {
      await openFreshDeck(page)

      const lanes = page.getByRole('region', { name: 'Drum Machine' }).locator('.step-row')
      await expect(lanes).toHaveCount(5)
      for (let lane = 0; lane < 5; lane++) {
        const header = lanes.nth(lane).locator('.lane-label')
        const parts = [
          header.locator('.lane-led'),
          header.getByRole('button', { name: /^Mute / }),
          header.getByRole('button', { name: /^Solo / }),
          header.getByRole('slider', { name: / Level$/ }),
        ]
        const centers: number[] = []
        for (const part of parts) {
          const box = await part.boundingBox()
          expect(box, 'a header control has no box').not.toBeNull()
          centers.push(box!.y + box!.height / 2)
        }
        const headerBox = await header.boundingBox()
        // One line: the controls' centres agree to within the Level dial's own
        // height, and the header is no taller than that dial with its readout.
        expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(16)
        expect(headerBox!.height).toBeLessThanOrEqual(48)
      }
    })

    test('the transport strip is at most two rows and stays pinned', async ({ page }) => {
      await openFreshDeck(page)

      const strip = page.getByRole('region', { name: 'Transport' })
      const controls = [
        page.getByRole('button', { name: 'Play', exact: true }),
        page.getByRole('slider', { name: 'Tempo in beats per minute' }),
        strip.locator('.transport-bpm'),
        strip.getByRole('slider', { name: /swing/i }),
      ]
      const rows: number[] = []
      for (const control of controls) {
        const box = await control.boundingBox()
        expect(box, 'a transport control has no box').not.toBeNull()
        const centre = box!.y + box!.height / 2
        if (!rows.some((row) => Math.abs(row - centre) <= 10)) rows.push(centre)
      }
      expect(rows.length).toBeLessThanOrEqual(2)

      // Every scroll target clears --transport-strip-h, so the strip must fit it.
      const height = (await strip.boundingBox())!.height
      const reserved = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--transport-strip-h')),
      )
      expect(height).toBeLessThanOrEqual(reserved + 1)

      // Sticky: scrolled to the very bottom, it is still at the top of the screen.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      const pinned = await strip.boundingBox()
      expect(Math.abs(pinned!.y)).toBeLessThanOrEqual(1)
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeInViewport()
    })

    test('the region editor fits the screen', async ({ page }) => {
      await openFreshDeck(page)
      await page.getByRole('button', { name: /^Chop / }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()

      expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
      expect(await overlayOverflow(page, '.region-editor')).toBeLessThanOrEqual(0)
    })

    test('the finale fits the screen', async ({ page }) => {
      await seedProjectState(page, capstoneOneEditShort())
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeEnabled()
      await page.evaluate(() => document.fonts.ready)
      // Reloading an already-complete project never opens the finale, so this
      // is the deck one edit short of it.
      await expect(page.getByRole('dialog')).toHaveCount(0)

      // The last edit goes through the UI: the finale opens only on the
      // incomplete → complete transition.
      await page.getByRole('region', { name: 'Chord Stab' }).getByRole('button', { name: /^Stab step 5,/ }).click()
      await expect(page.getByRole('dialog', { name: /made techno/i })).toBeVisible()

      expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
      expect(await overlayOverflow(page, '.finale')).toBeLessThanOrEqual(0)
    })
  })
}

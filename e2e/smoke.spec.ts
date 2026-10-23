import { expect, test } from '@playwright/test'
import { createDemoProjectState, setTransportBpm } from '../src/model/projectState'
import { DEFAULT_BPM } from '../src/model/transport'
import { seedProjectState, wipeProjectStorage } from './helpers/project'

// Layout seam, smoke level: a real browser against the production build. It
// proves the suite works; the fold and pinned-transport checks live in fold.spec.ts.
test('a fresh project renders with Play visible at 1280×720', async ({ page }) => {
  // A fresh browser context is already empty, so save a project first. The wipe
  // then has something to remove, and the default tempo proves it did.
  await seedProjectState(page, setTransportBpm(createDemoProjectState(), 137))
  await wipeProjectStorage(page)
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Tempo in beats per minute' })).toHaveValue(
    String(DEFAULT_BPM),
  )
})

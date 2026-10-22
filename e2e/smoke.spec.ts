import { expect, test } from '@playwright/test'
import { wipeProjectStorage } from './helpers/project'

// Layout seam, smoke level: a real browser against the production build. It
// proves the harness works; EB3-03b adds the fold assertion on top of it.
test('a fresh project renders with Play visible at 1280×720', async ({ page }) => {
  await wipeProjectStorage(page)
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

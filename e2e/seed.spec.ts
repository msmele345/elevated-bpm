import { expect, test } from '@playwright/test'
import { createDemoProjectState, setTransportBpm } from '../src/model/projectState'
import { seedProjectState } from './helpers/project'

// Self-check of the seed helper. The seeded tempo is not the shipped default,
// so the app can only show it by loading the document this test wrote.
test('a seeded project opens on the seeded tempo', async ({ page }) => {
  await seedProjectState(page, setTransportBpm(createDemoProjectState(), 137))
  await page.goto('/')

  await expect(page.getByRole('slider', { name: 'Tempo in beats per minute' })).toHaveValue('137')
})

import { expect, type Page } from '@playwright/test'
import type { ProjectState } from '../../src/model/projectState'
import { DB_NAME, DB_VERSION, STORES } from '../../src/storage/db'
import { CURRENT_KEY } from '../../src/storage/projectStore'

/**
 * Persisted-state helpers for the layout seam. They write the app's IndexedDB
 * directly, so a test can start from a known project. They never stub app code.
 *
 * The writes run on a static asset, not on the app. The app autosaves 400 ms
 * after an edit, and a save that lands after the test's write would silently
 * replace it. Written from here, the database is in place before the app opens it.
 */

/** A file the production build serves from the app's origin, which never runs the app. */
const QUIET_PATH = '/samples/kick-909.wav'

/** Open a fresh project and wait until it is the hydrated deck, fonts and all. */
export async function openFreshDeck(page: Page): Promise<void> {
  await wipeProjectStorage(page)
  await page.goto('/')
  // The Share menu opens only once the stored project has replaced the
  // placeholder, so an enabled trigger means the deck is the real one.
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeEnabled()
  // Line wraps depend on the webfonts; measure after they have swapped in.
  await page.evaluate(() => document.fonts.ready)
}

/** Empty the database, so the next load of the app starts a fresh project. */
export async function wipeProjectStorage(page: Page): Promise<void> {
  await resetDatabase(page)
}

/** Save `state` as the project, so the next load of the app opens on it. */
export async function seedProjectState(page: Page, state: ProjectState): Promise<void> {
  await resetDatabase(page, state)
}

/** Delete the database, then, if given a state, save it into a fresh one. */
async function resetDatabase(page: Page, state?: ProjectState): Promise<void> {
  await page.goto(QUIET_PATH)
  await page.evaluate(
    async ({ name, version, storeNames, projectStore, key, state }) => {
      // Resolve with a request's result, or reject with its error.
      const settle = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })

      // A blocked delete would wait for another connection to close. None of the
      // suite's pages holds one: the app opens the database once per call.
      await settle(indexedDB.deleteDatabase(name))
      if (state === null) return

      // The upgrade creates every store, as the app's own upgrade lays them out.
      const opening = indexedDB.open(name, version)
      opening.onupgradeneeded = () => {
        for (const store of storeNames) opening.result.createObjectStore(store)
      }
      const db = await settle(opening)
      try {
        const transaction = db.transaction(projectStore, 'readwrite')
        transaction.objectStore(projectStore).put(state, key)
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        })
      } finally {
        db.close()
      }
    },
    {
      name: DB_NAME,
      version: DB_VERSION,
      storeNames: Object.values(STORES),
      projectStore: STORES.project,
      key: CURRENT_KEY,
      state: state ?? null,
    },
  )
}

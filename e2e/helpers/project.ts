import type { Page } from '@playwright/test'
import type { ProjectState } from '../../src/model/projectState'
import { DB_NAME, DB_VERSION, STORES } from '../../src/storage/db'
import { CURRENT_KEY } from '../../src/storage/projectStore'

/**
 * Persisted-state helpers for the browser suite. They write the app's IndexedDB
 * directly, so a test can start from a known project. They never stub app code.
 *
 * The writes run on a static asset, not on the app. The app autosaves 400 ms
 * after an edit, and a save that lands after the test's write would silently
 * replace it. Written from here, the database is in place before the app opens it.
 */

/** A file the production build serves from the app's origin, which never runs the app. */
const QUIET_PATH = '/samples/kick-909.wav'

/** Empty the database, so the next load of the app starts a fresh project. */
export async function wipeProjectStorage(page: Page): Promise<void> {
  await replaceDatabase(page, null)
}

/** Save `state` as the project, so the next load of the app opens on it. */
export async function seedProjectState(page: Page, state: ProjectState): Promise<void> {
  await replaceDatabase(page, state)
}

async function replaceDatabase(page: Page, state: ProjectState | null): Promise<void> {
  await page.goto(QUIET_PATH)
  await page.evaluate(
    async ({ name, version, storeNames, projectStore, key, saved }) => {
      // Delete first, so the database is recreated at `version` with every store
      // the app's own upgrade would lay down.
      await new Promise<void>((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase(name)
        deletion.onsuccess = () => resolve()
        deletion.onerror = () => reject(deletion.error)
        deletion.onblocked = () => reject(new Error(`${name} is held open by another connection`))
      })
      if (saved === null) return

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const opening = indexedDB.open(name, version)
        opening.onupgradeneeded = () => {
          for (const store of storeNames) opening.result.createObjectStore(store)
        }
        opening.onsuccess = () => resolve(opening.result)
        opening.onerror = () => reject(opening.error)
      })
      try {
        const write = db.transaction(projectStore, 'readwrite')
        write.objectStore(projectStore).put(saved, key)
        await new Promise<void>((resolve, reject) => {
          write.oncomplete = () => resolve()
          write.onerror = () => reject(write.error)
          write.onabort = () => reject(write.error)
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
      saved: state,
    },
  )
}

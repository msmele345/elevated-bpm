import { migrateProjectState, type ProjectState } from '../model/projectState'
import { STORES, withStore } from './db'

/**
 * IndexedDB persistence for the single current ProjectState document.
 * The store is deliberately deep: callers see save/load of a typed document;
 * database plumbing, versioning, and migration stay behind this interface.
 *
 * The database itself — its name, its version, and the stores it carries — is
 * shared with the sampler's audio and lives in `db.ts`, because IndexedDB
 * allows one version per database and two modules disagreeing about it fails
 * outright.
 */

const CURRENT_KEY = 'current'

/** Persist the current document, replacing any previous save. */
export async function saveProjectState(state: ProjectState): Promise<void> {
  await withStore(STORES.project, 'readwrite', (store) => store.put(state, CURRENT_KEY))
}

/**
 * Load the saved document, migrated to the current version.
 * Resolves null when nothing usable is saved (first run, or corrupt data).
 */
export async function loadProjectState(): Promise<ProjectState | null> {
  const raw = await withStore<unknown>(STORES.project, 'readonly', (store) =>
    store.get(CURRENT_KEY),
  )
  return migrateProjectState(raw)
}

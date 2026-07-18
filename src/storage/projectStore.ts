import { migrateProjectState, type ProjectState } from '../model/projectState'

/**
 * IndexedDB persistence for the single current ProjectState document.
 * The store is deliberately deep: callers see save/load of a typed document;
 * database plumbing, versioning, and migration stay behind this interface.
 */

const DB_NAME = 'elevated-bpm'
const DB_VERSION = 1
const STORE_NAME = 'project'
const CURRENT_KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

/** Persist the current document, replacing any previous save. */
export async function saveProjectState(state: ProjectState): Promise<void> {
  await withStore('readwrite', (store) => store.put(state, CURRENT_KEY))
}

/**
 * Load the saved document, migrated to the current version.
 * Resolves null when nothing usable is saved (first run, or corrupt data).
 */
export async function loadProjectState(): Promise<ProjectState | null> {
  const raw = await withStore<unknown>('readonly', (store) => store.get(CURRENT_KEY))
  return migrateProjectState(raw)
}

/**
 * The one IndexedDB database the app opens, and the one place its version
 * lives.
 *
 * Two modules now keep data here — the project document and the sampler's
 * audio — and IndexedDB allows exactly one version per database: a module that
 * opened at an older version than the one on disk fails outright with a
 * `VersionError`. So the version is not a detail of either store; it belongs
 * here, above both.
 *
 * The upgrade handler is deliberately **additive**: it creates only the stores
 * that are missing. A returning user's saved beat lives in `project`, and
 * recreating that store to add the audio ones beside it would silently throw
 * their work away.
 */

const DB_NAME = 'elevated-bpm'

/** v1 held the project document alone; v2 adds the sampler's slices and sources. */
const DB_VERSION = 2

export const STORES = {
  project: 'project',
  /** Rendered audio per committed region. Precious: never evicted. */
  slices: 'slices',
  /** Original uploaded or recorded bytes. Expendable under storage pressure. */
  sources: 'sources',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Run one request against one store and resolve its result. The database is
 * opened and closed per call: these are user-paced writes, not a hot path, and
 * holding a connection open would block a later version upgrade.
 */
export async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(name, mode).objectStore(name))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

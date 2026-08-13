import type { Slice } from '../model/slice'
import { STORES, withStore } from './db'

/**
 * The sampler's audio, kept beside the project document but deliberately apart
 * from it: `ProjectState` holds identifiers only, which is what keeps it JSON,
 * diffable, migratable and cheap to autosave on a trailing debounce.
 *
 * The store is two-part, and the halves are not equal:
 *
 * - **Slices** — the rendered audio for a committed region. Small, and required
 *   to make sound. Precious: never evicted.
 * - **Sources** — the original uploaded or recorded bytes. Large, and required
 *   only to *re-edit* a region. Expendable: dropped first under pressure.
 *
 * That split is not a preference. A six-minute stereo track decodes to roughly
 * 127 MB while its compressed file is around 6 MB, so what is worth keeping and
 * what is worth reclaiming are genuinely different things.
 *
 * Like `projectStore`, the interface is deep: callers save and load typed
 * values, and database plumbing stays behind it.
 */

/** A stored slice is the rendered value itself — `Int16Array` clones as-is. */
export async function saveSlice(key: string, slice: Slice): Promise<void> {
  await withStore(STORES.slices, 'readwrite', (store) => store.put(slice, key))
}

/**
 * The audio for one committed region, or nothing when it is gone. Startup
 * touches only this: stored PCM wraps straight into a playable buffer, with no
 * decode anywhere on the load path.
 */
export function loadSlice(key: string): Promise<Slice | undefined> {
  return withStore<Slice | undefined>(STORES.slices, 'readonly', (store) => store.get(key))
}

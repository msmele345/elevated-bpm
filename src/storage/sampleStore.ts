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

/**
 * A stored source: the bytes exactly as they arrived, plus when they arrived.
 * Compressed audio, so a six-minute track is a few megabytes here rather than
 * the hundred-plus its decoded form would be — and nothing decodes it until an
 * editor opens it or a region is committed out of it.
 */
interface StoredSource {
  bytes: Blob
  storedAt: number
}

/** Keep a source's bytes so its chops stay re-editable. */
export async function saveSource(id: string, bytes: Blob): Promise<void> {
  const record: StoredSource = { bytes, storedAt: Date.now() }
  await withStore(STORES.sources, 'readwrite', (store) => store.put(record, id))
}

/** A source's bytes, or nothing when they were never kept or have been reclaimed. */
export async function loadSource(id: string): Promise<Blob | undefined> {
  const record = await withStore<StoredSource | undefined>(STORES.sources, 'readonly', (store) =>
    store.get(id),
  )
  return record?.bytes
}

/**
 * Reclaim a source's bytes. Slices are untouched by construction — they live in
 * a different store — which is what makes deleting a source cost re-editability
 * and never sound.
 */
export async function deleteSource(id: string): Promise<void> {
  await withStore(STORES.sources, 'readwrite', (store) => store.delete(id))
}

/** What a document still points at: slice keys across all its pads, and its sources. */
export interface AudioReferences {
  sliceKeys: ReadonlySet<string>
  sourceIds: ReadonlySet<string>
}

/**
 * Drop every slice and source the document does not reference.
 *
 * The feature makes orphans three ways — re-chopping a pad, clearing or
 * reassigning one, and loading audio inside a share preview that is then
 * abandoned — and the third is why this runs at load rather than at write. A
 * write-time view of "what is referenced" can be wrong: audio written during a
 * preview is referenced only by a document that is never persisted. At load
 * there is exactly one authoritative document, so one sweep is enough.
 *
 * The caller's reference set must be collected across all four pads before any
 * deletion, because one source legitimately backs several of them.
 */
export async function collectUnreferencedAudio(
  references: AudioReferences,
): Promise<{ slices: number; sources: number }> {
  return {
    slices: await collectStore(STORES.slices, references.sliceKeys),
    sources: await collectStore(STORES.sources, references.sourceIds),
  }
}

async function collectStore(
  name: typeof STORES.slices | typeof STORES.sources,
  referenced: ReadonlySet<string>,
): Promise<number> {
  const keys = await withStore<IDBValidKey[]>(name, 'readonly', (store) => store.getAllKeys())
  const orphans = keys.filter((key) => !referenced.has(String(key)))
  for (const key of orphans) {
    await withStore(name, 'readwrite', (store) => store.delete(key))
  }
  return orphans.length
}

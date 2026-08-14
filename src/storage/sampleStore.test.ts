import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { renderSlice, sliceKey, type RenderableAudio } from '../model/slice'
import { CURATED_SAMPLE_SOURCE, type SampleRegion } from '../model/sampler'
import {
  addSource,
  commitRegionToSamplerPad,
  createInitialProjectState,
  referencedAudio,
} from '../model/projectState'
import {
  collectUnreferencedAudio,
  deleteSource,
  loadSlice,
  loadSlicesFor,
  loadSource,
  loadStoredAudio,
  saveSlice,
  saveSliceWithinQuota,
  saveSource,
} from './sampleStore'

beforeEach(() => {
  // Fresh database per test.
  indexedDB = new IDBFactory()
})

/** Buffer-shaped, so a slice can be rendered without a browser or a decoder. */
function sourceFake(seconds: number, sampleRate = 100): RenderableAudio {
  const length = Math.round(seconds * sampleRate)
  return {
    sampleRate,
    length,
    numberOfChannels: 2,
    getChannelData: () => Float32Array.from({ length }, (_, frame) => Math.sin(frame) * 0.5),
  }
}

const REGION: SampleRegion = { sourceId: 'upload-1', start: 0.2, duration: 0.5 }

describe('sampleStore slices', () => {
  it('gives back a stored slice exactly, so a reload needs no decode', async () => {
    const slice = renderSlice(sourceFake(2), REGION)
    await saveSlice(sliceKey(REGION), slice)

    await expect(loadSlice(sliceKey(REGION))).resolves.toEqual(slice)
  })
})

describe('sampleStore missing audio', () => {
  it('resolves a dangling reference to nothing rather than throwing', async () => {
    // Share links produce this state by design, so it is a value the deck can
    // hold — never an error that could stop it loading.
    await expect(loadSlice(sliceKey(REGION))).resolves.toBeUndefined()
    await expect(loadSource('never-stored')).resolves.toBeUndefined()
  })

  it('keeps every slice sounding when a source is deleted', async () => {
    // Housekeeping must never be audible: dropping the original costs
    // re-editability and nothing else.
    const slice = renderSlice(sourceFake(2), REGION)
    await saveSlice(sliceKey(REGION), slice)
    await saveSource('upload-1', new Blob([Uint8Array.of(9)]))

    await deleteSource('upload-1')

    await expect(loadSource('upload-1')).resolves.toBeUndefined()
    await expect(loadSlice(sliceKey(REGION))).resolves.toEqual(slice)
  })
})

describe('loading a document’s audio', () => {
  it('gives every chopped pad its slice, and says what is reachable', async () => {
    const uploaded = {
      id: 'upload-1',
      name: 'Warehouse Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    const state = commitRegionToSamplerPad(
      addSource(createInitialProjectState(), uploaded),
      'pad2',
      REGION,
    )
    const slice = renderSlice(sourceFake(2), REGION)
    await saveSlice(sliceKey(REGION), slice)
    await saveSource('upload-1', new Blob([Uint8Array.of(1)]))

    const audio = await loadStoredAudio(state)

    expect(audio.padSlices).toEqual([['pad2', slice]])
    expect(audio.available.slices).toEqual(new Set([sliceKey(REGION)]))
    // The shipped source's bytes were never stored — it is a static asset the
    // app can always fetch again — so it is reachable without costing quota.
    expect(audio.available.sources).toEqual(
      new Set(['upload-1', CURATED_SAMPLE_SOURCE.id]),
    )
  })

  it('leaves a pad without a stored slice out, rather than failing the load', async () => {
    const state = commitRegionToSamplerPad(createInitialProjectState(), 'pad1', {
      sourceId: CURATED_SAMPLE_SOURCE.id,
      start: 0,
      duration: 0.2,
    })

    const audio = await loadStoredAudio(state)

    expect(audio.padSlices).toEqual([])
    expect(audio.available.slices.size).toBe(0)
  })

  it('gathers named slices for a bundle, omitting the ones that are gone', async () => {
    // What a bundle is assembled from. A key with nothing behind it is left out
    // rather than faked, so the caller can see a pad has lost its audio and
    // refuse to write a bundle it would itself refuse to open.
    const other: SampleRegion = { sourceId: 'upload-1', start: 1, duration: 0.5 }
    const slice = renderSlice(sourceFake(2), REGION)
    await saveSlice(sliceKey(REGION), slice)

    const gathered = await loadSlicesFor([sliceKey(REGION), sliceKey(other)])

    expect(gathered).toEqual(new Map([[sliceKey(REGION), slice]]))
  })
})

describe('sampleStore quota policy', () => {
  /**
   * A browser out of room. Writes are refused until `freeAfter` sources have
   * been given up, which is the only way the app can make space — fake-indexeddb
   * has no quota of its own to run into.
   */
  function outOfRoomUntil(freeAfter: number): () => void {
    const put = IDBObjectStore.prototype.put
    const remove = IDBObjectStore.prototype.delete
    let freed = 0
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: never[]) {
      if (freed < freeAfter) throw new DOMException('no room', 'QuotaExceededError')
      return put.apply(this, args as never)
    }
    IDBObjectStore.prototype.delete = function (this: IDBObjectStore, ...args: never[]) {
      if (this.name === 'sources') freed += 1
      return remove.apply(this, args as never)
    }
    return () => {
      IDBObjectStore.prototype.put = put
      IDBObjectStore.prototype.delete = remove
    }
  }

  async function storeTwoSources(): Promise<void> {
    await saveSource('small', new Blob([new Uint8Array(10)]))
    await saveSource('large', new Blob([new Uint8Array(5000)]))
  }

  it('makes room by giving up a source, then keeps the chop', async () => {
    await storeTwoSources()
    const slice = renderSlice(sourceFake(2), REGION)
    const restore = outOfRoomUntil(1)

    const outcome = await saveSliceWithinQuota(sliceKey(REGION), slice)
    restore()

    expect(outcome).toEqual({ status: 'saved', evicted: ['large'] })
    await expect(loadSlice(sliceKey(REGION))).resolves.toEqual(slice)
    // Largest first: one eviction that frees the most room costs the user the
    // fewest sounds to re-edit.
    await expect(loadSource('large')).resolves.toBeUndefined()
    await expect(loadSource('small')).resolves.toBeDefined()
  })

  it('never gives up a slice to make room, and says so only once evicting has failed', async () => {
    // Slices are what make sound. A pad that went quiet to save space would be
    // housekeeping the user can hear.
    const kept: SampleRegion = { sourceId: 'upload-9', start: 0, duration: 0.3 }
    const keptSlice = renderSlice(sourceFake(2), kept)
    await saveSlice(sliceKey(kept), keptSlice)
    await storeTwoSources()
    const restore = outOfRoomUntil(Number.POSITIVE_INFINITY)

    const outcome = await saveSliceWithinQuota(sliceKey(REGION), renderSlice(sourceFake(2), REGION))
    restore()

    expect(outcome).toEqual({ status: 'full', evicted: ['large', 'small'] })
    await expect(loadSlice(sliceKey(kept))).resolves.toEqual(keptSlice)
  })

  it('leaves storage alone when a write succeeds', async () => {
    await storeTwoSources()

    const outcome = await saveSliceWithinQuota(sliceKey(REGION), renderSlice(sourceFake(2), REGION))

    expect(outcome).toEqual({ status: 'saved', evicted: [] })
    await expect(loadSource('large')).resolves.toBeDefined()
  })

  it('will not spend the user’s own audio on a beat they are only previewing', async () => {
    // Eviction cannot be undone, and backing out of a preview has to be free.
    // So a shared beat writes only into room that is already there: no room
    // means the pad sounds now and says it will not survive a reload — never
    // that someone else's beat cost the recipient a sound of their own.
    await storeTwoSources()
    const restore = outOfRoomUntil(Number.POSITIVE_INFINITY)

    const outcome = await saveSliceWithinQuota(
      sliceKey(REGION),
      renderSlice(sourceFake(2), REGION),
      { mayEvictSources: false },
    )
    restore()

    expect(outcome).toEqual({ status: 'full', evicted: [] })
    await expect(loadSource('large')).resolves.toBeDefined()
    await expect(loadSource('small')).resolves.toBeDefined()
  })
})

describe('sampleStore orphan collection', () => {
  it('drops audio the document no longer references and keeps what it does', async () => {
    // Re-chopping a pad, clearing one, and loading audio inside an abandoned
    // share preview all leave audio behind that nothing points at. One sweep,
    // at the one moment the referencing document is authoritative.
    const kept = renderSlice(sourceFake(2), REGION)
    const orphan: SampleRegion = { sourceId: 'upload-2', start: 1, duration: 0.25 }
    await saveSlice(sliceKey(REGION), kept)
    await saveSlice(sliceKey(orphan), renderSlice(sourceFake(2), orphan))
    await saveSource('upload-1', new Blob([Uint8Array.of(1)]))
    await saveSource('upload-2', new Blob([Uint8Array.of(2)]))

    await collectUnreferencedAudio({
      sliceKeys: new Set([sliceKey(REGION)]),
      sourceIds: new Set(['upload-1']),
    })

    await expect(loadSlice(sliceKey(REGION))).resolves.toEqual(kept)
    await expect(loadSource('upload-1')).resolves.toBeDefined()
    await expect(loadSlice(sliceKey(orphan))).resolves.toBeUndefined()
    await expect(loadSource('upload-2')).resolves.toBeUndefined()
  })

  it('collects a bundle preview that was backed out of, against the recipient’s own document', async () => {
    // The sharp case, in the terms the deck actually meets it: a bundle writes
    // its audio during a preview, so if the recipient hands it back it is
    // referenced by nothing at all. The sweep must read *their* document — the
    // previewed one is not authoritative, and sweeping against it would delete
    // the recipient's audio instead of the stranded audio.
    const uploaded = {
      id: 'upload-1',
      name: 'My Break',
      origin: 'upload' as const,
      duration: 4,
      channels: 2,
    }
    const recipient = commitRegionToSamplerPad(
      addSource(createInitialProjectState(), uploaded),
      'pad2',
      REGION,
    )
    const fromBundle: SampleRegion = { sourceId: 'upload-sender', start: 0, duration: 1 }
    const mine = renderSlice(sourceFake(2), REGION)
    await saveSlice(sliceKey(REGION), mine)
    await saveSource('upload-1', new Blob([Uint8Array.of(1)]))
    await saveSlice(sliceKey(fromBundle), renderSlice(sourceFake(2), fromBundle))

    await collectUnreferencedAudio(referencedAudio(recipient))

    expect(await loadSlice(sliceKey(fromBundle))).toBeUndefined()
    expect(await loadSlice(sliceKey(REGION))).toEqual(mine)
    expect(await loadSource('upload-1')).toBeDefined()
  })
})

describe('sampleStore sources', () => {
  it('gives back stored source bytes, so a chop stays re-editable', async () => {
    await saveSource('upload-1', new Blob([Uint8Array.of(1, 2, 3, 4)], { type: 'audio/wav' }))

    const loaded = await loadSource('upload-1')
    expect(loaded?.type).toBe('audio/wav')
    expect(new Uint8Array((await loaded!.arrayBuffer()) as ArrayBuffer)).toEqual(
      Uint8Array.of(1, 2, 3, 4),
    )
  })
})

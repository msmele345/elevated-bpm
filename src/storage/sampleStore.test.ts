import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { renderSlice, sliceKey, type RenderableAudio } from '../model/slice'
import type { SampleRegion } from '../model/sampler'
import { collectUnreferencedAudio, deleteSource, loadSlice, loadSource, saveSlice, saveSource } from './sampleStore'

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

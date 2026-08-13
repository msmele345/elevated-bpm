import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { renderSlice, sliceKey, type RenderableAudio } from '../model/slice'
import type { SampleRegion } from '../model/sampler'
import { loadSlice, saveSlice } from './sampleStore'

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

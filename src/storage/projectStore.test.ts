import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DEFAULT_BASS_SETTINGS } from '../model/bass'
import { createInitialPattern } from '../model/pattern'
import {
  createInitialProjectState,
  PROJECT_STATE_VERSION,
  setBassParamValue,
  setTransportBpm,
  cycleActivePatternStep,
  type ProjectState,
} from '../model/projectState'
import { loadProjectState, saveProjectState } from './projectStore'
import { saveSlice } from './sampleStore'

beforeEach(() => {
  // Fresh database per test.
  indexedDB = new IDBFactory()
})

describe('projectStore', () => {
  it('round-trips a ProjectState document through IndexedDB', async () => {
    const state = setTransportBpm(
      cycleActivePatternStep(createInitialProjectState(), 'kick', 8),
      124,
    )
    await saveProjectState(state)
    await expect(loadProjectState()).resolves.toEqual(state)
  })

  it('restores a hand-tuned synth patch exactly', async () => {
    // The patch is half the sound of a saved beat: a bassline that comes back
    // with default knobs is not the track the user left.
    const patched = setBassParamValue(
      setBassParamValue(createInitialProjectState(), 'cutoff', 2400),
      'resonance',
      14,
    )
    await saveProjectState(patched)

    const loaded = await loadProjectState()
    expect(loaded?.instrumentSettings.bass).toEqual({
      ...DEFAULT_BASS_SETTINGS,
      cutoff: 2400,
      resonance: 14,
    })
  })

  it('resolves null when nothing has been saved', async () => {
    await expect(loadProjectState()).resolves.toBeNull()
  })

  it('overwrites the previous save (single current document)', async () => {
    const first = createInitialProjectState()
    await saveProjectState(first)
    const second = setTransportBpm(first, 90)
    await saveProjectState(second)
    await expect(loadProjectState()).resolves.toEqual(second)
  })

  it('migrates an older saved document on load', async () => {
    const pattern = createInitialPattern()
    const v0Doc = { version: 0, pattern, bpm: 118 }
    await saveProjectState(v0Doc as unknown as ProjectState)

    const loaded = await loadProjectState()
    expect(loaded?.version).toBe(PROJECT_STATE_VERSION)
    expect(loaded?.patterns).toEqual([pattern])
    expect(loaded?.transport.bpm).toBe(118)
  })

  it('resolves null instead of throwing when the saved document is corrupt', async () => {
    await saveProjectState('garbage' as unknown as ProjectState)
    await expect(loadProjectState()).resolves.toBeNull()
  })

  it('keeps a beat saved by the previous build when the audio stores arrive', async () => {
    // The database the shipped build wrote: one `project` store, at version 1.
    // Adding the sampler's stores means bumping the version, and an upgrade
    // that recreated `project` — or a module still opening at the old version —
    // would cost a returning user everything they had made.
    const saved = setTransportBpm(createInitialProjectState(), 131)
    await writePreviousBuildDatabase(saved)

    await saveSlice('upload-1|0|0.5', { sampleRate: 100, channels: 1, frames: 2, pcm: Int16Array.of(1, 2) })

    await expect(loadProjectState()).resolves.toEqual(saved)
  })
})

/** The v1 database, opened the way the previous build opened it. */
function writePreviousBuildDatabase(state: ProjectState): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('elevated-bpm', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('project')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const put = db.transaction('project', 'readwrite').objectStore('project').put(state, 'current')
      put.onerror = () => reject(put.error)
      put.onsuccess = () => {
        db.close()
        resolve()
      }
    }
  })
}

import { describe, expect, it } from 'vitest'
import { createSampleRegistry } from './sampleRegistry'

const perc = { duration: 0.25 }

describe('sample registry', () => {
  it('hands back the audio registered under a source id', () => {
    const registry = createSampleRegistry()

    registry.register('curated-warehouse-perc', perc)

    expect(registry.get('curated-warehouse-perc')).toBe(perc)
  })

  it('knows nothing about a source that was never registered', () => {
    const registry = createSampleRegistry()

    expect(registry.has('upload-1')).toBe(false)
    expect(registry.get('upload-1')).toBeUndefined()
  })
})

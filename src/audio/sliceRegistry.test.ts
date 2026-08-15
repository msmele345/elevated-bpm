import { describe, expect, it } from 'vitest'
import { createSliceRegistry } from './sliceRegistry'

const chop = { duration: 0.25 }
const otherChop = { duration: 1.1 }

describe('slice registry', () => {
  it('hands back the slice rendered for a pad', () => {
    const slices = createSliceRegistry()

    slices.set('pad1', chop)

    expect(slices.get('pad1')).toBe(chop)
  })

  it('knows nothing about a pad that has never been committed to', () => {
    expect(createSliceRegistry().get('pad3')).toBeUndefined()
  })

  it('replaces a pad’s slice when it is re-chopped, rather than accumulating', () => {
    // Re-chopping is a correction. The previous slice is referenced by nothing
    // once it is replaced, which is the orphan EB2-06 sweeps up on load.
    const slices = createSliceRegistry()

    slices.set('pad2', chop)
    slices.set('pad2', otherChop)

    expect(slices.get('pad2')).toBe(otherChop)
  })

  it('gives a pad back its silence, so a previewed beat leaves nothing behind', () => {
    // The slice — not the region — is what decides whether a pad makes sound.
    // So a deck that swaps documents, as a bundle preview does, has to be able
    // to take a pad's audio away again, or the previous beat's sound plays
    // under the new one's programming.
    const slices = createSliceRegistry()
    slices.set('pad1', chop)

    slices.clear('pad1')

    expect(slices.get('pad1')).toBeUndefined()
  })

  it('keeps pads apart, so two chops of one source do not collide', () => {
    const slices = createSliceRegistry()

    slices.set('pad1', chop)
    slices.set('pad4', otherChop)

    expect(slices.get('pad1')).toBe(chop)
    expect(slices.get('pad4')).toBe(otherChop)
  })
})

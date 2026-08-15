import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShareControls } from './ShareControls'

describe('ShareControls', () => {
  it('makes a shared beat an explicit preview with keep and restore choices', () => {
    const markup = renderToStaticMarkup(
      createElement(ShareControls, {
        previewing: true,
        errorMessage: null,
        shareReady: true,
        isSharing: false,
        isBundling: false,
        sharedUrl: null,
        copied: false,
        degradedNotice: '2 sounds could not travel.',
        onShare: () => undefined,
        onExportBundle: () => undefined,
        onOpenBundle: () => undefined,
        onKeep: () => undefined,
        onRestore: () => undefined,
        onDismissError: () => undefined,
      }),
    )
    const text = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('Shared beat preview')
    expect(text).toContain('Your saved project is untouched')
    expect(text).toContain('Keep this beat')
    expect(text).toContain('Back to my project')
    // What a link could not carry belongs beside the beat it is describing.
    expect(text).toContain('2 sounds could not travel.')
    // Sampling locally is the user's own business; passing the audio on is a
    // product feature, and this is where the product says so.
    expect(text).toContain('only send audio you have the right to share')
  })
})

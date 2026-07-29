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
        sharedUrl: null,
        copied: false,
        onShare: () => undefined,
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
  })
})

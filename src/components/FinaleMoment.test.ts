import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FinaleMoment } from './FinaleMoment'

describe('FinaleMoment', () => {
  it('announces a distinct, dismissible “you made techno” graduation moment', () => {
    const markup = renderToStaticMarkup(createElement(FinaleMoment, { onClose: () => undefined }))
    const text = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(text).toContain('You made techno')
    expect(text).toContain('Keep it rolling')
  })
})

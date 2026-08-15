import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ARCS } from '../lessons'
import { FinaleMoment } from './FinaleMoment'

function render(finale: (typeof ARCS)[number]['finale']) {
  const markup = renderToStaticMarkup(
    createElement(FinaleMoment, { finale, onClose: () => undefined }),
  )
  return { markup, text: markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

describe('FinaleMoment', () => {
  it('announces a distinct, dismissible “you made techno” graduation moment', () => {
    const { markup, text } = render(ARCS[0].finale)

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(text).toContain('You made techno')
    expect(text).toContain('Keep it rolling')
  })

  it('speaks each track’s own ending, and never the other one’s', () => {
    // A second ending that claimed the first one's words would be a lie: the
    // techno arc is what "you made techno" means.
    for (const arc of ARCS) {
      const { text } = render(arc.finale)
      expect(text).toContain(arc.finale.headline)
      expect(text).toContain(arc.finale.close)
      for (const other of ARCS) {
        if (other === arc) continue
        expect(text).not.toContain(other.finale.headline)
      }
    }
  })

  it('keeps the techno graduation the biggest moment on the deck', () => {
    // Finishing a track with nothing at the end reads as an unfinished feature,
    // so the sampling arc gets a real payoff — a deliberately quieter one.
    expect(render(ARCS[0].finale).markup).toContain('data-scale="grand"')
    expect(ARCS.slice(1).every((arc) => arc.finale.scale === 'compact')).toBe(true)
  })
})

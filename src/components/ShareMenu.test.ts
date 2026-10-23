// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { ShareMenu } from './ShareMenu'
import { ShareNotices } from './ShareNotices'

function renderMenu(overrides: Partial<Parameters<typeof ShareMenu>[0]> = {}) {
  return render(
    createElement(
      'div',
      null,
      createElement(ShareMenu, {
        shareReady: true,
        isSharing: false,
        isBundling: false,
        sharedUrl: null,
        copied: false,
        onShare: () => undefined,
        onExportBundle: () => undefined,
        onOpenBundle: () => undefined,
        ...overrides,
      }),
      createElement('button', { type: 'button' }, 'Elsewhere on the deck'),
    ),
  )
}

function trigger(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Share' }) as HTMLButtonElement
}

afterEach(cleanup)

describe('ShareMenu', () => {
  it('folds sharing behind one header button until it is asked for', () => {
    renderMenu()

    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Share beat' })).toBeNull()

    fireEvent.click(trigger())

    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Share beat' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export bundle' })).toBeTruthy()
    expect(screen.getByLabelText('Open a bundle')).toBeTruthy()
    // The copy that used to stand on the deck permanently travels with the menu.
    expect(screen.getByText(/Uploaded audio is far too large for a URL/)).toBeTruthy()
    // Sampling locally is the user's own business; passing the audio on is a
    // product feature, and this is where the product says so.
    expect(screen.getByText(/only send audio you have the right to share/)).toBeTruthy()
  })

  it('waits for the real project before it opens', () => {
    renderMenu({ shareReady: false })

    expect(trigger().disabled).toBe(true)
  })

  it('shows the link it made inside the menu', () => {
    renderMenu({ sharedUrl: 'https://example.test/?p=abc' })
    fireEvent.click(trigger())

    expect(
      (screen.getByLabelText('Copy this share URL') as HTMLInputElement).value,
    ).toBe('https://example.test/?p=abc')
  })

  it('puts itself away on Escape and hands focus back to its button', () => {
    renderMenu()
    fireEvent.click(trigger())
    const share = screen.getByRole('button', { name: 'Share beat' })
    share.focus()

    fireEvent.keyDown(share, { key: 'Escape' })

    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Share beat' })).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('puts itself away when the user presses anywhere else, but not inside it', () => {
    renderMenu()
    fireEvent.click(trigger())

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Share beat' }))
    expect(trigger().getAttribute('aria-expanded')).toBe('true')

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere on the deck' }))
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })
})

describe('ShareNotices', () => {
  it('makes a shared beat an explicit preview with keep and restore choices', () => {
    const markup = renderToStaticMarkup(
      createElement(ShareNotices, {
        previewing: true,
        errorMessage: null,
        degradedNotice: '2 sounds could not travel.',
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
  })

  it('takes no room on the deck when there is nothing to decide', () => {
    const markup = renderToStaticMarkup(
      createElement(ShareNotices, {
        previewing: false,
        errorMessage: null,
        degradedNotice: null,
        onKeep: () => undefined,
        onRestore: () => undefined,
        onDismissError: () => undefined,
      }),
    )

    expect(markup).toBe('')
  })
})

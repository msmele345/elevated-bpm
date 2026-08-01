import type { MouseEvent } from 'react'
import { DECK_SECTIONS } from '../model/deckSections'

/**
 * The keyboard user's way around the deck. Off-screen until focused, then each
 * link surfaces as a hardware-style tab above the panel — Tab, Tab, Enter and
 * you are standing in the bass lane instead of eighty steps upstream.
 *
 * Focus is moved explicitly rather than left to fragment navigation: the target
 * sections carry `tabindex="-1"` so they can hold focus, and skipping a block
 * should not leave a hash on a URL whose query string is the share payload.
 */
export function SkipLinks() {
  const jump = (event: MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    const target = document.getElementById(sectionId)
    if (!target) return
    event.preventDefault()
    target.focus()
    target.scrollIntoView?.({ block: 'start' })
  }

  return (
    <nav className="skip-links" aria-label="Skip to section">
      {DECK_SECTIONS.map((section) => (
        <a
          key={section.id}
          className="skip-link"
          href={`#${section.id}`}
          onClick={(event) => jump(event, section.id)}
        >
          Skip to {section.label.toLowerCase()}
        </a>
      ))}
    </nav>
  )
}

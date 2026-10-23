import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { DECK_SECTION_IDS } from '../model/deckSections'
import { spotlightNeedsScroll, spotlightScrollBehavior } from '../model/spotlightScroll'

/** Every way a control on the deck wears its lesson spotlight ring. */
const SPOTLIT_SELECTOR = '.is-spotlit, [data-spotlit]'

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Bring the first spotlit control under `root` into view, unless it is
 * already wholly visible below the sticky transport strip. A control inside
 * the strip is always on screen, so it never moves the page.
 */
function scrollSpotlightIntoView(root: HTMLElement | null): void {
  const target = root?.querySelector<HTMLElement>(SPOTLIT_SELECTOR)
  if (!target) return
  const strip = document.getElementById(DECK_SECTION_IDS.transport)
  if (strip?.contains(target)) return

  const box = target.getBoundingClientRect()
  const visible = {
    top: Math.max(0, strip?.getBoundingClientRect().bottom ?? 0),
    bottom: window.innerHeight,
  }
  if (!spotlightNeedsScroll(box, visible)) return
  // The scroll itself clears the strip through `scroll-padding-top` on html.
  target.scrollIntoView({ behavior: spotlightScrollBehavior(prefersReducedMotion()), block: 'center' })
}

/**
 * Scroll to spotlight. Entering a lesson asks for a scroll with
 * `requestScroll`, called alongside the edit that enters it; the scroll runs
 * after that edit has rendered, so the new lesson's ring is on screen to find.
 * Nothing else ever sets the request — not hydration, not an edit while the
 * lesson is worked on — so the page never moves under a knob being dragged.
 * `scrollNow` is "Show me": the same scroll, on demand.
 */
export function useSpotlightScroll(rootRef: RefObject<HTMLElement | null>) {
  const pendingRef = useRef(false)

  // No dependency list: a ref check after every commit, so whatever render
  // carries the entered lesson is the one that scrolls.
  useEffect(() => {
    if (!pendingRef.current) return
    pendingRef.current = false
    scrollSpotlightIntoView(rootRef.current)
  })

  const requestScroll = useCallback(() => {
    pendingRef.current = true
  }, [])
  const scrollNow = useCallback(() => scrollSpotlightIntoView(rootRef.current), [rootRef])

  return { requestScroll, scrollNow }
}

/**
 * Scroll to spotlight: the pure rules behind bringing a lesson's spotlit
 * control into view when the lesson is entered. The DOM reading and the scroll
 * itself live with the deck; what "in view" means lives here.
 */

/** The vertical extent of a box, in viewport pixels. */
export interface VerticalSpan {
  top: number
  bottom: number
}

/**
 * True when the spotlit control is not wholly inside the visible band — the
 * part of the viewport below the sticky transport strip. A control half cut
 * off by the fold, or tucked under the strip, still needs bringing into view;
 * one already fully on screen is left exactly where it is.
 */
export function spotlightNeedsScroll(target: VerticalSpan, visible: VerticalSpan): boolean {
  return target.top < visible.top || target.bottom > visible.bottom
}

/** Glide by default; under reduced motion, jump — the page never glides at the learner. */
export function spotlightScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth'
}

import { stabKeyForCode } from './stab'

/**
 * What a track's graduation moment says, and how loudly.
 *
 * Copy per arc rather than hardcoded, because the deck now has more than one
 * path to finish and a second ending that claimed the first one's words would
 * be a lie. `scale` is the only thing the two endings genuinely differ on: the
 * techno arc is the product's spine and its graduation stays the biggest moment
 * on the deck, so anything after it is deliberately quieter.
 */
export interface ArcFinale {
  kicker: string
  /** The small line above the headline, e.g. "You made". */
  lead: string
  headline: string
  copy: string
  /** What the one control out of the moment says. */
  close: string
  scale: 'grand' | 'compact'
}

/** Lights in the step run behind the headline — the grand ending gets a full bar. */
export function finaleStepCount(finale: ArcFinale): number {
  return finale.scale === 'grand' ? 16 : 8
}

interface FinaleKeyInput {
  key: string
  code: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export type FinaleKeyAction = 'close' | 'block' | 'pass'

/**
 * Route keys while the graduation dialog owns the surface. Escape closes it,
 * live-note keys cannot leak through to the instrument behind it, and native
 * button keys/OS shortcuts keep their normal behavior.
 *
 * Tab is held as well: the dialog carries a single control, so containing
 * focus is simply keeping it where it is. That is what makes this a real modal
 * for a keyboard user rather than one they can tab out the back of — and it is
 * only fair to hold focus because Escape always lets go of it.
 */
export function finaleKeyAction(input: FinaleKeyInput): FinaleKeyAction {
  if (input.key === 'Escape') return 'close'
  if (input.metaKey || input.ctrlKey || input.altKey) return 'pass'
  if (input.key === 'Tab') return 'block'
  return stabKeyForCode(input.code) ? 'block' : 'pass'
}

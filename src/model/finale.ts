import { stabKeyForCode } from './stab'

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

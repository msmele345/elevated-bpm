import { stabKeyForCode } from './stab'

interface FinaleKeyInput {
  key: string
  code: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

export type FinaleKeyAction = 'close' | 'block' | 'pass'

/**
 * Route keys while the graduation dialog owns the surface. Escape closes it,
 * live-note keys cannot leak through to the instrument behind it, and native
 * button keys/OS shortcuts keep their normal behavior.
 */
export function finaleKeyAction(input: FinaleKeyInput): FinaleKeyAction {
  if (input.key === 'Escape') return 'close'
  if (input.metaKey || input.ctrlKey || input.altKey) return 'pass'
  return stabKeyForCode(input.code) ? 'block' : 'pass'
}

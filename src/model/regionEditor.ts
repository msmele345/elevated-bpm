import { claimsInstrumentKeys } from './instrumentKeys'
import { padForKeyboardInput } from './sampler'
import { stabKeyForCode } from './stab'

interface RegionEditorKeyInput {
  key: string
  code: string
  target: unknown
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

export type RegionEditorKeyAction = 'close' | 'block' | 'pass'

/**
 * Route keys while the region editor owns the surface.
 *
 * Presenting the editor as a modal dialog is what makes key scoping free:
 * nothing outside it is reachable, so the editor introduces **no new global
 * bindings** and chopping can never fire a stab or a pad underneath it. The
 * instrument's own global listeners still hear the window, which is why they
 * are stopped here rather than trusted to notice the dialog.
 *
 * Two keys are deliberately not ours:
 *
 * - **Space is never bound.** It natively activates a focused button and this
 *   deck has roughly 160 of them, so a shortcut there would double-fire.
 * - **Tab passes through**, because the editor has several controls of its own
 *   to move between. Containing focus is the dialog's job, not this rule's —
 *   and it is only fair to contain it because Escape always lets go.
 *
 * A control that wants letters keeps them, so a text field or a select inside
 * the editor behaves the way it does everywhere else on the deck.
 */
export function regionEditorKeyAction(input: RegionEditorKeyInput): RegionEditorKeyAction {
  if (input.key === 'Escape') return 'close'
  if (input.metaKey || input.ctrlKey || input.altKey) return 'pass'
  if (
    typeof input.target === 'object' &&
    input.target !== null &&
    claimsInstrumentKeys(input.target as Parameters<typeof claimsInstrumentKeys>[0])
  ) {
    return 'pass'
  }
  const playsSomething =
    stabKeyForCode(input.code) !== undefined || padForKeyboardInput(input) !== undefined
  return playsSomething ? 'block' : 'pass'
}

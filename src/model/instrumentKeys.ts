/**
 * Input types that do not consume printable instrument keys themselves.
 * Unknown input types fail toward text entry, so typing is never stolen.
 */
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/** Whether the focused element owns printable keys instead of the instrument. */
export function claimsInstrumentKeys(target: {
  tagName?: unknown
  type?: unknown
  isContentEditable?: unknown
}): boolean {
  if (target.isContentEditable === true) return true
  if (typeof target.tagName !== 'string') return false
  switch (target.tagName.toUpperCase()) {
    case 'TEXTAREA':
    case 'SELECT':
      return true
    case 'INPUT': {
      const type = typeof target.type === 'string' ? target.type.toLowerCase() : 'text'
      return !NON_TEXT_INPUT_TYPES.has(type)
    }
    default:
      return false
  }
}

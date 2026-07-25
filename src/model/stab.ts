export interface StabKey {
  code: string
  label: string
  midi: number
  kind: 'white' | 'black'
}

/**
 * One chromatic octave laid out like the common computer-keyboard piano:
 * A–K are the white keys and W/E/T/Y/U fill in the sharps above them.
 */
export const STAB_KEYS: readonly StabKey[] = [
  { code: 'KeyA', label: 'A', midi: 60, kind: 'white' },
  { code: 'KeyW', label: 'W', midi: 61, kind: 'black' },
  { code: 'KeyS', label: 'S', midi: 62, kind: 'white' },
  { code: 'KeyE', label: 'E', midi: 63, kind: 'black' },
  { code: 'KeyD', label: 'D', midi: 64, kind: 'white' },
  { code: 'KeyF', label: 'F', midi: 65, kind: 'white' },
  { code: 'KeyT', label: 'T', midi: 66, kind: 'black' },
  { code: 'KeyG', label: 'G', midi: 67, kind: 'white' },
  { code: 'KeyY', label: 'Y', midi: 68, kind: 'black' },
  { code: 'KeyH', label: 'H', midi: 69, kind: 'white' },
  { code: 'KeyU', label: 'U', midi: 70, kind: 'black' },
  { code: 'KeyJ', label: 'J', midi: 71, kind: 'white' },
  { code: 'KeyK', label: 'K', midi: 72, kind: 'white' },
]

/** Resolve a physical keyboard key to its on-screen stab key. */
export function stabKeyForCode(code: string): StabKey | undefined {
  return STAB_KEYS.find((key) => key.code === code)
}

interface StabKeyboardInput {
  code: string
  target: unknown
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

/**
 * Input types that have no use for a letter key. Everything else — including
 * an absent or unrecognized type, which the DOM renders as a text field — is
 * treated as text entry, so the guard fails toward leaving typing alone.
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

/**
 * Whether the focused element would itself consume a letter key: text fields
 * and anything editable, plus `select`, whose options answer to type-ahead.
 * A fader, pad, or checkbox does not, so the deck stays playable while one
 * holds focus — nudging the tempo must not silence the instrument.
 */
function claimsLetterKeys(target: {
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

/**
 * Map a global keyboard event only when it belongs to the instrument. Text
 * entry and browser/OS shortcuts keep their native behavior.
 */
export function stabKeyForKeyboardInput(input: StabKeyboardInput): StabKey | undefined {
  if (input.metaKey || input.ctrlKey || input.altKey) return undefined
  if (typeof input.target === 'object' && input.target !== null) {
    if (claimsLetterKeys(input.target as Parameters<typeof claimsLetterKeys>[0])) {
      return undefined
    }
  }
  return stabKeyForCode(input.code)
}

export interface StabNoteAttack {
  midi: number
  /** Identifies this particular first hold, so late async attacks can be rejected. */
  request: number
}

export interface StabNoteRelease {
  midi: number
}

export interface StabNoteHolds {
  /**
   * Hold a note from one physical source. Returns an attack only for the first
   * source on that pitch; repeated events and shared-pitch holds are silent.
   */
  press(source: string, midi: number): StabNoteAttack | null
  /** Release a source, returning a note-off only when the pitch has no holds left. */
  release(source: string): StabNoteRelease | null
  /** Whether an async attack still represents a currently held pitch. */
  isCurrent(attack: StabNoteAttack): boolean
}

/**
 * Source-aware live-note lifecycle shared by pointer and computer-keyboard
 * input. It is intentionally independent of React and Tone so the chord and
 * quick-tap rules stay deterministic and directly testable.
 */
export function createStabNoteHolds(): StabNoteHolds {
  const sourceNotes = new Map<string, number>()
  const noteHoldCounts = new Map<number, number>()
  const noteRequests = new Map<number, number>()

  const nextRequest = (midi: number) => {
    const request = (noteRequests.get(midi) ?? 0) + 1
    noteRequests.set(midi, request)
    return request
  }

  return {
    press(source, midi) {
      if (sourceNotes.has(source)) return null
      sourceNotes.set(source, midi)

      const holdCount = noteHoldCounts.get(midi) ?? 0
      noteHoldCounts.set(midi, holdCount + 1)
      if (holdCount > 0) return null

      return { midi, request: nextRequest(midi) }
    },

    release(source) {
      const midi = sourceNotes.get(source)
      if (midi === undefined) return null
      sourceNotes.delete(source)

      const holdCount = noteHoldCounts.get(midi) ?? 0
      if (holdCount > 1) {
        noteHoldCounts.set(midi, holdCount - 1)
        return null
      }

      noteHoldCounts.delete(midi)
      nextRequest(midi)
      return { midi }
    },

    isCurrent(attack) {
      return (
        (noteHoldCounts.get(attack.midi) ?? 0) > 0 &&
        noteRequests.get(attack.midi) === attack.request
      )
    },
  }
}

interface SequencedStabNote {
  midi: number
  startsAt: number
  endsAt: number
}

export interface StabSoundingNotes {
  attackLive(midi: number): void
  releaseLive(midi: number): void
  schedule(midi: number, startsAt: number, endsAt: number): void
  clearSequenced(): void
  /** Notes audible at a monotonically increasing audio-context time. */
  atTime(time: number): number[]
}

/**
 * Clock-aware union of live holds and transport-scheduled notes. The audio
 * engine owns this registry; the keyboard reads it from requestAnimationFrame
 * so visual state follows Tone's clock without React rendering on every tick.
 */
export function createStabSoundingNotes(): StabSoundingNotes {
  const live = new Set<number>()
  let sequenced: SequencedStabNote[] = []

  return {
    attackLive(midi) {
      live.add(midi)
    },

    releaseLive(midi) {
      live.delete(midi)
    },

    schedule(midi, startsAt, endsAt) {
      if (endsAt <= startsAt) return
      sequenced.push({ midi, startsAt, endsAt })
    },

    clearSequenced() {
      sequenced = []
    },

    atTime(time) {
      sequenced = sequenced.filter((note) => note.endsAt > time)
      const sounding = new Set(live)
      for (const note of sequenced) {
        if (note.startsAt <= time) sounding.add(note.midi)
      }
      return [...sounding].sort((a, b) => a - b)
    },
  }
}

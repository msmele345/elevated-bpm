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

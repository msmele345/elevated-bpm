/**
 * What the keyboard was played like, rather than what it left behind. Live
 * stabs write nothing into the pattern, so a "play a chord" goal has no
 * document to assert over — like knob motion (see paramMotion.ts) it needs its
 * own session observation: which inputs are holding which pitch right now, and
 * the most pitches that have sounded together.
 *
 * Sources are the same input identities the keyboard already tracks (a pointer
 * contact or a physical key code), so a note counts as held until the input
 * holding it lets go.
 */

export interface ChordPlay {
  /** Pitch held by each live input, keyed by input source. */
  held: Record<string, number>
  /** The most distinct pitches held at one time this session. */
  maxNotes: number
}

/** A session in which nothing has been played yet. */
export const NO_CHORD_PLAY: ChordPlay = { held: {}, maxNotes: 0 }

function distinctPitches(held: Record<string, number>): number {
  return new Set(Object.values(held)).size
}

/**
 * Fold one note-on into the record. A source already holding something is
 * ignored, so key repeat can never stack a chord out of one finger.
 */
export function observeChordAttack(play: ChordPlay, source: string, midi: number): ChordPlay {
  if (source in play.held) return play
  const held = { ...play.held, [source]: midi }
  // Distinct pitches, not inputs: a mouse and a computer key on the same note
  // are one voice, and asking for three notes must mean three notes.
  return { held, maxNotes: Math.max(play.maxNotes, distinctPitches(held)) }
}

/** Fold one note-off into the record; the high-water mark is never given back. */
export function observeChordRelease(play: ChordPlay, source: string): ChordPlay {
  if (!(source in play.held)) return play
  const { [source]: _released, ...held } = play.held
  return { ...play, held }
}

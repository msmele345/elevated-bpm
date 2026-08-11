/**
 * The deck's addressable sections, in the order they are stacked.
 *
 * A groovebox is a wall of controls — five drum lanes alone are ninety Tab
 * stops — so every block big enough to be a barrier gets an id, a heading, and
 * a skip link. This list is the single source of truth all three read from:
 * adding a panel without adding it here is what the accessibility contract in
 * `src/a11y.test.ts` fails on.
 */
export const DECK_SECTION_IDS = {
  curriculum: 'deck-curriculum',
  master: 'deck-master',
  drums: 'deck-drums',
  sampler: 'deck-sampler',
  bass: 'deck-bass',
  stabs: 'deck-stabs',
} as const

export interface DeckSection {
  /** DOM id of the section element, and the skip link's fragment target. */
  id: string
  /** What the section is called — its skip link's destination. */
  label: string
}

export const DECK_SECTIONS: readonly DeckSection[] = [
  { id: DECK_SECTION_IDS.curriculum, label: 'Curriculum' },
  { id: DECK_SECTION_IDS.master, label: 'Master' },
  { id: DECK_SECTION_IDS.drums, label: 'Drum machine' },
  { id: DECK_SECTION_IDS.sampler, label: 'Sampler' },
  { id: DECK_SECTION_IDS.bass, label: 'Bass synth' },
  { id: DECK_SECTION_IDS.stabs, label: 'Stab synth' },
]

/** The id of a section's heading — what its `aria-labelledby` points at. */
export function sectionTitleId(sectionId: string): string {
  return `${sectionId}-title`
}

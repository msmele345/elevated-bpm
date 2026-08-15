/**
 * Every addressable panel on the deck — the one id space, so a panel cannot
 * quietly invent an id of its own somewhere else.
 *
 * Not every panel here is a *barrier*. A groovebox is a wall of controls — five
 * drum lanes alone are ninety Tab stops — so a block big enough to be one also
 * gets a skip link, and those are `DECK_SECTIONS` below. A small panel takes an
 * id and a heading from here and stops there.
 */
export const DECK_SECTION_IDS = {
  curriculum: 'deck-curriculum',
  master: 'deck-master',
  drums: 'deck-drums',
  sampler: 'deck-sampler',
  bass: 'deck-bass',
  stabs: 'deck-stabs',
  /**
   * Two controls, so deliberately not in `DECK_SECTIONS`: a skip link past a
   * button and a select is one more stop to tab through, not a bypass. The
   * eight-control threshold in `src/a11y.test.ts` is what actually decides
   * this — but it cannot see this panel, because jsdom has no Web MIDI and only
   * ever renders the unsupported state. `src/appMidi.test.ts` connects first
   * and checks it there instead.
   */
  midi: 'deck-midi',
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

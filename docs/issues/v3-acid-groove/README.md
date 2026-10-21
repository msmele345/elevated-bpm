# Elevated BPM v3.0 — Issue Track: Groove, Bank & Acid

> Source spec: `docs/specs/v3-groove-bank-acid.md`
> Background: `docs/v3_brainstorming.md` ("If I were picking the next track", items 1, 2, 4, 5)

The spec ships four strands — **Feel** (swing, level), **Playable from the first
click** (layout), **the Pattern Bank**, and **Acid** (303 slide/accent/Env Mod
plus an Acid Arc and progress chips for every lesson). Its "Agreed issue order"
names ten issues, EB3-01…EB3-10. This folder cuts them into fifteen tracer-bullet
slices: one prefactor up front, and five of the spec's issues split where a
single one would not fit one fresh context window.

Every file is written to be picked up cold: read the ticket plus the source spec
and start working.

## Tickets

| # | File | Title | Blocked by | Schema |
|---|---|---|---|---|
| EB3-00 | `00-step-resolution-prefactor.md` | Prefactor: one step-resolution function | — | — |
| EB3-01 | `01-swing.md` | Swing | 00 | v11 |
| EB3-02 | `02-voice-level-and-mixer.md` | Level on every voice, bass/stab mute & solo | 00, 01 | v12 |
| EB3-03a | `03a-playwright-ci.md` | Playwright in CI | — | — |
| EB3-03b | `03b-fold-layout.md` | Fold layout: Share menu, curriculum line, sticky transport strip, Master below | 03a, 01, 02 | — |
| EB3-04a | `04a-progress-chips.md` | Progress chips on every lesson | 03b | — |
| EB3-04b | `04b-completed-strip-and-spotlight-scroll.md` | Completed-lesson strip and scroll to spotlight | 03b | — |
| EB3-05 | `05-sampler-compaction-and-two-columns.md` | Sampler compaction and two columns ≥1600px | 03b | — |
| EB3-06 | `06-phone-reflow.md` | Phone reflow, 320px and up | 03b | — |
| EB3-07a | `07a-pattern-bank-core.md` | Pattern Bank core: slots A–D, queued switching | 00, 02, 03b | v13 |
| EB3-07b | `07b-bank-copy-and-clear.md` | Bank Copy and Clear | 07a | — |
| EB3-08 | `08-bank-in-share-links.md` | Bank in share links, single-pattern fallback | 07a | — |
| EB3-09a | `09a-bass-accent-and-env-mod.md` | Bass Accent and Env Mod | 00, 06, 07a | v14 |
| EB3-09b | `09b-bass-slide.md` | Bass Slide | 09a | — |
| EB3-10 | `10-acid-arc.md` | Acid Arc | 01, 09a, 09b | — |

## Order and dependencies

```
EB3-00  step-resolution prefactor ─────────────┐         EB3-03a  Playwright in CI
   │                                           │            │   (start any time)
EB3-01  Swing (v11) ───────────────────────────┤            │
   │                                           │            │
EB3-02  Level + bass/stab M/S (v12) ───────────┤            │
   │                                           │            │
EB3-03b fold layout ◄──────────────────────────┴────────────┘
   │
   ├── EB3-04a  progress chips
   ├── EB3-04b  completed strip + scroll to spotlight
   ├── EB3-05   sampler compaction + two columns
   ├── EB3-06   phone reflow ─────────────────────┐
   └── EB3-07a  Pattern Bank core (v13)           │
          │                                       │
          ├── EB3-07b  Copy / Clear               │
          ├── EB3-08   Bank in share links        │
          └── EB3-09a  Accent + Env Mod (v14) ◄───┘
                 │
              EB3-09b  Slide
                 │
              EB3-10   Acid Arc  (also needs 01 for swingInRange)
```

**The frontier:** EB3-00 and EB3-03a can start immediately. After EB3-03b
lands, 04a, 04b, 05, 06 and 07a are independent of each other.

## ProjectState version ledger

The document is at **v10** today. This track spends four versions, fixed per the
spec. Fixed numbers serialize the schema tickets — **01 → 02 → 07a → 09a must
merge in that order** regardless of anything else.

| Version | Ticket | Adds |
|---|---|---|
| v11 | EB3-01 | `transport.swing` (0.50–0.75, default 0.50) |
| v12 | EB3-02 | mixer keyed by voice (drum, pad, note lanes); each entry gains `level` (linear 0–~2, default 1) |
| v13 | EB3-07a | `patterns` is always four slots A–D; the existing pattern becomes A and keeps its id |
| v14 | EB3-09a | every note step gains `slide: false`, `accent: false`; bass patch gains `envMod` (default 0) |

Every step adds fields only, with defaults that reproduce today's sound. Old
links and bundles run through the same migration chain (EB2-01), so a v10 link
opens as slot A at 50% swing. **The share/bundle validator is updated in the
same ticket as each bump** — it is the one place links and bundles are checked.

## Intermediate states we are accepting

Each is called out in its own ticket so it is not mistaken for a bug.

- **After EB3-01 / EB3-02, before EB3-03b:** the Swing knob sits beside the tempo
  fader in the Master strip, and the Deck is still below the fold. EB3-03b moves
  Swing into the transport strip.
- **After EB3-02, before EB3-06:** Level knobs make drum and pad rows wider, so
  the phone overflow (open since Phase 9) gets slightly worse. EB3-06 closes it.
- **After EB3-07a, before EB3-08:** share links carry only the selected slot (as
  slot A); bundles already carry all four.
- **After EB3-09a, before EB3-09b:** the `slide` flag exists on every note step
  but has no row and no sound.

Do not ship v3.0 with any of these still open.

## Conventions for every ticket on this track

- **TDD, red-green-refactor.** Follow the `/tdd` skill. The spec's Testing
  Decisions name six seams (document, step resolution, lesson, share/bundle,
  mounted app, layout). Prefer the highest seam that can make the claim; the
  layout seam (Playwright) is only for facts jsdom cannot measure.
- **Branch off `develop`**, named in each ticket's header. PR back into
  `develop`, squash and merge. See `AGENTS.md`.
- **Acceptance criteria are checked off with evidence**, in the style of
  `plans/elevated-bpm-v1.md` and the v2 track: what was built, the seam that
  proves it, and what in-browser verification actually measured.
- **Keep `GLOSSARY.md` current.** The spec's Vocabulary section introduces Bank,
  Slot, Selected slot, Playing slot, Voice, Level, Swing, Slide, Accent (note
  step), Env Mod, Transport strip, Progress chip. Each term lands in the glossary
  in the ticket that ships it, following the file's maintenance rules.
- **Stay in scope.** Each ticket lists what it leaves to a later slice and names
  which one.
- **The performance rule holds.** rAF reads the engine directly; React
  re-renders on user edits only, never on the audio clock. New controls follow
  the Phase 9 memoization discipline (named callbacks, stable props) and the
  render-stability tests keep passing.
- **The demo rule holds.** No slot of the opening Deck satisfies any lesson in
  any Arc; `lessons.test.ts` enforces it.
- **Accessibility holds.** Every new control has an accessible name, and any
  block of more than eight controls has a skip link — the mounted a11y suite
  fails otherwise.

## Not a ticket

- **Branch protection** on `develop` and `main` (Phase 1.5) is still pending in
  GitHub settings. When it is turned on, the Playwright job from EB3-03a should
  be a required check alongside build-and-test.
- **Web MIDI (EB2-10)** stays parked on `feat/10-web-midi-input`. v3 rewrites
  App wiring, the transport and the mixer, so expect conflicts when it is
  rebased; live stab notes from MIDI should pass through stab Level, mute and
  solo.

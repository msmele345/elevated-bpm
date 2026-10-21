# EB3-03b — Fold layout: Share menu, curriculum line, sticky transport strip, Master below

> Track: v3.0 · Slice 3b of 15
> Blocked by: EB3-03a (harness), EB3-01 (Swing exists), EB3-02 (Level widens rows)
> Blocks: EB3-04a, EB3-04b, EB3-05, EB3-06, EB3-07a
> Branch: `feat/fold-layout`
> Spec stories: 24–30, 45; spec "Layout" and Further Notes "Fold budget"

## What to build

**The guarantee: on a fresh load at 1280×720, Play, BPM and all five drum lanes
are visible without scrolling.** Write that Playwright test first and watch it
fail, then restructure the top of the Deck until it passes.

## Scope

### In

- **Deck order, top to bottom:** header (brand, model, **Share ▾**) → any
  incoming-share or error strip → **transport strip** (sticky) → curriculum line
  → lesson card → Drums → Sampler → Bass → Stab → Master.
- **Share ▾ menu** in the header: Share link, Export bundle, Open bundle, plus
  the explanatory copy that used to be permanent. The incoming-share "Keep this
  beat / Back to my project" choice and link errors stay full-width strips.
- **Transport strip:** Play/Stop, tempo fader with BPM readout, Swing (moved
  from Master). It reserves room for the Bank (EB3-07a) — slots, Copy, Clear.
  - Its own deck section with a heading and a skip link (required: the a11y
    suite fails any block of more than eight controls without one).
  - Sticky at the top of the viewport, no taller than ~56px on desktop.
  - Scroll targets account for its height so nothing scrolls under it.
- **Curriculum line:** track selector, compact progress meter (n/total), current
  lesson name, and a "Path ▸" toggle revealing the existing numbered path.
  Expanded state is session-only — nothing saved to `prefs`.
- **Master strip** (scope, macros, FX bus) moves below the instruments.
- Skip links reordered to match; deck-section list gains the transport strip.
- `GLOSSARY.md`: **Transport strip**; update any entries describing the Master
  strip as holding the transport.

### Fold budget

Projected bottom of drum lane 5 is ≈709px — about 11px of margin, too thin to
rely on (see spec Further Notes). Expect to use the levers, in this order:

1. clamp the lesson intro to three lines with "more";
2. trim drum-panel chrome above the rows (71px today);
3. tighten the deck gap.

The test runs on a wiped IndexedDB with lesson 1's card open. Leave headroom
for EB3-04a's ~28px chip row; if it cannot fit, say so in the PR rather than
leaving 04a to discover it.

### Out (and where it lands)

- Completed-lesson strip, scroll to spotlight — EB3-04b.
- Chips — EB3-04a. Sampler compaction, two columns — EB3-05.
- Phone layout of the transport strip (two rows max) — EB3-06.
- Bank controls in the strip — EB3-07a.

## Acceptance criteria

- [ ] Playwright: fresh project at 1280×720 with lesson 1 open — Play visible,
      bottom of the fifth drum lane ≤ 720px (test written first, seen red)
- [ ] Playwright: after scrolling to the stab keyboard, the transport strip is
      pinned at the top and Play responds
- [ ] Share ▾ menu holds Share link / Export / Open; incoming-share and error
      strips still appear full-width
- [ ] Curriculum line collapses the path to one line; "Path ▸" reveals it and
      every lesson is still one click away
- [ ] Master strip renders below Stab; macros, FX and scope work as before
- [ ] Transport strip has a heading and skip link; skip links follow the new
      order; a11y suite passes
- [ ] No React re-render on the audio clock introduced (render tests pass)
- [ ] `GLOSSARY.md` updated

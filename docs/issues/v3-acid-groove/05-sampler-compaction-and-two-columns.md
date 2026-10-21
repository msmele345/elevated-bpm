# EB3-05 — Sampler compaction and two columns at ≥1600px

> Track: v3.0 · Slice 5 of 15
> Blocked by: EB3-03b
> Blocks: none
> Branch: `feat/wide-layout`
> Spec stories: 38–40; spec "Layout → Sampler compaction" and "Two columns"

## What to build

An empty sampler stops taking 738px of nothing, and wide monitors put most of
the Deck on screen at once.

## Scope

### In

- **Sampler compaction:** a pad's step lane renders when the pad has a sound
  **or** has programmed steps (so programming survives lost audio). Pads with
  neither show as compact "Load a sound" cards.
- **Two columns at viewport width ≥1600px:** Drums and Sampler on the left, Bass
  and Stab on the right. Header, transport strip, curriculum line and lesson
  card span the full width above; Master spans it below. Below 1600px the single
  column stays.
- Skip-link order and section headings still match visual order.

### Out (and where it lands)

- Phone layout — EB3-06.

## Acceptance criteria

- [ ] Empty pads render as compact "Load a sound" cards; loading a sound reveals
      the pad's step lane immediately
- [ ] A pad with programmed steps but missing audio keeps its lane visible
- [ ] Playwright: at 1600×900 the Bass panel sits beside the Drums panel
- [ ] Below 1600px the layout is a single column; the 1280×720 fold test still
      passes
- [ ] a11y suite passes (compact cards named; skip links still cover blocks >8)
- [ ] Mounted test: lane appears/disappears per the sound-or-steps rule

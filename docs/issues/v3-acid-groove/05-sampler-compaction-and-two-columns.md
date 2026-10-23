# EB3-05 — Sampler compaction and two columns at ≥1600px

> Track: v3.0 · Slice 5 of 15
> Blocked by: EB3-03b
> Blocks: none
> Branch: `feat/acid-groove-05-sample-compaction-and-wide-layout`
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

- [x] Empty pads render as compact "Load a sound" cards; loading a sound reveals
      the pad's step lane immediately — `padLaneShown` (`src/model/sampler.ts`)
      is the rule (a region, or any step on); `SamplerPanel` draws a card
      (number, source picker, "From file", drop target) in place of the strip
      and leaves the lane out. A fresh sampler measured 722px → 390px at
      1280×720 (cards 86px vs 195px strips). Verified in-browser: picking
      Basement Break on Pad 1 swapped its card for the full strip and lane.
- [x] A pad with programmed steps but missing audio keeps its lane visible —
      a silent pad keeps its region, so its strip, relink and lane all stay;
      a pad with steps but no region at all also keeps its lane
- [x] Playwright: at 1600×900 the Bass panel sits beside the Drums panel —
      `e2e/wide.spec.ts` (also Sampler under Drums, Stab under Bass, Master
      spanning below, no sideways scroll)
- [x] Below 1600px the layout is a single column; the 1280×720 fold test still
      passes — `e2e/wide.spec.ts` at 1599×900; `e2e/fold.spec.ts` green (lane 5
      bottom at 693px)
- [x] a11y suite passes (compact cards named; skip links still cover blocks >8)
      — cards are named groups ("Pad 1: load a sound") with a named picker and
      file control; `DECK_SECTIONS` order is unchanged and matches the reading
      order in both layouts
- [x] Mounted test: lane appears/disappears per the sound-or-steps rule —
      `App sampler compaction` in `src/App.test.ts` (appears on assigning a
      source, stays for a silent programmed pad, folds back to a card when its
      last step is cleared, with focus kept on the card)

**Note:** at exactly 1600px each column is ~762px, so a step button is 24px
wide (34px in the 920px single column), which is the WCAG 2.5.8 minimum. Steps
grow back to full width as the viewport approaches 1900px.

# EB3-06 — Phone reflow, 320px and up

> Track: v3.0 · Slice 6 of 15
> Blocked by: EB3-03b
> Blocks: EB3-09a (new bass rows must wrap with this pattern)
> Branch: `feat/phone-reflow`
> Spec stories: 41–44; spec "Layout → Phone reflow"
> Closes: the Phase 9 AC4 note (WCAG 1.4.10 reflow)

## What to build

Nothing on the Deck scrolls sideways from 320px up. On phones, every step lane
puts its label, M, S and Level on one line and wraps its 16 steps into two rows
of 8, keeping the four-step colour groups.

## Scope

### In

- **Below 600px:** every step lane (drum, pad, bass, stab) wraps steps 1–8, then
  9–16, under a header line holding label, M, S, Level.
- A reusable wrapping pattern that lets additional rows under a lane (the bass
  Accent and Slide rows arriving in EB3-09a/b) align step *n* across rows.
- Keyboard, Master strip, region editor and finale reflow to fit 320px.
- Sticky transport strip fits in at most two rows on phones.

### Out (and where it lands)

- A separate phone "perform" view — not in v3.
- The bass Accent/Slide rows themselves — EB3-09a/b, which use this pattern.

## Acceptance criteria

- [ ] Playwright: at 390×844 and 320×640 the document is never wider than the
      viewport — on a fresh load, with the region editor open, and with the
      finale open (seed a capstone one edit short and make the last edit through
      the UI; the finale only opens on the incomplete → complete transition)
- [ ] Every lane wraps into 2×8 with its controls on one line above; four-step
      colour groups preserved
- [ ] Transport strip is at most two rows on phones and stays sticky
- [ ] Step *n* aligns across rows sharing the wrap pattern (verified on the bass
      lane's existing rows)
- [ ] Desktop fold test and the 1600px two-column check (if EB3-05 landed) still
      pass
- [ ] Phase 9 AC4's out-of-scope reflow note can be marked resolved in the plan

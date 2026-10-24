# EB3-06 — Phone reflow, 320px and up

> Track: v3.0 · Slice 6 of 15
> Blocked by: EB3-03b
> Blocks: EB3-09a (new bass rows must wrap with this pattern)
> Branch: `feat/acid-groove-06-phone-reflow`
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

- [x] Playwright: at 390×844 and 320×640 the document is never wider than the
      viewport — on a fresh load, with the region editor open, and with the
      finale open (seed a capstone one edit short and make the last edit through
      the UI; the finale only opens on the incomplete → complete transition) —
      `e2e/reflow.spec.ts`, six tests (three scenarios × two phones). The
      finale test seeds the Techno capstone with one stab note missing, reloads
      (asserting no dialog, since a reload never replays the finale), then
      clicks the last stab step. The two overlays are also measured on their own
      content, because a fixed overlay never widens the document: the region
      editor and finale are checked for their scrollable width and for the right
      edge of anything inside them (fixed decoration such as the finale's light
      bloom is skipped — it scrolls nothing). Red first: all six failed at a
      563 px deck before any CSS changed
- [x] Every lane wraps into 2×8 with its controls on one line above; four-step
      colour groups preserved — `.step-grid` becomes four tracks, a 2px spacer
      track, four tracks, with steps 5–8 and 13–16 placed past the spacer. The
      spacer is the quad gap, so all 16 buttons are one width (the desktop
      indent is a margin, which shrank steps 5 and 13 and, through
      `aspect-ratio`, their height). `.step-row` stacks its `.lane-label`
      (label, M, S, Level) over the grid; the old ≤640px rule that hid every lane
      label, mixer included, is gone. Checked on all seven fresh-deck lanes at
      both phone sizes: two rows, header above both, equal widths, a wider gap
      after step 4 than inside a quad, and drum lanes' M, S and Level within one
      dial's height of each other
- [x] Transport strip is at most two rows on phones and stays sticky — below
      600px `.transport` is a grid: Play, tempo fader and BPM readout on the
      first row, Swing on the second (where EB3-07a's slots will sit beside it).
      `--transport-strip-h` is 86px there, and the test asserts the strip is no
      taller than the variable every scroll target clears, and pinned at y = 0
      after scrolling to the bottom
- [x] Step *n* aligns across rows sharing the wrap pattern (verified on the bass
      lane's existing rows) — step *n* and step *n* + 8 share an x within 1px on
      every lane including Bass and Stab. The pattern is the shared `.step-grid`
      tracks, so EB3-09's Accent and Slide rows only need to be `.step-grid`s
      (documented in the CSS and under **Phone reflow** in `GLOSSARY.md`)
- [x] Desktop fold test and the 1600px two-column check (if EB3-05 landed) still
      pass — `fold.spec.ts`, `wide.spec.ts` and `lessonCard.spec.ts` green
      alongside the new spec (22 e2e tests), `tsc -b` clean, 760 Vitest tests
- [x] Phase 9 AC4's out-of-scope reflow note can be marked resolved in the plan —
      marked resolved in `plans/elevated-bpm-v1.md`

## Review notes (EB3-06)

- **Bass and stab header line.** Their M, S and Level live on the panel plate
  (`PanelTitle`), above a lane label that holds only the LED and name, so the
  "label, M, S, Level on one line" check runs on the five drum lanes only. The
  pad lane shares the drum lane's markup and is checked for the wrap and header
  position, not separately for M, S and Level on one line; bass and stab are not
  checked for it at all. Nothing overflows and the plate
  wraps; moving the strip into the lane label is a markup change left out of a
  CSS-only slice.
- **600–820px.** The old `max-width: 640px` rule hid every `.lane-label`, mixer
  included. It is removed, and the reflow starts below 600px as written, so
  from 600px the label is back beside a 16-step row: first-step width is about
  12px at 600px (was ~27px) and 25px at 820px (already the case from 641px).
  Nothing overflows. Whether the reflow should run to 640px or to tablet
  widths is an open decision for the issue's owner.
- **Pad lanes** are covered by a seeded one-step pad (a pad with programmed
  steps shows its lane even with no sound).

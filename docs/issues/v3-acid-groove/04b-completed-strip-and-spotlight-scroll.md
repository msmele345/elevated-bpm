# EB3-04b — Completed-lesson strip and scroll to spotlight

> Track: v3.0 · Slice 4b of 15
> Blocked by: EB3-03b
> Blocks: none
> Branch: `feat/lesson-strip`
> Spec stories: 31–37; spec "Layout → Completed lesson card" and "Scroll to spotlight"

## What to build

After its celebration, a completed lesson shrinks to a slim strip so the Deck
comes back on screen. Entering a lesson whose spotlit control is below the fold
scrolls that control into view — and the page never scrolls by itself while the
learner is working.

## Scope

### In

- **Completed strip (~44px):** "✓ complete", **Next ▸**, and a way to reopen the
  full lesson text. Next ▸ is the existing put-away-and-advance action, so the
  path still waits for the user (Phase 7 rule — a celebration is never cut
  short). Progress chips (EB3-04a, if landed) are hidden on an earned lesson.
- **Scroll to spotlight:** when a lesson is *entered* — picked on the path,
  reached via Next ▸, or resumed — scroll the first spotlit control into view,
  only if it isn't already fully visible.
  - Never on page load or hydration; never while a lesson is being worked on.
  - Smooth by default; instant under `prefers-reduced-motion`.
  - Offsets account for the sticky transport strip's height.
- **"Show me"** link on the lesson card does the same on demand.

### Out (and where it lands)

- Chips themselves — EB3-04a.
- Saving expanded/collapsed state in `prefs` — not in v3.

## Acceptance criteria

- [ ] After the celebration, a completed lesson becomes a ~44px strip with ✓,
      Next ▸ and "reopen"; reopening shows the full text
- [ ] The path does not advance until Next ▸ is pressed
- [ ] Entering a lesson whose spotlight is off-screen scrolls it into view below
      the transport strip; a visible spotlight causes no scroll
- [ ] No scroll on load/hydration or on any edit while the lesson is open
      (mounted test with scrolling mocked)
- [ ] "Show me" scrolls to the spotlit control on demand
- [ ] Reduced motion uses instant scrolling
- [ ] Playwright fold test still passes; a11y suite passes
- [ ] In-browser: entering the filter-sweep lesson from the top of the page
      brings the Cutoff knob into view, not hidden under the strip

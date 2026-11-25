# EB3-04b — Completed-lesson strip and scroll to spotlight

> Track: v3.0 · Slice 4b of 15
> Blocked by: EB3-03b
> Blocks: none
> Branch: `feat/acid-groove-04b-lesson-strip`
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

- [x] After the celebration, a completed lesson becomes a ~44px strip with ✓,
      Next ▸ and "reopen"; reopening shows the full text — `LessonPanel` holds
      the celebration card for `CELEBRATION_MS` (2.4 s), then renders the strip:
      ✓, "Lesson complete", the title, **Reopen** (`aria-expanded`) and **Next ▸**
      (reading "Next: <title> ▸", or "Done" once the track has nothing left). No
      earned card shows chips. Reopen unfolds the intro, with Collapse to fold it; the card is
      keyed by lesson so that state is session-only. The celebration is set in the
      same `continuing` branch as the completion announcement, so hydrating onto
      an earned lesson lands straight on the strip; behind a capstone's finale the
      celebration's clock starts only once the finale closes. Mounted tests (`App.test.ts`,
      "completed strip"); Playwright measures the strip at ≤48px
      (`e2e/lessonCard.spec.ts`); measured 44px in-browser at 1280×720
- [x] The path does not advance until Next ▸ is pressed — Next ▸
      (`handleNextLesson`) requests the scroll and calls `handleDismissLesson`, the
      existing put-away-and-advance action; it is the only
      control on an earned card that moves the path (the ✕ is unearned-only).
      Mounted: edits on the strip leave lesson 1 in place; Next ▸ enters Offbeat Hats
- [x] Entering a lesson whose spotlight is off-screen scrolls it into view below
      the transport strip; a visible spotlight causes no scroll —
      `useSpotlightScroll` (`src/hooks/`) scrolls the first spotlit control with
      `scrollIntoView({ block: 'center' })` (cleared by `scroll-padding-top`) only
      when `spotlightNeedsScroll` (`src/model/spotlightScroll.ts`, unit-tested) says
      it is not wholly inside the band below the strip; a target inside the strip
      never scrolls, and neither does entering a lesson whose goal is already met (it
      is earned on arrival and its ring rests). Triggered by picking on the path,
      Next ▸ and Resume. Mounted
      tests cover each trigger, the visible case and the in-strip case
- [x] No scroll on load/hydration or on any edit while the lesson is open
      (mounted test with scrolling mocked) — the request is a ref set only by the
      three entry handlers; a deck hydrated onto the filter sweep, then knob moves,
      step taps, a tempo change and Play, never calls `scrollIntoView`
- [x] "Show me" scrolls to the spotlit control on demand — a link at the end of an
      unearned card's intro, shown when the lesson spotlights something; mounted test
- [x] Reduced motion uses instant scrolling — `spotlightScrollBehavior` gives
      `'auto'` under `prefers-reduced-motion: reduce`, `'smooth'` otherwise; unit and
      mounted (stubbed `matchMedia`) tests
- [x] Playwright fold test still passes; a11y suite passes — all 6 e2e tests and
      all 747 Vitest tests pass
- [x] In-browser: entering the filter-sweep lesson from the top of the page
      brings the Cutoff knob into view, not hidden under the strip — held as a
      Playwright test (`e2e/lessonCard.spec.ts`): from `scrollY` 0, picking lesson 9
      scrolls the page, the Cutoff knob is fully in the viewport, and its top is
      below the transport strip's bottom edge

# EB3-04a — Progress chips on every lesson

> Track: v3.0 · Slice 4a of 15
> Blocked by: EB3-03b (chips count against the fold budget)
> Blocks: none (EB3-10 benefits but does not depend on it)
> Branch: `feat/progress-chips`
> Spec stories: 95–102; spec "Lesson vocabulary and progress"

## What to build

Every lesson card shows a **Progress chip** per goal assertion — "Kick 3/4 · 1
extra", "Sweep 60%", "Tempo 130 → 138–145" — so a learner can tell whether they
are close without being told the answer. A met chip turns into a green ✓, so a
five-part capstone reads as a checklist.

## Scope

### In

- A pure **progress function per assertion type**, returning met, done/total, an
  extra count for exact-placement goals, and a current value for range/value
  goals. **Lesson completion is derived from it** ("every assertion met") so
  progress and completion can never disagree.
  - Exact placement (`stepsActive`, `stepsAccented`, `notesActive`): done =
    wanted steps satisfied; extra = satisfied steps not wanted; met = all wanted
    and no extra.
  - Minimum count (`notesPlaced`, `pitchesVaried`, `padStepsPlaced`,
    `sourceLoaded`, `padAssigned`): done capped at the minimum.
  - `paramSwept`: travel against `minTravel`, as a percentage.
  - `chordPlayed`: notes held together against `minNotes`.
  - Range (`bpmInRange`, `swingInRange`): current vs range.
  - Sampler value goals (`regionStartsWithin`, `regionShorterThan`,
    `fitTargetSet`, `padTuned`): met or not, with the current value where it
    means something.
- **Chip text** generated from goal type + the lane's or knob's display label.
  An optional `label` string in lesson JSON overrides the noun (validated
  non-empty). All twenty existing lessons get chips with no JSON edits.
- **Display:** a single wrapping row (~28px) in the lesson card; met = ✓ in the
  deck's run green; chips are a list with accessible text.
- **One polite live region** announces only a chip becoming met and the lesson
  completing — never every count change.
- Progress computed on the user-edit cadence (step taps, knob moves, transport
  edits) — never the audio clock.
- Chips never reveal *which* steps are wrong.
- `GLOSSARY.md`: **Progress chip**.

### Out (and where it lands)

- Chips for `notesAccented` / `notesSlid` — added with those goal types in
  EB3-10, following this slice's pattern.
- Hiding chips on an earned lesson's slim strip — EB3-04b (until then, chips on
  a completed card simply all show ✓).
- Escalating hints — not in v3.

## Acceptance criteria

- [x] Every existing assertion type has a progress function; completion is
      derived from it and all existing completion tests still pass —
      `assertionProgress` (`src/model/lesson.ts`) answers all sixteen goal types
      in one shape (`met`, `done`/`total`, `extra`, `current`), and `isGoalMet` is
      now `every(assertionProgress(...).met)`, so the old per-type checks are gone
      rather than duplicated. Covered at the lesson seam (`lesson.test.ts`, one
      case per type plus "met exactly when every assertion reports met"); every
      pre-existing `isGoalMet`, arc and shipped-lesson completion test passes
      unchanged
- [x] Exact-placement chips show "n/total · k extra" and are met only with zero
      extras — `placementProgress` counts wanted steps that hold and holding steps
      that were not wanted, and nothing else (no positions). Vitest: "Kick 3/4 ·
      1 extra", "Kick 4/4 · 2 extra" unmet, `Kick 4/4` met (`progressChip.test.ts`);
      mounted: tapping kick 1 then 2 reads "Kick 1/4" then "Kick 1/4 · 1 extra"
      (`App.test.ts`)
- [x] Chip text is generated for all twenty shipped lessons; `label` overrides
      it; an empty `label` fails parsing — `progressChips`
      (`src/model/progressChip.ts`) builds the noun from `KIT_LANES` /
      `NOTE_LANES` / `PAD_LANES` labels and `deckParamSpec(...).label`. The shipped
      contract (`lessons.test.ts`) asserts 20 lessons, a well-formed chip per goal
      on both the opening deck and a known-good context, every chip met on the
      known-good context, and the broken chip unmet on each near miss. `label`
      replaces the noun ("Downbeats 1/4 · 1 extra"); `''`, whitespace and a
      non-string are rejected by `parseLesson`, and an absent label adds no key.
      No lesson JSON was edited
- [x] Met chips render ✓ in run green; chips are an accessible list — a
      `<ul aria-label="Goal progress">` of `<li>`s; a met chip gets `is-met`
      (`color: var(--go)`), an `aria-hidden` ✓ and visually hidden ", done". On an
      earned card every chip shows ✓, since completion is latched. Verified
      in-browser: the completed lesson-1 chip computed `rgb(77, 255, 106)` (`--go`)
- [x] Live region announces chip-met and lesson-complete only (mounted test) —
      one always-mounted `aria-live="polite"` region outside the deck (so the
      finale's `aria-hidden` and dismissing the card cannot silence it); the
      celebration lost its `role="status"`, so there is no second one. Mounted
      tests: three kicks on the capstone say nothing, the fourth says "Kick 4/4
      done"; on lesson 1 the fourth kick says only "Lesson complete: Four on the
      Floor", never the chip as well; a saved beat earning lesson 1 on load, and
      walking onto a lesson with a met chip, say nothing. Announcements are keyed
      nodes, so a chip met again is heard again
- [x] Playwright fold test still passes with chips on lesson 1 — `fold.spec.ts`
      now also requires the "Goal progress" list to be visible before measuring;
      all four e2e tests pass against the production build. Measured in-browser at
      1280×720: card 154px (126 + 28), fifth drum lane bottom at 693px; the
      five-chip capstone row fits one 22px line (876px wide)
- [x] Render-stability tests pass (no audio-clock re-renders) — chips are
      computed in a `useMemo` over the goal context (document, knob motion,
      chord), and handed back as the same array while their text and met state
      are unchanged (`sameChips`). `render.test.ts`: a master-knob move
      mid-playback changes no lesson-card prop; a kick tap changes only `chips`.
      Checked the guard bites: without `sameChips` the first test fails
- [x] `GLOSSARY.md` updated — Progress chip loses its `[v3 spec]` tag and
      describes what shipped (hiding on the earned strip stays tagged for
      EB3-04b); Goal gains `label` and `assertionProgress`; Lesson card names the
      chip row

## Testing decisions

- Lesson seam: progress for every assertion type, completion derived.
- Mounted app: chip text, ✓ state, live-region announcements.
- Layout seam: fold budget re-checked.

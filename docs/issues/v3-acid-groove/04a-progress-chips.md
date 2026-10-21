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

- [ ] Every existing assertion type has a progress function; completion is
      derived from it and all existing completion tests still pass
- [ ] Exact-placement chips show "n/total · k extra" and are met only with zero
      extras
- [ ] Chip text is generated for all twenty shipped lessons; `label` overrides
      it; an empty `label` fails parsing
- [ ] Met chips render ✓ in run green; chips are an accessible list
- [ ] Live region announces chip-met and lesson-complete only (mounted test)
- [ ] Playwright fold test still passes with chips on lesson 1
- [ ] Render-stability tests pass (no audio-clock re-renders)
- [ ] `GLOSSARY.md` updated

## Testing decisions

- Lesson seam: progress for every assertion type, completion derived.
- Mounted app: chip text, ✓ state, live-region announcements.
- Layout seam: fold budget re-checked.

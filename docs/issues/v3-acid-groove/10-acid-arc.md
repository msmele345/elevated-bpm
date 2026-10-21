# EB3-10 — Acid Arc

> Track: v3.0 · Slice 10 of 15
> Blocked by: EB3-01 (`swingInRange`, Swing knob), EB3-09a (accent, Env Mod), EB3-09b (slide)
> Blocks: none — closes the track
> Branch: `feat/acid-arc`
> Spec stories: 85–94; spec "Acid Arc" and "Lesson vocabulary and progress"

## What to build

A seven-lesson **Acid** Arc on the curriculum selector, between Techno and
Sampling, that takes a learner from a busy line of sixteenths to a shuffled,
accented, sliding acid line — ending in a graduation moment.

## Scope

### In

- **New goal types**, parsed with the same strictness as existing ones:
  - `notesAccented { lane, min }` and `notesSlid { lane, min }` — the lane must
    be one that shows flags (bass only); a stab lane fails loudly at load.
    `notesSlid` counts only slides that connect into a following note.
  - Progress functions and chip text for both, following EB3-04a's pattern (if
    04a has not landed, add the progress functions anyway so completion stays
    derived the same way once it does).
- **Arc registration:** third entry in the curriculum registry, ordered Techno,
  Acid, Sampling. Id `acid`, title "Acid", blurb "One bassline, endlessly bent."
  Finale: the compact scale, certified as **BL-303** — Techno stays the biggest
  moment on the Deck.
- **Lessons, in order (JSON):**
  1. **Sixteenths** — `notesPlaced` bass ≥ 8.
  2. **Make It Walk** — `pitchesVaried` bass ≥ 3.
  3. **Accent It** — `notesAccented` bass ≥ 3, spotlight `accentRow:bass`.
  4. **Slide Into It** — `notesSlid` bass ≥ 2, spotlight `slideRow:bass`.
  5. **Env Mod Sweep** — `paramSwept` envMod ≥ 0.5 while playing, spotlight
     `knob:envMod`.
  6. **Shuffle** — `swingInRange` 56–66, spotlight `knob:swing`.
  7. **Your First Acid Line** (capstone) — `notesPlaced` ≥ 8, `pitchesVaried` ≥ 3,
     `notesAccented` ≥ 2, `notesSlid` ≥ 2, `swingInRange` 54–70.
- Starting the Acid arc requires nothing else (never gated).
- `GLOSSARY.md`: update **Arc** (three shipped Arcs) and add the new goal types
  wherever goal types are listed.

### Out (and where it lands)

- Phase 7 AC5 (JSON-only lesson registration) — the Arc is registered in code
  like the others; not in v3.
- Mixing, Arrangement or bank lessons — not in v3.

## Acceptance criteria

- [ ] Acid appears between Techno and Sampling and can be started immediately
- [ ] Seven lessons load from JSON; parser rejects a stab lane on the flag goals
- [ ] Shipped-curriculum contract: a known-good context completes every Acid
      lesson; breaking each assertion in turn leaves it incomplete
- [ ] No slot of the opening Deck satisfies any lesson in any Arc (demo bass is
      empty, swing 50%)
- [ ] Every spotlight and param id names something the Deck has
- [ ] Completing the capstone shows the compact BL-303 finale (transition-only;
      reload doesn't replay it)
- [ ] Chips show for every Acid goal, including "Swing 50% → 54–70%"
- [ ] In-browser: all seven lessons completed through the real controls in
      order, with negative checks (7 notes, 2 pitches, a slide into an empty
      step, swing 52%) not completing; zero console errors
- [ ] `GLOSSARY.md` updated

## Testing decisions

- Lesson seam: parse and progress for `notesAccented` / `notesSlid`; shipped-arc
  contract extended to the Acid Arc. Prior art: `lessons.test.ts`, `arc.test.ts`.

# EB3-10 — Acid Arc

> Track: v3.0 · Slice 10 of 15
> Blocked by: EB3-01 (`swingInRange`, Swing knob), EB3-09a (accent, Env Mod), EB3-09b (slide)
> Blocks: none — closes the track
> Branch: `feat/acid-groove-10-acid-arc`
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

- [x] Acid appears between Techno and Sampling and can be started immediately —
      `ARCS` (`src/lessons/index.ts`) is `[TECHNO_ARC, ACID_ARC, SAMPLING_ARC]`, id
      `acid`, title "Acid", blurb "One bassline, endlessly bent."; nothing gates it.
      `lessons.test.ts` "sits between techno and sampling on the selector";
      `App.test.ts` "puts Acid between Techno and Sampling, ready to start with nothing
      else done" (track buttons in order, "0 of 7 complete", switching lands on
      Sixteenths with its "Bass notes 0/8" chip)
- [x] Seven lessons load from JSON; parser rejects a stab lane on the flag goals —
      `sixteenths`, `make-it-walk`, `accent-it`, `slide-into-it`, `env-mod-sweep`,
      `shuffle`, `your-first-acid-line` in `src/lessons/`, each through `parseLesson`;
      `lessons.test.ts` "is seven lessons, a busy line of sixteenths to a shuffled,
      accented, sliding one" pins ids and goals. New `NotesAccentedGoal` / `NotesSlidGoal`
      (`lesson.ts`) parse their lane through `parseFlagLane` against `NOTE_FLAG_LANES`:
      `lesson.test.ts` "rejects a lane that shows no flags, so a stab accent goal fails at
      load" and "rejects counts no 16-step lane could reach"
- [x] Shipped-curriculum contract: a known-good context completes every Acid
      lesson; breaking each assertion in turn leaves it incomplete — `satisfyingContext`
      and `nearMiss` (`lessons.test.ts`) gained `notesAccented` and `notesSlid` (built
      from the public step shape: a one-step note with a note on the next step; a near
      miss leaves the flag one short), so "recognizes a known-good completion example
      for every shipped lesson" and "keeps every assertion necessary" now sweep all
      three arcs. `notesSlid` counts only `slideReach(...).into === 'note'`:
      `lesson.test.ts` covers a slide into a rest, a slide on an empty step, a long note
      whose gate reaches a rest before the next note, the 16 → 1 wrap, and the wrong lane
- [x] No slot of the opening Deck satisfies any lesson in any Arc (demo bass is
      empty, swing 50%) — the existing "opens with no slot of the bank satisfying any
      lesson, on any track" now includes Acid; "opens unearned: the demo bass is empty and
      the swing is straight" checks no Acid chip is met on the opening deck
- [x] Every spotlight and param id names something the Deck has — new
      `lessons.test.ts` "spotlights only controls the deck actually has, of every kind"
      checks every `kind:id` across all 27 lessons (`lane`, `noteLane`, `knob`, `pad`,
      `accentRow`, `slideRow`, `transport`, `keyboard`, `sampler`); the existing knob
      and flag-row checks still run
- [x] Completing the capstone shows the compact BL-303 finale (transition-only;
      reload doesn't replay it) — finale `scale: 'compact'`, kicker "Acid track complete ·
      BL-303 certified"; `lessons.test.ts` "ends in the compact graduation, certified as
      the bass synth itself" (Techno stays the only grand one). `App.test.ts` "raises the
      compact BL-303 finale when the acid capstone is earned, and not again on reload"
      seeds the capstone one slide short, clicks "Bass slide, step 5", sees
      `data-scale="compact"` and the kicker, closes, reloads: no dialog, "1 of 7 complete"
- [x] Chips show for every Acid goal, including "Swing 50% → 54–70%" — chip nouns
      "Bass accents" and "Bass slides" (`progressChip.ts`), counts read `done/total`;
      `progressChip.test.ts` "reads accented and slid bass notes as counts, named by the
      lane"; `lessons.test.ts` "chips every goal of the capstone, starting from the
      opening deck" (`Bass notes 0/8`, `Bass pitches 0/3`, `Bass accents 0/2`,
      `Bass slides 0/2`, `Swing 50% → 54–70%`) and "does not count a slide into an empty
      step towards the capstone" (only the slide chip drops)
- [x] In-browser: all seven lessons completed through the real controls in
      order, with negative checks (7 notes, 2 pitches, a slide into an empty
      step, swing 52%) not completing; zero console errors — dev build, wiped
      IndexedDB, Acid track picked from the selector, Next ▸ between lessons:
      1. seven bass steps read "Bass notes 7/8", the eighth completed;
      2. one octave lift read "Bass pitches 2/3", a fifth on step 7 completed;
      3. accents on steps 2 and 4 plus one parked on empty step 12 ("on (no note)") read
         "Bass accents 2/3", step 6 completed;
      4. a slide on step 8 (into empty step 9) and one on empty step 13 read
         "Bass slides 0/2", step 3 → 1/2, step 6 completed, ties drawn into steps 4 and 7;
      5. Env Mod swept end to end while stopped read "Env Mod sweep 0%" (spotlit knob);
         playing, a 20% move read 39%, a full sweep completed;
      6. Swing 52% read "Swing 52% → 56–66%", 60% completed;
      7. swing dropped to 52% before Next ▸, so the capstone opened with four ✓ chips and
         "Swing 52% → 54–70%"; raising swing completed it at 54% and opened the compact
         dialog (8 lights, "Acid track complete · BL-303 certified", "an acid line"). After
         closing and reloading: no dialog, "Acid track — 7 of 7 complete", zero console errors
- [x] `GLOSSARY.md` updated — **Arc** (three shipped, in selector order, Acid's seven
      lessons), **Track**, **Finale** (Acid compact as BL-303), **Goal** (`notesAccented`,
      `notesSlid`, flag lanes only, connected slides only), **Progress chip** examples;
      every `[v3 spec]` tag is now retired and the header names EB3-10

**Note (fixed on this branch):** in-browser verification found that a sweep only counted
from the first knob position seen while playing, so a single keyboard jump from rest
(Env Mod 0 → End) recorded one point and no travel. That was true of every sweep lesson
before this issue. Now the position a knob moves *from* over a running loop counts too:
`observeParamMotion` (`paramMotion.ts`) takes an optional `from`, and `App`'s knob handlers
pass the knob's current value through `deckParamValue` (`projectState.ts`). Motion on a
stopped deck still leaves no trace. Covered by `paramMotion.test.ts` "counts where the knob
sat before a move made over the running loop" (and the stopped case), `projectState.test.ts`
"deckParamValue" (every knob, every family, in its knob's units), and `App.test.ts` "counts
one keypress from the bottom of a knob to the top as a full sweep", which fails with the
`from` argument removed.

## Testing decisions

- Lesson seam: parse and progress for `notesAccented` / `notesSlid`; shipped-arc
  contract extended to the Acid Arc. Prior art: `lessons.test.ts`, `arc.test.ts`.

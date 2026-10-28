# EB3-09b — Bass Slide

> Track: v3.0 · Slice 9b of 15
> Blocked by: EB3-09a
> Blocks: EB3-10
> Branch: `feat/acid-groove-09b-bass-slide`
> Spec stories: 74–78, 83 (slide parts); spec "Slide, accent and Env Mod → Slide"

## What to build

A **Slide** row under the bass lane: a slid note glides into the next step's note
without restarting its envelope, so the line bends like a 303.

## Scope

### In

- **Slide semantics:** a slid note keeps its gate open into the step right after
  the note ends.
  - If that step holds a note, the next note glides in from the slid pitch over a
    fixed ~60 ms, **without restarting** the amplitude or filter envelope
    (legato).
  - If that step is empty, the slid note ties through it and then releases.
  - Slide on a step with no note does nothing and is kept.
- Step resolution: note events gain "glided into" (legato) and "gate ties on".
  A slide that would tie across a bar boundary where the playing slot changes is
  released at the boundary.
- The bass voice moves from one attack-and-release per note to **attack/release
  pairs**, so a slid chain is one gate.
- **Slide row:** a thin row of 16 toggles under the Accent row, named like "Bass
  slide, step 5, on" / "… on (no note)". Wraps on phones aligned with the lane.
- A slid note draws a **tie** on the main bass row into the note it reaches.
- Spotlight target `slideRow:bass`.
- The two rows add 32 tab stops inside the bass section (which already has a
  skip link).
- `GLOSSARY.md`: **Slide**; drop its `[v3 spec]` tag.

### Out (and where it lands)

- Stab slide — not in v3.

## Acceptance criteria

- [x] A slid note into a following note glides (~60 ms) with no envelope restart —
      `slideReach` (`note.ts`) finds the step right after a slid note ends, from its
      clipped length; `resolveStep` marks that note `tiesOn` and the note it reaches
      `legato`. The engine glides a legato note with
      `synth.frequency.exponentialRampTo(freq, SLIDE_SECONDS, at)` (0.06 s) and touches
      neither envelope nor the voicing. `stepResolution.test.ts` "keeps a slid note’s gate
      open into the next note, which is glided into (legato)" and "carries the open gate
      across the slid note’s own length"; `engine.test.ts` "plays a slid chain as one
      gate" (one `filterEnvelope.triggerAttack`, two glides at 60 ms)
- [x] A slid note before an empty step ties through it, then releases — the note's
      gate is one step longer and releases itself: `stepResolution.test.ts` "ties a slid
      note through an empty step after it, then releases"; `engine.test.ts` "ties a slid
      note through an empty step after it" (release at 2 steps)
- [x] Slide on an empty step is silent and kept when a note is added later —
      `note.test.ts` "keeps a slide set on an empty step, and through switching the note
      off and on" and "reaches nothing … from a slide parked on a step with no note";
      `stepResolution.test.ts` "does nothing for a slide on a step with no note, and keeps
      it for a note placed later"; mounted: `App.test.ts` "keeps a slide set on an empty
      step, and says the step has no note"
- [x] A slid chain is one gate (mocked Tone: one attack, one release) — the bass voice
      moved from `triggerAttackRelease` to `triggerAttack` + `triggerRelease` pairs, the
      release skipped for a note that `tiesOn`. `engine.test.ts` "plays a slid chain as
      one gate: one attack, one release, the pitch gliding between" (three notes, 2→3→4);
      the 09a and swing/mixer bass assertions were converted to the pairs. The open gate
      is threaded from one 16th to the next (`bassTie` in, `bassTie` out, like the
      playing slot), so a gate whose note is cleared or muted before it arrives is closed
      by `releaseTie`, and Stop releases a gate still held (never before an attack the
      look-ahead already scheduled) — `stepResolution.test.ts` "releases a tied gate when
      the note it was reaching has gone…" / "…when the bass is muted…"; `engine.test.ts`
      "releases a gate still held open when the loop stops"
- [x] A slide across a bar where the playing slot changes releases at the bar — with a
      switch queued, a slide reaching past the bar line neither ties on nor ties
      through; a gate already tied when the switch lands (the slot pressed after step 16
      was scheduled) is released at step 0 before the new slot's note attacks.
      `stepResolution.test.ts` "across a bar where the playing slot changes" (3 cases);
      `engine.test.ts` "releases a gate tied across the bar when the slot changes there,
      before the new slot attacks" (release ordered before the attack, no glide)
- [x] Tie drawn on the main row from the slid note to its target; Slide row named and
      keyboard-operable; a11y suite passes — `NoteRow` marks the slid note
      `data-tie-out` and its target `data-tie-in` (CSS hooks meeting over the gap as one
      arc) and names it "Bass step 5, C2, 1 step long, slides into step 6"; a slide into a
      rest draws none; the stab never draws one. The Slide row is a second `NoteFlagRow`
      under Accent: 16 buttons with `aria-pressed`, "Bass slide, step 5, on" / "… on (no
      note)". `App.test.ts` "App bass Slide row and ties" (5 tests); `BassPanel.test.ts`
      "rings the Slide row when a lesson points at slideRow:bass"; `lessons.test.ts`
      guards `slideRow:` targets to flag lanes; `a11y.test.ts` and `render.test.ts` pass
      unchanged (the 16 new tab stops sit inside the bass section's skip link)
- [x] Slide flags survive slots, Copy, links and bundles — `share.test.ts` "round-trips
      303 accents and slides in every slot, flags parked on empty steps, and Env Mod" and
      "carries bass slides in every slot through a bundle"; `projectState.test.ts`
      "carries the slot’s slides and accents, as fresh steps that edit independently"
      (Copy) and "keeps each slot’s own slides: a slide set in B stays in B"
- [x] Phone: Slide row wraps aligned with notes and accents (Playwright 320/390 no
      overflow) — `e2e/reflow.spec.ts` counts nine wrapped rows and "the bass Slide row
      wraps under the Accent row, each toggle under its note and accent" (≤ 1 px, no
      sideways scroll) at 390×844 and 320×640; the whole suite (28) passes, fold included
- [x] In-browser: a two-note slide shows a continuous pitch glide and no second
      amplitude attack in the captured envelope — Chromium driving the dev deck from a
      wiped IndexedDB: bass C2 on step 1, G2 on step 2, bass soloed, 130 BPM, master
      recorded with `Tone.Recorder`. Unslid, pitch (30 ms autocorrelation, 5 ms hop) jumps
      65.4 → 93.6 → 98 Hz in one window and the 10 ms peak envelope re-attacks to 1.00 at
      step 2. Slid, the pitch bends 65.4 → 66.1 → 68.4 → 74.6 → 81.5 → 88.9 → 96.9 → 98 Hz
      over about 70 ms, and the envelope holds at the sustain level (0.29–0.34) through
      step 2 with no peak, releasing after two steps. The step read "Bass step 1, C2, 1
      step long, slides into step 2" and drew its tie; no console errors
- [x] `GLOSSARY.md` updated — **Slide** (tag dropped, defined as built), **Slide row**
      added, and the EB3-09b forward references in **Note step**, **Phone reflow**,
      **Step resolution**, **Spotlight** and **Bass synth** brought up to date

## Testing decisions

- Step-resolution seam: legato glide-in, tie-through, slide on empty step, bar
  boundary with slot change.
- Engine (mocked Tone): legato chain as one gate.
- Mounted app: Slide row and tie rendering.

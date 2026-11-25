# EB3-09a — Bass Accent and Env Mod

> Track: v3.0 · Slice 9a of 15
> Blocked by: EB3-00, EB3-06 (rows wrap with the phone pattern), EB3-07a (schema chain: v14 follows v13)
> Blocks: EB3-09b, EB3-10
> Branch: `feat/acid-groove-09a-bass-accent-envmod`
> Schema: **v14**
> Spec stories: 72–73, 78–84 (accent and Env Mod parts); spec "Slide, accent and Env Mod"

## What to build

The bass gets the first half of real 303 behaviour: an **Accent** row that makes
a note louder and gives it a stronger, faster filter "wow", and an **Env Mod**
knob that opens the filter on every note and lets it close with Decay.

## Scope

### In

- **Schema v14:** every note step in every slot gains `slide: false` and
  `accent: false` (both flags land here so there is one bump); the bass patch
  gains `envMod` (0–100%, default 0), clamped/defaulted by the settings repair
  like every other knob. v13 → v14 migration.
- Both note lanes share the note-step type and carry the flags, but only the bass
  shows the rows and only the bass voice reads them. The stab ignores them.
- **Env Mod:** the bass filter gets a frequency envelope based at the Cutoff
  knob, depth in octaves set by Env Mod (up to ~4 octaves at 100%), decaying with
  the existing Decay knob. Cutoff keeps moving the base live, mid-note. Env Mod
  joins the bass patch and the deck param registry (`knob:envMod`).
- **Accent:** an unaccented note plays exactly as today. An accented note gets
  ~+4 dB (the drum accent gap) via a **gain stage with headroom** — Tone velocity
  tops out at 1 — plus a fixed extra filter-envelope depth with a shorter filter
  decay. **This applies even at Env Mod 0**, so the row is never a dead control.
- Step resolution: note events carry `accent`.
- **Accent row:** a thin row of 16 toggles under the bass lane, labelled Accent.
  Plain buttons with `aria-pressed` and names like "Bass accent, step 3, on" /
  "… on (no note)". Accent set on an empty step is kept. Wraps with the bass lane
  on phones (EB3-06 pattern), step *n* aligned.
- Spotlight target `accentRow:bass`.
- Share/bundle validator: boolean note flags, envMod range.
- `GLOSSARY.md`: **Accent** (on a note step — distinct from drum accent),
  **Env Mod**; drop the `[v3 spec]` tags for them.

### Out (and where it lands)

- Slide row, legato, ties — EB3-09b.
- Stab slide/accent; a 303 Accent amount knob — not in v3.

## Intermediate state

After this slice the `slide` flag exists on every note step but has no row and
no sound. EB3-09b gives it both.

## Acceptance criteria

- [x] v13 → v14 migration: flags off, envMod 0 in every slot; the bass sounds
      identical — `migrateV13ToV14` runs `withNoteFlags` over every slot and
      `createBassSettings` over the patch. `projectState.test.ts` "lifts a v13
      document to v14: every note flag off and Env Mod 0, in every slot, sounding
      as before" (programming in two slots, both note lanes, a hand-set patch: the
      migrated document equals the current one). Identical sound: `bassVoicing` of
      an unaccented note at Env Mod 0 is unity gain and 0 octaves
      (`stepResolution.test.ts`), and the engine applies exactly that — gain 1,
      depth 0 (`engine.test.ts` "plays an unaccented note at Env Mod 0 exactly as
      before"); in-browser the unaccented note's 800–3000 Hz band and peak were
      unchanged before and after accents existed on the lane (−72.4 / −71.8 dB,
      1.072 / 1.071)
- [x] Env Mod knob opens the filter per note and Decay closes it; Cutoff still
      moves the base live while Env Mod is up — `envMod` (0–100 %, default 0) joins
      `BASS_PARAMS`, so the knob, `knob:envMod`, clamping and repair come with the
      registry. A `Tone.Envelope` scaled in cents drives the bass filter's
      `detune`, which multiplies Cutoff: `engine.test.ts` "opens the filter by Env
      Mod's octaves on every note, decaying with Decay" (2 octaves → 2400 cents at
      50 %, the envelope's decay set to the Decay knob at the attack) and "keeps
      Cutoff live with Env Mod up" (Cutoff ramps `frequency`; `detune` untouched).
      In-browser, with Env Mod at 100 % and the loop running, Cutoff moved the live
      filter 301 → 757 Hz
- [x] Accented bass notes are ~4 dB louder and audibly "wow" even at Env Mod 0;
      unaccented notes are unchanged — `bassVoicing`: accent gain =
      `ACCENT_GAIN / UNACCENTED_GAIN` (+4.2 dB, the drum gap), applied by an accent
      `Tone.Gain` after the filter because velocity tops out at 1, plus
      `ACCENT_ENV_OCTAVES` (2) of extra depth decaying in half the Decay time.
      `stepResolution.test.ts` "bassVoicing — accent and Env Mod", `engine.test.ts`
      "applies an accent as given"
- [x] Accent row: 16 named toggle buttons under the bass lane, keyboard-operable,
      flag kept on empty steps; wraps aligned on phones (Playwright 320/390 no
      overflow) — `NoteFlagRow` (plain `<button>`s with `aria-pressed`, named "Bass
      accent, step 3, on" / "… off" / "… on (no note)"), a `.step-row` holding a
      `.step-grid` so it shares the lane's tracks. `App.test.ts` "App bass Accent row
      and Env Mod" (16 names, after the lane, none on the stab; accent kept through
      note off/on; saved in the selected slot the engine reads); `a11y.test.ts`
      still green. `e2e/reflow.spec.ts` "the bass Accent row wraps with the lane,
      each toggle under its note" at 390×844 and 320×640 (x and width within 1 px,
      no page overflow); the row also passes the every-lane 2×8 check. Desktop
      measured 0 px misalignment in-browser
- [x] Flags and envMod round-trip through bank slots, links and bundles;
      non-boolean flags and out-of-range envMod rejected — `isNoteStep` requires
      boolean `slide`/`accent`; `isPatch` already range-checks every bass param.
      `share.test.ts` "round-trips 303 accents in every slot, an accent parked on an
      empty step, and Env Mod", "opens a link written before the 303 flags…",
      "rejects a payload whose note flags are not booleans", "rejects a payload whose
      Env Mod is missing or out of range", and the bundle's "carries 303 accents in
      every slot and Env Mod". Copy carries flags because `withProgrammingOf` clones
      every step
- [x] `knob:envMod` and `accentRow:bass` are spotlightable; shipped-lessons guard
      passes — `BassPanel.test.ts` rings the Accent row for `spotlitAccentRow` (App
      passes `spotlitTarget('accentRow:bass')`) and the Env Mod knob for
      `knob:envMod`; `lessons.test.ts` "spotlights a flag row only on a lane that
      shows one" (`NOTE_FLAG_LANES`) and the existing knob guard pass
- [x] In-browser FFT: with Env Mod 50% the high band rises at each note onset and
      decays; an accented note's peak and filter opening exceed an unaccented
      one's at Env Mod 0 — analyser tapped off the bass accent stage in the dev
      build, Cutoff 301 Hz, notes on steps 1 and 9 at 130 BPM, 800–3000 Hz band:
      Env Mod 0 peaked at −72.4 dB; Env Mod 50 % at −23.5 dB on the onset's step,
      falling to −85.7 dB a step later and to the floor after. At Env Mod 0 with
      step 9 accented: band −21.8 dB vs −72.7 dB and peak 1.885 vs 1.071 (×1.76),
      step 1 unchanged. Zero console errors
- [x] `GLOSSARY.md` updated — Accent (both meanings), Accent row, Env Mod, Note
      step, Bass synth, Param registry, Neutral, Step resolution, ProjectState
      (v14), Share validator, Spotlight; `[v3 spec]` dropped for what shipped

**Note:** step resolution now takes the bass patch and hands each bass note its
`voicing` (gain, filter octaves, filter decay), so the Tone callback applies it
and decides nothing. Env Mod, like Decay, takes effect on the next note; only
Cutoff is live mid-note. `slide` is on every note step but has no row and no
sound until EB3-09b.

## Testing decisions

- Document seam: toggling flags, Env Mod patch, v13 → v14.
- Step-resolution seam: note events carry accent.
- Engine (mocked Tone): accent gain stage and filter envelope applied as given.
- Mounted app: Accent row names and toggling. Share seam: flags and envMod.

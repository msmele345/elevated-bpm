# EB3-09a — Bass Accent and Env Mod

> Track: v3.0 · Slice 9a of 15
> Blocked by: EB3-00, EB3-06 (rows wrap with the phone pattern), EB3-07a (schema chain: v14 follows v13)
> Blocks: EB3-09b, EB3-10
> Branch: `feat/bass-accent-envmod`
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

- [ ] v13 → v14 migration: flags off, envMod 0 in every slot; the bass sounds
      identical
- [ ] Env Mod knob opens the filter per note and Decay closes it; Cutoff still
      moves the base live while Env Mod is up
- [ ] Accented bass notes are ~4 dB louder and audibly "wow" even at Env Mod 0;
      unaccented notes are unchanged
- [ ] Accent row: 16 named toggle buttons under the bass lane, keyboard-operable,
      flag kept on empty steps; wraps aligned on phones (Playwright 320/390 no
      overflow)
- [ ] Flags and envMod round-trip through bank slots, links and bundles;
      non-boolean flags and out-of-range envMod rejected
- [ ] `knob:envMod` and `accentRow:bass` are spotlightable; shipped-lessons guard
      passes
- [ ] In-browser FFT: with Env Mod 50% the high band rises at each note onset and
      decays; an accented note's peak and filter opening exceed an unaccented
      one's at Env Mod 0
- [ ] `GLOSSARY.md` updated

## Testing decisions

- Document seam: toggling flags, Env Mod patch, v13 → v14.
- Step-resolution seam: note events carry accent.
- Engine (mocked Tone): accent gain stage and filter envelope applied as given.
- Mounted app: Accent row names and toggling. Share seam: flags and envMod.

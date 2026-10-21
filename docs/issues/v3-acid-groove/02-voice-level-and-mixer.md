# EB3-02 — Level on every voice, plus bass/stab mute & solo

> Track: v3.0 · Slice 2 of 15
> Blocked by: EB3-00, EB3-01 (schema chain: v12 follows v11)
> Blocks: EB3-03b, EB3-07a (schema chain)
> Branch: `feat/voice-level`
> Schema: **v12**
> Spec stories: 11–23 (Level and mixer)

## What to build

Every **Voice** on the Deck — five drum lanes, four pad lanes, bass and stab —
gets a **Level** knob next to its mute and solo. Bass and stab gain mute and
solo, so one mixer rule (multiple solos allowed, solo overrides mute) covers all
eleven voices, live playing included. This finishes v1's promised "per-track
volume".

## Scope

### In

- Mixer keyed by voice (drum, pad and note lane ids). Each entry gains `level`,
  a linear gain multiplier 0 to ~2 (+6 dB), default 1. Missing entries and
  missing fields still mean "unity, unmuted, unsoloed". v11 → v12 migration.
- A channel gain per voice, ramped ~20 ms on change, sitting **after** the
  per-hit accent gain and note velocity — live and sequenced sound pass through
  it alike, and accents keep their headroom.
- Step resolution (EB3-00) filters bass and stab note events through the same
  mute/solo rule; live stab keys respect it too, as live pads already do.
- A smaller variant of `Knob`, readout in dB (−∞ at 0); taper spends most of its
  travel between −24 and +6 dB.
  - Drum and pad rows: in the lane strip after M and S.
  - Bass and stab: in the panel header, beside new M and S buttons.
- Level knobs join the deck param registry with unique ids per voice (e.g. kick
  level, pad 1 level, bass level) so `paramSwept` and spotlights can name them.
- Share/bundle validator: mixer voice ids and level range.
- `GLOSSARY.md`: **Voice**, **Level**; update the mixer/mute/solo entries.

### Out (and where it lands)

- Level goal types and mixing lessons — not in v3 (registry entries make them
  JSON-only later).
- Phone layout of the wider rows — EB3-06.

## Intermediate state

Level knobs make drum and pad rows wider; the existing phone overflow gets a
little worse until EB3-06.

## Acceptance criteria

- [ ] All eleven voices have a Level knob next to their M/S, showing dB from −∞
      to +6, defaulting to 0 dB, operable by drag and keyboard
- [ ] Bass and stab have M and S; solo works identically across all eleven
      voices (multiple solos, solo overrides mute) for sequenced and live sound
- [ ] Accented hits stay louder than unaccented at any Level (gain applied after
      accent)
- [ ] Moving a Level while playing ramps without clicks
- [ ] v11 documents migrate to v12 at unity, unmuted, unsoloed and sound
      identical
- [ ] Levels, mutes and solos round-trip through links and bundles; unknown
      voice ids and out-of-range levels are rejected
- [ ] Every Level knob is a registered deck param a lesson could spotlight or
      sweep (shipped-lessons guard still passes)
- [ ] Render-stability tests still show unrelated lanes not re-rendering on a
      Level move; a11y suite passes (every new control named)
- [ ] In-browser: Level on the hats measurably lowers only the hats; bass solo
      leaves only bass audible; muting the stab silences live keys too
- [ ] `GLOSSARY.md` updated

## Testing decisions

- Document seam: level/mute/solo across all eleven voices; v11 → v12.
- Step-resolution seam: note events filtered by mute/solo; accent gains under
  any level.
- Engine (mocked Tone): channel gains ramped; live stab respects mute/solo.
- Mounted app: bass/stab M/S/Level wiring. Share seam: round trip + rejection.

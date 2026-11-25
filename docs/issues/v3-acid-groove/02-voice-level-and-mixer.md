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
  a linear gain multiplier 0 to ~2 (+6 dB), default 1. A missing entry still
  means "unity, unmuted, unsoloed"; a missing field is repaired by the v11 → v12
  migration, and a v12 link or bundle must carry complete entries.
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

- [x] All eleven voices have a Level knob next to their M/S, showing dB from −∞
      to +6, defaulting to 0 dB, operable by drag and keyboard — `LEVEL_PARAMS`
      (`src/model/mixer.ts`) gives each voice in `VOICES` a spec (0 to
      `MAX_LEVEL` = +6 dB, default 1) on a new `'fader'` taper in `knob.ts`:
      the bottom 15% of travel runs linearly out of silence to −24 dB, the rest
      is even dB steps up to +6. `formatParam` reads it as "−∞ dB" / "0.0 dB" /
      "+6.0 dB". `VoiceMixStrip` renders M, S and a `Knob size="small"` — in
      the lane label for drum and pad rows, on the panel plate (`PanelTitle`
      children) for bass and stab. Taper and readout tested in `knob.test.ts`;
      mounted tests (`App.test.ts`, "App voice mixer") find all eleven sliders
      at "0.0 dB" beside their M/S and drive one with End/Home/PageUp/arrows
- [x] Bass and stab have M and S; solo works identically across all eleven
      voices (multiple solos, solo overrides mute) for sequenced and live sound —
      the mixer is keyed by `VoiceId`; `audibleVoiceIds`/`voiceIsAudible` are
      the one rule. `resolveStep` now filters bass and stab note events through
      it (seam tests: muted bass/stab, a drum solo silencing notes, a bass solo
      silencing every hit, cross-kind multiple solos, solo over mute), and
      `attackStabNote` refuses a live note — and its key light — when the stab
      is not audible, as `attackPad` already did (engine test). In-browser: a
      held live C4 measured −11.2 dB on the stab channel unmuted, and nothing
      (no signal, no lit key) with the stab muted or the bass soloed
- [x] Accented hits stay louder than unaccented at any Level (gain applied after
      accent) — `resolveStep` hit gains stay accent-only at Levels 0–2 (seam
      test); in the engine each kit/pad player runs player → accent gain →
      channel gain, and the engine test walks that chain to prove they are
      separate nodes
- [x] Moving a Level while playing ramps without clicks — `setMixer` ramps every
      channel with `gain.rampTo(level, 0.02)` (engine test asserts the call per
      voice). In-browser, the scheduled curve of a +6 dB → −∞ move on the perc
      channel was linear over 18 ms (1.976 → 1.577 → 1.178 → 0.779 → 0.38),
      starting after Tone's usual look-ahead, like every other knob
- [x] v11 documents migrate to v12 at unity, unmuted, unsoloed and sound
      identical — `migrateV11ToV12` fills `level: 1` (and any missing flag) on
      every existing strip and changes nothing else (whole-document `toEqual`
      in `projectState.test.ts`); a v10 document still chains through to v12.
      In-browser, Level edits autosaved as `version: 12` and came back
      identical after reload
- [x] Levels, mutes and solos round-trip through links and bundles; unknown
      voice ids and out-of-range levels are rejected — `isMixer`
      (`sharePayload.ts`, both carriers) requires a known voice id, boolean
      flags and a finite Level in `[0, MAX_LEVEL]`. `share.test.ts`: a link and
      a bundle round-trip mixed strips (hats −12 dB, bass soloed at +6, stab
      muted at −∞, a pad soloed); a v11 link opens at unity; `master`, −0.1,
      above +6 dB, a string, NaN and a missing Level are rejected
- [x] Every Level knob is a registered deck param a lesson could spotlight or
      sweep (shipped-lessons guard still passes) — `LEVEL_PARAMS` joins
      `DECK_PARAMS` (`kickLevel`, `pad1Level`, `bassLevel`, `stabLevel`, …;
      uniqueness asserted in `deckParams.test.ts`); a lesson parses with
      `knob:closedHatLevel` spotlights and `paramSwept` on `pad1Level`
      (`lesson.test.ts`). `handleLevelChange` observes Level motion like every
      other knob. The shipped-lessons contract is unchanged and passes
- [x] Render-stability tests still show unrelated lanes not re-rendering on a
      Level move; a11y suite passes (every new control named) — new
      `render.test.ts` case: a Closed Hat Level move changes only that lane's
      `level` prop and no panel's props (the sampler is handed a memoized
      pad-only mixer); a Bass Level move changes only `BassPanel`'s `level`.
      `a11y.test.ts` passes unchanged: every slider is named "<Voice> Level"
- [x] In-browser: Level on the hats measurably lowers only the hats; bass solo
      leaves only bass audible; muting the stab silences live keys too —
      analysers on each channel while playing the demo plus a bass and a stab
      note: hats −10.6 dB on the knob took the closed-hat peak from −5.0 to
      −15.6 dBFS while clap, perc, open hat, bass and stab held their levels;
      Solo Bass left the bass at +1.2 and every other channel silent; the stab
      result is under AC2. Transport stayed `started`; zero console errors
- [x] `GLOSSARY.md` updated — Voice and Level lose their `[v3 spec]` tags and
      describe what shipped; Mixer, Mute / solo, step resolution, the param
      registry, Neutral, Send / return and ProjectState (v12) corrected

## Testing decisions

- Document seam: level/mute/solo across all eleven voices; v11 → v12.
- Step-resolution seam: note events filtered by mute/solo; accent gains under
  any level.
- Engine (mocked Tone): channel gains ramped; live stab respects mute/solo.
- Mounted app: bass/stab M/S/Level wiring. Share seam: round trip + rejection.

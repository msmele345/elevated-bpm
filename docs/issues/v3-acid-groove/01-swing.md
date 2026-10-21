# EB3-01 — Swing

> Track: v3.0 · Slice 1 of 15
> Blocked by: EB3-00
> Blocks: EB3-02 (schema chain), EB3-03b, EB3-10 (`swingInRange`)
> Branch: `feat/swing`
> Schema: **v11**
> Spec stories: 1–10 (Swing); `swingInRange` from "Lesson vocabulary and progress"

## What to build

A **Swing** knob beside the tempo control shuffles every sequenced voice —
drums, pads, bass and stab — from 50% (straight) to 75% (heavy), MPC-style, on
16ths. Live-played keys and pads stay unswung. Swing is saved, shared and
bundled, and the curriculum gains a `swingInRange` goal type so the Acid Arc
(EB3-10) can teach it.

## Scope

### In

- `transport.swing`, a fraction 0.50–0.75, default 0.50; v10 → v11 migration.
- Swing applied **by the Deck, not by Tone** (see below).
- A standard `Knob` (id `swing`, readout like `54%`) in the deck param registry,
  so lessons can spotlight `knob:swing` and knob motion is observed like any
  other knob. Its value lives in the Transport, not an instrument patch.
- Share/bundle validator: swing range checked; old payloads migrate to 0.50.
- `swingInRange { min, max }` goal type (percent, within 50–75), evaluating a new
  `swing` field on the goal context; parser rejects out-of-range or inverted
  ranges.
- `GLOSSARY.md`: **Swing**; drop any spec tag on the Transport entry's swing.

### Out (and where it lands)

- Moving the knob into the sticky transport strip — EB3-03b.
- Progress chip for `swingInRange` — EB3-04a.
- Any lesson using `swingInRange` — EB3-10.
- 8th-note swing, per-slot swing, preset swing steps — not in v3.

## Implementation decisions (from the spec — do not rediscover)

- **Tone's transport swing stays at 0.** Tone's swing delays the time the step
  callback receives, and the step index is derived by rounding transport ticks
  at that time. At 75% that delay reaches half a 16th — the rounding boundary —
  so off-beat steps would resolve as the next step.
- The step index keeps coming from the straight grid.
- The step-resolution result (EB3-00) gains a **swing offset in seconds**: zero
  on even 16ths; on odd 16ths, `(swing − 0.5) × 2 × secondsPer16th`. The
  callback adds it to the scheduled time. 66% lands the off-beat at triplet
  position, 75% at dotted.
- Note lengths stay in whole steps, measured from the delayed start.
- Live-played keys and pads are never offset.
- The rAF playhead stays on the straight grid (at most half a 16th of
  difference).

## Intermediate state

Until EB3-03b, the Swing knob sits beside the tempo fader in the current Master
strip. That is expected.

## Acceptance criteria

- [ ] A Swing knob beside tempo reads 50%–75% and works by drag and keyboard
      (arrows, Page keys, Home/End) like every other knob
- [ ] Odd 16ths of every sequenced voice are delayed by the specified offset;
      even 16ths are untouched; the step index is never shifted, including at
      75% — proven at the step-resolution seam at 50/66/75%
- [ ] Live stab keys and pad hits are never offset
- [ ] Sweeping swing while playing changes the feel immediately, with no stalls
- [ ] v10 documents migrate to v11 at 0.50 and sound identical; swing persists
      across reload
- [ ] Swing round-trips through share links and bundles; out-of-range swing is
      rejected; a v10 link opens at 50%
- [ ] `swingInRange` parses, rejects bad ranges, and evaluates against the live
      swing value
- [ ] In-browser: at 130 BPM, measured off-beat delay matches the formula at 66%
      and 75% within 1 ms across two loops; bass stays locked to the kick
- [ ] `GLOSSARY.md` updated

## Testing decisions

- Document seam: set/clamp swing, v10 → v11 migration.
- Step-resolution seam: offsets at 50/66/75%, step index unchanged.
- Engine (mocked Tone): offset added to the scheduled time; Tone swing stays 0.
- Lesson seam: `swingInRange` parse + evaluate.
- Share seam: round trip, rejection, old-link migration.

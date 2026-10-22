# EB3-01 — Swing

> Track: v3.0 · Slice 1 of 15
> Blocked by: EB3-00
> Blocks: EB3-02 (schema chain), EB3-03b, EB3-10 (`swingInRange`)
> Branch: `feat/acid-groove-01-swing`
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

- [x] A Swing knob beside tempo reads 50%–75% and works by drag and keyboard
      (arrows, Page keys, Home/End) like every other knob — `SWING_PARAM`
      (`src/model/transport.ts`) is a standard `Knob` spec in percent (50–75,
      readout "54 %"), rendered by `TransportBar` beside the BPM readout; the
      Transport stores the fraction and the two meet only through
      `swingToPercent`/`swingFromPercent`. It joins `DECK_PARAMS` via
      `TRANSPORT_PARAMS`, so `knob:swing` spotlights it and its motion is
      observed like any knob's. Mounted test (`App.test.ts`, "App swing"):
      Home/End/PageUp/ArrowUp move it and drive `engine.setSwing`
- [x] Odd 16ths of every sequenced voice are delayed by the specified offset;
      even 16ths are untouched; the step index is never shifted, including at
      75% — proven at the step-resolution seam at 50/66/75% —
      `swingOffsetSeconds` is the one formula; `resolveStep` takes the
      Transport and returns `swingOffset` (seconds) for the 16th. Seam tests
      cover all 16 steps at 66/75%, zero at 50%, and distinct sounds on
      neighbouring steps 0–3 and 15 resolving as themselves at 50/66/75%. The
      engine adds the offset to chokes, drum starts and gains, pads, bass and
      stab (mocked-Tone tests: odd step at 75% lands `time + 0.5 × step`, even
      step untouched); Tone's transport swing stays 0
- [x] Live stab keys and pad hits are never offset — they still fire at
      `Tone.immediate()`; engine test at 75% asserts both, and in-browser three
      live stab keys at 75% attacked at exactly the context's current time
- [x] Sweeping swing while playing changes the feel immediately, with no
      stalls — swing reaches the engine through a `useEffect` like the mixer and
      patches, and the callback reads it on every 16th. In-browser, 50 arrow
      presses over ~2 s while playing: consecutive off-beats landed 15 → 21.9 →
      27.7 → … → 53.1 ms late, the transport stayed `started`, and its tick
      rate never dropped (0.38–0.49 ticks/ms against 0.416 expected)
- [x] v10 documents migrate to v11 at 0.50 and sound identical; swing persists
      across reload — `migrateV10ToV11` adds `swing: 0.5` and changes nothing
      else (asserted with `toEqual` on the whole document). In-browser: a 75%
      edit autosaved as `{ version: 11, transport: { bpm: 130, swing: 0.75 } }`
      and came back at "75 %"; a hand-written v10 document (`{ bpm: 126 }`)
      opened at "50 %", 126 BPM, beat intact
- [x] Swing round-trips through share links and bundles; out-of-range swing is
      rejected; a v10 link opens at 50% — `isSharedProject` checks
      `MIN_SWING ≤ swing ≤ MAX_SWING` for both carriers; `share.test.ts` covers
      a 62% link round trip, a 70% bundle, a v10 link opening at
      `{ bpm, swing: 0.5 }`, and 0.49 / 0.76 / non-number / missing rejected
- [x] `swingInRange` parses, rejects bad ranges, and evaluates against the live
      swing value — percent within 50–75, rejecting out-of-range, inverted,
      fraction-valued and non-numeric ranges. It judges the whole percent the
      knob reads (`wholeSwingPercent`), so "56 %" on screen meets 56–66 even at
      55.51%; boundary tests pin this. `GoalContext.swing` comes from
      `goalContextFor`; the shipped-arc contract knows how to satisfy and break it
- [x] In-browser: at 130 BPM, measured off-beat delay matches the formula at 66%
      and 75% within 1 ms across two loops; bass stays locked to the kick — a
      fresh deck programmed through the UI (kick 1/5/9/13, closed hat and bass
      on all 16), swing set from the keyboard, with the kick, closed-hat and
      bass voices wrapped to log scheduled times. 66%: 58 off-beats over 7
      loops all 36.9231 ms late (formula 36.923), even steps 0, max error 0 ms.
      75% (set live with End): 18 off-beats over 2.3 loops all 57.6923 ms late
      (formula 57.692), max error 0 ms. Every kick and hat time had a bass note
      at the identical time; kicks stayed 461.538 ms apart; zero console errors
- [x] `GLOSSARY.md` updated — Swing and Transport lose their spec tags and
      describe what shipped; Step resolution, Goal context, goal types, Param
      registry, Live play, Playhead, Neutral, Demo groove and ProjectState (v11)
      updated, with spec tags kept only on what is still unbuilt

## Testing decisions

- Document seam: set/clamp swing, v10 → v11 migration.
- Step-resolution seam: offsets at 50/66/75%, step index unchanged.
- Engine (mocked Tone): offset added to the scheduled time; Tone swing stays 0.
- Lesson seam: `swingInRange` parse + evaluate.
- Share seam: round trip, rejection, old-link migration.

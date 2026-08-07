# EB2-02 — FX sends: delay and reverb on the master bus

> Track: v2.0 · Slice 2 of 10
> Depends on: EB2-01
> Blocks: EB2-03 (send-tap contract, param registry)
> Branch: `feat/fx-sends`
> Folds in: the **FX sends** item deferred to v1.x in `docs/PRD.md`
> Resolves review finding: **G12**

## Why this slice, and why here

FX sends were parked at v1.x as "dub techno lesson material". They come first in
v2 because three things the sampler needs get built as a side effect of doing
them, and doing them second would mean building each thing twice:

1. **A send tap on every voice.** Today every instrument connects straight to
   `master.input`. Sends require each voice to fan out to an FX bus as well. If
   the sampler ships first, pad voices connect directly like everyone else and
   then get retrofitted; if FX ships first, pads follow an established contract.
2. **A deck-wide param registry.** `paramSwept` goals validate the param name
   against `BASS_PARAMS` only, which is why the Phase 9 master macros cannot
   carry a sweep goal today (G12). The sampler's Tune knobs hit the same wall.
   FX forces the fix.
3. **The Master strip's final layout**, settled before a pad panel has to fit
   beside it.

It also means the sampler arrives into a deck where a chop can be given space.
A dry one-shot is the least musical thing on this instrument.

## Scope

### In

- A shared FX bus carrying one delay and one reverb.
- Per-instrument send level: drums (one send for the kit), bass, stabs.
- FX parameters on the Master strip as `Knob`s, alongside the existing filter and
  drive macros.
- `ProjectState` v8: `instrumentSettings.fx`, with a v7 → v8 migration that
  defaults the patch the way v6 → v7 defaulted the master macros.
- Share payload validation extended to the FX patch.
- The param registry widened so any deck knob can be the subject of a
  `paramSwept` goal.

### Out (and where it lands)

- **Per-drum-lane sends.** One send level for the whole kit in this slice. Seven
  send controls is a mixer redesign, not an FX feature.
- **A dub techno lesson.** The goal vocabulary becomes capable of expressing one;
  authoring it belongs with the curriculum work in EB2-09, where the techno arc's
  fourteen-lesson shape and its graduation moment are already on the table.
- **Pad sends** — EB2-03, which follows the contract this slice sets.

## Implementation decisions

### Signal flow

The master bus today is `input → filter → drive → destination`. It becomes:

```
voice ──┬─────────────────────────────► master.input ─► filter ─► drive ─► out
        └─► sendGain ─► fxBus ─► delay ─► reverb ─┘
```

- **FX return lands on `master.input`, upstream of the master filter.** This is
  the deliberate choice: it means the macro filter sweeps the delay tails with
  the mix, which is the dub techno move the feature exists for. Returning
  downstream would leave tails ringing brightly through a closed filter and sound
  wrong.
- **Delay before reverb**, the conventional order — reverb smears the repeats
  rather than the repeats multiplying a smeared signal.
- **Sends are post-fader in spirit**: the tap comes off each voice's existing
  output node, so muting a lane mutes its send too. A muted lane that keeps
  feeding the delay would be a bug report.

### Delay is transport-synced

Delay time is expressed in musical divisions, not milliseconds, and the dotted
eighth is the default — it is *the* techno delay. This couples the FX bus to the
transport, which is new. Follow the existing rule: the transport is the only
musical clock, so use Tone's notation-based delay time and let it follow BPM,
never compute milliseconds from `bpm` by hand.

### Reverb must not touch the startup path

`Tone.Reverb` generates its impulse response asynchronously and exposes a
`ready` promise. Awaiting that on the first user gesture is exactly the stall the
product's first-click promise forbids.

Pick one, and state which in the PR:

- Use a synchronous algorithmic reverb (`Freeverb` / `JCReverb`) — cheaper, no
  IR generation, and entirely adequate for a send reverb on a groovebox; or
- Use `Tone.Reverb` but build it **off** the unlock path, leaving the send dry
  until `ready` resolves.

Do not await IR generation inside `unlockAudio`.

### Params

- FX knobs join `MASTER_PARAMS` in spirit but get their own spec list, so the
  Master strip can group them visually. Ranges, defaults and tapers follow the
  `ParamSpec` shape already used by bass and master knobs.
- **All FX params rest neutral**: sends at zero. An untouched deck must sound
  bit-identical to the one before this slice, the same promise the master macros
  made at v7.
- **Widen the param registry (G12).** `parseParamSweptGoal` builds its allowed
  set from `BASS_PARAMS`. Replace that with a single deck-wide registry of every
  knob the deck has — bass, master, FX, and later the sampler's Tune knobs — so a
  `paramSwept` goal can name any of them and a mistyped one still fails loudly at
  parse time. `observeParamMotion` already works off a `ParamSpec`, so knob motion
  recording needs no change once the registry is shared.

## Acceptance criteria

- [ ] A delay and a reverb audibly shape the mix from the Master strip, fed by
      per-instrument send levels for drums, bass and stabs
- [ ] Delay time is expressed musically and follows the transport: changing BPM
      mid-playback moves the repeats with the grid, with no clicks and no
      rescheduling
- [ ] With every send at zero — the shipped default — the deck's output is
      unchanged from before this slice, verified by comparing spectra of the same
      pattern before and after
- [ ] Muting or un-soloing a lane silences its send as well as its direct signal
- [ ] The FX return sits upstream of the master filter: closing the master filter
      while a delay tail rings audibly dulls the tail, not just the dry signal
- [ ] The first user gesture still unlocks audio and reaches a playable deck
      without waiting on reverb impulse generation
- [ ] `instrumentSettings.fx` persists in a v8 document, restores onto the live
      audio nodes after a reload, and a v7 document migrates in place keeping its
      beat and earned lessons
- [ ] A share link round-trips the FX patch, and a payload with an out-of-range
      or missing FX value is refused
- [ ] A `paramSwept` goal can name any knob on the deck — bass, master or FX —
      and a goal naming a knob that does not exist still fails at parse time
- [ ] Dragging an FX knob during playback causes no audio dropout and no dropped
      frames, held to the Phase 9 standard

## Testing decisions

**Seam 1 — pure model functions** (prior art: `src/model/master.test.ts`).
Carries the FX patch specs, clamping and repair of a hand-edited document, the
mapping from patch values to bus parameters, and the widened param registry —
including that every knob on the deck resolves in it and that an unknown id does
not.

**Seam 2 — the document** (prior art: `src/model/projectState.test.ts`).
The v8 shape, the setter for an FX param, and the v7 → v8 migration defaulting a
neutral patch onto an older document without disturbing its pattern or progress.

**Seam 3 — share round-trip** (prior art: `src/model/share.test.ts`).
A driven FX patch survives a round trip; an out-of-range or absent FX value is
rejected. Extend the existing suite.

**Seam 4 — render discipline** (prior art: `src/render.test.ts`,
`src/components/laneMemo.test.ts`). An FX knob move mid-playback must hand every
lane and panel unchanged props. New knobs on the Master strip are new props
flowing through `App`; this is exactly the regression Phase 9 AC5 bought.

## Verification beyond unit tests

Unit tests cannot claim any of this sounds right. In-browser, while playing:

- Raise the stab send and confirm repeats appear at the dotted eighth against the
  grid; change BPM and confirm they move with it.
- Close the master filter and confirm the delay tail dulls with the mix.
- Measure a spectrum with all sends at zero against the pre-change build and
  confirm they match.
- Drag an FX knob through a full sweep during playback and confirm the transport
  never stalls and no frame exceeds the Phase 9 threshold.
- Confirm the first click still reaches sound with no perceptible delay,
  especially if you chose `Tone.Reverb`.

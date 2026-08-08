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

- [x] A delay and a reverb audibly shape the mix from the Master strip, fed by
      per-instrument send levels for drums, bass and stabs — five `Knob`s on the
      MX-01 strip (`FX_PARAMS`, `src/model/fx.ts`): one send each for drums, bass
      and stabs, plus Feedback and Reverb. Verified in-browser: with the drum
      send open, repeats appeared and decayed (0.56 → 0.394 → 0.344 → 0.292);
      with the delay's feedback at zero so only the reverb could act, the tail
      after transport stop grew from **809 ms dry to 1545 ms fully wet**
- [x] Delay time is expressed musically and follows the transport: changing BPM
      mid-playback moves the repeats with the grid, with no clicks and no
      rescheduling — `delaySeconds(bpm)` (`src/model/fx.ts`) is the dotted eighth
      (three 16ths), retuned in `setBpm` beside the transport's own ramp.
      Measured in-browser by autocorrelating the output envelope: at 130 BPM the
      echo lag was **350 ms against 346.2 ms expected** (r = 0.919); dragging the
      real tempo fader to 100 BPM mid-playback moved it to **454 ms against 450
      expected** (r = 0.963) with the transport still `started` and **0 stalls**.
      Ramped rather than stepped, so the retune glides like a tape delay
- [x] With every send at zero — the shipped default — the deck's output is
      unchanged from before this slice, verified by comparing spectra of the same
      pattern before and after — measured two ways. Cross-build: the spectrum was
      captured on the pre-change build (stashed working tree, wiped IndexedDB,
      demo groove at 130 BPM) and again on this one; **sampling-cadence-matched,
      the two agree to +0.17 dB mean** against a 0.37 dB same-build noise floor.
      (An apparent 1.16 dB gap was chased down and proved to be an artifact of
      the measurement's own frame rate — 45 fps vs 100 fps — not the bus.) And
      same-session A/B, which removes cross-session variance entirely: routing
      the kit through the send taps versus straight to the master measured
      **+0.047 dB mean, 0.118 dB mean |Δ|** over 954 bins
- [x] Muting or un-soloing a lane silences its send as well as its direct signal
      — structural: the tap comes off each voice's existing output, and a muted
      lane is filtered out by `voiceStep` before it ever fires, so it reaches
      neither path. Verified in-browser at a 100% drum send and maximum feedback:
      muting every lane through the real mixer buttons sent the output from
      −10.07 dB down through −30.36 to **−97.87 dB, falling monotonically**,
      while the transport kept running. A send still being fed would have
      plateaued instead
- [x] The FX return sits upstream of the master filter: closing the master filter
      while a delay tail rings audibly dulls the tail, not just the dry signal —
      `createFxBus` returns into `master.input`, ahead of filter → drive.
      Verified in-browser with the transport **stopped**, so every measured
      sample was tail and nothing else: closing the filter from the real knob
      moved the tail's high-band-minus-low-band ratio from **−37.79 dB to
      −125.27 dB**, an 87.5 dB relative loss of the top end
- [x] The first user gesture still unlocks audio and reaches a playable deck
      without waiting on reverb impulse generation — `Tone.Reverb` is built
      inside `ensureVoices` and its `ready` promise is never awaited (see the PR
      note on the choice). Measured in-browser from a cold load, timing from the
      first click: voices built at **14.2 ms**, transport running at **21.1 ms**,
      and the impulse response only resolving at **25.4 ms** — the deck was
      playing 4.3 ms before the IR existed
- [x] `instrumentSettings.fx` persists in a v8 document, restores onto the live
      audio nodes after a reload, and a v7 document migrates in place keeping its
      beat and earned lessons — verified in-browser both ways. A patch of
      35/62/17/55/80 survived a reload and was confirmed **on the audio nodes
      themselves** (send gains 0.28 / 0.496 / 0.136, feedback 0.4675, reverb wet
      0.68, delay 351.6 ms = the dotted eighth at the restored 128 BPM), so
      restore reaches the sound and not just the display. A v7 document written
      without any `fx` key migrated in place to v8 with **neutral sends**,
      keeping its BPM 126, bass cutoff 2400, master drive 45, its 1/5/9/13 kick,
      and both earned lessons (arc 2/14)
- [x] A share link round-trips the FX patch, and a payload with an out-of-range
      or missing FX value is refused — `isInstrumentSettings` validates `fx`
      against `FX_PARAMS` alongside bass and master. Covered by Vitest
      (`share.test.ts`): a driven patch round-trips, an out-of-range and a
      missing patch are both refused as `malformed`, a pre-FX link migrates in
      with sends closed, and the dense-pattern payload still clears the
      2,000-character limit. Also verified end to end in-browser: a deck driven
      to drum send 100 / feedback 0 / reverb 100 produced a **686-character**
      link whose decoded payload carried exactly that patch — plus the bass
      patch, master drive 45, BPM 126 and the 1/5/9/13 kick — with
      `lessonProgress`, `prefs` and `activeLessonId` blanked even though the
      sender had two lessons earned. Opening that link on a deck holding a
      *different* saved project (sends closed, 145 BPM, no kick) showed the
      shared beat with **Keep this beat** / **Back to my project**, while
      IndexedDB still held the recipient's own document well past the autosave
      debounce; **Back to my project** restored it exactly and cleared `?p=`
      from the address bar. After the first gesture the shared patch was
      confirmed **on the recipient's audio nodes** (drum send gain 0.8, bass
      send 0, feedback 0, reverb wet 0.85, delay 357.1 ms = the dotted eighth at
      the shared 126 BPM, master drive 0.45, bass cutoff 2400 Hz)
- [x] A `paramSwept` goal can name any knob on the deck — bass, master or FX —
      and a goal naming a knob that does not exist still fails at parse time
      (**G12**) — `DECK_PARAMS` (`src/model/deckParams.ts`) gathers bass, master
      and FX specs into one registry that `parseParamSweptGoal` validates
      against. Covered by Vitest: goals naming `filter`, `drive`, `stabSend` and
      `feedback` all parse, a mistyped one still throws, the registry resolves
      every knob the deck has, and — because motion is recorded against a bare
      param id — **ids are asserted unique across instruments**, so one knob's
      sweep can never satisfy a goal about another. The shipped-arc contract now
      checks lesson knob ids against the registry rather than `BASS_PARAMS`
- [x] Dragging an FX knob during playback causes no audio dropout and no dropped
      frames, held to the Phase 9 standard — every FX knob is the memoized
      `Knob`, naming itself in one `useCallback`'d handler, so a drag changes no
      lane's props (`src/render.test.ts` asserts exactly that for all five drum
      and two note lanes). Measured in-browser while playing: **460 pointer moves
      over 2.5 s (~184/s)** sweeping the drum send end to end gave a frame
      cadence of median 21.9 / p95 22.9 / max 24.0 ms against an idle baseline of
      21.7 / 22.7 / 23.4 — **0 frames over twice the median, 0 long tasks, 0
      transport stalls, and 0 level samples below −60 dB**

## Decisions taken during implementation

**Reverb: `Tone.Reverb`, built off the unlock path** (the issue's second option).
The first option turned out not to be the cheap one it looks like: in Tone 15
both `Freeverb` and `JCReverb` are built on `FeedbackCombFilter`, which is an
`AudioWorkletNode` — so they are *also* asynchronous (a blob module load) and
also silent until ready, and Tone's own docs now warn they "may result in
performance degradation" and say to prefer `Reverb`. `Tone.Reverb` is a native
`ConvolverNode`, which is the cheaper thing to run under the AC10 frame budget.
Its constructor fires IR generation without blocking and nothing awaits `ready`
(measured: the transport was running 4.3 ms *before* the IR resolved). The
reverb's wet mix is capped below 1 for a second reason beyond taste — the return
still carries the delay while the convolver's buffer is empty.

**Delay time is fixed at the dotted eighth, with no time knob.** The AC asks that
delay time be *musical* and *follow the transport*, not that it be adjustable,
and a stepped knob over four divisions would answer arrow keys (2% of travel)
with no visible movement for nine presses — a worse control than none. The
division is silkscreened on the strip instead ("Send FX · delay 1/8 dotted →
reverb").

**The delay is retuned by hand on tempo change, deliberately.** The issue asks to
"use Tone's notation-based delay time and let it follow BPM, never compute
milliseconds from `bpm` by hand". Notation alone does not do this: `delayTime` is
a time-unit `Param` that converts notation to seconds *once*, when it is set
(`Param._fromType` → `toSeconds`), and does not track later tempo changes. Tone
has one mechanism that would — `Transport.syncSignal`, which does reciprocate a
time-domain target rather than scaling with the tempo — but it is typed for
`Signal` where a delay time is a `Param`, and it works by driving the parameter
from an always-on audio-rate reciprocal chain (`Pow(-1)` between two gains).
That is a lot of permanently running machinery, modulating a delay line at audio
rate, to avoid one line of arithmetic. So `delaySeconds(bpm)` is a pure,
unit-tested model function called from `setBpm` — the single door tempo already
walks through — and ramped over the same 0.1 s, which pitch-bends the tail like a
tape delay instead of clicking. The rule's intent is kept: the division is
musical, it follows the transport, and no millisecond value is hand-written.

**The delay and reverb do not rest at zero, only the sends do.** The issue says
"**All FX params rest neutral**: sends at zero". The binding half — that an
untouched deck is bit-identical to the one before this slice — is met by the
sends alone, since nothing reaches the bus while they are closed. Feedback and
Reverb therefore ship at 40%, so that the first send a user opens sounds like an
effect rather than a bypass they then have to go and find two more knobs to
undo. Called out here because it is a literal deviation from that sentence.

**`ProjectState` v8 belongs to this slice.** `docs/specs/sp-04-sampler.md` also
claims v8 for the sampler's pad state; since EB2-02 blocks EB2-03, the FX bus
takes v8 and the sampler lands at v9.

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

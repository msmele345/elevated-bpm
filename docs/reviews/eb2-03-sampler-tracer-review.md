# Code review — EB2-03 / SP-04 sampler tracer

> Commit: `e2b7a14 feat: add SP-04 sampler tracer`
> Diff: `git diff e2b7a14^...HEAD` — 35 files, +2,244 / −168
> Spec: `docs/issues/03-sampler-tracer.md` (corrects `docs/specs/sp-04-sampler.md`)
> Reviewed: 2026-08-10. Two axes (standards, spec) reviewed independently, then aggregated.

**Verdict: nothing blocks the slice.** Every acceptance criterion is present in
substance, every binding implementation decision is honoured, all seven named
test seams got a test, and nothing from *"Deliberately not in this slice"*
appears. The slice's reason for existing — the G1 correction — genuinely landed.

What follows is the defect list and, more importantly, the four structural
problems that will cost real money in EB2-04/05 if they are not addressed
first.

---

## Contents

- [Confirmed defects](#confirmed-defects) — 3 bugs, all small fixes
- [Design flaws needing refactor](#design-flaws-needing-refactor) — 4 items, the substance of this review
- [Standards axis](#standards-axis)
- [Spec axis](#spec-axis)
- [Test-coverage gaps](#test-coverage-gaps)
- [Suggested order of work](#suggested-order-of-work)

---

## Confirmed defects

These three were independently re-verified against source during aggregation,
not taken on the reviewing agents' word.

### D1 — A pad's Space/Enter can be permanently killed by tabbing away mid-hold

**`src/components/SamplerPad.tsx:65-69`** · severity: medium · fix: small

`handleKeyUp` is bound to the button's own `onKeyUp`:

```tsx
const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
  if (event.code !== 'Space' && event.code !== 'Enter') return
  event.preventDefault()
  attack(`button:${pad.id}:${event.code}`)
}

const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
  if (event.code !== 'Space' && event.code !== 'Enter') return
  event.preventDefault()
  release(`button:${pad.id}:${event.code}`)
}
```

Hold Space on a pad, Tab away, then release. The keyup lands on the newly
focused element, never on the pad. The `button:padN:Space` entry survives in
`heldSources`, and the `has()` early-return at `SamplerPad.tsx:31` then makes
**that pad's Space and Enter permanently dead until unmount**:

```tsx
const attack = (inputSourceId: string) => {
  if (heldSources.current.has(inputSourceId)) return   // ← never false again
  ...
}
```

`StabKeyboard.tsx:115` handles `button:${event.code}` sources in the **global**
keyup listener for exactly this reason. The sampler diverged from the prior art
that already solved it.

**Fix:** release `button:` sources from the panel's global keyup (mirroring
`StabKeyboard.tsx:115`), or add an `onBlur` that drains `heldSources`.

---

### D2 — Equal-time retrigger throws inside Tone

**`src/audio/engine.ts:431` + `src/audio/padVoice.ts:54-99`** · severity: medium · fix: one line

`attackPad` de-dupes on `inputSourceId`, not on pad:

```ts
export function attackPad(inputSourceId: string, padId: PadLaneId): void {
  if (heldPadSources.has(inputSourceId)) return
  ...
  void unlockAudio().then(() => {
    const now = Tone.immediate()
    triggerPlayablePad(padId, 1, now, now)
  })
}
```

Hold a pad with the mouse and press its digit key — the exact simultaneity AC5
and AC8 invite. Two different input sources, so both pass the guard, and both
resolve to the same `Tone.immediate()` (block-quantised, ~2.7 ms).

In `triggerPadVoice`, `future` is `pendingHits` filtered by
`hit.startsAt > currentTime`. For a live hit `time === currentTime`, so the
first hit is **not** in `future`, `insertedBeforeFuture` is false, and control
falls straight through to `startHit(voice, next)` — a second `player.start` at
an identical time. Tone's started branch then hits:

```js
assert(GT(computedTime, prevStartTime), "Start time must be strictly greater than previous start time")
```

(`node_modules/tone/build/esm/source/Source.js:133`; `GT` uses EPSILON, so equal
times fail.) It surfaces as an **unhandled rejection** inside
`void unlockAudio().then(...)` and leaves `pendingHits` stale. The first hit
still sounds — this is an uncaught engine exception, not silence.

**Fix:** a `time > lastStart` guard in `triggerPadVoice` (which the voice object
from [R2](#r2--padvoicets-pending-hit-replay-is-unowned-module-level-mutable-state)
would naturally own).

---

### D3 — `stop()` has no sampler half; pad LEDs stick after Stop

**`src/audio/engine.ts:534-540`** · severity: low · fix: one line

```ts
export function stop(): void {
  const transport = Tone.getTransport()
  transport.stop()
  stab?.stopSequenced()
  stabSoundingNotes.clearSequenced()
  // stop() resets transport position, so the next play starts on step 1.
}
```

There is no `padSoundingLanes.clearSequenced()`. A pad scheduled inside the
transport lookahead keeps its LED — and its `aria-pressed="true"` — for up to
its window after Stop.

This breaks the Phase 6 contract stated in `plans/elevated-bpm-v1.md`
("transport stop clears sequenced highlights without clearing live ones"). Drums
share the *sound* behaviour, so it is specifically the lights that break — and
pads, unlike drums, have lights.

**Fix:** `padSoundingLanes.clearSequenced()` alongside the stab clear.

---

## Design flaws needing refactor

This is the part worth acting on before EB2-04 and EB2-05 start. Each of these
is cheap now and expensive after the next slice lands on top of it.

### R1 — The pad's buffer is bound to the pad, not to its source

**`src/audio/kit.ts` (`PAD_SAMPLES`), `src/audio/engine.ts:461`** · severity: **high** · scope: new module + engine change

`PAD_SAMPLES` maps all four pad ids to a fixed URL, and playback is gated on the
one shipped source id:

```ts
// The tracer has one shipped source. Later intake replaces the Player's
// buffer before assigning other source ids; until then an unknown id is
// metadata without playable audio and must stay silent.
if (!voice || pad.region?.sourceId !== CURATED_SAMPLE_SOURCE.id) return
```

The issue deliberately scoped this slice to a shipped asset, so **this is not a
spec breach**. The problem is that the model and the audio layer now disagree
about what owns a buffer:

| Layer | Says |
|---|---|
| Model | a pad holds a *region into a source*; one source can back several pads |
| Audio | a pad has *one URL*, fixed at construction |

EB2-04 (file loading) and EB2-05 (three chops from one break) both invalidate
the audio layer's version, and nothing in this slice prepares the join. The
comment above is an accurate description of a seam that does not exist yet.

**Fix shape:** `src/audio/sampleRegistry.ts` keyed on `SampleSource['id']` —
`register(sourceId, buffer)` / `has(sourceId)` — with the pad voice resolving
its buffer from `pad.region.sourceId` at trigger time. The guard then becomes
"the registry knows this source", which is honest today and correct later.

---

### R2 — `padVoice.ts` pending-hit replay is unowned module-level mutable state

**`src/audio/padVoice.ts:31`** · severity: **high** · scope: one module, mirrors existing prior art

```ts
/** Future hits already handed to each Tone.Player by transport lookahead. */
const pendingHits = new WeakMap<PadVoice, PendingPadHit[]>()
```

A module-level singleton keyed by voice identity: it cannot be reset, inspected,
or disposed. The stop → `cancelScheduledValues` → replay-the-future-starts
algorithm in `triggerPadVoice` is the most intricate code in the whole change,
and it exists only because one `Tone.Player`'s `playbackRate` setter mutates
every active source.

`fit` (EB2-05) adds rate variation to exactly this path.

The repo **already solved the same live-vs-sequenced contention with an owning
object**: `createStabVoices` in `src/audio/stabVoice.ts`.

**Fix shape:** `createPadVoice(player, gain)` returning
`{ trigger(pad, gain, time, now), dispose() }` that owns its own queue. Three
things fall out for free:

1. D2's equal-time guard has an obvious home.
2. It removes the `(padId, gain, time, currentTime)` **Data Clump** threaded
   through `triggerPlayablePad` → `triggerPadVoice` → `plannedHit`.
3. It makes the audio test injectable like `padVoice.test.ts` /
   `stabVoice.test.ts`, instead of the hand-rolled fake Tone library in the new
   `engine.test.ts` — which currently asserts on `tone.repeatCallbacks[0](42)`
   and `player.start.mock.calls`. That coupling is forced by `engine.ts`'s
   module-level singleton state, not chosen.

---

### R3 — Lane-kind dispatch will multiply (Shotgun Surgery)

**`src/model/pattern.ts:137`, `src/audio/engine.ts:357`, `src/audio/engine.ts:507`** · severity: medium · scope: engine + pattern

The issue promised one voice registry so that "`voiceStep` needs no dispatch."
That is true for *voicing* — but the branch reappeared three times elsewhere:

```ts
// engine.ts:507 — the trigger path
for (const hit of starts) {
  const voice = voices[hit.laneId]
  if (isPadLaneId(hit.laneId)) {
    triggerPlayablePad(hit.laneId, hit.gain, time, Tone.immediate())
  } else {
    voice.gain.gain.setValueAtTime(hit.gain, time)
    voice.player.start(time)
  }
}
```

plus routing at `engine.ts:357` and step-array resolution at `pattern.ts:137`.
Every future voice type or per-pad choke group is now a three-site edit.

**Fix shape:** build the branch **once**, in `ensureVoices` — give `Voice` a
`trigger(gain, time, now)` closure (drums get `start`, pads get the voice object
from R2) so the play loop becomes `voices[hit.laneId].trigger(...)` with zero
branch. Separately, put lane-array resolution behind one
`laneArrayFor(pattern, laneId)` in `pattern.ts`, which also removes the
`(pattern as Partial<Pattern>).padLanes ?? []` cast in `withPadLanes`.

---

### R4 — Live-input plumbing is now duplicated across two instruments

**`src/components/SamplerPanel.tsx:55-118` vs `src/components/StabKeyboard.tsx:66-142`** · severity: medium · scope: two hooks

Near-verbatim copies: the same rAF `signature !== previous` light loop, the same
`keydown`/`keyup`/`blur`/`visibilitychange` + `releaseAll` block, the same
`computer:${event.code}` source ids. Two instruments now maintain the same live
input plumbing in parallel — and D1 is precisely a bug caused by that copy
drifting from its original.

Related duplication:

- `createPadSoundingLanes` (`src/model/sampler.ts:210+`) re-implements
  `createStabSoundingNotes` (`src/model/stab.ts:152`) — same expire-by-`atTime`
  window registry, differing only in the retrigger clip.
- **"This input source is already holding" is guarded three times** for pads:
  `SamplerPad.heldSources`, `SamplerPanel.heldComputerSources`, and
  `engine.heldPadSources`. The stab path has two. One `createPadHolds()` beside
  `createStabNoteHolds` should own it — and would have made D1 impossible.

**Fix shape:** extract `useLiveInstrumentKeys` / `useSoundingLights`, and one
holds registry per instrument, shared in shape.

---

### Smaller structural notes

- **`SamplerPanel.tsx:144`** — `const sampleSource = sources[0]` silently assumes
  the curated source is first, and bakes that assumption into an `aria-label`.
  Resolve by `origin === 'shipped'` or by id.
- **Divergent Change — `src/model/sampler.ts` (239 lines)** carries source/region
  types, the pad registry, knob specs, persistence repair, keyboard-input
  mapping, playback-rate math, *and* an audio-clock light registry. Its
  neighbours split exactly these concerns (`bass.ts`, `knob.ts`, `mixer.ts`,
  `note.ts`).
- **`MIN_FIT_STEPS`/`MAX_FIT_STEPS`** are range-checked in both
  `sampler.ts:120` and `share.ts:238`. The validate/repair split follows the
  bass/master precedent, but these two will drift.

---

## Standards axis

*Reported independently; not merged or reranked against the spec axis.*

**No hard violations of a documented standard**, with one exception below.

What passes deserves naming: pad lights are rAF-over-DOM, never React state on
the audio clock (`SamplerPanel.tsx:55-82`), per the performance rule in
`plans/elevated-bpm-v1.md`; the DOM/SVG rendering split holds (pads are buttons,
Tune is `Knob`); `ProjectState` stays one versioned document with a real v8→v9
link in the chain; the sampler is registered in `DECK_SECTIONS` so skip links
and headings are enforced rather than remembered; new CSS reuses the Phase 9
`:root` token set at the same ratio as the code beside it.

### Documented-standard findings

- **Branch name** (`AGENTS.md`, git strategy) — `feat/issue-03-samplert-tracer`
  contains a typo, and the issue prescribes `feat/sampler-tracer`. Correctly cut
  from `develop`; commit message format is correct.
- **`src/App.test.ts:38`** — the new file-wide `vi.mock('./audio/engine')`
  silently moved the **pre-existing share-workflow tests** from a real engine to
  a mocked one. Engine-mocking is itself endorsed (sp-04 seam 3, and
  `a11y`/`render`/`appAutosave` already did it), but this weakens what those
  older tests verify, unannounced. Side effect: `vi.mock('tone', …)` in that file
  is now dead — `engine.ts` is the only non-test importer of `tone`.
- **`src/App.test.ts`** — two real `await new Promise(r => setTimeout(r, 450))`
  sleeps to outwait the 400 ms autosave debounce. Phase 3 established fake timers
  for exactly this.
- **TDD cadence** (judgement) — one 2,244-line / 35-file commit; the previous
  phase shipped several. Tests exist at all seven seams the issue named, so this
  is granularity, not absence.

### Baseline smells (all judgement calls)

Duplicated Code (R4, strongest), Repeated Switches (R3), Divergent Change
(`sampler.ts`), Data Clumps (R2) — all detailed in
[Design flaws needing refactor](#design-flaws-needing-refactor) above, plus D1
which fell out of the R4 divergence.

---

## Spec axis

*Reported independently; not merged or reranked against the standards axis.*

**Verdict: nothing blocks.** Every acceptance criterion is present in substance,
every binding implementation decision is honoured, all seven test seams got a
test, and nothing from *"Deliberately not in this slice"* appears in the diff —
no intake, editor, waveform, audio persistence, recording, bundles, or Sampling
Arc; `fit` is shape-only. The reviewing agent reported `npx tsc -b` clean and
348/348 Vitest passing. *(Not independently re-run during aggregation.)*

The slice's reason for existing — **G1** — genuinely landed: `Mixer` is
`Partial<Record<LaneId, LaneMix>>` (`src/model/mixer.ts:13`), `audibleLaneIds`
is generic over `LaneId`, and the spec's own corrected claim is asserted **in
both directions at two seams** (`mixer.test.ts:32-41`, `hits.test.ts:88-100`).
Share validation widens (`share.ts:isMixer`) and rejects `pad5`; v8→v9 preserves
beat, FX patch and earned lessons (`projectState.test.ts:396`).

### (a) Missing or partial

None blocking. See [Test-coverage gaps](#test-coverage-gaps) for ACs satisfied
in code but not held down by a test.

### (b) Scope — one judgement call

`samplerSend` adds a **sixth FX knob** (`fx.ts:41`, rendered from `FX_PARAMS` at
`App.tsx:619`) and changes the FX document shape. AC3 asks only that *"the FX
sends from EB2-02 shape them along with everything else."* It follows EB2-02's
pre-existing per-instrument tap contract (*"give it a tap and it is on the
bus"*, `engine.ts:97-105`), and `migrateV8ToV9` repairs old documents via
`createFxSettings`. **Flag, don't fail.**

### (c) Implemented but wrong

Both findings promoted to [D2](#d2--equal-time-retrigger-throws-inside-tone) and
[D3](#d3--stop-has-no-sampler-half-pad-leds-stick-after-stop) above.

### The spec itself is wrong in one place

**The issue contradicts itself on `fit`.** Implementation decisions say:

> Tune and fit compose into one effective playback rate. That arithmetic is pure
> and belongs in the model with the knob taper and scope math.

*Deliberately not in this slice* says:

> The `fit` field exists in the pad shape here but gains its control and its rate
> arithmetic in EB2-05.

The code obeys the second — `tunePlaybackRate` (`sampler.ts:190`) is tune-only,
and `plannedHit` divides duration by that rate alone. **That is the correct
choice**; the first sentence should be struck or explicitly scoped to EB2-05.

---

## Test-coverage gaps

Four acceptance criteria are satisfied in code but not actually held down by a
test. None is a defect today; each is a place where a future change breaks
silently.

1. **AC4 monophony is asserted at the wrong altitude — and it is where D2
   hides.** *"Retriggering a pad on consecutive steps cuts the previous hit; a
   pad is monophonic."* This rests entirely on Tone turning `start`-while-started
   into `restart(time, offset, duration)` (`Player.js:180-187`). That is correct
   today. But `padVoice.test.ts` never exercises it: `fakeVoice()` is a
   hand-rolled object whose `start` is a `vi.fn()`, so the test *"restarts the
   same player on consecutive hits, making the pad monophonic"* asserts only that
   two `start` calls were made on one object — **it would pass identically
   against a polyphonic player**. The behaviour is an untested Tone *version
   contract*, and D2's equal-time assert lives in the same uncovered branch.

2. **AC3 is satisfied by construction only.**
   `isPadLaneId(laneId) ? taps.sampler.input : taps.drums.input`
   (`engine.ts:357`) → `createFxBus(master.input)` → filter → drive →
   destination. The routing is right; no test asserts a pad voice actually
   reaches the master bus or the send.

3. **AC6's mounted test proves wiring, not the union.** `App.test.ts:126` stubs
   `getSoundingPadIds` to return `['pad2']` and checks the DOM — real coverage of
   the rAF path, but it never shows the engine registry holding a *live* attack
   **plus** a *sequenced* hit simultaneously. `sampler.test.ts` covers
   `createPadSoundingLanes` in isolation; nothing joins the two.

4. **AC12's "every pad empty" is only transitive.** `createDemoPattern` spreads
   `createInitialPattern()` and overrides `lanes` only (`pattern.ts:69`), and
   `createDemoProjectState` spreads `createInitialProjectState()`. Correct — but
   the shipped-demo assertions (`lessons.test.ts:285`, `:310`) look at
   `demo.lanes` exclusively. **No test says the opening deck's pad lanes and pad
   regions are empty**, which is the Phase-4/Phase-7 demo rule this AC invokes.

---

## Suggested order of work

Ordered so that each step makes the next one cheaper.

| # | Item | Why first |
|---|---|---|
| 1 | [D3](#d3--stop-has-no-sampler-half-pad-leds-stick-after-stop) — `padSoundingLanes.clearSequenced()` in `stop()` | One line, zero risk |
| 2 | [D1](#d1--a-pads-spaceenter-can-be-permanently-killed-by-tabbing-away-mid-hold) — release `button:` sources globally | Small, and a real user-facing dead control |
| 3 | [R2](#r2--padvoicets-pending-hit-replay-is-unowned-module-level-mutable-state) — `createPadVoice` owning its queue | Gives D2 its home and makes gap 1 testable |
| 4 | [D2](#d2--equal-time-retrigger-throws-inside-tone) — equal-time guard + test | Lands naturally inside R2 |
| 5 | [R1](#r1--the-pads-buffer-is-bound-to-the-pad-not-to-its-source) — `sampleRegistry` keyed on source id | **Blocks EB2-04**; do before intake starts |
| 6 | [R3](#r3--lane-kind-dispatch-will-multiply-shotgun-surgery) — one `trigger` closure, one `laneArrayFor` | Cheapest right after R1/R2 rework the same call sites |
| 7 | [R4](#r4--live-input-plumbing-is-now-duplicated-across-two-instruments) — extract live-key hook + holds registry | Largest, least urgent; do before a third instrument |
| 8 | Test gaps 1–4, `sampler.ts` split, `sources[0]`, branch-name note | Cleanup |

**The one hard scheduling constraint:** R1 blocks EB2-04. Everything else can
follow the slice.

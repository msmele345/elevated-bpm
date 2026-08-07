# EB2-03 — SP-04 tracer: pads are lanes

> Track: v2.0 · Slice 3 of 10
> Depends on: EB2-02
> Blocks: EB2-04, EB2-09, EB2-10
> Branch: `feat/sampler-tracer`
> Spec stories covered: 13, 18, 22–32, 55, 56, 58, 64, 65, 67, 68
> Resolves review findings: **G1**, **G4** (the `origin` field), **G14**

## Why this slice

The thinnest complete path through the sampler: a **source** exists, a **region**
references it, a **pad** holds that region, and the pad sequences, accents, mutes,
solos, plays live on a digit key, and runs through the master bus and the FX
sends from EB2-02.

No file loading, no editor, no waveform, no storage of audio. The one source is
a curated one-shot that ships with the app as an asset, exactly the way
`KIT_SAMPLES` ships. That removes every storage and decode risk from this slice
so it can concentrate on the one thing that actually has to be got right, which
is the domain model.

This is where the spec is wrong and has to be corrected in code.

## The spec's "nothing changes shape" claim is false (G1)

SP-04 states that `DrumLaneId` and the kit registry are frozen, that pads get a
separate closed union, and that "nothing in the existing kit, curriculum, share
validation, or migration path changes shape as a result." Three things in the
codebase contradict it:

- **Solo is a global rule.** `audibleLaneIds` asks whether *any* lane is soloed
  across one mixer map. If pads carry their own separate `Mixer`, soloing the
  kick leaves the pads sounding — which directly contradicts story 24, "pads mute
  and solo like every other lane".
- **Share validation is closed over the kit.** `isMixer` builds its allowed key
  set from `KIT_LANES` and rejects anything else, and `isPattern` asserts the
  lane count equals `KIT_LANES.length` exactly. Story 44 requires pad programming
  to travel in a link, so both must widen.
- **The engine's voice registry is keyed on `DrumLaneId`**, and so is the `Hit`
  the hit-voicing layer returns.

The pad id union really is separate and closed — that part of the spec stands.
What has to widen is the *lane id space* those structures are keyed on.

## Implementation decisions

### The lane id space

- Introduce `PadLaneId` as a closed union of four ids, and `LaneId = DrumLaneId |
  PadLaneId`. `DrumLaneId` and `KIT_LANES` are untouched, as the spec intends.
- Generalize the drum lane shape over its id — a `StepLane<Id>` carrying
  `DrumStep[]`, with `DrumLane = StepLane<DrumLaneId>` and
  `PadLane = StepLane<PadLaneId>`. The step shape is genuinely identical
  (on/off + accent), so this is a type parameter, not a new structure, and the
  existing step row component renders both.
- **Pad lanes live in their own array on the Pattern**, mirroring how `noteLanes`
  is separate. Not because their steps differ — they don't — but because the drum
  panel renders `lanes` and the sampler panel renders `padLanes`, and merging
  them would put pads inside the DR-909.
- **One mixer, widened to `LaneId`.** This is the fix that makes solo correct.
  `audibleLaneIds` becomes generic over `LaneId`; `toggleLaneMute` and
  `toggleLaneSolo` take a `LaneId`; `isMixer` widens its key set to the kit ids
  plus the pad ids.
- **One voice registry, keyed on `LaneId`.** Drum voices get their buffer from a
  shipped URL, pad voices get theirs assigned at load, but both are a player
  through a gain and both are started by the same scheduled 16th. Keeping one
  registry means `voiceStep` needs no dispatch and the choke map widens for free.
- Pads are numbered **1–4**, so the printed label is the key that plays them.

### Source and region

- A **source** is `{ id, name, origin, duration, channels }` — metadata only. It
  is an identifier in `ProjectState`; audio never enters the document.
- **`origin: 'shipped' | 'upload' | 'recording'` exists from this slice (G4).**
  The curated source is pre-installed, and the Sampling Arc's first lesson is
  "load a sound". Without an origin field that lesson is earned the moment the
  app opens — the same trap the backbeat clap fell into in Phase 7. The field
  costs nothing now and is unavoidable later; EB2-09 uses it to write a goal that
  asserts a *user-added* source.
- A **region** is `{ sourceId, start, duration }` — a reference, never a copy.
- A **pad** holds `{ region | null, tune, fit, name }`. In this slice `region` is
  always the whole source when set, `tune` is live, and `fit` is present in the
  shape but not yet driven by any UI.
- Tune and fit compose into one effective playback rate. That arithmetic is pure
  and belongs in the model with the knob taper and scope math.

### Pads ship empty

The curated source is pre-installed and appears in the sources list; **no pad
holds a region on first run**. This satisfies the demo rule that Phase 4
established and Phase 7 paid for. The tracer's demonstrable action is assigning
the source to a pad in one click — which is exactly the gesture the editor later
replaces with a trimmed region.

### Pad voicing (G14)

- **One player per pad, so a pad is monophonic and self-choking.** Retriggering a
  pad on consecutive steps cuts the previous hit, which is how hardware behaves
  and what makes a fit-to-grid loop work at all.
- **No choke groups between pads** by default. The choke map is already data and
  widens to `LaneId`, so a pair could be added later without new machinery.
- Accent velocity uses the existing gain model unchanged.
- **Live pad hits never write to the Pattern.** Performance only, matching the
  contract the stab keyboard already sets. Introducing record-arm, quantization
  and undo is out of scope for the entire v2 track.

### Digit keys

- Pads play on digit keys 1–4 through a global listener, following the
  source-aware hold model the stab keyboard already uses so a pad released by one
  input is not cut short by another.
- The focus guard that keeps stab notes out of text fields generalizes to digits.
  Note that the guard's helper is named for letter keys and will want renaming;
  its rule — *would the focused control itself consume this key?* — is correct and
  should not change. A range input does not consume a digit, so the tempo fader
  must not deaden the pads.
- Pads and stabs must be playable simultaneously (story 29). The two listeners
  key off different physical keys, so this falls out, but test it.

### Accessibility

- The sampler registers in the deck section registry, which is the single source
  of truth for skip links, section ids and headings. The contract suite fails any
  block of more than eight controls without a skip link, so registration is
  enforced rather than remembered.
- The panel is titled by a real heading its section is labelled by.
- **Pointer capture comes last.** Perform the hit, then attempt capture inside a
  guard. Phase 9 found this bug twice: `setPointerCapture` throws for a pointer it
  cannot capture, and a pad that captures first never sounds at all.

## Acceptance criteria

- [ ] Four pad lanes sequence across sixteen steps with accents, locked to the
      same scheduled 16th as the drums, bass and stabs — verified by timestamping
      voices off the audio node and confirming pad hits share timestamps with kit
      hits
- [ ] Mute and solo on a pad behave like every other lane, on **one** mixer:
      soloing a drum lane silences the pads, and soloing a pad silences the drums
- [ ] Pads run through the master bus, so the macro filter, drive and the FX sends
      from EB2-02 shape them along with everything else
- [ ] Retriggering a pad on consecutive steps cuts the previous hit; a pad is
      monophonic
- [ ] Pads play live on digit keys 1–4 with the same latency characteristics the
      stab keyboard was held to, and a live hit leaves the Pattern byte-identical
- [ ] A pad lights when it sounds, whether played live or sequenced, driven from
      rAF reading the clock — never from React state on the audio clock
- [ ] Typing in a text field, textarea or contenteditable triggers no pad; the
      tempo fader holding focus does **not** deaden the pads
- [ ] Pads and stabs can be played at the same time, each releasing independently
- [ ] The sampler appears in the section registry with a skip link and a real
      heading, and every new control has a non-empty accessible name
- [ ] `ProjectState` v9 carries `sources[]` and the pad lanes and pad settings; a
      v8 document migrates in place keeping its beat, FX patch and earned lessons
- [ ] A share link round-trips pad programming, tune and fit, and the widened
      mixer validates pad keys
- [ ] The sampler ships with the curated source pre-installed and **every pad
      empty**, and the shipped-lessons contract still passes
- [ ] A pad hit or a knob drag during playback causes no audio dropout and no
      dropped frames

## Testing decisions

**Seam 1 — pure model functions** (prior art: `src/model/mixer.test.ts`,
`src/audio/hits.test.ts`). The widened mixer is the headline: assert directly
that soloing a kit lane silences pads and vice versa, because that is the claim
the spec got wrong. Also carries pad settings clamping and repair, and the
playback-rate arithmetic for tune.

**Seam 2 — the document** (prior art: `src/model/projectState.test.ts`). The v9
shape, pad step cycling through the existing rule, and the v8 → v9 migration.

**Seam 3 — share round-trip** (prior art: `src/model/share.test.ts`). Pad
programming and pad mixer keys survive; a pad key the deck does not have is
rejected.

**Seam 4 — mounted deck in jsdom** (prior art: `src/App.test.ts`). Assigning the
curated source to a pad, programming it, and a live digit key sounding without
mutating the Pattern.

**Seam 5 — accessibility contract** (prior art: `src/a11y.test.ts`). Largely
automatic once the section is registered; confirm it actually is.

**Seam 6 — component, strictly narrow** (prior art:
`src/components/StabKeyboard.test.ts`). Exactly one class of test: a pad whose
pointer cannot be captured must still sound.

**Seam 7 — render discipline** (prior art: `src/render.test.ts`). A pad edit
changes only that pad's props; a master knob move leaves every pad lane's props
unchanged.

## Verification beyond unit tests

- Timestamp every voice off the Web Audio node across two loops and confirm pad
  hits land on the same scheduled times as kit hits, with no drift.
- Confirm the solo fix by ear as well as by test: solo the kick and confirm the
  pads go quiet.
- Confirm a live pad hit during playback leaves the programmed pattern untouched
  by diffing the document before and after.
- Confirm first-click playability is unchanged with the sampler panel present.

## Deliberately not in this slice

File loading (EB2-04), the region editor and waveform (EB2-05), any persistence
of audio (EB2-06), microphone recording (EB2-07), bundles (EB2-08), the Sampling
Arc (EB2-09). The `fit` field exists in the pad shape here but gains its control
and its rate arithmetic in EB2-05, where a trimmed region makes it meaningful.

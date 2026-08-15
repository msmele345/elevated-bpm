# EB2-10 — Web MIDI hardware input

> Track: v2.0 · Slice 10 of 10
> Depends on: EB2-03 (pads must exist to route to)
> Blocks: nothing
> Branch: `feat/web-midi-input`
> Folds in: the **Web MIDI hardware input** item deferred to v1.x in `docs/PRD.md`

## Why this slice, and why it is last

Web MIDI was parked at v1.x as "a small, well-contained add: one more event
source into the same input layer". That assessment is correct — the engine is
already shaped for it. It is last for one reason: **its scope doubles for free
once pads exist.** Done before the sampler it is a stabs-only implementation that
gets revisited; done after, it is one routing table covering stabs and pads,
written once.

It has **no dependents**, so it can be pulled forward to any point after EB2-03
if a short slice between two heavy ones is wanted.

**It is also the only issue on this track that needs hardware to verify. If there
is no MIDI controller on the desk, do not start it** — an untestable input path
is worse than an absent one.

## Why this is genuinely small

The seams already exist, and they were built source-aware for exactly this:

- `attackStabNote(source, midi)` and `releaseStabNote(source)` are keyed on an
  opaque **source string**. A MIDI device is simply another source — pointer
  contacts, computer keys and now hardware channels all feed the same boundary.
- `createStabNoteHolds` already resolves the hard part: a pitch held by two
  inputs releases only when the last one lets go, so a MIDI key and a computer
  key on the same note behave correctly with no new logic.
- `createStabSoundingNotes` unions live holds with sequenced notes, so a
  MIDI-played note lights the on-screen keyboard **for free**.
- EB2-03 built the same hold model for pads.

The work is the adapter, the routing table, and the device UI — not the note
lifecycle.

## Scope

### In

- MIDI note input routed to stabs **and** pads.
- Device discovery, selection, and hot-plug handling.
- Velocity from the MIDI message.
- A visible connection state.

### Out (and where it goes)

- **MIDI CC → knobs.** A mapping UI (learn mode, per-control assignment,
  persistence of the map) is a feature of comparable size to this one and should
  be its own issue if it is wanted. Note input alone is the deferred item.
- **MIDI clock sync**, in or out. The transport is the only musical clock and
  slaving it to an external one is a substantial change to the timing
  architecture, not an input feature.
- **MIDI output / export.** The graduation path to a real DAW is worth building
  one day, but it is a different feature.

## Implementation decisions

### One routing table, data not code

A single map from incoming MIDI note number to a deck target:

- **Notes 36–39 → pads 1–4.** This is the General MIDI drum region and matches
  what pad controllers send out of the box, so a Push, an MPD or an LPD lands on
  the pads with no configuration.
- **The stab keyboard's octave → stab notes**, matching the pitches the on-screen
  keys already carry.
- Anything unmapped is ignored silently. A controller sending transport or
  aftertouch messages must not produce noise.

Keep the table as data next to the existing key maps, so a second convention is a
line rather than a branch.

### Velocity maps to the existing gain models

Pads already have an accent gain model and stabs already take a velocity
argument. Map MIDI velocity onto those rather than introducing a parallel one —
and decide whether a hard hit on a pad reads as an accent. The recommendation is
yes, thresholded, because it is what the accent model already means.

### The adapter is injected

`navigator.requestMIDIAccess` is real I/O and browser machinery, so it sits behind
an injected adapter like the decoder and the recorder before it. Tests stop at
that boundary: a MIDI note-on becomes a sounding note indistinguishable from a
computer-key press.

### Permission and availability

- Access is requested when the user opens the MIDI device UI, not at startup.
- **Web MIDI is not available in every browser** — Safari's support is recent and
  Firefox's is behind a flag historically. Absence is a normal state, not an
  error: show that MIDI is unavailable in this browser and leave everything else
  untouched. Never let a missing API break the deck loading.
- Hot-plug: connecting or disconnecting a device while the app is open updates the
  device list, and disconnecting mid-note releases anything that device was
  holding. A stuck note from an unplugged controller is the classic bug here.

### Live play is still performance only

A MIDI hit sounds and lights; it never writes to the Pattern. This is the
contract the stab keyboard set and EB2-03 kept, and MIDI does not change it.
Record-arm, quantization and undo remain out of scope for the whole v2 track.

### Accessibility

The device UI is a small panel: a select and a connection state. It needs an
accessible name and a real heading like everything else, but at that size it does
not need its own skip link. Confirm against the contract suite rather than
assuming.

## Acceptance criteria

> **Verified without hardware.** There was no controller on the desk, so the
> in-browser pass below drove the *real* adapter, engine and Tone through a fake
> Web MIDI implementation built from real `EventTarget`s — ports that open, a
> `statechange` that fires, `midimessage` events carrying real `Uint8Array`s.
> That reaches everything except the browser's own `requestMIDIAccess`. What it
> cannot claim is timing under a human's hands and one real device's quirks; the
> hardware checklist below is therefore still open, and this slice should be
> confirmed against a controller before it is called done.

- [x] A connected MIDI keyboard plays the stab synth, with the on-screen keys
      lighting exactly as they do for computer keys — MIDI routes through the
      deck's *own* live-play handlers (`handleStabAttack`/`handlePadAttack` in
      `App.tsx`) rather than straight into the engine, so the hold model, the
      lighting registry and the chord observation are literally the same code
      path a computer key takes. Verified in-browser with the real engine: a
      C major triad played from a device lit exactly `{60, 64, 67}`, releasing
      the middle note left `{60, 67}`, and releasing the rest cleared it
- [x] A connected pad controller plays pads 1–4 from notes 36–39 — the routing
      table is data (`MIDI_NOTE_BINDINGS`, `src/model/midi.ts`) sitting beside
      the key maps it mirrors, with the stab half *derived* from `STAB_KEYS` so
      hardware pitches and on-screen pitches cannot drift. Verified in-browser
      with the curated break assigned to two pads: notes 36 and 37 on channel 10
      lit pad 1 and pad 2
- [x] MIDI velocity shapes the sound through the existing gain models, and a hard
      pad hit reads as an accent — stabs take a continuous `velocity/127` into
      the 0–1 the synth already accepts; pads threshold onto the two-level accent
      model at `PAD_ACCENT_VELOCITY` (96), so a hard hit is exactly as loud as an
      accented step rather than a parallel notion of loudness. The engine's
      `attackStabNote`/`attackPad` gained optional trailing arguments, so every
      existing velocity-less call site is unchanged. Covered by Vitest
      (`midi.test.ts`, `appMidi.test.ts`)
- [x] A pitch held by both a MIDI key and a computer key releases only when the
      last input lets go — free, as the issue predicted: `midi:<device>:<note>`
      is just another opaque source into `createStabNoteHolds`. Covered at the
      model seam (a MIDI hold and a computer hold on one pitch) and at the
      mounted deck, where the computer key's release does not silence the note
- [x] Unmapped incoming messages are ignored silently — control change,
      aftertouch, pitch bend, clock, truncated messages and notes outside the map
      all resolve to nothing. Verified in-browser: a 40-message CC sweep, pitch
      bend, a clock byte and a note two octaves below the keyboard produced no
      sound, no light and no console error
- [x] Devices can be selected, and connecting or disconnecting one while the app
      is open updates the list without a reload — every input is subscribed and
      each message carries its device, so *choosing* is a filter rather than a
      re-subscription and hot-plug costs nothing. `resolveSelectedDevice` gives
      the two rules that matter: the first controller found plays (plugging one
      in is the whole setup), and a choice already made survives another arriving
      beside it. Verified in-browser through the real adapter: plugging a second
      device added it to the select and opened its port while leaving the choice
      alone; unplugging the chosen one fell back to what was left
- [x] Disconnecting a device mid-note releases everything it was holding — no
      stuck notes — held notes are tracked per device precisely because an
      unplugged controller will never send its note-offs, so the disconnect is
      them. Verified in-browser: two stab keys and a pad held, then the device
      pulled — every key went dark, nothing stuck. Switching device does the same
      thing for the same reason
- [x] A browser without Web MIDI shows that it is unavailable and leaves the rest
      of the deck completely unaffected — `unsupported` is a modelled state, not
      an error path, and a browser without the API is offered no control to press
      because there is nothing behind it. Covered by Vitest, which is the honest
      place for it: jsdom *is* a browser without Web MIDI, so the whole existing
      suite runs against the unsupported state and would fail if it broke
      anything
- [x] A MIDI hit leaves the Pattern byte-identical — live play stays performance
      only, as the stab keyboard and EB2-03 already set. Verified in-browser
      (every pad step label unchanged across a run of hits) and at the mounted
      deck, where the engine is never handed a new pattern because there is not
      one
- [x] MIDI input during playback causes no audio dropout and no dropped frames —
      measured in-browser while playing. Frame cadence under **207 note pairs,
      207 pad hits and 1,656 CC messages in 2.5 s** was identical to idle (median
      8.3 ms both, p95 8.9 → 9.1), and over a separate 4 s run of 400 note events
      plus 400 pad hits the transport advanced **36 steps with zero skips**, its
      largest gap one 16th, still running at the end. Zero console errors
      throughout
- [x] Every control in the device UI has a non-empty accessible name — checked
      explicitly rather than assumed, because the deck-wide contract in
      `src/a11y.test.ts` *cannot* reach these: jsdom has no Web MIDI, so it only
      ever sees the unsupported state and neither control is on screen.
      `appMidi.test.ts` connects first and then computes the accessible name of
      every control in the panel. The panel is titled by a real `<h2>` its
      section is labelled by, and at two controls it is far under the suite's
      eight-control bypass threshold, so it correctly needs no skip link — which
      the contract confirms rather than this note asserting it

## Testing decisions

**Seam 1 — pure model functions** (prior art: `src/model/stab.test.ts`). The
routing table: note 36 resolves to pad 1, the keyboard octave resolves to stab
pitches, an unmapped note resolves to nothing. Velocity mapping onto the gain
models. Device-disconnect releasing held notes.

**Seam 2 — mounted deck in jsdom** (prior art: `src/App.test.ts`). With a fake
adapter: a note-on sounds and lights a key indistinguishably from a computer-key
press, and leaves the Pattern unchanged. A browser reporting no MIDI support
renders the unavailable state and nothing breaks.

**Deliberate gap:** `requestMIDIAccess` itself is not tested. Verify by hand,
with hardware.

## Verification beyond unit tests

Requires a real controller — **still open**, since there was none on the desk:

- [ ] Play chords on hardware and confirm the on-screen keyboard tracks them.
- [ ] Finger-drum the pads over a running loop and confirm hits are tight and the
      pattern is untouched.
- [ ] Unplug the controller mid-note and confirm nothing sticks.
- [ ] Confirm the app is entirely unaffected in a browser without Web MIDI
      support (Chromium has it; this needs Safari or a Firefox without the flag).

Each has an in-browser equivalent above driven through a fake device, so what
remains genuinely needs hardware: **latency under a human's hands**, and the
quirks of one real controller — running status, a velocity curve that never
reaches 127, a device that reports an empty name, or a note-off convention the
fake does not imitate.

## What this slice decided

**MIDI routes through the deck's live-play handlers, not the engine.** The
issue's framing — "a MIDI device is simply another source" — is right about the
hold model but stops one layer short. Attacking the engine directly would have
sounded a note and lit a key while skipping the chord observation that sits in
`handleStabAttack`, so a triad played on hardware would not have earned the
lesson that asks for one. Routing through the handlers makes "indistinguishable
from a computer key" true of the whole deck rather than only of the audio.

**The router returns instructions rather than calling anything.** `receive` and
`releaseDevice` hand back a list of `MidiInstruction`s that `App` executes. This
is what keeps the unplug rule — the feature's one genuinely subtle bug — pure and
testable with no adapter, no component and no hardware.

**Pads get `accent`, not a gain.** The velocity threshold is a model decision;
what the two levels are *worth* stays in `audio/hits.ts` where `ACCENT_GAIN`
already lives. An earlier draft had the model importing those constants, which
would have been the only `model/ → audio/` import in the codebase and pointed the
dependency the wrong way.

**A second `role="status"` on the deck.** The connection line is live because it
changes without the user doing anything — a controller plugged in or pulled out
has to announce itself. That collided with the recording announcement's own
status region, which two existing tests were finding by role alone; they are now
scoped to the sampler panel that owns it, which is more precise anyway. The
semantics were kept rather than weakened to avoid the collision.

**Found while verifying:** pressing Connect while a permission prompt was open
opened a second request, replacing the first session without ever closing it and
leaving its ports listening. A permission prompt leaves the page interactive —
the same property EB2-07 had to account for with the microphone. Fixed with a
synchronously-read ref and covered by a test confirmed to fail without it.

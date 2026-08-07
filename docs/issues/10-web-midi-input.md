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

- [ ] A connected MIDI keyboard plays the stab synth, with the on-screen keys
      lighting exactly as they do for computer keys
- [ ] A connected pad controller plays pads 1–4 from notes 36–39
- [ ] MIDI velocity shapes the sound through the existing gain models, and a hard
      pad hit reads as an accent
- [ ] A pitch held by both a MIDI key and a computer key releases only when the
      last input lets go
- [ ] Unmapped incoming messages are ignored silently
- [ ] Devices can be selected, and connecting or disconnecting one while the app
      is open updates the list without a reload
- [ ] Disconnecting a device mid-note releases everything it was holding — no
      stuck notes
- [ ] A browser without Web MIDI shows that it is unavailable and leaves the rest
      of the deck completely unaffected
- [ ] A MIDI hit leaves the Pattern byte-identical
- [ ] MIDI input during playback causes no audio dropout and no dropped frames
- [ ] Every control in the device UI has a non-empty accessible name

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

Requires a real controller:

- Play chords on hardware and confirm the on-screen keyboard tracks them.
- Finger-drum the pads over a running loop and confirm hits are tight and the
  pattern is untouched.
- Unplug the controller mid-note and confirm nothing sticks.
- Confirm the app is entirely unaffected in a browser without Web MIDI support.

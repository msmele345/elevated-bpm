# EB2-04 — Audio intake: file picker, drag-and-drop, limits and failure

> Track: v2.0 · Slice 4 of 10
> Depends on: EB2-03
> Blocks: EB2-05
> Branch: `feat/audio-intake`
> Spec stories covered: 1, 2, 8, 42 (partially), 69–72
> Resolves review finding: **G13** (via the spike below)

## Why this slice

Getting the learner's own audio into the app, and refusing it clearly when it
cannot work. A loaded file becomes a **source** exactly like the curated one, and
lands on a pad as a whole-file region — the same assignment the tracer already
does. No trimming yet.

The interesting content here is not the file picker. It is the intake gate and
the failure surfaces, which are the difference between a feature that feels
solid and one that hangs.

## Do this first: the decode spike (G13)

**Before writing any intake code, spend half a day proving the memory design.**
The entire storage architecture in SP-04 rests on one claim: that a source can be
decoded at a *reduced* sample rate into an offline context, putting a six-minute
track at roughly 16 MB for the editor instead of 127 MB.

Two things need checking, because the spec asserts the first and does not mention
the second:

1. **Does `decodeAudioData` on an `OfflineAudioContext` honour that context's
   sample rate?** Chrome and Firefox resample to it. Safari has historically
   decoded at the file's own rate and ignored it. If Safari does not honour it,
   the editor's memory budget does not hold there and the design needs a fallback
   — decode-then-downsample, or a lower duration cap on that browser.
2. **What rate does the full render decode actually run at?** `decodeAudioData`
   resamples to the context's rate, not the file's. The spec's 127 MB figure is
   44.1 kHz arithmetic; at the 48 kHz many devices run, six minutes of stereo is
   closer to 138 MB. Derive the duration cap from the live context rate rather
   than hardcoding a number computed at 44.1.

Record what you measured in the PR. If Safari fails the first check, raise it
before building on top of it — it changes EB2-05 and EB2-06, not just this slice.

## Scope

### In

- File picker and drag-onto-a-pad, both producing a source.
- The intake gate: size then duration, both **before any decode**.
- Decoding behind an injected dependency.
- A visible list of loaded sources.
- Failure surfaces for oversized, over-long, and undecodable files.
- The stated limits shown where audio is loaded, before the user waits on
  anything.

### Out (and where it lands)

- **Persistence.** A source loaded in this slice does **not** survive a reload.
  That is accepted and closed by EB2-06 — the same way v1 shipped Phases 1 and 2
  with no persistence until Phase 3. Say so in the PR so it is not read as a bug.
- Trimming, waveform, onsets — EB2-05.
- Microphone recording — EB2-07. It produces a source through the same path this
  slice builds; that is the point of building the path here.
- Deleting a source — EB2-06, where it belongs with the storage lifecycle.

## Implementation decisions

### The gate runs before any decode, in this order

1. **File size**, read straight off the file. Instant, and it rejects absurd
   input having done zero work.
2. **Duration**, probed from an audio element's metadata via an object URL. This
   yields duration *without decoding*, and it is the gate that actually matters.

Duration is the only real lever on peak memory. Decoding preserves the file's
channel count, so a source cannot be downmixed on the way in — peak is
`duration × sampleRate × channels × 4 bytes`, and duration is the only term the
app controls.

| Limit | Value | Why |
|---|---|---|
| Source duration | **6 minutes** | Accepts essentially any full track, which is the stated use case. Refuses DJ mixes and long sets. |
| Source file size | **50 MB** | A cheap first gate that costs nothing to apply. |

Confirm the duration figure against the spike's measured context rate before
shipping it. Six minutes is chosen because three would refuse most full techno
tracks — precisely the material the feature was asked for — and ten would accept
DJ mixes at a real risk of the tab being killed at commit. An out-of-memory kill
cannot be caught, explained or recovered from, so it is the one failure mode
worth designing away rather than handling.

### Formats are not allowlisted

Attempt the decode and report what happened. The browser is the authority on what
it can play, and an allowlist would only go stale. A file extension may be used
to produce a *better error message* — never to refuse a file the browser could
have decoded.

### Failure behavior

Follow the pattern already established for malformed share links: a dismissible
alert that explains the problem, with the user's project left open and unharmed.
This covers an oversized file, an over-length file, and a decode rejection
alike. A rejected file must leave the project byte-identical — experimenting with
files is never risky.

### Decoding is an injected dependency

Decode is real I/O. Inject it, following the pattern where the autosaver is
constructed with its save function. Everything downstream — slice geometry, rate
math, and later onset detection — stays pure functions over buffer-shaped data,
which is what keeps the majority of this feature testable without a browser.

### Drag-and-drop

Dropping onto a specific pad assigns to that pad (story 2 — one gesture, not a
dialog). Dropping onto the sampler panel generally adds a source without
assigning. Guard the window against the browser's default navigate-to-file
behavior on a stray drop, which is an easy way to lose an unsaved session.

## Acceptance criteria

- [ ] A file chosen through the picker becomes a source and can be assigned to a
      pad, where it sequences and plays exactly as the curated source does
- [ ] Dragging an audio file onto a pad loads it and assigns it in one gesture;
      dropping anywhere else on the page never navigates away from the app
- [ ] All loaded sources appear in one list with their names
- [ ] A file over the size limit is refused **without being decoded**, with a
      dismissible message naming the limit
- [ ] A file over the duration limit is refused after a metadata probe and
      **before any decode**, with a dismissible message naming the limit
- [ ] A file the browser cannot decode produces a clear message that identifies
      the file as the problem, not the app
- [ ] Any rejection leaves the project byte-identical — same pattern, same pads,
      same settings
- [ ] Both limits are stated in the UI where audio is loaded, before the user
      waits on anything
- [ ] The decode dependency is injected, and the intake gate is tested at its
      boundaries without a real decoder
- [ ] Loading a source during playback causes no audio dropout and no dropped
      frames

## Testing decisions

**Seam 1 — pure model functions.** The intake gate is the headline: assert that
size and duration limits accept and reject at their exact boundaries. This is
pure arithmetic over metadata and needs no browser.

**Seam 2 — mounted deck in jsdom** (prior art: `src/App.test.ts`, which drives
the real share controls). This is where the slice is proved: load a file through
the **real file input** and watch it become a pad. Then the failure surfaces,
which are user-visible behavior rather than plumbing — an oversized file, an
over-length file, and an undecodable file each produce a specific dismissible
alert and leave the project unchanged.

Real decoding is **not** exercised. The decoder is injected and tests supply
buffer-shaped fakes. This is a conscious trade, recorded so it is not mistaken
for an oversight.

## Verification beyond unit tests

- Load a real full-length track and confirm the duration probe returns before any
  perceptible delay, and that memory does not spike at load (nothing is decoded
  yet at this point in the flow).
- Load a file the browser cannot decode and confirm the message is the one a
  confused user needs.
- Confirm a rejected load during playback does not interrupt the loop.

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

### Spike results (measured 2026-08-12)

Run against the dev server in two engines: Chrome 151 and WebKit 26.5 (the
Safari engine, via a Playwright build rather than Safari.app itself). A
synthesized **48 kHz stereo** WAV was used, so the file's rate and channel
count both differ from the context's and the questions can actually be
answered — the shipped 44.1 kHz mono assets cannot distinguish "honoured"
from "coincidence".

| Question | Chrome 151 | WebKit 26.5 |
|---|---|---|
| Does `decodeAudioData` honour an `OfflineAudioContext`'s rate? | **Yes** — 22 050 Hz asked, 22 050 Hz returned (44 099 frames for 2 s); also honoured at 16 kHz | **Yes** — 22 050 Hz returned, 44 100 frames |
| Does the full decode run at the file's rate or the context's? | **Context's** — a 48 kHz file decoded in a 44.1 kHz context returned 44 100 Hz / 88 199 frames | **Context's** — 44 100 Hz / 88 200 frames |
| Is the channel count preserved? | **Yes** — a stereo file decoded into a *one-channel* offline context still came back with 2 channels | **Yes** — 2 channels |

**G13 does not materialize on current WebKit.** The historical Safari behavior
the risk was written against is not present in 26.5, so the reduced-rate
analysis decode EB2-05's editor rests on is sound in both engines. Two caveats
worth carrying forward: this is Playwright's WebKit build rather than
Safari.app, and older Safari versions were not tested — if the editor's memory
budget ever looks wrong on a user's machine, this is the first thing to
re-measure.

**Channel preservation is confirmed, which is the load-bearing one.** Asking
for a mono context does *not* downmix on the way in, so duration really is the
only lever the app has on peak memory, exactly as the spec argues.

**The peak figure derived from the live rate, not from 44.1 arithmetic.** The
context measured 44 100 Hz here, putting a six-minute stereo render decode at
**121 MB**; the same source on a 48 kHz device is **132 MB**. The spec's ~127 MB
sits between them, and the six-minute cap holds either way — so the cap stays a
flat six minutes rather than becoming a computed number.

The other half of the spike — registering a real decoded buffer under a source
id and hearing it come out of a pad — is recorded under verification below.

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

**Where the decoded buffer goes: EB2-03a built the place.** The engine owns a
sample registry keyed by source id, and it is the only path from a source to
sound — the curated shipped source goes through it like anything else. A pad
resolves its region's source through the registry on every hit, so intake's
whole job here is *decode, register under a source id, add the source to the
document*. Assigning it to a pad is the assignment the tracer already does, and
no audio-layer change is needed. A source the registry does not hold is metadata
without audio and its pad simply stays silent, which is also the honest state of
a source restored from a reload before EB2-06 exists.

This is also what the decode spike above should write into: register a real
decoded buffer under a source id and hear it come out of a pad, rather than
reporting a number.

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

### Results (Chrome 151, real decoding, 2026-08-12)

- **A source becomes sound.** A real WAV chosen through the file input became a
  source, was assigned to Pad 3 through its select, and the master meter peaked
  at **−11.1 dB** and decayed over ~350 ms when the pad was hit — the spike's
  second half answered with audio rather than a number.
- **The probe returns before any perceptible delay, and decodes nothing.** A
  real **35 MB, seven-minute** file was refused **27 ms** after the change
  event, with the JS heap unchanged at 54 MB either side. Size and duration
  refusals both left the source list untouched.
- **The messages are the ones a confused user needs.** A text file named
  `broken.wav` produced "could not be read as audio. This browser cannot play
  that file — your project is unchanged"; a 51 MB file produced "is too large.
  Sources must be 50 MB or smaller."
- **Nothing interrupts the loop.** Across a real decode and two rejections while
  playing: transport `started` throughout, **0 tick stalls**, **0 meter samples
  below −60 dB**, and **0 frames over twice the median** (median 23.8 ms under
  the test browser's own throttled vsync). Zero console errors.
- **A drop onto a pad is one gesture.** A real `DragEvent` carrying a file onto
  Pad 4 loaded and assigned it (`Play Pad 4 — Dropped Rim`), added exactly one
  source rather than two, and prevented the browser's default — with the
  transport still running.

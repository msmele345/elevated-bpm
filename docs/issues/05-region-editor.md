# EB2-05 — Region editor: waveform, onsets, trim, and slice rendering

> Track: v2.0 · Slice 5 of 10
> Depends on: EB2-04
> Blocks: EB2-06, EB2-09
> Branch: `feat/region-editor`
> Spec stories covered: 9–12, 14–17, 19–21, 59–63
> Resolves review findings: **G2**, **G10**, **G11**

## Why this slice

The craft the product exists to teach. A learner opens a source, sees its shape,
finds a moment inside it, trims to it, hears it, and commits it to a pad. The
region stays a reference into the source, so a chop is re-editable and one break
can supply four pads without being loaded four times.

This slice also defines the **slice** as a value — the rendered audio for a
committed region — which is the thing EB2-06 persists and EB2-08 ships in a
bundle. Two decisions the spec left unstated get made here, and both are
load-bearing downstream.

## Decision: slice storage format (G2)

The spec never states what a slice *is*, and its two numbers disagree about it.
The memory section computes with 4 bytes per sample (Float32). The bundle section
estimates "four one-second stereo slices ≈ 750–850 KB", which only works at
16-bit: `4 × 1s × 2ch × 48kHz × 2 bytes` = 768 KB raw, ~1 MB base64, gzip
recovering to roughly 790 KB. At Float32 the same four slices are about 1.5 MB —
near double the spec's figure.

The compression reasoning in the spec is sound, by the way: base64 uses 64
symbols out of 256 possible byte values, so gzip's Huffman stage recovers almost
exactly the 4/3 expansion and lands back near raw size. It does not compress the
audio itself, and should not be expected to.

**Decide and write it down in the PR**, covering format, bit depth and channel
count. The recommendation:

- **16-bit PCM, source channel count preserved, at the render context's rate.**
  Halves storage and bundle size against Float32 for a difference nobody will
  hear on a drum chop, and it is the arithmetic the spec's own size budget
  assumes.
- **Store raw PCM, not an encoded file.** This is *why* the first-click promise
  survives the sampler: startup wraps stored PCM straight into an `AudioBuffer`
  with no decode at all. Storing MP3/Opus would shrink the bundle further and put
  a decode back on the startup path — the wrong trade for this product.

Whatever is chosen, state it once and let EB2-06 and EB2-08 read it from here.

## Decision: normalization instead of a per-pad level (G10)

Pads reuse the drum lanes' mute/solo, which is consistent — but drum lanes have
no volume either, and the shipped 909 kit is level-matched by us. A user's chop
is not. A hit lifted from a mastered track sits roughly 12 dB above the kit and
will both bury the groove and slam the master `Distortion` added at v7.

**Peak-normalize each slice at render time.** It is pure arithmetic over the
rendered buffer, testable without a browser, needs no UI, and makes an arbitrary
upload sit sensibly against the kit on first hit. Tune and fit change playback
rate and are unaffected by it.

If a per-pad level control is wanted later it is a small addition, but it is not
this slice and it is not a substitute for normalizing — a control the user has to
find first still means their first hit is 12 dB too loud.

## Decision: the editor is a modal dialog (G11)

The spec never says how the editor is presented, and it decides the accessibility
work. Make it a **modal dialog** over the deck:

- The deck already has this exact pattern working, in the finale moment: an
  accessible `role="dialog"`, labelled and described, the deck marked `inert` and
  hidden from assistive tech, Escape closing, focus contained, and mapped live
  keys unable to leak through.
- It solves the key-scoping requirement for free. Editor keys are scoped to the
  editor because nothing else is reachable while it is open, so no new global
  bindings are introduced and chopping can never fire a stab or a pad.
- It solves the bypass problem. The sampler panel alone adds roughly 80 controls
  — four pads × sixteen steps, plus mutes, solos and tunes — against a skip-link
  threshold of eight. Adding an inline editor beneath that would put the region
  handles ~90 Tab stops deep, which is the exact barrier Phase 9 measured and
  fixed. In a dialog the handles are two Tabs from opening it.

Escape must always release the dialog, which is what makes containing Tab
acceptable.

## Implementation decisions

### Two decodes, for two different jobs

- **Analysis decode** — reduced rate, mono, into an offline context. This is what
  the waveform, onset detection and scrubbing read. A waveform does not need full
  bandwidth and neither does an onset detector, so a six-minute source costs
  roughly 16 MB here instead of 127 MB. Held **only while the editor is open**,
  released when it closes.
- **Render decode** — full rate, full channels, used solely to render a committed
  region into a slice. **Transient**: acquired at commit, released immediately
  after the slice is produced. This is the feature's peak memory moment and the
  reason the duration cap in EB2-04 exists.

Rebuilding slices from sources at startup would put a full-length decode on the
load path and break the first-click promise. That is why commit renders and
persists rather than deferring.

Honour whatever the EB2-04 spike found about offline-context resampling. If
Safari does not reduce the rate, the fallback belongs here.

### Region selection is a two-thumb slider

- Each edge is an accessible slider built on the established knob pattern:
  arrows nudge fine, Page keys nudge coarse, Home and End park at the source's
  bounds, and each edge's range is bounded by the other.
- Each edge announces its **timecode and its position within the detected
  onsets** — "1.482s, onset 4 of 19". That second half is what makes the audio
  navigable by structure.
- Bracket keys jump between onsets. **Space is never bound**: it natively
  activates focused buttons and this deck has roughly 160 of them.
- **Enter auditions the current region** without committing it.
- The waveform drawing is decorative to assistive technology; the slider controls
  carry all the semantics. This mirrors how the knob's SVG is handled.

### Onset detection is accessibility work, not a nicety

Every other visual affordance on this deck describes something with a non-visual
equivalent — a knob has a value, a step has a state. A waveform describes audio
the user can already hear. Making the editor navigable by *structure* is what
makes it operable without sight, and it makes chopping faster for everyone else
as a side effect.

It is pure math over decoded samples and belongs in the model layer beside the
spectrum and room-light math.

### Fit to steps

- A pad may optionally declare that its chop fills N steps. Playback rate is then
  region duration over target duration, and **pitch moves with it, the way
  pitching a record does**. There is no time-stretching and no pitch-independent
  processing anywhere in this feature.
- Tune and fit compose into a single effective rate.
- Show what fitting did to speed and pitch (story 21), so the tradeoff is visible
  rather than mysterious.

### Waveform rendering

Canvas, on rAF, reading the analysis buffer — the same discipline as the spectrum
scope: never React state on a draw loop, skip the repaint on frames where nothing
changed, and give reduced-motion users a static render with no loop at all.

## Decisions as built (2026-08-12)

Everything EB2-06 and EB2-08 read from this slice, in one place. The
authoritative copy lives in `src/model/slice.ts`; this is the summary.

| Decision | Value | Where |
|---|---|---|
| Slice encoding | **16-bit PCM, interleaved** | `Slice.pcm`, `src/model/slice.ts` |
| Slice channels | **the source's own count**, preserved | `renderSlice` |
| Slice rate | **the render context's rate** (44.1 kHz measured) | `renderSlice` |
| Slice peak | **0.95**, every slice, always | `SLICE_PEAK` |
| Longest slice | **8 s** | `MAX_SLICE_SECONDS`, `src/model/region.ts` |
| Shortest region | **10 ms** | `MIN_REGION_SECONDS` |
| Region on assignment | **first 4 s** of the source | `DEFAULT_PAD_REGION_SECONDS` |
| Analysis decode | **22.05 kHz mono**, open editor only | `ANALYSIS_SAMPLE_RATE` |

Four of these were not in the spec and are load-bearing enough to say why:

- **0.95 is not a taste call.** It is the peak `scripts/generate-kit.mjs`
  normalizes the shipped 909 kit to. Measured in-browser, a chop rendered from
  an arbitrary upload peaks at 0.950 against the kit kick's 0.837 — so a hit
  lifted from a mastered track sits *with* the groove on the user's first press
  rather than 12 dB above it, with no control for them to find first.
- **A slice has a maximum length**, derived rather than picked: a bar at the
  transport's slowest tempo is the longest a fit-to-steps target can ask for,
  and twice that leaves room for a one-shot with a tail. EB2-06 keeps slices
  and never evicts them, so "slices are small" has to be enforced rather than
  assumed — an untrimmed six-minute commit would render tens of megabytes and
  put back exactly the residency this design removes. The cap is not a clamp on
  the edges: pushing one edge past it **drags the other along**, so the region
  behaves as a sliding window and Home/End still park at the source's own
  bounds, which is what the AC asks for.
- **Assigning a source opens on its first four seconds**, not on all of it.
  Under EB2-04 a whole-file region was free, because a pad read an offset into
  an already-decoded source. A region is rendered now, so the same gesture on a
  full track would render a full-track slice.
- **The analysis decode is 22.05 kHz, not the ~11 kHz the spec's 16 MB implies.**
  That buffer is also what an audition plays, and a chop judged by ear through
  5 kHz of bandwidth is not judged. 22.05 kHz measured at **30.3 MB** for a
  six-minute source — four times under the render decode's peak, which is the
  number that actually constrains the feature.

**A pad's audio no longer survives a reload — including a curated-source pad.**
Under EB2-04 the shipped source was decoded into the registry at startup, so a
pad pointed at it still sounded after a refresh. Playback now touches only
rendered slices, and nothing persists them yet, so every pad comes back named
and silent. This is the intermediate state the issue declares; EB2-06 closes
it, and closes it for the curated source too.

One deliberate loose end: an audition is a monitor rather than a hit, so it
sits outside the transport and a ringing audition is not cut by Stop.

## Acceptance criteria

- [x] A source opens in an editor showing its waveform and its detected onsets —
      verified in Chrome against the real curated asset (60,928 painted canvas
      pixels over a real decayed percussion envelope) and against a synthesized
      six-minute source, where **720 onsets were detected from 720 hits**
- [x] Both region edges drag directly, and each is fully operable from the
      keyboard with fine and coarse nudges and Home/End parking at the bounds —
      measured on the six-minute source: ArrowRight 0.000 → 0.010, PageUp →
      0.110, End → 3.990, Home → 0.000. Dragging is covered by a component test
      for the one class Phase 9 found twice: a handle whose pointer cannot be
      captured must still drag (`RegionHandle.test.ts`)
- [x] Each edge announces its timecode **and** its position among the onsets —
      `regionEdgeAnnouncement` (`src/model/region.ts`) places an edge whether it
      is on a hit, between two, before them all or past them all. The
      accessibility suite asserts the *content*, not just the presence:
      `0.500 s, onset 1 of 4`, `0.510 s, between onsets 1 and 2 of 4`
- [x] Bracket keys jump the focused edge between onsets; Enter auditions the
      region; Space does nothing but activate a focused button — verified in
      Chrome: `]` → onset 2 (0.499 s), `]` → onset 3 (0.998 s), `[` → back to
      onset 2, all landing on real detected hits; Space on a focused handle
      changed nothing. A jump only ever targets an onset the edge can legally
      reach, so navigation can never quietly retrim the chop
- [x] Committing a region assigns it to a chosen pad, where it sequences and
      plays as the whole-file region did — mounted-deck test drives the real
      controls; in-browser, a committed chop fired from the sequencer and from
      the number keys on the same clock as the kit
- [x] Several regions cut from one source land on different pads, and the source
      is loaded once — `App.test.ts` cuts two regions onto two pads and asserts
      one decode, one source entry, and two different `start` times into it
- [x] Reopening a pad's region shows its current edges and moving them is a
      correction, not a redo — the editor opens on the pad's own region
      (clamped to the source), and a commit keeps the pad's Tune and fit
- [x] A Tune control pitches a pad; a fit-to-steps target locks a chop to N steps
      and moves its pitch with its speed, with the resulting speed and pitch shown
      — measured live on the audio node: an 8.000 s slice fitted to 16 steps ran
      at **4.3333× at 130 BPM** and **3.3333× at 100 BPM**, both exactly
      `sliceDuration / (steps × 15/bpm)`, so a fitted chop follows the tempo
      while it plays. The strip reads `433 % speed, +25.4 st` — pitch is not a
      side effect to hide, it is the sound of the technique
- [x] Committed slices are peak-normalized: a chop from a loud source and a hit
      from the 909 kit sit at comparable level on first play — measured on the
      real rendered buffers: **slice peak 0.950, kit kick peak 0.837**
- [x] The editor is an accessible modal dialog — labelled, deck `inert`, Escape
      closes, focus contained, and no live stab or pad key leaks through while it
      is open — verified in Chrome mid-playback: **0 stab attacks and 0 pad
      starts** from a/s/1/2 while the editor was open; the deck carried `inert`
      and left the accessibility tree entirely (the mounted test asserts
      `getByRole('main')` finds nothing while it is open). Focus lands on the
      close control, and the handles are the **2nd and 3rd tab stops** rather
      than ninety deep
- [x] Closing the editor releases the analysis buffer, and the render decode is
      released immediately after a slice is produced — both confirmed by measured
      heap, not by inspection — with a six-minute source: baseline **14.1 MB**,
      editor open **45.9 MB** holding exactly **30.3 MB** of analysis buffer
      (360 s × 22050 × 4 B), and **0 bytes held** on close. Across five
      open/close cycles the heap stayed bounded at **74.9–77.1 MB**, where a
      retained buffer would have put it past 160 MB. The render decode never
      appears as a step: a full-quality decode of the same file at intake left
      the heap at 14.2 MB
- [x] The slice storage format is stated in the PR and matches what EB2-06 and
      EB2-08 will read — stated above and in `src/model/slice.ts`
- [x] Editing or committing during playback causes no audio dropout and no
      dropped frames — measured while playing, committing the **largest region
      the cap allows** out of the six-minute source (the worst case this slice
      permits): commit took 307 ms, and across it the transport stayed
      `started` with **0 stalls**, **0 meter samples below −60 dB**, and **0
      frames over twice the baseline median** (baseline median 28.3 ms / p95
      29.5; during 29.1 / 32.6 — the test browser's own throttled vsync sets
      the cadence). Zero console errors throughout

## Testing decisions

**Seam 1 — pure model functions.** The majority of this slice's logic, and where
it can be tested without a browser: onset detection over buffer-shaped fakes,
slice geometry, region clamping against source bounds, the playback-rate
arithmetic for tune and for fit, and peak normalization.

**Seam 2 — mounted deck in jsdom** (prior art: `src/App.test.ts`). Committing a
region and hearing it become a pad; reopening a pad's region and moving an edge;
cutting two regions from one source onto two pads.

**Seam 3 — accessibility contract** (prior art: `src/a11y.test.ts`). Adds
explicit coverage of the region handles' slider semantics and their announced
value text — the announcement is the feature, so assert its content, not just its
presence.

**Seam 4 — component, strictly narrow** (prior art:
`src/components/Knob.test.ts`). Exactly one class: a region handle whose pointer
cannot be captured must still drag. Phase 9 found this bug twice; it is the
reason this seam exists at all.

Real decoding is not exercised — the decoder is injected and tests supply
buffer-shaped fakes.

## Verification beyond unit tests

Unit tests cannot make the claims that matter most here:

- That a chop is **audibly** locked to the grid when fitted.
- That closing the editor **actually** releases memory — measure the heap with a
  six-minute source open and after closing.
- That the peak render decode at commit stays within the budget the EB2-04 spike
  measured.
- That the editor is navigable end to end with a screen reader, finding a hit by
  onset alone without looking at the waveform.

## Known intermediate state

A committed slice is held in memory and does **not** survive a reload. EB2-06
closes this. Do not ship v2.0 with it open.

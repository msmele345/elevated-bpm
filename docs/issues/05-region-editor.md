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

## Acceptance criteria

- [ ] A source opens in an editor showing its waveform and its detected onsets
- [ ] Both region edges drag directly, and each is fully operable from the
      keyboard with fine and coarse nudges and Home/End parking at the bounds
- [ ] Each edge announces its timecode **and** its position among the onsets
- [ ] Bracket keys jump the focused edge between onsets; Enter auditions the
      region; Space does nothing but activate a focused button
- [ ] Committing a region assigns it to a chosen pad, where it sequences and
      plays as the whole-file region did
- [ ] Several regions cut from one source land on different pads, and the source
      is loaded once
- [ ] Reopening a pad's region shows its current edges and moving them is a
      correction, not a redo
- [ ] A Tune control pitches a pad; a fit-to-steps target locks a chop to N steps
      and moves its pitch with its speed, with the resulting speed and pitch shown
- [ ] Committed slices are peak-normalized: a chop from a loud source and a hit
      from the 909 kit sit at comparable level on first play
- [ ] The editor is an accessible modal dialog — labelled, deck `inert`, Escape
      closes, focus contained, and no live stab or pad key leaks through while it
      is open
- [ ] Closing the editor releases the analysis buffer, and the render decode is
      released immediately after a slice is produced — both confirmed by measured
      heap, not by inspection
- [ ] The slice storage format is stated in the PR and matches what EB2-06 and
      EB2-08 will read
- [ ] Editing or committing during playback causes no audio dropout and no
      dropped frames

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

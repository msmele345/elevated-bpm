# EB2-08 — Bundles, and links that tell the truth

> Track: v2.0 · Slice 8 of 10
> Depends on: EB2-06
> Blocks: nothing
> Branch: `feat/beat-bundles`
> Spec stories covered: 42–48

## Why this slice

Sharing has to stop lying. A share link carries a beat that now references audio
it cannot possibly carry, and a recipient who opens one gets silent pads with no
explanation. Two things fix it: a link that says plainly what could not travel,
and a **bundle** file that carries the real thing.

## Why links cannot carry audio, and why that is not a limitation to engineer around

A 180 KB sample is roughly 240 KB base64-encoded, and audio is already compressed
so gzip buys effectively nothing. The practical URL ceiling is 2,000 characters.
That is a two-orders-of-magnitude gap, not a budget to tune. Any design that
promises faithful links without a server is promising something it cannot
deliver — and hosting user audio on a server is out of scope for the product, not
just for this slice.

So links degrade, by design, and say so.

## Implementation decisions

### The bundle is not a new format

It is the share payload with a different carrier: the same document
serialization, the same gzip compression, the same base64 encoding, and the same
validation and typed error codes the share link already uses — with slice audio
included, and written to a file instead of a query string.

| | Carrier | Audio |
|---|---|---|
| Link | query string | dropped — the URL ceiling makes it impossible |
| Bundle | file | included |

One serializer, one validator, one set of error messages, and no new runtime
dependency. This is the whole reason an archive format was rejected: the share
pipeline already serializes, compresses, encodes, validates and reports typed
errors on exactly this document, and all of it is already under test.

### Bundles carry slices, not sources

Three chops totalling under two seconds must not ship a multi-megabyte source
file. Because slices are already persisted by EB2-06, bundle export is largely
assembly rather than processing.

Size follows the slice format decided in EB2-05. At 16-bit stereo, four
one-second slices land around 750–850 KB; at Float32 it is roughly double. Read
the format from EB2-05 rather than re-deciding it here, and assert the resulting
size in a test so the number cannot drift.

A recipient opening a bundle gets slices but **no** sources — so every pad lands
in the "slice present, source missing" state from EB2-06: it sounds, and it says
re-chop is unavailable. That state already exists precisely because sharing
produces it.

### The accepted cost is opacity

A bundle cannot be opened and inspected by a human the way an archive could, so a
failed import cannot be diagnosed by looking inside it. **Import validation must
therefore be specific about *what* was wrong** — that message is the only
diagnostic anyone will ever get. "This bundle is damaged" is not enough; say
whether it was truncated, whether the document failed to parse, whether a slice
was missing, or whether it came from a newer build.

### Version tolerance

Bundles are files people keep, so they must survive schema bumps. This works
already because EB2-01 made the shared decode path run payloads through
`migrateProjectState` — but assert it here explicitly, with a bundle written at
an older version opening on the current build. It is the property most likely to
be broken later by someone who does not know it was a requirement.

### Link degradation

- On opening a link whose pads reference audio, the recipient sees an explicit
  notice naming **how many** sounds could not travel.
- The message directs them to **ask the sender for a bundle**. It does not offer
  to fetch one, because with no backend there is nothing to fetch from.
- Pad programming, tune and fit arrive intact, so the recipient can load their own
  sounds into the arrangement and hear it.

### Nothing is destroyed uninvited

Opening a bundle uses the same preview-and-confirm flow the share link already
uses: the incoming beat is previewed with autosave suspended, and the recipient's
own project is only replaced on an explicit keep. Restoring returns their exact
document.

Note the interaction with EB2-06: audio written during an abandoned preview is
collected as an orphan at next load. Confirm that still holds for a bundle
preview that is backed out of.

### Copyright framing

The spec flags this as an open product decision: local-only sampling is the
user's own business, but a bundle makes redistribution a product feature. It
affects copy and placement only — no architecture depends on it. Decide it in
this slice rather than carrying it further; a single line near the export action
is likely all it needs.

## Acceptance criteria

- [x] Exporting a bundle produces a file that reproduces the beat exactly on
      another machine, including pad audio — `createBundle` (`src/model/bundle.ts`)
      writes the share payload plus the rendered slices each pad references;
      `readBundle` gives the beat and its audio back. Proven in the browser
      rather than only in a test: a real 53 KB `.ebpm` file was downloaded from
      one profile, IndexedDB was wiped, and the file was opened through the real
      file input on the empty profile. The arriving slice hashed
      **`f237114f94bcf084` over 26,460 frames** — byte-identical to the slice
      that same machine then rendered locally from the same source file, under a
      different source id. Covered by Vitest at both the model seam
      (`share.test.ts`) and the mounted deck (`App.test.ts`)
- [x] Importing a bundle previews the beat with autosave suspended, and only
      writes to storage on an explicit keep; backing out restores the recipient's
      exact document — an opened bundle takes the same preview-and-confirm path a
      link does, `sharePreview` holding the recipient's own document. A mounted
      test proves the preview survives past the 400 ms autosave debounce with
      storage still byte-identical, that **Keep** persists the sender's beat, and
      that **Back to my project** returns the recipient's pattern and tempo.
      Confirmed in-browser: after backing out, the recipient's kick step 3 was
      back and every pad was empty again
- [x] A bundle's pads land in the "slice present, source missing" state: they
      sound, and they say re-chop is unavailable — a bundle carries slices and
      not sources, so `padAudioState` derives `sourceMissing` with no new code.
      Confirmed in-browser on a wiped profile: the imported pad read
      **"Play Pad 2 — My Kick"**, its Chop control was off, and the strip said
      *"Original cleared — My Kick still sounds, but cannot be re-chopped."*
- [x] Bundle size for four one-second stereo slices is asserted in a test against
      the slice format chosen in EB2-05, so the figure cannot drift unnoticed —
      `share.test.ts` builds four one-second 16-bit stereo slices at 48 kHz filled
      with **white noise**, the worst case audio can be for compression, and
      asserts the file lands under `SENDABLE_BUNDLE_LIMIT` (850,000 bytes) and
      over 600,000 — the floor being what would catch a bundle that quietly
      stopped carrying its audio. Measured: **772.4 KB** against 768 KB of raw
      PCM at 48 kHz, and 709.7 KB against 706 KB at 44.1 kHz. Float32 slices
      would be roughly double and would fail it
- [x] A truncated, corrupt, or structurally invalid bundle is refused with a
      message specific enough to act on — naming what was wrong, not just that
      something was — five refusals, each naming a different thing:
      `not-a-bundle`, `unsupported-version`, `truncated`, `malformed` and
      `missing-audio` (which names the pads). The order of the checks is what
      makes each message true, and is documented on `readBundle`. Covered by
      Vitest, and confirmed in-browser against a file **truncated by hand on
      disk** (`head -c 11000`): *"This bundle is incomplete — the file was cut
      short before it finished."*, with no preview opened and the deck untouched
- [x] A bundle written at an older schema version opens on the current build —
      the decode path runs every payload through `migrateProjectState`, exactly
      as EB2-01 made the link path do. `share.test.ts` rewrites a bundle's
      document as a v6 body and asserts it opens at the current version with its
      beat and tempo intact, so a later change that skips migration fails loudly
- [x] A bundle from a newer build is refused with the unsupported-version message
      — the version is read from the plaintext header before anything is
      decompressed, and the refusal reuses the link's own wording verbatim from
      `sharePayload.ts`, which is what "one set of error messages" means here
- [x] Opening a **link** whose pads reference audio shows a notice naming how many
      sounds could not travel and directing the recipient to ask for a bundle —
      `sharedAudioNotice` (`src/model/share.ts`) counts the pads that landed in
      the modelled **silent** state, so a bundle says nothing and a link says
      exactly what it cost. Confirmed in-browser on a wiped profile: *"1 sound
      could not travel: audio is far too large to fit in a link. Ask whoever sent
      it for a bundle file to hear it."*
- [x] A shared link's pad programming, tune and fit arrive intact and are
      playable once the recipient loads their own sounds — the payload was
      already carrying all three; the mounted test asserts pad steps, `fit` and
      the pad's name survive a link, and the browser pass confirmed the silent
      pad kept its name, its Tune, its fit menu and its **1/5/9/13** programming,
      with a Relink control offered
- [x] Audio written during a bundle preview that is backed out of is collected as
      an orphan rather than stranded — the bundle's slices are written where an
      upload's are, outside the suspended autosave, so an abandoned preview
      leaves them referenced by nothing and the load-time sweep takes them.
      Covered by a mounted test, and confirmed in-browser: one slice key in
      storage while previewing, **zero after backing out and reloading**, with
      the recipient's own beat still intact

## Testing decisions

**Seam 1 — share round-trip** (prior art: `src/model/share.test.ts`). Because the
bundle reuses the share pipeline, its round-trip and its rejection cases **extend
the existing share tests rather than forming a new suite**. That includes: a
bundle carrying slices reproduces the beat exactly; a truncated or
version-mismatched bundle is refused with a message specific enough to act on;
and the size assertion.

**Seam 2 — mounted deck in jsdom** (prior art: `src/App.test.ts`, which already
proves the preview-and-confirm flow for links). Bundle export and import including
preview, keep, and restore. Link degradation showing its notice while preserving
pad programming.

**Seam 3 — storage** (prior art: `src/storage/projectStore.test.ts`). Orphan
collection after an abandoned bundle preview.

## Verification beyond unit tests

- Export a bundle, open it on a different machine or profile, and confirm the
  beat sounds identical. **Done** — see AC1. A real downloaded `.ebpm` opened on
  a wiped profile, and its slice hashed identically to one rendered locally from
  the same audio.
- Truncate a bundle by hand and confirm the error names the problem — this is the
  check that proves the opacity trade was paid for. **Done** — see AC5, against a
  file cut in half on disk.
- Confirm a link with loaded pads shows the notice and that its arrangement is
  usable after the recipient loads their own audio. **Done** — see AC8/AC9.

Zero console errors across the whole browser pass.

**What this pass could not reach.** As in EB2-07, the headless browser has no
audio device, so nothing here was heard. "Sounds identical" is claimed on the
strength of byte-identical PCM reaching the pad, not on listening — the render
is deterministic and the hash matched, but the last step is the user's own.

## Decisions made in this slice

1. **A bundle is a binary file, not a base64 text file.** The issue lists "the
   same base64 encoding" as part of the shared pipeline, and it still is — the
   same helper encodes each slice's PCM *inside* the JSON document, where gzip
   takes the third it adds straight back. Doing it *again* around the finished
   gzip, which a URL forces and a file does not, would be an unrecoverable +33%
   on the one artifact whose whole point is being sendable: ~950 KB instead of
   772 KB for the four-slice case, outside the size band this issue states. The
   file is therefore a plaintext header line — `elevated-bpm-bundle/9\n` — and
   the gzip bytes. The header also earns its place twice over: it is what lets a
   newer build's file be named as such before anything is decompressed, and what
   separates "not a bundle at all" from "a bundle that arrived cut short".

2. **Exporting a beat with a silent pad is refused, not quietly trimmed.** The
   issue asks for `missing-audio` on import, but with one gzip stream a slice
   cannot go missing in transit — the realistic way to produce that file is
   exporting from a deck whose own pad has lost its audio. Left alone, the app
   would write files it would itself refuse to open. Export now names the pad and
   the one click that fixes it.

3. **Pads are named `Pad 1 (Warehouse Break)` in these messages, not by name
   alone.** Two chops cut from one break wear the same name, so "missing the
   audio for Warehouse Break and Warehouse Break" names nothing actionable. The
   lane is what disambiguates; a pad still wearing its default name is not given
   a parenthesis repeating it back (`namedPad`, `src/model/sampler.ts`).

4. **The share pipeline was split into a payload and two carriers.** "One
   serializer, one validator" was a claim the old shape could not enforce, since
   both lived inside the link module. `sharePayload.ts` now holds the
   serialization, compression, base64, migration, structural validation and both
   shared error messages; `share.ts` is the query string and `bundle.ts` is the
   file. A bundle cannot drift into accepting a document a link would refuse.

5. **Entering *and* leaving a bundle preview moves the audio, not just the
   document.** A slice — not a region — is what makes a pad sound, so a document
   swap that only registers is half a swap: the recipient's own chop would keep
   playing under a pad the sender left empty, and backing out would leave the
   sender's chop on the recipient's deck. The registry gained `clear`, the engine
   `clearSlice`, and both transitions now set the pads to exactly what the
   incoming document owns.

6. **Copyright framing: one line under the export action** — *"A bundle carries
   your sounds with it — only send audio you have the right to share."* Sampling
   on your own machine is the user's own business; a bundle is the moment the
   product starts moving audio between people, so that is the moment, and the
   place, it says so. No architecture depends on it.

**A note on what fell out of this.** Truncated gzip fails at *both* ends of a
`DecompressionStream`. The link path had been catching one and leaking the other
as an unhandled rejection all along — invisible until a bundle made truncation a
case worth naming, at which point it surfaced in the test run. Both ends are now
settled together in `decompressPayload`.

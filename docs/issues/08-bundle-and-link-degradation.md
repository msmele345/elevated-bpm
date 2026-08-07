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

- [ ] Exporting a bundle produces a file that reproduces the beat exactly on
      another machine, including pad audio
- [ ] Importing a bundle previews the beat with autosave suspended, and only
      writes to storage on an explicit keep; backing out restores the recipient's
      exact document
- [ ] A bundle's pads land in the "slice present, source missing" state: they
      sound, and they say re-chop is unavailable
- [ ] Bundle size for four one-second stereo slices is asserted in a test against
      the slice format chosen in EB2-05, so the figure cannot drift unnoticed
- [ ] A truncated, corrupt, or structurally invalid bundle is refused with a
      message specific enough to act on — naming what was wrong, not just that
      something was
- [ ] A bundle written at an older schema version opens on the current build
- [ ] A bundle from a newer build is refused with the unsupported-version message
- [ ] Opening a **link** whose pads reference audio shows a notice naming how many
      sounds could not travel and directing the recipient to ask for a bundle
- [ ] A shared link's pad programming, tune and fit arrive intact and are
      playable once the recipient loads their own sounds
- [ ] Audio written during a bundle preview that is backed out of is collected as
      an orphan rather than stranded

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
  beat sounds identical.
- Truncate a bundle by hand and confirm the error names the problem — this is the
  check that proves the opacity trade was paid for.
- Confirm a link with loaded pads shows the notice and that its arrangement is
  usable after the recipient loads their own audio.

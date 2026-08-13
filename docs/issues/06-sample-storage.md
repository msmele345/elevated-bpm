# EB2-06 — Sample storage, quota policy, and missing audio

> Track: v2.0 · Slice 6 of 10
> Depends on: EB2-05
> Blocks: EB2-07, EB2-08, EB2-09
> Branch: `feat/sample-storage`
> Spec stories covered: 33–41, 73–75
> Resolves review findings: **G5**, **G15**

## Why this slice

Everything the last two slices built is currently lost on reload. This closes
both intermediate states and makes the learner's own audio as durable as the
browser allows — while keeping the deck playable on first click and keeping
startup flat regardless of how much audio they have.

It also carries the two designed failure behaviors that make the storage split
worth having: what happens when the browser reclaims space, and what a pad does
when its audio is gone.

## Implementation decisions

### `ProjectState` holds no binary data

The document keeps storing **identifiers only**. That is what keeps it JSON,
diffable, migratable and cheap to autosave. The autosave path is unchanged: the
whole document on a trailing debounce, and it stays small because audio is not in
it. Audio is written **once**, at upload or at commit, outside the autosave path.

### The audio store is two-part, and the halves are not equal

A separate object store in the same IndexedDB database, deliberately split:

- **Slices** — the rendered audio for each pad's committed region. Small.
  Required to make sound. **Precious**: never evicted.
- **Sources** — the original uploaded or recorded audio. Large. Required only to
  *re-edit* a region. **Expendable**: dropped first under pressure.

This is not premature optimization; it was derived from a number. A six-minute
stereo track decodes to roughly 127 MB while its compressed file is around 6 MB.
Holding decoded sources resident across four pads is a quarter of a gigabyte —
enough to have the tab terminated on a phone, on a product that ships a mobile
layout.

### Database versioning (G15)

`projectStore` opens the database at version 1 and creates a single `project`
store in `onupgradeneeded`. Adding the sample store means bumping that version,
and the upgrade handler must **preserve the existing `project` store** rather
than recreating it — a returning user's saved beat lives there.

Keep the store interface deep, the way `projectStore` already is: callers see
typed save/load of slices and sources, and database plumbing stays behind it.

### Quota exhaustion has a designed answer, not an error message

Because sources are already declared expendable, a failed write triggers:

1. **Evict sources**, oldest or largest first.
2. **Retry the write.**
3. Only if it still fails, tell the user plainly — **naming which pads are
   affected** — that there is not enough room.

**Slices are never evicted to make space**, because slices are what make sound.
Housekeeping must never be audible: a pad whose source was discarded keeps
sounding and loses only re-editability.

### Lifecycle and orphans (G5)

The spec has no garbage collection story, and the feature creates orphans three
ways:

- **Re-chopping a pad** leaves its previous slice referenced by nothing.
- **Clearing or reassigning a pad** does the same.
- **Loading audio during a share preview** is the sharp one. Autosave is
  suspended while a shared beat is previewed, but audio writes deliberately sit
  outside the autosave path — so a source or slice written during a preview is
  referenced only by a document that is never persisted. "Back to my project"
  then strands it permanently.

The rule, and it is cheap: **on load, drop any slice or source not referenced by
the current document.** One sweep, at the one moment the referencing document is
authoritative. Do not try to reference-count at write time; the preview case
proves the write-time view of "what is referenced" can be wrong.

Note that one source legitimately backs multiple pads, so the sweep must collect
references across all four pads before deleting anything.

### `navigator.storage.persist()`

Requested at **first upload** — the first moment there is user-created audio
worth protecting. Not at startup, where it would be a permission prompt about
nothing.

### Missing audio is a modelled state, not an error path

It must exist regardless of storage behavior, because share links produce it by
design (EB2-08).

| Condition | Pad behavior |
|---|---|
| Slice present, source present | Fully functional |
| Slice present, source missing | Sounds normally; re-chop unavailable, and says so |
| Slice missing | Silent; keeps its name, tune, fit and programming; offers relink |

- Deleting a source is permitted, preceded by a warning **naming the pads that
  use it**. Those pads continue to sound.
- Relink is one action: point a silent pad at a file and it comes back with its
  programming intact. Losing a file costs one click, not the beat.
- A dangling reference resolves to one of these states. It must never throw, and
  it must never stop the deck loading.

### Startup budget

App startup touches **slices only** — never sources, never a decode. Stored PCM
wraps straight into an audio buffer. The deck must be playable on first click
with four pads loaded, exactly as it is with none.

## Acceptance criteria

- [x] Chops, tuning, fit and pad programming are exactly as left after a reload —
      audio is keyed by the region that rendered it (`sliceKey`, `src/model/slice.ts`)
      and hydrated at load by `loadStoredAudio` → `engine.registerSlice`. Verified
      in-browser from a wiped database: four pads loaded by dropping four 909
      samples on them, reload, and every pad sounded its own slice at exactly the
      length it was chopped to — 0.600 / 0.400 / 0.960 / 0.250 s, measured off the
      `AudioBufferSourceNode` each pad started. A pad's Tune (3.84 st) and fit
      target (4 steps) came back with it. Covered by Vitest at the mounted deck
      (`App.test.ts`, "brings a chop back exactly as it was left")
- [x] The deck is playable on first click with four pads loaded, with no decode
      and no stall on the startup path — **measured**, four reloads each way, with
      `decodeAudioData` counted from before any app code ran:

      | | startup to a hydrated deck | decodes before hydration | long tasks | gesture → first sound |
      |---|---|---|---|---|
      | no audio loaded | 103.3 / 101.1 / 99.1 / 101.4 ms | 0 | 0 | 1.0 ms |
      | four pads loaded | 102.2 / 104.4 / 103.6 / 99.8 ms | 0 | 0 | 0.7 ms |

      Indistinguishable, which is the whole point of rendering slices at commit:
      startup wraps stored PCM into a buffer and never decodes anything
- [x] `ProjectState` still contains no binary data, and the autosave payload size
      is unchanged by the presence of loaded audio — measured on the saved
      document: **6,365 bytes** with no audio, **7,227 bytes** with four pads
      chopped from four uploads. The 862-byte difference is four source metadata
      entries and four region references; the audio those 862 bytes refer to is
      195 KB of slices and 195 KB of sources, in their own stores. No `pcm` field
      or blob appears anywhere in the document. Also asserted at the mounted deck
      ("keeps no audio in the saved document, however much is loaded")
- [x] `navigator.storage.persist()` is requested at first upload and not before —
      requested once per session, immediately before the first source write.
      Asserted at the mounted deck: not called at mount, called exactly once when
      a file is chosen
- [x] A project whose **source** was cleared still sounds; the pad says re-chop is
      unavailable — verified in-browser by clearing the `sources` store outright
      and reloading: all four pads kept their names, all four sounded (0.600 /
      0.400 / 0.960 / 0.250 s again), every Chop button was disabled, and each pad
      read "Original cleared — <name> still sounds, but cannot be re-chopped."
      Reached a second way, by real eviction, in the quota run below
- [x] A project whose **slice** was cleared loads normally with the pad silent,
      keeping its name, tune, fit and programming, and offering relink; relinking
      restores it — verified in-browser by clearing the `slices` store: the deck
      loaded in 108 ms with 0 decodes, all four pads kept their names and offered
      "Relink Pad N", pad 1 kept Tune 3.84 and fit 4, and hitting it started no
      buffer at all. Relinking it from a file named *Some Other Filename.wav*
      brought it back sounding (0.600 s) and still called **Pad 1 sound** — a
      repair keeps the name the user is reading. Programming survives too: pad 2's
      steps 1/5/9/13 were unchanged in the saved document across a relink
- [x] A dangling reference resolves to a modelled missing state rather than
      throwing, and never prevents the deck loading — `padAudioState`
      (`src/model/sampler.ts`) derives one of four states from what is present, and
      the store resolves a missing key to `undefined` rather than raising. The
      hydration path is wrapped so a storage failure of any kind leaves the deck
      open with its pads reading as silent. Covered by Vitest at the store, the
      model, and the mounted deck ("loads the deck normally when a reference
      dangles")
- [x] Deleting a source warns first, naming the pads that use it; those pads keep
      sounding afterwards — the warning is built by `padsUsingSource` and says the
      consequence as well as the fact: "<pads> use <source>. Those pads keep
      sounding, but can no longer be re-chopped." Confirmed at the mounted deck
      that after **Delete anyway** the pad still names its sound, the source bytes
      are gone from storage and the slice is still there
- [x] A write that exceeds quota evicts **sources**, retries, and only then
      reports failure — naming the affected pads. No slice is ever evicted —
      exercised through the real UI and real IndexedDB with the browser refusing
      writes for want of room: **2 refusals → 2 sources given up (largest first) →
      the write succeeded**, with 5 slices before and 5 slices after and every key
      still present. The notice named the pad rather than an id ("Made room by
      discarding the original audio behind Open Hat 909. That pad keeps sounding,
      but can no longer be re-chopped."), the affected pad picked up its
      "Original cleared" line, all four pads still sounded, and the transport
      stayed `started` throughout. The exhausted case — evicting everything and
      still failing — is covered at the store, where it reports `full` with no
      slice touched
- [x] Slices and sources not referenced by the loaded document are collected at
      load, including audio written during an abandoned share preview — verified
      in-browser for the everyday case: re-chopping a pad took the store from 4
      slices to 5 (the old one now referenced by nothing), and the next load's
      sweep collected exactly that key, leaving 4 — with the pad sounding its new
      0.540 s chop. The share-preview case is the sharp one and is covered at the
      mounted deck: a sound loaded while previewing a shared beat, then "Back to my
      project", and at the next load the stranded source is gone while the
      recipient's own slice and source are untouched — because the sweep reads
      *their* document, never the preview
- [x] The database version bump preserves an existing saved `project` document —
      verified by upgrading a database written by the previous build. In-browser:
      a version 1 database containing only a `project` store, holding a real v8
      document (four-on-the-floor kick, BPM 130, an earned lesson). After one
      reload the database was at version 2 with `project`, `slices` and `sources`,
      the document had migrated to v9 with pad lanes and the curated source added,
      and the kick steps, tempo and earned lesson were all exactly as saved. Also
      covered by Vitest, where storing a slice into a database written the old way
      previously failed with the `VersionError` this closes
- [x] Saving audio during playback causes no audio dropout and no dropped frames —
      measured while the loop ran, with a full audio write (fetch, decode, render,
      source blob and slice both written) fired into the middle of the window:

      | | median | p95 | max | frames over 2× median | samples below −60 dB |
      |---|---|---|---|---|---|
      | idle | 10.6 ms | 13.9 ms | 16.3 ms | 0 | 0 of 307 |
      | during the write | 10.8 ms | 13.1 ms | 19.8 ms | 0 | 0 of 308 |

      No long tasks, and the transport still `started` at the end

## Testing decisions

**Seam 1 — storage round-trip against a fake IndexedDB** (prior art:
`src/storage/projectStore.test.ts`). The headline seam for this slice:

- Slices and sources round-trip.
- A project survives losing a source; a project survives losing a slice.
- Dangling references resolve to the modelled missing states rather than
  throwing.
- The quota policy: a write that exceeds quota evicts sources and retries, never
  evicts a slice, and reports which pads are affected only once eviction has
  genuinely failed to make room.
- Orphan collection removes unreferenced audio and **keeps** audio referenced by
  any of the four pads.
- The version upgrade preserves an existing `project` document.

**Seam 2 — pure model functions.** The derivation of the three pad audio states
from what is present, and the reference set a collection sweep computes from a
document.

**Seam 3 — mounted deck in jsdom** (prior art: `src/App.test.ts`). Committing a
region, reloading, and finding the pad intact. A missing slice presenting a
relink affordance that restores the pad. Loading audio during a share preview and
restoring the recipient's project, with the orphan collected.

## Verification beyond unit tests

All four were done; the numbers are in the acceptance criteria above.

- Fill storage for real and confirm the eviction path fires, sources go, slices
  stay, and the pads still sound.
- Clear site data for the sources only (via devtools) and confirm the pads sound
  and say re-chop is unavailable.
- Measure first-click-to-sound with four pads loaded against an empty deck.
- Confirm autosave during playback still causes no audible glitch, now that a
  sample store shares the database.

## What this slice decided

**Storage keys slices by region; the playing registry still keys them by pad.**
EB2-03a settled that "a pad is what has a slice", and that is still true of
playback. It is not true of storage, and the share preview is what proves it: a
chop committed while a shared beat is previewed would overwrite the recipient's
own audio for that pad, and "Back to my project" could not give it back. Keyed by
the region that rendered it, a re-chop writes a new key and leaves the old slice
referenced by nothing — which is exactly the condition the sweep looks for — and
two pads chopped identically out of one break share one stored slice.

**The sweep reads the user's own document, never the deck's.** When a share link
is open, the document on the deck is a preview that will never be persisted. The
authoritative document is the recipient's. Sweeping against the deck would delete
their audio rather than the audio stranded by abandoning the preview — the exact
inverse of the bug the sweep exists to fix.

**Eviction is largest-first.** The issue allowed "oldest or largest". Each
eviction costs the user a sound they can no longer re-edit, so freeing the most
room per source given up is the fewest losses to survive the write. Oldest-first
would be kinder to recent work but can take several sources to free what one
would.

**Shipped sources are never stored.** The curated source is a static asset the app
can always fetch again, so keeping a copy would spend the user's quota on
something recoverable by URL. It counts as reachable without being stored, which
also means eviction can never touch it and a pad chopped from it can never read
as source-missing.

**Relink is a distinct action from assignment.** Assigning takes the new file's
name; relinking keeps the name the user is reading on the pad, along with its
Tune, its fit target and its programming. The acceptance criterion says the pad
"keeps its name", and a repair that renamed it would fail that literally and feel
wrong besides.

## Notes from verification

**A real browser quota, and what it taught.** Chromium's quota here is 10.7 GB, so
filling it literally was not practical. `Storage.overrideQuotaForOrigin` over CDP
*was* honoured — but `navigator.storage.estimate()` keeps reporting the original
quota, so the override looks inert when it is not. Two runs were polluted before
that was understood, which is worth recording because of what the pollution
showed: with the origin genuinely out of room, **the project document's own
autosave fails too**, silently, and the deck then reloads onto a stale document
whose sweep collects audio the live deck was using. Everything stays
self-consistent — the document and its audio roll back together — but autosave
has no error surface of its own and no quota policy. That is pre-existing (the
autosaver predates this slice) and outside these acceptance criteria, which are
about audio writes; it is the obvious next thing to look at if storage pressure
becomes real.

**A malformed fixture, not a bug.** A hand-written "v8" document with no note
lanes crashed the deck at render, because `migrateProjectState` trusts a
document's own version and runs no migration steps for the current one. A real v8
document has those lanes, and the verification was redone by taking the app's own
saved document and stripping exactly the v9 additions. Worth knowing that a
hand-edited document at a *known* version has no repair path, unlike the
per-field clamping every patch gets.

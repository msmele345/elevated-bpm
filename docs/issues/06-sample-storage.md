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

- [ ] Chops, tuning, fit and pad programming are exactly as left after a reload
- [ ] The deck is playable on first click with four pads loaded, with no decode
      and no stall on the startup path — measured, not assumed
- [ ] `ProjectState` still contains no binary data, and the autosave payload size
      is unchanged by the presence of loaded audio
- [ ] `navigator.storage.persist()` is requested at first upload and not before
- [ ] A project whose **source** was cleared still sounds; the pad says re-chop is
      unavailable
- [ ] A project whose **slice** was cleared loads normally with the pad silent,
      keeping its name, tune, fit and programming, and offering relink; relinking
      restores it
- [ ] A dangling reference resolves to a modelled missing state rather than
      throwing, and never prevents the deck loading
- [ ] Deleting a source warns first, naming the pads that use it; those pads keep
      sounding afterwards
- [ ] A write that exceeds quota evicts **sources**, retries, and only then
      reports failure — naming the affected pads. No slice is ever evicted
- [ ] Slices and sources not referenced by the loaded document are collected at
      load, including audio written during an abandoned share preview
- [ ] The database version bump preserves an existing saved `project` document —
      verified by upgrading a database written by the previous build
- [ ] Saving audio during playback causes no audio dropout and no dropped frames

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

- Fill storage for real and confirm the eviction path fires, sources go, slices
  stay, and the pads still sound.
- Clear site data for the sources only (via devtools) and confirm the pads sound
  and say re-chop is unavailable.
- Measure first-click-to-sound with four pads loaded against an empty deck.
- Confirm autosave during playback still causes no audible glitch, now that a
  sample store shares the database.

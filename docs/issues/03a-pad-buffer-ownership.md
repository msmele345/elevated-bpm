# EB2-03a — Refactor: a buffer belongs to a source, not to a pad

> Track: v2.0 · Refactor slice between EB2-03 and EB2-04
> Depends on: EB2-03
> Blocks: EB2-04
> Branch: `feat/pad-buffer-ownership`
> Resolves review findings: **R1**, **R2** (`docs/reviews/eb2-03-sampler-tracer-review.md`)

## Problem Statement

EB2-03 shipped the sampler's domain model correctly: a **source** is metadata, a
**region** references it, and a **pad** holds a region. One source can back
several pads, and `ProjectState.sources[]` is already a list.

The audio layer does not believe any of that. `PAD_SAMPLES` maps each of the four
pad ids to a fixed URL, and `ensureVoices` bakes that URL into
`new Tone.Player(url)` at construction. A pad does not have *a region into a
source* down there — it has *one file, forever*. The two layers are held together
by a single line in `engine.ts`:

```ts
if (!voice || pad.region?.sourceId !== CURATED_SAMPLE_SOURCE.id) return
```

That guard is honest today, because today there is exactly one shipped source. It
is a placeholder for a seam that was never built, and its own comment says so:
*"Later intake replaces the Player's buffer before assigning other source ids."*
Nothing does that yet.

This is not a spec breach — EB2-03 deliberately scoped itself to a shipped asset.
It is a join that the next slice cannot be built on top of. EB2-04's first
acceptance criterion is that a loaded file "becomes a source and can be assigned
to a pad, where it sequences and plays exactly as the curated source does." With
buffers owned by pads, there is no place to put that file's audio. EB2-05 makes
it worse: three chops from one break is three regions over **one** source, which
the pad-owns-a-URL model cannot express at all.

The second half of the problem is where the fix has to land. `padVoice.ts` keeps
its future-hit queue in a module-level `WeakMap<PadVoice, PendingPadHit[]>` — an
unowned singleton that cannot be reset, inspected or disposed. It exists because
one `Tone.Player`'s `playbackRate` setter mutates every active source, so a live
hit arriving inside the transport lookahead must cancel the timeline, insert
itself, and replay the future starts. That is the most intricate code in the
slice, and **buffer swapping has exactly the same hazard as `playbackRate`** — it
is pad-global and live. Adding buffer resolution to that path without first
giving it an owner would be building the harder thing on the weaker foundation.

## Solution

Move buffer ownership onto the source, and give the pad voice an object that owns
its own queue.

A **sample registry** maps a source id to a decoded buffer. It is the only thing
that knows how a source becomes audio, and it is what EB2-04's injected decoder
will write into — the file picker's whole job becomes "decode, register, add the
source to the document," with no audio-layer change at all.

The **pad voice becomes an owning object** built by a factory, in the shape the
repo already uses for `createStabVoices`: it holds its player, its gain, its
pending-hit queue, and a reference to the registry. At trigger time it resolves
`pad.region.sourceId` through the registry, swaps the player's buffer when the
source has changed, and plays. The guard stops asking "is this the one curated
source?" and starts asking "does the registry know this source?" — which is true
today and stays true when there are twenty of them.

The curated source goes through the registry like anything else, so `PAD_SAMPLES`
is deleted and pad players are constructed with no URL. There is one path from a
source to sound, and EB2-04 inherits nothing special.

## Commits

Each commit leaves the app playable and the suite green. TDD throughout, per
`AGENTS.md` and the `/tdd` skill — the test comes first in every commit that adds
behavior.

**1. Add the sample registry, wired to nothing.**
A new module holding source-id → buffer, with register, has, and get. Its buffer
type is a small structural interface, not a Tone type, so tests inject plain
fakes the way the pad voice tests already do. Nothing imports it yet. The app is
byte-identical at runtime; this commit is a new file and its test.

**2. Introduce the pad voice factory alongside the existing free function.**
A factory that takes a player and a gain and returns an object with a trigger
method, holding its pending-hit queue in its own closure. The logic is moved
across unchanged — the same cancel-insert-replay algorithm, the same window
arithmetic. Cover it with the same five cases the free function already has,
written against the factory; the old function keeps its own tests and its
module-level WeakMap for now, so the engine is untouched and both paths stay
covered while both exist.

**3. Switch the engine onto pad voice objects; delete the old path.**
Build one pad voice per pad where voices are created, and have the trigger site
call the object instead of the free function. Delete the free function, its
module-level WeakMap, and the now-duplicated tests that covered it. Still no
registry, still gated on the curated source id — behavior is unchanged and the
existing engine test proves it.

**4. Resolve the buffer through the registry, still fed by the URL path.**
Hand the registry to each pad voice. Register the curated source's buffer under
its source id, taken from the player that already loaded it. Change the guard
from "is this the curated source id" to "does the registry know this source id",
and have the voice set the player's buffer when the resolved source differs from
what the player is holding. Pads still construct with a URL, so nothing about
loading changes — this is the commit where the model and the audio layer finally
agree about what owns a buffer, and it is the one to be careful with.

**5. Load the curated asset into the registry directly; delete `PAD_SAMPLES`;
widen the readiness gate in the same commit.**
Fetch and decode the curated asset once, into the registry, under its source id.
Construct pad players with no URL. Delete the pad-id → URL map. The kit's own map
is untouched — drums genuinely are one fixed sample per lane, and that is not the
thing being fixed here.

The readiness gate has to move **in this same commit**, not the next one. Today
first-click readiness rides on Tone's global loaded promise, which covers every
player constructed with a URL. The moment the pad players lose their URL, that
promise stops covering the pad asset — so a first gesture on a cold cache would
resolve on the drum loads alone, reach a registry that has not filled yet, and
the pad would be silent. Splitting these two changes would put a first-click
playability regression in a standalone commit, which is exactly what "each commit
leaves the app playable" forbids. The gate becomes the drum loads *and* the
curated registry load together.

This is the one commit in the sequence with a behavioral risk, so verify it in
the browser before moving on rather than at the end: hard reload, first click,
pad sounds.

**6. Name the seam in the EB2-03 issue's own words.**
Update the comment that described a seam that did not exist, and record in
`docs/issues/04-audio-intake.md` that the intake path now has a place to put a
decoded buffer. Documentation only.

## Decision Document

**Buffer ownership moves to the source.** A decoded buffer is keyed by source id,
never by pad id. Several pads may hold regions into one source and must share its
buffer rather than each holding a copy — this is the state EB2-05 requires, where
three chops come off one break.

**The registry is the single way a source becomes audio.** The curated shipped
source is not special-cased; it is registered like any other. There is one path,
so the intake slice adds a producer rather than a second mechanism.

**Buffers resolve at trigger time, not at assignment time.** The voice reads the
pad's source id on each hit and swaps only when it differs from what the player
holds. This was chosen over pushing buffers on settings change because a pad can
be reassigned mid-playback, and a push-based design can silently hold a stale
buffer if any path forgets to push. The cost is one identity comparison per hit.

**A buffer swap is subject to the same hazard as tune.** Both are pad-global and
live, and both affect starts the transport lookahead has already handed to the
player. Buffer resolution therefore belongs inside the existing cancel-insert-
replay rebuild, not beside it — a swap must not retune or re-sound a hit that is
already scheduled.

**The pad voice becomes an owning object, following the stab voice pool.** The
repo already solved live-versus-sequenced contention with a factory returning an
object that owns its state; the sampler's queue follows it rather than inventing
a second pattern. Module-level mutable state keyed on object identity is removed.

**The guard becomes a registry membership question.** "Does the registry know
this source" is true today for the curated source and stays correct for every
later one, where "is this the curated source id" would have to be edited by every
slice that adds a way to make audio.

**A `dispose` is deliberately not added.** Nothing disposes a voice today —
voices are created once per session. The lifecycle belongs to EB2-06, where
source deletion arrives, and adding it now would be a hook for a need that does
not exist.

**The kit keeps its lane → URL map.** A drum lane really is one fixed sample and
has no source, no region, and no reassignment. Generalizing it would be a cost
paid for nothing.

## Testing Decisions

A good test here asserts what a caller can observe — that a pad sounds, stays
silent, or swaps what it is playing — and never how the queue is stored. The
existing pad voice tests are the model: they drive a fake player and assert the
calls it receives, so the intricate rebuild logic is fully covered without an
AudioContext. That is the property to preserve while its state moves into a
closure.

**Registry — new pure test.** Register, membership, retrieval, and an unknown id.
Prior art: any of the pure model suites; this is smaller than most.

**Pad voice — extend the existing suite.** Port the five existing cases onto the
factory unchanged; they are the regression net for the rebuild algorithm and must
keep passing verbatim. Add: a pad whose source the registry does not know stays
silent; a buffer is set when the resolved source changes and not when it is the
same; and a swap arriving inside the lookahead goes through the rebuild rather
than around it.

**Engine — extend the existing suite, keep its mock.** The hand-rolled Tone mock
stays. It proves real wiring end to end, it is what caught the sticking-lights
bug, and replacing it is a separate refactor that would drag in the drum path.
Add: a pad assigned a source the registry does not know does not start its
player, and the curated source does.

**Regression net that must stay green untouched.** The monophony and accent cases
in the pad voice suite, the pad-versus-kit timestamp case and the stop-clears-
sequenced-lights case in the engine suite, and the mounted-deck and share
round-trip suites, which should not notice this refactor at all.

**In-browser verification.** Commit 5 is the one that needs it: first click after
a hard reload must still sound, since the readiness promise changed. Also confirm
a pad reassigned while the transport is running swaps cleanly without a dropout.

## Out of Scope

- **D2, the equal-time retrigger throw.** The owning object from commit 2 gives
  its guard an obvious home, and taking it here would be cheap — but it is a
  separate defect with its own test, and folding a bug fix into a refactor makes
  both harder to review. Take it immediately before or after, not inside.
- **R3, the lane-kind dispatch appearing at three sites.** Commit 3 touches one
  of those three. Collapsing all of them means giving every voice a trigger
  closure, which changes the drum path for a benefit this slice does not need.
- **R4, the duplicated live-input plumbing** between the sampler panel and the
  stab keyboard. Unrelated layer; unaffected by any commit here.
- **Rewriting the engine test onto injection.** Considered and declined above.
- **EB2-04 itself** — no file picker, no drag-and-drop, no decoder, no intake
  gate. This slice builds the place those things put their output and stops.
- **Persistence of audio** (EB2-06) and **per-pad level / normalization**
  (G10, EB2-05).

## Further Notes

The sequencing argument is that every commit here gets more expensive after
EB2-04 lands, and one of them stops being possible. Commit 5 deletes the pad-id →
URL map; once intake exists, that map has live callers built on top of it and its
deletion becomes a migration instead of a deletion. Commit 4 changes the guard
while there is exactly one source to reason about — the cheapest possible moment
to change a rule about which sources may sound.

There is also a spike in EB2-04 that this ordering serves. That slice opens by
measuring whether `decodeAudioData` honours an offline context's sample rate,
because the whole memory budget rests on it. A spike wants somewhere to put its
result; with the registry already in place it can register a real decoded buffer
and hear it come out of a pad, which is a far better answer than a number in a PR
comment.

Worth stating plainly, since it is the temptation this doc exists to resist: none
of this makes the app do anything new. At the end of it the deck sounds exactly
as it does now, four pads playing one shipped perc sample. The whole return is
that the next slice becomes small.

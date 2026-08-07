# EB2-09 — Multi-track curriculum and the Sampling Arc

> Track: v2.0 · Slice 9 of 10
> Depends on: EB2-06 (persistence), EB2-05 (regions to assert against)
> Blocks: nothing
> Branch: `feat/sampling-arc`
> Spec stories covered: 49–57
> Resolves review findings: **G3**, **G4** (the goal), **G7**, **G8**

## Why this slice

The deferred v2 item named in `CONCEPT.md`: the curriculum becomes multi-track.
The fourteen-lesson techno Arc is untouched and keeps its graduation moment as a
real ending, and a new Sampling Arc teaches the craft the sampler exists for.

The arc navigation rules are already parameterized by arc — `activeArcLesson`,
`nextUnfinishedLessonId`, `arcCompletion`, `arcEntries` and `isFinalArcLesson`
all take the arc as an argument. So most of this slice is registering a second
arc, tracking which is active, extending the arc UI with a track selector, and
authoring. The three interesting problems are below.

## Problem 1: one lesson pointer cannot hold two places (G3)

`ProjectState.activeLessonId` is a single `string | null`, and the spec's v8 adds
only "the active curriculum arc id" alongside it. That does not satisfy story 51,
"switch between paths without losing my place in either."

With one pointer, switching from sampling back to techno leaves `activeLessonId`
naming a sampling lesson. `activeArcLesson` will not find it in the techno arc,
falls through to "first unfinished", and the user's place is silently gone.

**Decision:** the pointer becomes per-arc — a map from arc id to the selected
lesson id or null. `ProjectState` advances to **v10**, and the v9 → v10 migration
lifts the existing scalar into the techno arc's slot so a returning user resumes
on exactly the rung they were on. `activeArcId` is separate and names which track
is on screen.

## Problem 2: the pre-installed source earns lesson one (G4)

The sampler ships with the curated source pre-installed and pads empty. If the
Sampling Arc's first lesson is "load a sound" and its goal is "a source exists",
it is earned the moment the app opens — the same trap the backbeat clap fell into
in Phase 7, and the shipped-lessons contract will catch it.

**Decision:** the goal asserts a **user-added** source, using the `origin` field
introduced in EB2-03. `origin: 'upload' | 'recording'` counts; `'shipped'` does
not. The learner has to actually bring something in.

This preserves both halves of the rule the project has paid for twice: the
opening deck is immediately usable (there is a source to chop right now), and it
has done none of the curriculum's work.

## Problem 3: a region goal must name its source (G7)

The spec says sampling goals get their specificity from the curated source —
"because the app knows that file, a goal can assert that a region starts within a
particular window and mean something musical by it."

But a window alone is a false positive waiting to happen. A learner who loads
their own break and happens to chop near the same offset completes a lesson about
a file they never opened.

**Decision:** a region-window goal carries the **source id** as well as the
window, and the lesson parser rejects a window that falls outside that source's
known duration — consistent with how it already rejects unknown lanes,
unreachable counts and out-of-range tempo ranges. A mistyped lesson must fail
loudly rather than become unwinnable.

## Implementation decisions

### `GoalContext` grows, goals stay declarative

The evaluator does not receive `ProjectState`; it receives a curated
`GoalContext` of `{ pattern, motion?, bpm?, chord? }`. Sampling assertions need
pad settings and source metadata, so the context gains a sampler field. The
context is the only thing that grows as the vocabulary does — that is the
existing design and it holds here.

New goal types are declarative and JSON-authored like the rest of the vocabulary.
Likely shape:

- a **source loaded** assertion, qualified by origin (Problem 2)
- a **pad assigned** assertion
- a **region within a window** assertion, qualified by source (Problem 3)
- a **region trimmed below a duration** assertion
- a **fit target set** assertion
- a **pad tuned away from neutral** assertion

Author these as the arc needs them, not speculatively. Every one must be
rejectable at parse time when it names a pad, a source or a window that does not
exist.

### The param registry already covers Tune

EB2-02 widened `paramSwept` from `BASS_PARAMS` to a deck-wide registry. The pad
Tune knobs join it, so "tune a pad" can be a sweep goal with no new machinery.

### Inheritance must cover every arc and both carriers (G8)

`lessonsAlreadyMet` currently runs over the single `ARC` when a shared beat
arrives, holding back credit for work the recipient did not do until the goal
stops being met and is built again.

Two extensions:

1. **Iterate every registered arc**, not the techno one.
2. **Cover bundle import**, not just links. A bundle carries real audio, so a
   recipient could otherwise arrive with "build your own kit" already earned —
   the most obviously unearned completion the product could hand out.

### Arc UI

- A track selector showing both paths and progress on each.
- Every lesson stays enterable; the deck is never gated. Navigation is pure
  marker movement — entering or leaving a lesson must return the same `patterns`,
  `instrumentSettings`, `mixer` and sampler references it was given, which is
  already asserted for the techno arc and must be asserted for arc *switching*
  too.

### The Sampling Arc

Roughly six lessons: load a sound, find the chop, trim it tight, fit a break to
the grid, tune a pad, build your own kit.

### The Sampling Arc's ending

The spec says the techno arc keeps its graduation moment but is silent on whether
the sampling arc gets one. `FinaleMoment` hardcodes the techno payoff.

**Decide it in this slice** and state the decision in the PR. The recommendation
is a distinct, smaller payoff — the techno arc is the product's spine and its
graduation should stay the biggest moment on the deck, but finishing a track with
nothing at the end reads as an unfinished feature. Whatever is chosen, the finale
component's copy must become data-driven per arc rather than hardcoded.

## Acceptance criteria

- [ ] Both curriculum paths are visible with progress on each, and the user can
      switch between them
- [ ] Switching arcs and switching back returns the user to exactly the lesson
      they were on in each — verified across a reload as well as in-session
- [ ] `ProjectState` v10 carries a per-arc lesson pointer and the active arc id;
      the v9 → v10 migration lifts the existing scalar into the techno arc,
      keeping earned lessons and the user's rung
- [ ] Six sampling lessons exist covering loading, finding a chop, trimming,
      fitting to the grid, tuning, and building a kit, ordered as one arc
- [ ] The opening deck — curated source pre-installed, pads empty — satisfies **no
      lesson in either arc**, enforced by the shipped-lessons contract
- [ ] "Load a sound" is satisfied by a user-added source and **not** by the
      pre-installed one
- [ ] A region-window goal names its source, and a region cut from a different
      source in the same window does not satisfy it
- [ ] The lesson parser rejects a goal naming a pad that does not exist, a source
      that does not exist, or a window outside that source's duration
- [ ] Every sampling lesson auto-detects completion with no false positives or
      negatives, proven by breaking each assertion in turn
- [ ] A shared link or an imported bundle that arrives with sampling work already
      done does not earn those lessons; they become earnable once the goal stops
      being met and is built again
- [ ] Arc navigation and arc switching leave the sandbox untouched — same pattern,
      same patch, same pads, transport still running
- [ ] Adding a lesson to either arc requires editing JSON and one registration
      line, with no other code change

## Testing decisions

**Seam 1 — shipped-arc contract** (prior art: `src/lessons/lessons.test.ts`).
The existing suite synthesizes a known-good goal context per lesson and then
breaks each assertion in turn. **Generalize it to iterate every registered arc.**
It must continue to assert that the opening deck satisfies no shipped lesson —
now including that the pre-installed curated source with empty pads earns nothing
in the Sampling Arc.

**Seam 2 — pure model functions** (prior art: `src/model/arc.test.ts`,
`src/model/lesson.test.ts`). The new goal types and their parse-time rejections;
the per-arc pointer rules, including that switching arcs preserves both places.

**Seam 3 — the document** (prior art: `src/model/projectState.test.ts`). The v10
shape and the v9 → v10 migration; and the existing assertion that navigation
returns identical references, extended to arc switching and to sampler state.

**Seam 4 — mounted deck in jsdom** (prior art: `src/App.test.ts`). Inheritance
suppression for both a link and a bundle carrying finished sampling work.

## Verification beyond unit tests

- Complete all six sampling lessons in order from the real UI, from a wiped
  IndexedDB, confirming each detects only when it should.
- Confirm the negative cases in-browser as the techno arc's AC1 did: a chop from
  the wrong source in the right window, a trim that is not tight enough, a tune
  nudge that is not a sweep.
- Switch arcs mid-playback repeatedly and confirm the pattern, pads, tempo and
  running transport are byte-identical every time.
- Reload and confirm both arcs resume on the correct rung.

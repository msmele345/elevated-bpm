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

- [x] Both curriculum paths are visible with progress on each, and the user can
      switch between them — `ARCS` (`src/lessons/index.ts`) is the registry every
      consumer reads; `LessonArc` renders it as a pair of raised tabs cut from
      the same steel as a step button, each carrying its own earned count and
      `aria-pressed`, ringed where the user is standing the way the current arc
      stop is. Verified in-browser: "Techno 0/14" and "Sampling 0/6" on a wiped
      deck, the meter's `aria-valuemax` following the chosen track
- [x] Switching arcs and switching back returns the user to exactly the lesson
      they were on in each — verified across a reload as well as in-session —
      `activeLessonIds` is a map, so the pointers cannot overwrite each other.
      In-browser: parked on techno 9 and sampling 4, switched back and forth, both
      unmoved; then parked on techno 9 and sampling 3, reloaded, and the deck came
      back on Sampling 3 with techno still holding 9. Also at the model seam
      (`projectState.test.ts`) and the mounted deck (`App.test.ts`)
- [x] `ProjectState` v10 carries a per-arc lesson pointer and the active arc id;
      the v9 → v10 migration lifts the existing scalar into the techno arc,
      keeping earned lessons and the user's rung — proven on a **real** v9
      document rather than only a synthetic one: a v9 doc was written into the
      browser's own IndexedDB naming `filter-sweep`, holding one earned lesson,
      BPM 126 and a pad chopped from the retired shipped perc source. It came back
      on Lesson 9, 1/14 earned, 126 BPM, sampling on its own path — and that pad
      kept its name and its 3.0 st tune while reading "Original cleared", the
      modelled `sourceMissing` state. Housekeeping is never audible
- [x] Six sampling lessons exist covering loading, finding a chop, trimming,
      fitting to the grid, tuning, and building a kit, ordered as one arc
- [x] The opening deck — curated source pre-installed, pads empty — satisfies **no
      lesson in either arc**, enforced by the shipped-lessons contract — the
      contract now iterates `ARCS` and builds its opening context from
      `createDemoProjectState()` through the same `goalContextFor` the deck uses,
      so it cannot drift from what a first-time user actually finds
- [x] "Load a sound" is satisfied by a user-added source and **not** by the
      pre-installed one — the goal carries an `origin`, and the parser refuses
      `origin: "shipped"` outright rather than accepting it and letting it be
      wrong at runtime. In-browser: assigning the curated break to a pad left the
      lesson unearned; a real file through the picker earned it
- [x] A region-window goal names its source, and a region cut from a different
      source in the same window does not satisfy it — verified in-browser as the
      techno arc's AC1 was: the learner's own upload trimmed to start at 0.500 s,
      inside the lesson's [0.40, 0.53] window, did **not** complete "Find the
      Chop"; the same window cut from the Basement Break did
- [x] The lesson parser rejects a goal naming a pad that does not exist, a source
      that does not exist, or a window outside that source's duration — plus a
      window that runs backwards, an unreachable count, a fit target past 16
      steps, a tune of zero semitones, and a chop length past `MAX_SLICE_SECONDS`
      (`lesson.test.ts`)
- [x] Every sampling lesson auto-detects completion with no false positives or
      negatives, proven by breaking each assertion in turn — the generalized
      contract synthesizes a known-good context per lesson from its own JSON and
      then breaks each assertion one at a time, across both tracks. Three of the
      negatives were also driven through the real UI: a 0.69 s trim did not earn
      "Trim It Tight" (0.23 s did), a 2.9 st nudge did not earn "Tune a Pad"
      (6.7 st did), and two assigned pads did not earn the capstone (three did)
- [x] A shared link or an imported bundle that arrives with sampling work already
      done does not earn those lessons; they become earnable once the goal stops
      being met and is built again — `lessonsAlreadyMet` now sweeps `ALL_LESSONS`,
      and both inheritance sites build their context through `goalContextFor`, so
      neither can silently omit the sampler. Both carriers are covered at the
      mounted deck, including the recovery half: delete the sender's source, load
      your own, and the lesson is earned
- [x] Arc navigation and arc switching leave the sandbox untouched — same pattern,
      same patch, same pads, transport still running — asserted by reference at
      the model seam and measured in-browser under a running loop: eight switches
      left the tempo, the pads, the pad steps, the drum steps and the Tune value
      byte-identical, and the playhead advanced through eight distinct steps
      without the clock stalling once
- [x] Adding a lesson to either arc requires editing JSON and one registration
      line, with no other code change — the six sampling lessons were authored
      that way; only genuinely new *goal vocabulary* needed code, which is the
      same rule the techno arc has always had

## What this slice decided

**The Sampling Arc gets an ending, deliberately the smaller of the two.** The
issue asked for this to be decided here and stated. Finishing a track with
nothing at the end reads as an unfinished feature, but the techno arc is the
product's spine and its graduation has to stay the biggest moment on the deck.
So `FinaleMoment`'s copy became per-arc data (`ArcFinale`), and `scale` is the
only thing the two endings really differ on: the techno plate keeps its full bar
of sixteen lights and "You made techno"; the sampling one is a compact eight-light
plate — "Sampling track complete · SP-04 certified", "You built your own kit".
Verified in-browser: the capstone raised the compact dialog over an inert deck
with its close control focused, and it never claims the other track's words.

**The curated source graduated from a 0.25 s perc one-shot to a generated
two-bar break.** "Find the chop", "trim it tight" and "fit a break to the grid"
cannot mean anything musical against a quarter of a second, and the spec's whole
justification for source-qualified windows is that a goal can "mean something
musical by it". The break is *generated*
(`scripts/make-curated-break.mjs`) from the 909 one-shots the deck already ships,
which is what makes every transient a number this repo can point at rather than
something measured off a waveform. Its duration is the generator's own output and
is what the parser validates windows against.

Retiring the old shipped source is handled rather than ignored: `withShippedSources`
drops shipped sources the app no longer has and keeps the user's own untouched, so
a pad still pointing at the perc keeps its region, keeps its slice, and goes on
sounding — losing only re-editability.

## Defect found during the in-browser pass: the lesson recommended a key that did not work

The unit tests could not have caught this, because the decoder is injected and
onset detection was never run over the real file.

"Find the Chop" tells the learner to "use the bracket keys to jump straight to
the detected hit". Driving that in the browser, the detector reported **seven**
onsets and the bracket key jumped from 0.000 s to 0.688 s — straight past the
clap at 0.46 s the lesson asserts. The lesson was still winnable by dragging, but
its own instruction led away from the answer, with nothing on screen to explain
why.

The cause was in the generated break, not the detector. `detectOnsets` reads the
*rise* between frames — deliberately, so it is indifferent to how loud a source
was mastered — and the 909 kick rings for over a second, so the clap landed
inside its tail and never cleared the threshold.

The fix was to give every voice in the generator the decay a sampled break would
already have. Detected onsets went from 7 to 13, including **0.459 s** — one
bracket press from the start and squarely inside the window. The alternative was
to move the lesson onto a transient that happened to be detected; that would have
made the lesson pass while leaving the curated source a poor thing to learn
chopping on, which is the one job it has.

**A note on the suite.** One full-suite run failed in `App region editor > cuts
two regions from one source onto two pads` on a `waitFor` timeout — a test this
slice does not touch. Four subsequent full runs and the file in isolation all
passed. It reads as the same pre-existing timing flake under parallel load
recorded in issue 07 rather than a regression, but it is written down rather than
dismissed.

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

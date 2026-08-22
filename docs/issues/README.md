# Elevated BPM v2 — Issue Track

> Source spec: `docs/specs/sp-04-sampler.md`
> Deferred items folded in from `docs/PRD.md`: **FX sends** (was v1.x) → EB2-02, **Web MIDI input** (was v1.x) → EB2-10.

SP-04 as specified is a release, not a phase: 75 user stories, a new storage
subsystem, a decode/memory discipline, an editor with its own accessibility
surface, a new file format, and a second curriculum arc. Measured against the v1
phases in `plans/elevated-bpm-v1.md`, that is four to six of them.

This folder slices it into ten issues that each ship something playable, in the
tracer-bullet style v1 used. Every issue is written to be picked up cold: an
agent should be able to read one file plus the source spec and start working.

## The v1.x line is retired

Web MIDI and FX sends were parked on a "v1.x" train. That train has no
passengers — nobody is pinned to a v1 build — and maintaining a parallel release
line costs real overhead for no benefit. Both items are folded into this track
and sequenced where they earn the most:

- **FX sends move to the front (EB2-02)**, before any sampler work. Not as a
  gate — as sequencing. FX forces the deck-wide param registry that the pad Tune
  lessons need anyway, settles the Master strip's layout before a pad panel has
  to fit beside it, and establishes the send-tap-per-voice contract that pad
  voices then follow instead of connecting directly and being retrofitted. It
  also makes the sampler sound good on arrival — a dry chop is the least musical
  thing on the deck.
- **Web MIDI moves to the back (EB2-10)**, after the pads exist. Its scope
  doubles for free there: one routing table covering stabs *and* pads instead of
  a stabs-only implementation revisited three months later. It has no dependents,
  so it can be pulled forward to any point after EB2-03 if you want a short slice
  between two heavy ones. It is also the only issue on this track that needs
  hardware to verify — if there is no controller on the desk, don't start it.

## Order and dependencies

```
EB2-01  share payload migration        ── foundation, unblocks every version bump
   │
EB2-02  FX sends (delay + reverb)      ── ProjectState v8, param registry, send taps
   │
EB2-03  SP-04 tracer: pads as lanes    ── ProjectState v9, lane-id widening
   │
EB2-03a refactor: buffer owned by source ── sample registry; pads bound to no file
   │
   ├── EB2-04  audio intake (file + drag)
   │      │
   │      └── EB2-05  region editor + slice render
   │             │
   │             ├── EB2-06  sample storage + missing audio
   │             │      │
   │             │      ├── EB2-07  microphone recording
   │             │      └── EB2-08  bundle + link degradation
   │             │
   │             └── EB2-09  multi-track curriculum + Sampling Arc
   │                          (needs 06 for persistence, 05 for goals)
   │
   └── EB2-10  Web MIDI input          ── no dependents; place anywhere after 03
```

Strictly sequential: 01 → 02 → 03 → 04 → 05 → 06. After 06, issues 07, 08, 09
and 10 are independent of each other and can be taken in any order.

## ProjectState version ledger

The document is at **v7** today. This track spends three versions:

| Version | Issue | Adds |
|---|---|---|
| v8 | EB2-02 | `instrumentSettings.fx` — send levels and FX patch |
| v9 | EB2-03 | `sources[]`, pad lanes on the Pattern, `instrumentSettings.sampler` pad settings |
| v10 | EB2-09 | per-arc lesson pointer, replacing the scalar `activeLessonId` |

Three bumps is only affordable because **EB2-01 lands first**. Today
`readSharedBeat` rejects any payload whose version is not exactly current, so
each bump would silently kill every share link in the wild — and later, every
bundle file anyone had saved. EB2-01 makes share and bundle payloads run through
the existing migration chain, after which version bumps are free. Do not
reorder it.

## Review findings → owning issue

These came out of the spec review. Each is resolved by exactly one issue; that
issue states the decision and carries the test that holds it.

| # | Finding | Owner |
|---|---|---|
| G1 | "Nothing changes shape" is false — `Mixer`, `Pattern`, share validation and the voice registry are all keyed on `DrumLaneId`, and solo is a global rule | EB2-03 |
| G2 | Slice storage format unstated; bundle size estimate silently assumes 16-bit while the memory math assumes Float32 | EB2-05 |
| G3 | Multi-track curriculum keeps a single `activeLessonId`, so switching arcs loses your place — story 51 unmet | EB2-09 |
| G4 | Pre-installed curated source earns "load a sound" on first run, repeating the Phase 4/7 demo problem | EB2-03 (`origin` field), EB2-09 (goal) |
| G5 | No slice/source lifecycle — re-chopping orphans slices, and a load during share preview strands one permanently | EB2-06 |
| G6 | Share/bundle version exact-match breaks links on v8 and would expire every bundle on every later bump | EB2-01 |
| G7 | `GoalContext` has no sampler field, and a region-window goal that does not assert *which* source will false-positive | EB2-09 |
| G8 | Inherited-lesson suppression must cover every arc and the bundle import path, not just links | EB2-09 |
| G9 | No microphone feedback story — mic + speakers + master `Distortion` is a howl on first use | EB2-07 |
| G10 | No per-pad level and no normalization; a chop off a mastered track sits ~12 dB above the 909 kit | EB2-05 |
| G11 | Editor presentation unspecified (inline vs dialog), and one skip link cannot cover ~80 sampler controls against a threshold of 8 | EB2-05 |
| G12 | `paramSwept` validates against `BASS_PARAMS` only — the Phase 9 master knobs already cannot carry a sweep goal | EB2-02 |
| G13 | `decodeAudioData` resamples to the context rate, and the reduced-rate offline decode the memory budget rests on is not reliable cross-browser | EB2-04 (spike, first task) |
| G14 | Pad retrigger and polyphony behavior unstated | EB2-03 |
| G15 | `projectStore` opens at `DB_VERSION = 1` with a single store; the sample store needs a bump that preserves `project` | EB2-06 |

## Conventions for every issue on this track

- **TDD, red-green-refactor.** Follow the `/tdd` skill. The spec's testing
  section names six seams, all already in active use — prefer them to new ones,
  and prefer the highest seam that can make the claim.
- **Branch off `develop`**, named in each issue's header. PR back into `develop`,
  squash and merge. See `AGENTS.md`.
- **Acceptance criteria are written to be checked off with evidence**, in the
  style of `plans/elevated-bpm-v1.md`: state what was built, name the seam that
  proves it, and record what in-browser verification actually measured. An AC
  with no evidence is not done.
- **Stay in scope.** Each issue lists what it deliberately leaves to a later
  slice and names which one. Do not implement a later slice's behavior because
  it seems cheap while you are nearby.
- **The performance rule still holds.** rAF reads the transport directly; React
  re-renders on user edits only, never on the audio clock. The memoization
  discipline from Phase 9 (`src/render.test.ts`) applies to every new control.
- **The demo rule still holds.** The opening deck may groove, but it must never
  do a lesson's work for the user. `src/lessons/lessons.test.ts` enforces it;
  EB2-09 generalizes that enforcement across both arcs.

## Intermediate states we are accepting

Two slices ship deliberately incomplete behavior, matching how v1 ran (Phase 1
and 2 had no persistence at all until Phase 3):

- After **EB2-04**, a loaded source does not survive a reload. Storage arrives in
  EB2-06.
- After **EB2-05**, a committed region is rendered but held in memory only. Same
  fix, same issue.

Both are called out in their own files so they are not mistaken for bugs, and
both are closed by EB2-06. Do not ship v2.0 with either still open.

## Note on EB2-10 - the work is done on a branch feat/10-web-midi-input. This will not be merged to develop/main until a real midi device can be connected and the feature can be re-tested with the phyical device. 
# EB2-07 — Microphone recording

> Track: v2.0 · Slice 7 of 10
> Depends on: EB2-06
> Blocks: nothing
> Branch: `feat/microphone-recording`
> Spec stories covered: 3–6
> Resolves review finding: **G9**

## Why this slice

Sampling your own voice, a tap on the desk, or a hardware synth without any other
software. It is the shortest path from "I want that sound" to "that sound is in
my beat", and it is why the intake path in EB2-04 was built as a path rather than
a file picker.

It is placed after storage so a recording is a first-class, durable source the
moment it is made — no throwaway state.

## Scope

### In

- Record from the microphone, stop, and get a source.
- An unmistakable recording indicator with an obvious stop control.
- Permission requested only on record, released on stop.
- Feedback safety.

### Out

- Input monitoring, input gain, and input device selection. A groovebox does not
  need a channel strip on its mic input, and monitoring is precisely what causes
  the problem below.
- Recording the deck's own output. That is a bounce/export feature, not a sampler
  feature, and it is not on the v2 track.

## Implementation decisions

### The recording is indistinguishable from an upload

A completed recording becomes a source with `origin: 'recording'` and travels the
**same** path an uploaded file does — same intake gate, same limits, same
failures, same storage. Everything downstream (chopping, tuning, sequencing)
works identically regardless of where the audio came from. That is story 5, and
it is the whole reason this slice is small.

The `origin` field distinguishes it for the curriculum's benefit (EB2-09), not
for the audio path's.

### Feedback safety (G9)

The spec says nothing about this and it is the worst possible first-run moment:
microphone plus speakers plus the master `Distortion` added at v7 is a howl, and
the user's instinct will be to reach for the volume they cannot find.

Three rules:

1. **The input is never monitored through the master bus.** The mic signal
   reaches the recorder and nothing else. No connection to `Tone.getDestination()`
   at any point.
2. **Starting a recording stops the transport**, and the UI says so. Recording
   over a running loop guarantees the loop is in the sample, which is almost never
   what a learner wants and is impossible to undo. Stopping is honest and it
   removes the loudest feedback source in one move.
3. **Warn about headphones** in the recording UI, once, quietly. Not a modal.

If the transport-stop rule turns out to feel wrong in use, the alternative is to
keep playing but mute the master — do not resolve it by allowing both to run.

### Permission lifecycle

- `getUserMedia` is called **when the user chooses to record**, never at startup
  and never speculatively.
- The stream's tracks are **stopped on stop**, so the browser's recording
  indicator goes out and granting permission once does not mean being listened to
  continuously. This is story 6 and it is a genuine privacy commitment, so test
  that the tracks are actually stopped rather than the stream merely dropped.
- Permission denial is a normal, dismissible failure, following the same pattern
  as a rejected file: explain it, leave the project untouched.

### The browser machinery is behind an adapter

`getUserMedia` and `MediaRecorder` sit behind an injected adapter, and testing
stops at that boundary: a completed recording becomes a source indistinguishable
from an uploaded file. The browser machinery itself is left to manual
verification. This is a conscious trade, recorded here so it is not mistaken for
an oversight.

### The indicator

Story 4 asks that the user is never unsure whether the app is listening. Make it
unambiguous — a persistent, visible recording state with elapsed time and a stop
control that is the largest thing on the panel. It should also be announced to
assistive technology when it starts and stops, since "am I being recorded" is not
a question anyone should have to check visually.

## Acceptance criteria

- [ ] Recording from the microphone produces a source that behaves identically to
      an uploaded file everywhere downstream — chopping, tuning, sequencing,
      storage
- [ ] Recording is unmistakable while in progress, with elapsed time and an
      obvious stop control, and the state change is announced to assistive
      technology
- [ ] The microphone is requested only when the user chooses to record, and the
      stream's tracks are **stopped** on stop — the browser's recording indicator
      goes out
- [ ] The input is never routed to the destination: no monitoring, no feedback
      path, verified by inspecting the audio graph
- [ ] Starting a recording stops the transport, and the UI says that it will
- [ ] A denied permission, or a failed recording, produces a dismissible message
      and leaves the project untouched
- [ ] A recording that exceeds the duration limit is handled by the same gate an
      over-length file hits
- [ ] The browser machinery sits behind an injected adapter, and the slice's tests
      stop at that boundary

## Testing decisions

**Seam 1 — mounted deck in jsdom** (prior art: `src/App.test.ts`). With a fake
adapter: starting a recording stops the transport and shows the indicator;
stopping produces a source that lands on a pad; a denied permission produces a
dismissible message and leaves the project unchanged.

**Seam 2 — pure model functions.** The recording session state machine — idle →
requesting → recording → stopping → source, including the denial and failure
transitions — is worth extracting and testing directly, because it is what
guarantees the indicator can never be wrong about whether the mic is live.

**Deliberate gap:** the actual `getUserMedia` and `MediaRecorder` plumbing is not
tested. Verify it by hand.

## Verification beyond unit tests

This slice leans on manual verification more than any other, by design:

- Record with speakers on and confirm nothing howls.
- Confirm the browser's own recording indicator appears on record and **goes out
  on stop** — this is the check that proves the tracks were stopped.
- Record, chop the result, and sequence it, confirming it is indistinguishable
  from an uploaded file at every step.
- Deny permission and confirm the app explains rather than breaking.
- Confirm the flow on Safari as well as Chrome; `MediaRecorder` container support
  differs and the decode path must accept whatever it produces.

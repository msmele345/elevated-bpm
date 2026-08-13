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

- [x] Recording from the microphone produces a source that behaves identically to
      an uploaded file everywhere downstream — chopping, tuning, sequencing,
      storage — because it *is* an upload by the time anything downstream sees
      it. A finished take becomes a `File` and is handed to the same
      module-scoped `sampleIntake.load` the file picker feeds, so there is one
      gate, one decode, one storage path and one set of failures rather than two
      that could drift. Covered at the mounted deck (`App.test.ts`, "chops, tunes
      and sequences a take exactly as it does an upload"): a take is recorded,
      opened in the same region editor, trimmed with the same bracket keys,
      committed to pad 2, tuned on the pad's own knob, sequenced onto step 5 —
      reaching the engine inside the same `padLanes` pattern as every other lane
      — and found in IndexedDB under the same `sliceKey` any other chop is kept
      under. Its `origin` is `'recording'` and nothing on the audio path reads it
- [x] Recording is unmistakable while in progress, with elapsed time and an
      obvious stop control, and the state change is announced to assistive
      technology — a red-lit plate with a lit dot, `RECORDING`, an `M:SS` clock
      that ticks itself, and a `STOP RECORDING` control that is deliberately the
      largest thing on the panel. The announcement is a clipped `role="status"`
      region carrying `MIC_LIVE_ANNOUNCEMENT` / `MIC_OFF_ANNOUNCEMENT` and
      **never the clock**, which would otherwise be read aloud twice a second.
      Verified in-browser: indicator, ticking elapsed and announcements all
      confirmed live, and the announcement flipped to "the microphone is off" on
      stop. Covered by Vitest at both seams
- [x] The microphone is requested only when the user chooses to record, and the
      stream's tracks are **stopped** on stop — `openMicrophone` is called from
      the record handler and nowhere else (asserted at the mounted deck: not
      called at startup), and every track is stopped by name in a `finally`.
      Verified in-browser against **real `MediaStreamTrack` objects**: the track
      read `live` while recording and `ended` after stop
- [x] The input is never routed to the destination: no monitoring, no feedback
      path — structural rather than careful. The stream goes from `getUserMedia`
      straight to `MediaRecorder` and no `AudioContext` node is ever built from
      it, so there is no edge to leave out. Verified in-browser by patching
      `createMediaStreamSource` before recording and counting calls: **0** across
      a full record → stop cycle
- [x] Starting a recording stops the transport, and the UI says that it will —
      the hint reads "Recording stops the loop. Wear headphones so the
      microphone does not hear the deck." before anything happens, and the stop
      goes through `stopTransport`, the state the play control, playhead and room
      light all read, rather than `engine.stop()` alone. Covered at the mounted
      deck ("says it will stop the loop, then stops it…"): the deck is playing,
      recording starts, and the play control reads stopped
- [x] A denied permission, or a failed recording, produces a dismissible message
      and leaves the project untouched — both are worded like a refused file and
      go to the same dismissible alert. Covered at the mounted deck: a refused
      permission leaves the saved document **byte-identical** past the autosave
      debounce (`loadProjectState()` equals the document saved before), and a
      take that fails mid-capture still ends every track
- [x] A recording that exceeds the duration limit is handled by the same gate an
      over-length file hits — the same `rejectionForProbe` against the same
      `MAX_SOURCE_SECONDS`, producing the same "must be 6 minutes or shorter"
      message. Covered at the mounted deck with a stubbed clock: nothing
      decoded, nothing registered, no source added, and the microphone still
      released
- [x] The browser machinery sits behind an injected adapter, and the slice's tests
      stop at that boundary — `src/audio/microphone.ts` holds `getUserMedia` and
      `MediaRecorder` and nothing else, mocked in tests exactly as
      `sampleDecoder` already is. The boundary hands back a `Blob` and a list of
      inputs, never an audio node, which is what keeps monitoring inexpressible

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

## What this slice decided

**The take's length comes from the clock that made it, not from a probe.**
Intake grew one option, `knownDuration`, used in place of the metadata probe.
The gate itself is untouched — same limits, same order, same refusals, same
decode — so "the same gate an over-length file hits" stays literally true; only
where the number comes from differs. The recorder's clock being exact and free
would be reason enough, but the reason it is worth an option is the failure
mode: a container that declares no duration probes as `Infinity`, and
`rejectionForProbe` reads that as **too long** — every take refused, in the one
wording that tells the user to record something shorter. Chromium was measured
declaring a correct duration, so this guards against a container that does not
rather than working around one that never does.

**The tracks are released above the adapter, not inside it.** The adapter could
have stopped them in `finish()`, and the boundary would have been tidier. It
would also have made "the microphone goes off when you stop" a claim about
untested plumbing. Exposing the inputs and stopping them in `App` puts the
privacy commitment where a test can hold the app to it — the issue asks for the
tracks to be *stopped* rather than the stream merely dropped, and that is only
checkable if something above the boundary does the stopping.

**A recording is not assigned to a pad.** The scope is "record, stop, and get a
source", and there is no pad in the gesture — recording is started from the
panel, not from a pad. A take lands in the sources list and is assigned or
chopped like anything else. Auto-assigning would also have to choose a pad, and
any choice would sometimes overwrite a chop the user wanted.

**The transport is stopped before the microphone is asked for, not after.** A
denied permission therefore leaves the loop stopped, which is a small surprise.
The alternative is worse: the loop would be audible through the permission
prompt and into the first moment of capture, which is exactly the audio the rule
exists to keep out of the sample.

**A recording is not released on blur or tab-switch.** The stab keyboard and the
pads both release everything held on `blur`/`visibilitychange`; recording
deliberately does not copy that. A held note is meaningless once the window is
gone, but a take should survive the user switching away — and the browser's own
recording indicator, which stays visible across tabs, is what covers them.

**An empty take is refused as too short rather than handed to the gate.** Found
while testing: stopping immediately produces a zero-byte blob, and the intake
gate calls that `undecodable` — "This browser cannot play that file", which
blames the browser for something the user did. `EMPTY_RECORDING_MESSAGE` says
the take was too short instead.

**The announcement is carried in the machine's state.** "The microphone is off"
is only worth announcing to someone who was just told it was on, and idle is the
state both before a recording and after one — so it cannot be derived from the
status alone. Carrying it through the transitions also means the denial path,
which never opened the mic, correctly announces nothing.

## Notes from verification

**What the browser pass could and could not reach.** Verified against real
browser objects: the record control and its hint, the indicator with its ticking
clock and stop control, both announcements, `getUserMedia` called only on the
record click, a **real `MediaStreamTrack` going `live` → `ended`** on stop, and
**zero `createMediaStreamSource` calls** across a full cycle. The page loaded
with zero app console errors.

What could **not** be reached: the headless browser has no audio output device
(`The AudioContext encountered an error from the audio device or the WebAudio
renderer`), so `Tone.start()` never resolves and the deck's audio never runs
there at all — the Play control never engages and no kit sample is ever
requested. That leaves the *decode* of a real recording, and the transport stop
as an audible event, unverified in-browser. Both are covered at the unit seams,
and both are on the manual list above. **This is the slice's real remaining
risk and it is the user's pass to make**, on a machine with an audio device: a
real microphone with speakers on (the howl check), the browser's own indicator
going out, and Safari's container decoding.

**Measured, on the container question.** Real `MediaRecorder` in this Chromium
produced `audio/webm;codecs=opus`, 18,650 bytes for ~1.2 s — which is what makes
`recordingFileName` yield `Recording 1.webm`, stripping back to `Recording 1`.
A metadata probe of that blob reported **1.439982 s** for a 1.5 s take: finite
and roughly right, contradicting the premise that a `MediaRecorder` container
commonly declares no duration. The design did not change but the comments did;
see the decision above.

**An unanswered permission prompt is a real state.** Playwright leaves the
prompt pending rather than answering it, and the deck sat on "Waiting for
permission…" indefinitely — which is correct, and is why that state has its own
copy rather than sharing the idle button's. There is no cancel affordance
because the prompt itself is the cancel; the cost is that a user who walks away
from an open prompt has no Record button until they answer it.

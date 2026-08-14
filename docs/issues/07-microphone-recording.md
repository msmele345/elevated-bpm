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
      recording starts, and the play control reads stopped. **And the loop
      cannot be started again while the microphone is live** — the criterion as
      worded is about the starting condition, but the rule it exists for
      ("do not resolve it by allowing both to run") is about the state, and
      stopping the transport is pointless if the next click undoes it
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
      `MediaRecorder` and nothing else, and the boundary hands back a `Blob` and
      a list of inputs, never an audio node, which is what keeps monitoring
      inexpressible. **Substituted at the module boundary rather than passed as
      a constructor argument**, which is a real difference from the sibling
      adapter: `sampleDecoder`'s functions are imported *and* injected into
      `createSampleIntake`, because intake is a thing with a lifetime that can
      be constructed. Recording is orchestrated directly by `App`, so there is
      no constructor to inject into, and inventing one to earn the word would be
      ceremony. What the criterion is protecting — one seam, browser machinery
      on the far side of it, tests stopping there — holds exactly

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

**The adapter releases the tracks on exactly one path, and the app on every
other.** The rule is that the privacy commitment lives above the boundary where
a test can hold the app to it. There is one path where it cannot: both
`new MediaRecorder` and `start()` can throw *after* the browser has granted
access, and on that path the session — the only thing carrying the tracks — is
never returned. Nothing above the boundary could ever stop them. So the adapter
stops them there, and only there.

**The gate reads a wall clock, which slightly over-measures.** `knownDuration`
is elapsed time including the recorder's flush, while the `duration` the
document keeps comes from the decoded buffer. Near the six-minute limit the two
can disagree by a fraction of a second, and the wall clock is the larger — so
the error is toward refusing a take marginally early rather than accepting one
over the cap. That is the safe direction for a limit whose whole job is bounding
peak memory.

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
requested. That left the *decode* of a real recording, and the transport stop
as an audible event, unverified in-browser. Both are covered at the unit seams,
and both were on the manual list above. **That was the slice's real remaining
risk**, and it has since been closed for Chrome — see the next section. Safari
remains open.

## The manual pass, on real hardware (Chrome)

Run in the user's own Chrome on macOS, on a machine with a real audio device,
with the user present for the checks only a human can make. This is the gap the
headless pass could not reach.

**The deck sounds, on a real device.** `contextState: "running"`,
`sampleRate: 44100`, destination `channelCount: 2`; transport ticks 15610 →
15818 in 500 ms; a meter off the destination read peak **−3.2 dB** with 23/24
frames above −60 dB. Confirmed audible by the user.

**Five takes through the real `getUserMedia` → `MediaRecorder` path.** Container
was `audio/webm;codecs=opus` throughout; all mono at 44.1 kHz.

| take | bytes | recorder clock | decoded | Δ | peak |
|---|---|---|---|---|---|
| 1 | 747,046 | 46.357 s | 46.379977 s | 23 ms | 1.00161 |
| 2 | 1,319,916 | 81.946 s | 81.959977 s | 14 ms | 0.19375 |
| 3 | — | — | 32.939977 s | — | 0.59119 |
| 4 | 594,418 | — | 36.899977 s | — | 0.07353 |

The decode-vs-recorder-clock deltas are the `knownDuration` decision paying off
in the only place it matters: **≤23 ms**, and the durations that reached storage
(46.38 / 81.96 / 32.94) are the recorder's numbers, not a probe's.

**Session-wide invariants, across all five takes:** `createMediaStreamSource`
called **zero** times — the feedback path is provably absent rather than merely
unwired; every `MediaStreamTrack` ended (`live` → `ended`, 5/5); zero decode
failures; the transport `stopped` with ticks frozen on record, and it stops
*before* the permission await rather than after the mic opens; Play held
(`aria-disabled="true"`) for the duration of a take and released after.

**The release proof, which only the OS can give.** With the user watching, the
Chrome tab indicator and the macOS menu-bar dot both **appeared on record and
were gone after stop**. The app can only report on itself; this is the
independent confirmation that the tracks were genuinely handed back. Done as a
differential test — appear, then disappear — because absence alone is not
observable by someone who has not seen the indicator present.

**A recording is indistinguishable from an upload, downstream.** Named
`Recording 1`…`5` with the extension stripped by the upload path's own
`sourceNameFromFileName`; chopped in the same editor (87 onsets over 36.900 s on
a real take, region set to 16.465 → 18.270 s); committed to a pad; sequenced and
**heard by the user**, soloed so nothing else sounded. Persisted with
`origin: "recording"` in a record shaped exactly like the shipped source
(`id, name, origin, duration, channels`).

**Two incidental findings, neither a defect.** Slices normalize to peak **0.95**
on render — measured identically across four slices whose sources peaked from
0.0735 to 1.0 — so a quiet take is still fully usable and the user does not have
to shout at the mic. And the chop editor's default 0–4 s region landed on pure
silence for a take where the user did not start speaking until second 16; the
per-second RMS profile (−74 dB through second 15, −43 dB from second 16) made
that legible immediately. Worth knowing when authoring guidance, not a bug.

**The deny path, run last** (Chrome's permission state is sticky, so a Block
poisons every later take). With the site permission set to Block:
`getUserMedia` called once and refused; a `role="alert"` carrying
`MICROPHONE_DENIED_MESSAGE` with a Dismiss control; no indicator; **nothing
announced** — correct, because a refused permission never opened the mic, which
is precisely why the announcement rides in state rather than being derived from
status; the deck fully usable with Play unheld; and `createMediaStreamSource`
still never called. "Your project is unchanged" was literally true — 1 project,
4 slices and 5 sources all still in IndexedDB afterwards.

**Still open: Safari.** Untouched, and the one substantive unknown left —
`MediaRecorder` container support differs and the decode path must accept
whatever it produces. Chrome gave `audio/webm;codecs=opus` throughout; the thing
to capture on Safari is what it hands back instead.

**Measured, on the container question.** Real `MediaRecorder` in the headless
Chromium produced `audio/webm;codecs=opus`, 18,650 bytes for ~1.2 s — the same
container the later real-hardware pass saw — which is what makes
`recordingFileName` yield `Recording 1.webm`, stripping back to `Recording 1`.
A metadata probe of that blob reported **1.439982 s** for a 1.5 s take: finite
and roughly right, contradicting the premise that a `MediaRecorder` container
commonly declares no duration. The design did not change but the comments did;
see the decision above.

**What review found, and why the deliberate test gap is where it found it.**
Three real defects, two of them inside the untested adapter or the transitions
around it — which is the cost of the gap, arriving exactly where the gap is:

1. **The loop could be restarted mid-take.** Nothing knew the mic was live, so
   Play worked one click after recording had stopped the transport. Fixed at
   both ends: the handler refuses and the control says so.
2. **A microphone that opened but could not be recorded from leaked.** Verified
   in-browser against the real `MediaRecorder` by handing it a stream it
   refuses (a stream whose track is already ended makes `start()` throw
   `NotSupportedError` — observed in this session before it was a fix): one
   `stop()` call, track `ended`, and the failure reported as the recorder's
   rather than as a refusal.
3. **A second stop was refused by status but not by identity.** `stopRequested`
   from `'stopping'` is refused *into* `'stopping'`, which passed a status
   check — and would have flushed and imported the same take twice, landing it
   as two sources. The transitions already returned their input unchanged, so
   the machine could always answer this; the caller now asks by identity.

Review also caught the record control unmounting itself: three buttons that
swapped meant pressing Record dropped focus to the document, 163 tab stops from
where the user was. It is one button through every state now, and `aria-disabled`
rather than `disabled` for the same reason — verified in-browser that focus stays
on the control through record, stop, and back.

**A note on the suite.** One full-suite run failed in `App region editor > is a
modal over an inert deck…` on a `waitFor` timeout, in a test this slice does not
touch; three subsequent full runs and the file in isolation all passed. It reads
as a pre-existing timing flake under parallel load rather than a regression, but
it is recorded here rather than dismissed, since this slice does add about two
and a half seconds of work to that file.

**An unanswered permission prompt is a real state.** Playwright leaves the
prompt pending rather than answering it, and the deck sat on "Waiting for
permission…" indefinitely — which is correct, and is why that state has its own
copy rather than sharing the idle button's. There is no cancel affordance
because the prompt itself is the cancel; the cost is that a user who walks away
from an open prompt has no Record button until they answer it.

## Defect found during the manual pass: the loop was not held while the prompt was open

Found during the real-hardware pass, fixed test-first.

`isMicrophoneLive` is `'recording' | 'stopping'` by design — asking is not
capturing, and that distinction is what lets the MIC_OFF announcement fire
exactly when the mic was ever actually on. But `App` also uses it to guard Play,
and `'requesting'` is a long window the user controls, because Chrome does not
block the page while a permission prompt is open:

1. Record → the transport stops, status `'requesting'`, Play **not** held
2. Press Play → the guard sees the mic is not live → **the loop starts**
3. Click Allow → the mic opens → **loop and microphone running together**

That is the condition AC5's rule forbids and the howl `RECORDING_HINT` warns
about. It is the same class as the defect review already caught — "the loop
could be restarted mid-take" — surviving in the one window that fix did not
cover. First seen in-browser as `aria-disabled` absent on the Play control while
a real permission prompt sat open, then reproduced at the App seam: with
`openMicrophone` left pending, clicking Play called `engine.play` once.

The fix was not to widen `isMicrophoneLive`, which would make the indicator
claim the mic was on while the browser was still asking, and would make a
refused permission announce that a microphone which never opened had been turned
off. **The set of states in which the transport must not run is simply not the
set of states in which the microphone is live**, and conflating them is what
caused this. So `isTransportHeld` joins it — every non-idle state — and `App`
uses it for both the Play guard and `heldForRecording`, while `SamplerPanel`
keeps `isMicrophoneLive` for the record control and the indicator, which really
are asking whether capture is happening.

The test fakes the one thing that made this reachable: a permission prompt that
stays unanswered, which is what a real one does until the user answers it.

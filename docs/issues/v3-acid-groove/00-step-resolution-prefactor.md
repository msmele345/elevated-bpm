# EB3-00 — Prefactor: one step-resolution function

> Track: v3.0 · Slice 0 of 15 (prefactor)
> Blocked by: none — can start immediately
> Blocks: EB3-01, EB3-02, EB3-07a, EB3-09a
> Branch: `feat/step-resolution`
> Spec section: Implementation Decisions → "Step resolution (the audio seam)"

## Why this slice, and why first

"Make the change easy, then make the easy change." Today the transport's
16th-note callback decides what sounds in two places: drum and pad hits go
through the choke/mixer voicing function, while note lanes are resolved
separately and **never pass through the mixer at all**. Swing (EB3-01), voice
Level and bass/stab mute/solo (EB3-02), the queued bank switch (EB3-07a) and
legato/accent note events (EB3-09a/b) all need to add to that decision. Doing
it four times in two places would be four chances to diverge.

This slice consolidates the decision into **one pure function** with **zero
behaviour change**, so every later ticket adds a field to one result and one
test file.

## Scope

### In

- A single pure "resolve this 16th" function that takes the current pattern, the
  mixer and a step index and returns, in one result:
  - drum/pad starts, each with its accent gain;
  - chokes;
  - note events (lane, pitch, length in steps) for bass and stab.
- The Tone callback reduced to applying that result as given — it decides
  nothing itself.
- Existing drum-hit, note-event and engine tests moved or re-pointed at the new
  seam and kept green.

### Out (and where it lands)

- Bank / selected-vs-playing slot inputs and the "playing slot after this step"
  output — EB3-07a.
- Swing offset in the result — EB3-01.
- Mixer filtering of note events (bass/stab mute/solo) — EB3-02. This slice
  keeps today's behaviour: note lanes ignore the mixer.
- Accent, legato and gate-tie on note events — EB3-09a/b.

## Implementation decisions

- The function's signature is shaped to grow: take an input object rather than
  positional arguments, so later tickets add Transport, Bank and bass patch
  without touching every call site.
- Keep the step index derived from transport ticks as today. Swing will need the
  straight-grid index (EB3-01), so do not move that derivation inside Tone's
  swing.

## Acceptance criteria

- [x] One pure function decides every sound on a 16th (drum/pad starts with
      gains, chokes, note events); the transport callback contains no
      sequencing decisions, only application of the result — `resolveStep`
      (`src/audio/stepResolution.ts`, the former `hits.ts`) takes a
      `{ pattern, mixer, stepIndex }` input object and returns
      `{ starts, chokes, notes }`. The old `hitsAtStep`/`voiceStep` are now
      private to it, and `noteEventsAtStep` moved out of `note.ts` into it
      (`noteEventAtStep`, the per-lane monophony rule, stays in the model). The
      Tone callback derives the step index from ticks exactly as before
      (`Math.round`, straight grid), calls `resolveStep` once and only routes
      the result to voices
- [x] No audible or behavioural change: every existing hit, choke, mixer,
      note-event and engine test passes unchanged in what it asserts — the
      eleven hit/choke cases moved from `hits.test.ts` to
      `stepResolution.test.ts` with their assertions verbatim, now reached
      through `resolveStep`; the `noteEventsAtStep` case moved the same way.
      Note lanes still ignore the mixer, pinned by a test so EB3-02 changes it
      on purpose. A new engine test in the mocked-Tone harness, written and
      green against the old callback *before* the refactor, proves the callback
      applies a mixed result as given: open-hat stop, kick/closed-hat starts at
      their accent gains, bass and stab notes at the scheduled time with
      length × one 16th. 589 tests pass, `tsc -b && vite build` clean
- [x] New step-resolution tests cover a step mixing drums, a choke and bass +
      stab notes in one result — `stepResolution.test.ts` asserts the whole
      result for an accented kick, a closed hat choking a same-step open hat,
      a perc, a two-step bass note and a transposed stab, plus a silent step
- [x] In-browser: the demo groove plus a programmed bassline and stab plays
      identically before and after (event timestamps per lane match across two
      loops), zero console errors — the demo groove plus a four-on-the-floor
      kick, a six-note bassline (two transposed, one clipped by the next note,
      one wrapping the loop) and two stabs was loaded via a share link, and the
      app's own Tone module was wrapped to log every `Player.start/stop` and
      synth `triggerAttackRelease` (lane, pitch, duration, time). Captured on the
      unchanged code, then again after: both runs logged the same 48 events
      over two loops at 130 BPM, byte-identical in loop offset (to the µs),
      frequency, duration and velocity, with zero console errors

## Testing decisions

- Step-resolution seam (spec seam 2). Prior art: the existing hits and
  note-event tests. Engine tests use the existing mocked-Tone harness only to
  prove the callback applies the result.

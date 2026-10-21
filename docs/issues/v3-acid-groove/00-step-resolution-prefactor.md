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

- [ ] One pure function decides every sound on a 16th (drum/pad starts with
      gains, chokes, note events); the transport callback contains no
      sequencing decisions, only application of the result
- [ ] No audible or behavioural change: every existing hit, choke, mixer,
      note-event and engine test passes unchanged in what it asserts
- [ ] New step-resolution tests cover a step mixing drums, a choke and bass +
      stab notes in one result
- [ ] In-browser: the demo groove plus a programmed bassline and stab plays
      identically before and after (event timestamps per lane match across two
      loops), zero console errors

## Testing decisions

- Step-resolution seam (spec seam 2). Prior art: the existing hits and
  note-event tests. Engine tests use the existing mocked-Tone harness only to
  prove the callback applies the result.

# Elevated BPM — Concept & Design Decisions

A learning-focused web app for making techno, built as a visually stunning,
hardware-styled groovebox that is playable from the first click, with a
goal-checked curriculum woven into the live instrument.

Decisions below were settled in a grilling session on 2026-07-11.

## Product identity

- **Craft taught: making techno** (production/performance), not DJing.
  The central metaphor is a **groovebox** (TR-909 + TB-303 lineage), not a
  pair of mixing decks.
- **Instrument-first core loop.** The app opens as a playable groovebox with
  a classic techno kit pre-loaded and sound on first click. Learning content
  is an optional, always-available guided path — never a gate.
- **The DAW is architecture, not UI.** Under the hood the app is a small DAW
  (clock, sequencer, instruments, mixer bus). v1 exposes only looping
  patterns — no timeline, no arrangement. Graduation path: export a pattern
  as MIDI/audio for a real DAW. The app is an on-ramp to Ableton, not a
  competitor.

## v1 scope

### Instruments (three, no more)
1. **Drum machine** — 16-step sequencer, ~5 lanes (kick, snare/clap,
   closed hat, open hat, +1), sample-based (909/808-style one-shots).
2. **Bass synth** — 303-style monophonic synth with filter cutoff/resonance
   and envelope knobs; sequenced per-step with pitch.
3. **Stab synth** — simple polyphonic synth for chord stabs, played on the
   on-screen MIDI-style keyboard.

Mixer surface: per-track volume/mute/solo plus a couple of macro knobs
(filter, drive). Nothing else.

### Audio engine
- **Tone.js** on Web Audio. Tone.Transport handles sample-accurate lookahead
  scheduling — never setTimeout/setInterval for musical time.
- Drums = samples (authentic immediately); bass/stabs = Tone synths, so
  lessons can teach filter, resonance, and envelope — core techno vocabulary.

### Learning model
- **A lesson = goal-checked challenge**: short intro text + a declarative
  goal verified against live pattern/instrument state (e.g. "kicks on every
  downbeat", "sweep the filter while the loop plays"). UI spotlights the
  relevant controls; completion auto-detected and celebrated.
- **Lessons are pure JSON data**, not code. Goals are assertions over the
  same serialized state the sequencer runs on.
- **v1 curriculum = one ordered arc (~10–15 challenges)**: silence → groove.
  Four-on-the-floor kick → off-beat hats → clap on 2 & 4 → first bassline →
  filter sweep → stab chords → "your first techno groove."

### Persistence & sharing
- **Local-first, one document.** All state — patterns, synth settings,
  lesson progress, prefs — serializes into one **versioned `ProjectState`
  JSON** document in IndexedDB. No backend, no accounts, no login in v1.
- **Sharing via URL**: a pattern is tiny JSON — encode compressed state into
  `?p=…`. Shareable beats with zero server.
- Static hosting only.

### Input
- Mouse for programming steps and twisting knobs; **computer keyboard
  mapped to pads and synth keys** (A–K row) so live jamming feels real.
- Web MIDI hardware support deferred to v1.x (small, well-contained add:
  one more event source into the same input layer).

### Stack & rendering
- **Vite + React + TypeScript**, pure SPA. TypeScript matters: ProjectState
  schema and lesson-goal contracts get real types.
- **Rendering split:** pads/keys/steps as DOM/CSS (accessible, focusable);
  knobs/faders as SVG; canvas only for real-time visualizers
  (waveform/spectrum).
- **Performance rule:** playhead and meters animate via requestAnimationFrame
  reading Tone.Transport directly. React state changes on user edits only —
  never on the audio clock.

## Domain model (ubiquitous language)

- **Deck** — the whole instrument surface.
- **Instrument** — DrumMachine | BassSynth | StabSynth; each owns its params.
- **Pattern** — a first-class, ID'd 16-step loop containing per-instrument
  lanes. First-class from day one so v2 song mode is "a list of pattern
  references," not a data-model rewrite.
- **Lane** — drum lane (step on/off + accent) or note lane (step + pitch +
  length).
- **Transport** — BPM, swing, play state (wraps Tone.Transport).
- **ProjectState** — the one versioned document: `{ version, patterns[],
  activePatternId, instrumentSettings, lessonProgress, prefs }`.
- **Lesson** — JSON: `{ id, title, intro, spotlight[], goal[] }` where goal
  is declarative assertions, e.g.
  `{ type: "stepsActive", lane: "kick", steps: [0,4,8,12] }` or
  `{ type: "paramSwept", instrument: "bass", param: "cutoff", whilePlaying: true }`.
- **Arc** — an ordered list of lesson IDs, plus what its track is called and
  what its graduation says. Shipped in v2.0 as two: the techno Arc and the
  Sampling Arc.

## Deferred (explicitly out of v1)

| Feature | Target |
|---|---|
| Song mode (chain patterns into an arrangement) | v2 |
| Accounts + sync (upload local ProjectState on first login) | v2 |
| Web MIDI hardware input | v1.x |
| FX sends (delay/reverb — dub techno lesson material) | v1.x |
| DJ/mixing mode | not planned |
| Mini-DAW timeline / audio clips / automation | ruled out |

## Ruled out and why

- **DJing-first**: teaches performance over existing music, needs a track
  library; production is the better match for "playing techno" + pads/keys UI.
- **Course-first gating**: delays the "I'm making techno" moment; instrument
  becomes an exam interface.
- **Backend without accounts**: anonymous device IDs don't survive browser
  switches, so no real sync value; URL sharing covers the social need.
- **Full-canvas deck**: forfeits accessibility, focus, and iteration speed
  for hit-testing math.

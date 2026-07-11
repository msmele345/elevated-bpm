# Plan: Elevated BPM v1 — Techno Groovebox Learning App

> Source PRD: `CONCEPT.md` (grilling session, 2026-07-11)

## Architectural decisions

Durable decisions that apply across all phases:

- **Stack**: Vite + React + TypeScript, pure client-side SPA, static hosting. No backend in v1.
- **Audio**: Tone.js on Web Audio. `Tone.Transport` is the only musical clock — never `setTimeout`/`setInterval` for musical time. Drums are sample-based one-shots; bass and stabs are Tone synths.
- **Key models** (ubiquitous language): `Deck`, `Instrument` (DrumMachine | BassSynth | StabSynth), `Pattern` (first-class, ID'd 16-step loop), `Lane` (drum lane: step on/off + accent; note lane: step + pitch + length), `Transport` (BPM, swing, play state), `Lesson`, `Arc`.
- **State document**: one versioned `ProjectState` JSON — `{ version, patterns[], activePatternId, instrumentSettings, lessonProgress, prefs }` — the single source of truth. Persisted to IndexedDB; also the contract lesson goals evaluate against, the URL-sharing payload, and the future sync document.
- **Lessons are data**: pure JSON — `{ id, title, intro, spotlight[], goal[] }` — where goals are declarative assertions over `ProjectState` and playback events (e.g. `{ type: "stepsActive", lane: "kick", steps: [0,4,8,12] }`).
- **Rendering split**: pads/keys/steps as DOM/CSS; knobs/faders as SVG; canvas only for real-time visualizers.
- **Performance rule**: playhead and meters animate via `requestAnimationFrame` reading the transport directly. React re-renders on user edits only, never on the audio clock.
- **The DAW is architecture, not UI**: loops only in v1; patterns stay first-class so v2 song mode is a list of pattern references.

---

## Phase 1: Kick tracer bullet

**User stories**: instrument-first core loop — the app opens as a playable groovebox with sound on first click.

### What to build

The thinnest playable slice: a scaffolded app showing a single 16-step kick lane. Clicking steps toggles them; play/stop and a BPM control drive the Tone.js transport; a playhead sweeps the row in sync via rAF. Programming four-on-the-floor and hearing it tight at 130 BPM proves the make-or-break timing architecture.

### Acceptance criteria

- [ ] App loads to a visible, clickable 16-step kick row with no setup or login
- [ ] Toggling steps and pressing play produces a kick loop with no audible drift or jitter at 120–140 BPM
- [ ] BPM is adjustable while playing without glitches
- [ ] Playhead position stays visually locked to the audio, driven by rAF (no per-16th React re-renders)
- [ ] Audio context unlocks correctly from the first user gesture (browser autoplay policy handled)

---

## Phase 2: First lesson tracer

**User stories**: learning-by-doing on the live instrument; lessons as data the app can verify.

### What to build

One complete goal-checked challenge — "build a four-on-the-floor" — running against the live kick lane from Phase 1. A lesson panel shows intro text, the relevant controls get spotlighted, goal assertions are continuously evaluated against live pattern state, and completion is auto-detected and celebrated. The lesson is defined entirely in JSON; adding a second lesson must require no code.

### Acceptance criteria

- [ ] The lesson is loaded from a JSON definition (intro, spotlight targets, declarative goal)
- [ ] Spotlighting visually highlights the kick lane while the lesson is active
- [ ] Placing kicks on steps 1/5/9/13 is detected automatically and triggers a completion celebration
- [ ] Wrong or extra steps do not falsely complete the goal
- [ ] The lesson can be dismissed and resumed; the sandbox is never gated

---

## Phase 3: ProjectState + persistence

**User stories**: local-first persistence — a beat or lesson progress is never lost on refresh; the document shape that makes v2 multi-user cheap.

### What to build

Consolidate all state into the versioned `ProjectState` document and autosave it to IndexedDB. Reload restores the active pattern, transport settings, and lesson progress exactly. Include a schema version field and a migration hook so future shape changes don't strand saved data.

### Acceptance criteria

- [ ] All pattern, instrument, transport, and lesson-progress state round-trips through one serialized `ProjectState` document
- [ ] Refreshing mid-session restores the exact pattern, BPM, and lesson completion state
- [ ] The document carries a schema version; loading an older version runs a migration path (proven with a trivial v0→v1 migration test)
- [ ] Autosave is debounced and never causes audible glitches while playing

---

## Phase 4: Full drum machine

**User stories**: a complete rhythm instrument — the anatomy of a techno groove's percussion.

### What to build

Expand the single kick lane to the full sample-based drum machine: ~5 lanes (kick, snare/clap, closed hat, open hat, +1), per-step accents, and per-lane volume/mute/solo. Curate a classic 909/808-style kit that sounds authentically techno out of the box.

### Acceptance criteria

- [ ] All lanes sequence independently and stay sample-locked to the transport
- [ ] Accented steps are audibly louder/harder than unaccented ones
- [ ] Mute/solo per lane behaves like hardware (solo overrides mutes; multiple solos allowed)
- [ ] Open hat is choked by closed hat (classic 909 behavior)
- [ ] A default demo pattern ships so first play sounds like techno immediately

---

## Phase 5: Bass synth

**User stories**: the melodic backbone; sound-design teaching (filter, resonance, envelope — core techno vocabulary).

### What to build

A 303-style monophonic bass synth with a note lane (per-step pitch, length/slide) and SVG knobs for filter cutoff, resonance, and envelope. Extend the lesson goal vocabulary with a parameter-motion assertion (e.g. "sweep the filter while the loop plays") so sound-design lessons become expressible in JSON.

### Acceptance criteria

- [ ] Bass steps carry pitch and length; the synth plays monophonically in sync with drums
- [ ] Filter cutoff and resonance knobs audibly shape the sound in real time while playing
- [ ] Knobs are SVG components operable by drag and by keyboard (accessible)
- [ ] A "param swept while playing" goal type evaluates correctly from knob motion during playback
- [ ] Synth settings persist in `ProjectState` and restore on reload

---

## Phase 6: Stab synth + keyboard

**User stories**: live playability — the MIDI-keyboard visual from the original pitch; jamming, not just programming.

### What to build

A simple polyphonic stab synth played on an on-screen MIDI-style keyboard, with the computer keyboard mapped (A–K row) so chords are finger-playable live over the running loop. Stabs are also step-programmable into the pattern like the other instruments.

### Acceptance criteria

- [ ] On-screen keys respond to mouse and to mapped computer-keyboard keys with low enough latency to feel playable
- [ ] Multiple simultaneous notes (chords) sound correctly
- [ ] Stab hits can be programmed into the pattern's note lane and loop in sync
- [ ] Key highlighting shows what's sounding, whether played live or sequenced
- [ ] Typing in text inputs never triggers notes (input focus is respected)

---

## Phase 7: Full curriculum arc

**User stories**: the v1 product promise — a beginner goes from silence to a full techno groove along one guided path.

### What to build

The complete ordered arc of ~10–15 goal-checked challenges: four-on-the-floor → off-beat hats → clap on 2 & 4 → first bassline → filter sweep → stab chords → "your first techno groove." Includes arc navigation (see the path, jump to any unlocked lesson), per-lesson completion state, and celebrations. All content is JSON; this phase is mostly authoring plus whatever goal types the arc still lacks.

### Acceptance criteria

- [ ] 10–15 lessons exist covering rhythm, bass, sound design, and stabs, ordered as one arc
- [ ] Arc UI shows progress and lets the user enter, leave, and resume any lesson without losing sandbox state
- [ ] Every lesson's goal auto-detects completion reliably (no false positives/negatives across the arc)
- [ ] Completing the final lesson delivers a distinct "you made techno" payoff moment
- [ ] Adding a new lesson requires editing JSON only, no code changes

---

## Phase 8: Share via URL

**User stories**: send your beat to a friend — sharing with zero backend.

### What to build

Encode the active pattern (and the instrument settings it needs to sound right) as a compressed payload in a shareable URL. Opening a shared link loads the beat ready to play, without overwriting the recipient's own saved work uninvited.

### Acceptance criteria

- [ ] A "share" action produces a URL that fully reproduces the pattern and its instrument settings on another machine
- [ ] The payload is compressed and stays within practical URL length limits
- [ ] Opening a shared link plays the shared beat and offers to keep it, without silently destroying the recipient's existing project
- [ ] Malformed or version-mismatched share payloads fail gracefully with a clear message

---

## Phase 9: Visual & mixer polish

**User stories**: the "visually stunning professional deck" identity; the last mixer-surface pieces.

### What to build

The hardware-aesthetic design pass across the whole deck, canvas-based real-time visualizers (waveform/spectrum), the macro filter/drive knobs on the mixer surface, and motion/celebration polish. This phase turns a functional groovebox into the product from the pitch.

### Acceptance criteria

- [ ] Cohesive hardware-inspired visual language across drum machine, bass, keyboard, and mixer (consistent spacing, materials, lighting/glow)
- [ ] Live waveform or spectrum visualizer runs on canvas at 60fps without affecting audio
- [ ] Master macro knobs (filter, drive) audibly shape the full mix and persist in `ProjectState`
- [ ] The deck remains fully usable by keyboard and meets basic accessibility (focus visible, controls labeled)
- [ ] No interaction causes audio glitches or dropped frames during playback

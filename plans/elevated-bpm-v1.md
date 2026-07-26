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

- [x] App loads to a visible, clickable 16-step kick row with no setup or login
- [x] Toggling steps and pressing play produces a kick loop with no audible drift or jitter at 120–140 BPM
- [x] BPM is adjustable while playing without glitches
- [x] Playhead position stays visually locked to the audio, driven by rAF (no per-16th React re-renders)
- [x] Audio context unlocks correctly from the first user gesture (browser autoplay policy handled)

---

## Phase 1.5: CI/CD pipeline

**User stories**: every change is verified before merge and live on a URL after — the pipeline that every later phase rides on.

### Decisions (from planning interview, 2026-07-17)

- **CI**: GitHub Actions — the repo and PR workflow already live on GitHub.
- **Checks**: typecheck + build (`tsc -b && vite build`) and unit tests (Vitest, to be added). ESLint/Prettier deliberately deferred.
- **CD**: Vercel via its native Git integration — Vercel auto-builds every push; GitHub Actions stays checks-only.
- **Branching**: gitflow — feature PRs target `develop` (checks + preview deploy); promoting `develop` → `main` deploys production.
- **Branch protection**: required status checks on both `develop` and `main`; no direct pushes.

### What to build

A GitHub Actions workflow that runs typecheck+build and the test suite on every PR targeting `develop` or `main` (and on pushes to those branches). Add Vitest with a seed suite over the pure model code — `pattern.ts` (initial pattern shape, `toggleStep` immutability) and step-index math — no DOM or audio mocking. Connect the repo to Vercel: preview URLs per PR, staging preview on `develop`, production on `main`. Turn on branch protection so the checks actually gate merges.

### Acceptance criteria

- [x] Every PR to `develop` or `main` runs a GitHub Actions workflow with typecheck+build and Vitest — confirmed green on PRs #14/#15 (`gh run list`), on both `pull_request` and `push` events for `develop`/`main`. Merge-blocking not yet enforced — see branch protection below.
- [x] Vitest runs locally via `npm test` and in CI, seeded with passing tests over the pure model code (no DOM/audio mocks) — `pattern.ts` + extracted `stepIndexAtTicks` (8 tests passing locally and in CI)
- [x] Every PR gets a Vercel preview URL; `develop` maintains a staging deployment; merging to `main` deploys production — confirmed: Vercel bot commented the preview link on PR #14; `elevated-bpm-git-develop-*.vercel.app` and production `elevated-bpm-dusky.vercel.app` both resolve
- [ ] `develop` and `main` are protected: required status checks, direct pushes blocked — checked via `gh api repos/.../branches/{branch}/protection`, both return 404 "Branch not protected"; still pending user's own GitHub settings configuration
- [x] The production URL serves the app with working audio (sample assets resolve; first-gesture unlock works in production build) — verified via curl: `/` → 200, `/samples/kick-909.wav` → 200 `audio/wave` (52,964 bytes)

---

## Phase 2: First lesson tracer

**User stories**: learning-by-doing on the live instrument; lessons as data the app can verify.

### What to build

One complete goal-checked challenge — "build a four-on-the-floor" — running against the live kick lane from Phase 1. A lesson panel shows intro text, the relevant controls get spotlighted, goal assertions are continuously evaluated against live pattern state, and completion is auto-detected and celebrated. The lesson is defined entirely in JSON; adding a second lesson must require no code.

### Acceptance criteria

- [x] The lesson is loaded from a JSON definition (intro, spotlight targets, declarative goal) — `src/lessons/four-on-the-floor.json` parsed through `parseLesson` (`src/model/lesson.ts`), which validates shape and goal assertions with descriptive errors; covered by Vitest (`lesson.test.ts`, `lessons.test.ts`)
- [x] Spotlighting visually highlights the kick lane while the lesson is active — spotlight targets (`"lane:kick"`) derived via `spotlitLaneIds`; the kick lane gets an amber glow ring + highlighted label while the lesson is active, verified in-browser via Playwright screenshot
- [x] Placing kicks on steps 1/5/9/13 is detected automatically and triggers a completion celebration — `isGoalMet` (`src/model/lesson.ts`) is re-evaluated on every pattern edit and latched; the panel flips to a green "Lesson complete" celebration state, verified in-browser via Playwright
- [x] Wrong or extra steps do not falsely complete the goal — `stepsActive` requires an exact match (every goal step on, every other step off); covered by Vitest (subset, wrong positions, goal-plus-extra, missing lane) and confirmed in-browser with steps 1/2/5/9/13 not completing
- [x] The lesson can be dismissed and resumed; the sandbox is never gated — dismiss collapses the panel to a "Resume lesson" chip; steps stay editable while dismissed, goal detection keeps running, and resuming restores the panel (including an already-earned completed state)

---

## Phase 3: ProjectState + persistence

**User stories**: local-first persistence — a beat or lesson progress is never lost on refresh; the document shape that makes v2 multi-user cheap.

### What to build

Consolidate all state into the versioned `ProjectState` document and autosave it to IndexedDB. Reload restores the active pattern, transport settings, and lesson progress exactly. Include a schema version field and a migration hook so future shape changes don't strand saved data.

### Acceptance criteria

- [x] All pattern, instrument, transport, and lesson-progress state round-trips through one serialized `ProjectState` document — `src/model/projectState.ts` defines the versioned document (`patterns[]`, `activePatternId`, `transport`, `instrumentSettings`, `lessonProgress`, `prefs`); App holds it as its single state and all edits go through pure document helpers; round-trip covered by Vitest (`projectState.test.ts`, `projectStore.test.ts`)
- [x] Refreshing mid-session restores the exact pattern, BPM, and lesson completion state — verified in-browser via Playwright: steps 1/5/9/13, BPM 124, lesson-complete and lesson-dismissed states all survived reloads; an edit made inside the debounce window survived an immediate refresh via the pagehide/visibilitychange flush
- [x] The document carries a schema version; loading an older version runs a migration path (proven with a trivial v0→v1 migration test) — `migrateProjectState` lifts a v0 doc (single `pattern` + flat `bpm`) to v1 and returns null for corrupt/unknown versions so the app falls back to a fresh document; `loadProjectState` applies migration on every load; covered by Vitest
- [x] Autosave is debounced and never causes audible glitches while playing — trailing-edge 400 ms debounce (`src/storage/autosave.ts`, fake-timer tested) coalesces edit bursts into one async IndexedDB write; verified while playing in-browser: transport stayed `started` with ticks advancing across three mid-playback saves, zero console errors

---

## Phase 4: Full drum machine

**User stories**: a complete rhythm instrument — the anatomy of a techno groove's percussion.

### What to build

Expand the single kick lane to the full sample-based drum machine: ~5 lanes (kick, snare/clap, closed hat, open hat, +1), per-step accents, and per-lane volume/mute/solo. Curate a classic 909/808-style kit that sounds authentically techno out of the box.

### Acceptance criteria

- [x] All lanes sequence independently and stay sample-locked to the transport — `KIT_LANES` (`src/model/pattern.ts`) defines kick/snare(clap)/closedHat/openHat/perc; `KIT_SAMPLES` (`src/audio/kit.ts`) gives each its own 909-style sample; the transport callback (`src/audio/engine.ts`) fires one `Tone.Player` voice per lane off the same scheduled 16th, reading the live pattern so all lanes stay locked together; covered by Vitest `hitsAtStep` — "fires every lane that has that step on, and only those lanes" (`src/audio/hits.test.ts`)
- [x] Accented steps are audibly louder/harder than unaccented ones — `hitsAtStep` (`src/audio/hits.ts`) assigns `ACCENT_GAIN` (1) vs `UNACCENTED_GAIN` (0.62) per step, applied via `voice.gain.gain.setValueAtTime` in the engine; a single click on `StepRow.tsx` cycles a step through off → on → on+accent → off (`cycleStep`, `src/model/pattern.ts`); covered by Vitest — "gives accented steps more gain than unaccented ones" and "accents one lane without affecting another lane on the same step" (`src/audio/hits.test.ts`), plus "cycles one step through off → on → accented → off" (`src/model/pattern.test.ts`)
- [x] Mute/solo per lane behaves like hardware (solo overrides mutes; multiple solos allowed) — `audibleLaneIds` (`src/model/mixer.ts`): with any lane soloed only soloed lanes play (multiple solos allowed) and solo overrides mute, otherwise every un-muted lane plays; wired through `App.tsx` (mute/solo buttons in `StepRow.tsx`, `engine.setMixer`) and `hitsAtStep` reads the mixer every 16th; covered by Vitest — "a muted lane is silenced; the rest still sound", "when any lane is soloed, only soloed lanes sound (multiple solos allowed)", "solo overrides mute: a lane that is both muted and soloed still sounds" (`src/model/mixer.test.ts`), plus "does not fire a muted lane" and "with a lane soloed, only the soloed lane fires" (`src/audio/hits.test.ts`)
- [x] Open hat is choked by closed hat (classic 909 behavior) — `CHOKES` map (`src/audio/hits.ts`) pairs `closedHat → openHat`; `voiceStep` cuts a firing choke's target from that step's starts and reports it as a choke so the engine calls `player.stop(time)` on the still-ringing open-hat voice before any new starts; covered by Vitest — "cuts a ringing open hat when the closed hat fires on a later step", "when closed and open hat share a step, the closed hat wins and the open hat does not sound", "lets the open hat ring when no closed hat fires", "does not choke the open hat when the closed hat is muted" (`src/audio/hits.test.ts`)
- [x] A default demo pattern ships so first play sounds like techno immediately — `createDemoPattern()` (`src/model/pattern.ts`) ships a clap (accented; originally the backbeat 5/13, trimmed to a half-time 13 in Phase 7 so the "clap on 2 and 4" lesson stays unearned — see that phase's note), offbeat closed hats (3/7/11), an accented open hat (15) and syncopated perc (4/6/12/14, accented on 6/12 — enriched in Phase 7, see that phase's note); `openingProjectState()` seeds it only when `loadProjectState()` returns null, so a returning user's saved beat is never overwritten (Vitest + verified in-browser: edited beat survived reload intact). The kick lane ships empty by design so the four-on-the-floor lesson stays unearned — guarded by a test asserting the shipped demo does not satisfy the shipped lesson goal; confirmed in-browser that programming 1/5/9/13 still fires the celebration. Playback verified over two loops: hits per lane exactly match the grid, kick silent, open hat choked only at closed-hat steps

---

## Phase 5: Bass synth

**User stories**: the melodic backbone; sound-design teaching (filter, resonance, envelope — core techno vocabulary).

### What to build

A 303-style monophonic bass synth with a note lane (per-step pitch, length/slide) and SVG knobs for filter cutoff, resonance, and envelope. Extend the lesson goal vocabulary with a parameter-motion assertion (e.g. "sweep the filter while the loop plays") so sound-design lessons become expressible in JSON.

### Acceptance criteria

- [x] Bass steps carry pitch and length; the synth plays monophonically in sync with drums — `NoteStep` (`src/model/types.ts`) carries `pitch` (MIDI, clamped to C1–C3) and `length` in whole steps; `noteEventAtStep` (`src/model/note.ts`) clips a note where the next one starts, so one Tone.Synth voice is never fought over. The bass fires inside the same scheduled 16th as the drums: verified in-browser over ~15 notes that bass trigger times were byte-identical to the kick's (81.428, 81.850, 82.273 …), with a transposed 2-step note lasting 0.211 s vs 0.106 s for 1-step notes at 142 BPM
- [x] Filter cutoff and resonance knobs audibly shape the sound in real time while playing — sawtooth `Tone.Synth` → resonant lowpass `Tone.Filter` (`src/audio/engine.ts`), cutoff/Q ramped over 20 ms so knob motion is heard mid-note, not on the next one. Measured in-browser with an FFT tapped off the bass output while playing: closing the cutoff dropped all energy above 1.5 kHz to the noise floor, and opening resonance from 0.5 Q to 18 Q lifted the high band 17×. Dragging swept the live filter 120 → 379 → 1200 → 3795 → 12000 Hz while the transport kept running
- [x] Knobs are SVG components operable by drag and by keyboard (accessible) — `Knob` (`src/components/Knob.tsx`) draws an SVG arc dial and is a `role="slider"` with `aria-valuemin/max/now/valuetext`; vertical drag uses pointer capture (shift = fine), arrows nudge 2% of travel, Page keys 10%, Home/End park at the ends. Taper math is pure and unit-tested (`src/model/knob.test.ts`): log cutoff puts its midpoint at the geometric mean, and both tapers round-trip. Verified in-browser — a 40 px drag moved resonance 6 → 10.4, a long drag clamped at 0.5, and keyboard nudges moved cutoff 900 Hz → 1.56 kHz
- [x] A "param swept while playing" goal type evaluates correctly from knob motion during playback — `paramSwept` (`src/model/lesson.ts`) asserts a knob covered at least `minTravel` of its range; motion is recorded by `observeParamMotion` (`src/model/paramMotion.ts`) as a per-param min/max span in normalized knob travel, so "half the knob" means the same on the log-tapered cutoff as on a linear one. The record is a transient session observation held in `App` — never persisted, so it can't dirty the autosave — while completion itself stays latched in `ProjectState`. Goals are re-evaluated on user edits only (step taps and knob moves), never on the audio clock. Shipped as `src/lessons/filter-sweep.json`, authored in JSON alone: `spotlight: ["knob:cutoff"]` (via new `spotlitParamIds`) puts an amber ring on the Cutoff knob. Verified in-browser: a full 1.2 kHz → 12 kHz sweep **while stopped** did not complete it; playing, a 12 k → 6.75 k nudge (0.125 travel) did not; the full sweep down to 120 Hz did, with the transport still `started` and zero console errors. Covered by Vitest — motion span/independence/stopped-transport (`paramMotion.test.ts`), goal met/nudge/untouched/wrong-knob and parser rejection of a missing param or out-of-range `minTravel` (`lesson.test.ts`), plus a guard that every shipped lesson names a knob the deck actually has (`lessons.test.ts`)
- [x] Synth settings persist in `ProjectState` and restore on reload — `instrumentSettings.bass` rides the same v4 document and autosave path as everything else; `createBassSettings` clamps or defaults each knob on load so a hand-edited or older document can never hand the synth a bad value. Verified in-browser: a patch of 362 Hz / 18 Q / 100 ms plus a 3-note bassline was written to IndexedDB (`version: 4`), survived a reload exactly in the UI, and — after play — was confirmed live on the audio nodes themselves (`filter.frequency` 362 Hz, `filter.Q` 18, `envelope.decay` 0.1), so restore reaches the sound and not just the display. Covered by Vitest: a hand-tuned patch round-trips through IndexedDB (`projectStore.test.ts`)

**Note:** the lesson arc now holds two lessons, advancing to the next only once a completed one is dismissed (so a celebration is never cut short). Full arc navigation — seeing the path, jumping between lessons — remains Phase 7.

---

## Phase 6: Stab synth + keyboard

**User stories**: live playability — the MIDI-keyboard visual from the original pitch; jamming, not just programming.

### What to build

A simple polyphonic stab synth played on an on-screen MIDI-style keyboard, with the computer keyboard mapped (A–K row) so chords are finger-playable live over the running loop. Stabs are also step-programmable into the pattern like the other instruments.

### Acceptance criteria

- [x] On-screen keys respond to mouse and to mapped computer-keyboard keys with low enough latency to feel playable — `StabKeyboard` (`src/components/StabKeyboard.tsx`) tracks pointer contacts and physical key codes as separate *sources*, so each note releases only when its own input ends; `attackStabNote` (`src/audio/engine.ts`) fires at `Tone.immediate()`, bypassing transport look-ahead. Measured in-browser by wrapping `PolySynth.triggerAttack` and timestamping against a capture-phase listener: **keydown → attack in 0.1–0.2 ms** (three consecutive notes) and **pointerdown → attack in 0.5 ms**, with the attack scheduled at the context's current time, not a later block. Pointer capture plus `pointercancel`/`lostpointercapture` release means a fast click leaves no stuck note (verified: keyboard clear 400 ms after a down-up tap), and `blur`/`visibilitychange` release everything held
- [x] Multiple simultaneous notes (chords) sound correctly — live notes go to a `Tone.PolySynth`, kept in a pool separate from sequenced hits (`createStabVoices`, `src/audio/stabVoice.ts`) so a scheduled note's release can never cut a still-held live key. Verified in-browser: holding A + D + G produced three concurrent voices at 261.63 / 329.63 / 392.00 Hz (a C major triad); releasing D alone emitted `triggerRelease(329.63)` while C and G kept ringing, and both released on their own key-ups. Mixed input sources chord too — a mouse-held F4 plus a computer-held C5 sounded together and each released independently. Covered by Vitest (`stab.test.ts`): key repeat is ignored, the other notes of a chord stay current when one is released, a pitch releases only after every source holding it lets go, and a quick tap invalidates its own pending attack
- [x] Stab hits can be programmed into the pattern's note lane and loop in sync — the stab lane is a `NoteLane` like the bass (`NOTE_LANES`, `src/model/note.ts`, ranged C4–C5 to match the visible octave) and resolves from the *same* scheduled 16th as the drums in the transport callback. Verified in-browser from a wiped IndexedDB (shipped stab lane confirmed empty): programming steps 1/5/9/13, transposing two of them and stretching step 9 to 2 steps, then playing three loops with every event grouped by its exact scheduled transport time — the clap and the stab share **byte-identical timestamps** (`1.890881`: snare + 349 Hz; `2.813958`: snare + 311 Hz; and again each loop). Loop period measured **1.846154 s**, exactly 16 × 15/130 at 130 BPM with zero drift across three passes; the 2-step note lasted 0.231 s vs 0.115 s for 1-step notes
- [x] Key highlighting shows what's sounding, whether played live or sequenced — the engine keeps a clock-aware union of live holds and transport-scheduled notes (`createStabSoundingNotes`, `src/model/stab.ts`); the keyboard reads it from `requestAnimationFrame` and toggles `data-sounding`/`aria-pressed` via the DOM, so highlighting follows Tone's clock without React rendering on the audio clock. Verified in-browser both ways: live keys lit exactly `{60,64,67}` → `{60,67}` → `{}` through a triad, and a frame-accurate recorder during playback caught the sequenced lane lighting C4 → F4 → C4 → D#4 in pitch order, each for one 16th (113–118 ms) except the 2-step note at 225 ms, repeating on a 1847 ms loop. Engine state and DOM agreed at every sampled stage, including a mixed mouse + computer-key chord (5/5 trials). Covered by Vitest: a live key stays lit when a sequenced hit on the same pitch ends, and transport stop clears sequenced highlights without clearing live ones
- [x] Typing in text inputs never triggers notes (input focus is respected) — `stabKeyForKeyboardInput` (`src/model/stab.ts`) declines any event whose target claims letter keys, and also leaves browser/OS shortcuts (meta/ctrl/alt) alone. Verified in-browser: typing `adgk` into a text input, a textarea, and a contenteditable produced **0 attacks** and 0 lit keys while the characters landed in the field; leaving the field made the same keys play again

**Note:** verification found the focus guard too broad — it declined *every* `<input>`, so clicking the tempo fader (an ordinary action, `<input type="range">`) left the computer keyboard dead for live playing until the user clicked elsewhere, breaking AC1's playability promise. Fixed test-first: the guard now asks whether the focused control would itself consume a letter key — text-like inputs, `textarea`, `select` (letters type-ahead its options) and anything editable keep native behavior, while a fader, pad, or checkbox does not. An absent or unrecognized input type is treated as text, so the rule fails toward leaving typing alone. Confirmed in-browser: with the tempo fader focused, A and K now play and the BPM is unchanged; a text field still swallows all four keys.

---

### Phase 6.5: Backdrop UX Only Update
- [x] the room around the deck is now a beat-synced club backdrop — vignetted void, light washes behind the deck, two slow haze beams, and a warm light spill under the deck, plus the brand wordmark swelling on the downbeat. Driven by useRoomLight (rAF → CSS vars, zero React re-renders, same pattern as usePlayhead); the pure envelope math lives in src/model/roomLight.ts (covered by roomLight.test.ts). Tuned for practice, not spectacle: the pulse is a bar-accented swell (accentAtBeatInBar — full on the 1, a lift on the 3, nods on 2/4) on a resting-glow floor with a soft e^-2.75x decay, and the palette slowly drifts from the deck's 909 warmth out to club magenta/cyan/violet and back over 36 s (coolMixAtTime, crossfaded warm/cool gradient layers — opacity-only, GPU-cheap). Flash rate capped under the WCAG 2.3.1 photosafety threshold (drops to half-note pulses past 180 BPM — beatsPerPulseForBpm). Stopped transport never pulses: the room falls to a slow dim breathe with the color drift continuing. prefers-reduced-motion gets a static dim warm+cool blend. Verified in-browser via Playwright: per-beat peaks measured 0.93 / 0.39 / 0.60 / 0.39 against the designed 1 / 0.4 / 0.6 / 0.4 at 130 BPM, pulse 0 when stopped, cool drift confirmed moving, zero console errors, rAF rate unchanged with/without the room layers. Mixer-surface macros, canvas visualizer, and the remaining materials pass are still open below.

**Note:** This was a phase 9 UI polish item that got bumped up to do before phase 7.

## Phase 7: Full curriculum arc

**User stories**: the v1 product promise — a beginner goes from silence to a full techno groove along one guided path.

### What to build

The complete ordered arc of ~10–15 goal-checked challenges: four-on-the-floor → off-beat hats → clap on 2 & 4 → first bassline → filter sweep → stab chords → "your first techno groove." Includes arc navigation (see the path, jump to any unlocked lesson), per-lesson completion state, and celebrations. All content is JSON; this phase is mostly authoring plus whatever goal types the arc still lacks.

### Acceptance criteria

- [x] 10–15 lessons exist covering rhythm, bass, sound design, and stabs, ordered as one arc — 14 lessons in `src/lessons/`, ordered by `ARC` (`src/lessons/index.ts`): four-on-the-floor → offbeat hats → clap on 2 & 4 → open hat lift → kick accents → find the tempo → first bassline → make the line move → filter sweep → acid squelch → pluck or rumble → stab on the offbeat → play a chord → your first techno groove. Rhythm covers placement across four drum lanes *and* dynamics (accents); bass covers programming and pitch movement; sound design sweeps all three synth knobs; stabs are both sequenced and played live. The arc needed six new goal types, all JSON-declarative (`src/model/lesson.ts`): `stepsAccented`, `notesActive`, `notesPlaced`, `pitchesVaried`, `bpmInRange`, `chordPlayed` — the last reading a session observation of live keyboard playing (`src/model/chordPlay.ts`, high-water mark of distinct pitches held together, held in a ref so a key press never re-renders the deck unless the chord grows). The parser now rejects a goal naming a lane the deck does not have, an unreachable count, or a tempo range outside the transport, so a mistyped lesson fails loudly instead of becoming unwinnable. Verified in-browser (Playwright, fresh IndexedDB): every one of the 14 detected from the real UI in order, including negative checks — 133 BPM did not satisfy the 138–145 goal, three of four bass notes did not satisfy the fourth, two pitches did not satisfy "three different pitches", a knob nudge did not satisfy a sweep, and three notes played one at a time did not satisfy the chord. Covered by Vitest (`lesson.test.ts`, `chordPlay.test.ts`, `lessons.test.ts`)
- [x] Arc UI shows progress and lets the user enter, leave, and resume any lesson without losing sandbox state — `LessonArc` (`src/components/LessonArc.tsx`) renders the whole path as numbered pads built from the same materials as a step button: a green LED and meter for what is earned (`arcCompletion`), an amber ring on where the user stands, `aria-current="step"`, a `role="progressbar"`, and a per-lesson `aria-label`. Every lesson is enterable — the deck is never gated — and where the user is lives in `ProjectState.activeLessonId` (v6, with a v5→v6 migration), so a reload resumes on the same rung. Navigation is pure marker movement: `selectLesson`/`enterLesson` return the same `patterns`, `instrumentSettings` and `mixer` references they were given (asserted in `projectState.test.ts`), and the arc rules are pure functions over progress (`src/model/arc.ts`, `arc.test.ts`). Verified in-browser mid-playback: jumping 14 → 3 → 12 → 1 → 9, dismissing, and resuming left the pattern, tempo, knob values and the running transport byte-identical every time; a completed lesson stays on screen until it is put away and only then does the path advance to the next unearned lesson; and after a reload the deck came back on lesson 9 with 14/14 and the meter at 100%. A v5 document written by the previous build migrated cleanly: earned lessons kept, beat and BPM 126 kept, arc rejoined at the first unfinished lesson. Zero console errors throughout
- [ ] Every lesson's goal auto-detects completion reliably (no false positives/negatives across the arc)
- [ ] Completing the final lesson delivers a distinct "you made techno" payoff moment
- [ ] Adding a new lesson requires editing JSON only, no code changes

**Note (AC1/AC2):** the shipped demo groove gave up its backbeat clap. Phase 4 set the rule — the demo may groove, but it must never do a lesson's work for the user, which is why the kick lane ships empty — and the full arc made it bite twice more: the demo's clap on 5/13 *was* "clap on 2 and 4", and its offbeat hats were three quarters of "offbeat hats". The demo now plays a half-time clap on 13 alone and stops the hats a step short, so both lessons start unearned and the arc's own edits converge back on the groove the demo used to ship.

The rule that fell out of it: **on a lane a lesson asserts, the demo may only place steps that lesson also wants** — then every lesson is a piece to add, never one to undo. The open hat is the single deliberate exception, because its lesson teaches the 909 choke by making the user hear the hat cut off and move it. That leaves the perc as the one lane no lesson asserts and therefore the one place the demo is free to be busy, so it now carries the groove the trimmed clap took with it: four hits, all on 16ths between the beats (4/6/12/14), accented on 6/12, with the hit after the clap answering the backbeat the arc has yet to build. Verified in-browser from a wiped IndexedDB by timestamping every sample voice off the Web Audio node across two loops: 9 hits per bar in exactly the designed placement, grid-locked, zero console errors, with lesson 1 still unearned until the kick goes in. Three tests hold the line — no shipped lesson is satisfied by the opening deck, the demo stays inside the arc's goals (open hat named as the one stray), and nothing in the arc asserts perc (`lessons.test.ts`). The one place this cannot hold is a *returning* user's own saved beat: someone who already built a four-on-the-floor will find that lesson earned the moment they open it, which is honest — they did the thing.

**Note (AC4, still open):** the capstone completes the moment the user arrives at it with the whole groove assembled, since its goal is exactly "everything you built, playing at once". That is a correct reading of the lesson but a thin payoff; AC4's distinct "you made techno" moment is still to come.

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

**Note** 
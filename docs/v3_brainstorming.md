# Elevated BPM v3 — Brainstorming

> Status: brainstorm, not yet grilled or scoped. Written 2026-10-17.
> Follows v2 (the SP-04 sampler release, `docs/issues/`): 9 of its 10 issues are merged, and Web MIDI (EB2-10) is built on `feat/10-web-midi-input`, waiting on a real controller before it merges.

Nothing here re-proposes v2 work (FX sends, the sampler, multiple curriculum arcs). The ideas come from the code, the docs, and the deck running locally at 1440×900 and 390×844.

**Legend:** ★ means the PRD, CONCEPT or v1 plan already promised it and it isn't built. **S / M / L** is a rough size.

## 1. Promised but not built (strongest material)

- ★ **Pattern bank, then song mode (bank M, song L).** `patterns[]` and `activePatternId` exist, but there's no UI for a second pattern. Start with A/B/C/D slots that switch on the next bar line, like hardware, plus copy A→B. Song mode is then a list of pattern references. Share links will need to accept more than one pattern; `sharePayload.ts:319` currently allows exactly one.
- ★ **Export to a DAW (M).** The "on-ramp to Ableton" graduation path never shipped; the only download is the bundle.
  - A `.mid` file per lane is S: a pure function over `Pattern` and easy to test.
  - A real-time audio bounce of a few bars, recorded off the master, is S–M. A faster-than-real-time render is bigger, because the engine is built on the live audio context.
  - It would be a natural button on the finale screen.
- ★ **Swing (S).** It's in the `Transport` domain model and was never built. Tone's transport has built-in swing, so the audio side may be close to free. Add one knob and a `swingInRange` goal type, and you have a lesson. Small cost, big change in feel.
- ★ **Per-lane volume (S).** v1 scope said "volume/mute/solo," but `LaneMix` only has mute and solo. `hitsAtStep` already sets a gain for every hit, so a lane level just multiplies in.
- ★ **303 slide and accent on the bass (M).** Phase 5 said "length/slide," but `NoteStep` only has pitch and length. Slide and accent are what make a 303 sound like acid.
- ★ **Stab sound design (S–M).** The Chord Stab panel has no knobs and there's no `STAB_PARAMS`. Because of the deck-wide parameter registry from EB2-02, a "dark stab" lesson needs only JSON once the knobs exist.
- ★ **Phase 7 AC5 is still unchecked** ("adding a lesson is JSON only"). Today a new lesson also needs a line in `src/lessons/index.ts`. Either auto-discover the lesson files with `import.meta.glob` plus an arc manifest in JSON, or reword the AC.
- ★ **Accounts and sync (L).** This is now bigger than the PRD assumed, because samples live in their own IndexedDB store and sync would have to move audio, not just one JSON document. I'd do it last; links and bundles already cover sharing.
- Branch protection on `develop` and `main` (Phase 1.5) is still pending. That's a GitHub settings change, not code.

## 2. New features

**Sequencer depth.** Each of these adds new techno vocabulary and could carry a lesson:

- **Per-step probability and conditional steps** (e.g. "every 2nd loop") (M). This is how techno keeps a 16-step loop from feeling like a loop.
- **Hat rolls/ratchets** (S–M) and **rotating a lane one step left or right** (S). Rotating is a great way to teach syncopation.
- **Different lengths per lane** (polymeter), e.g. a 3-step perc against 16 (M). It's the classic hypnotic-techno trick.
- **Euclidean fill** per lane ("5 hits across 16") (S), and a **constrained randomize** button (S).
- **Sidechain pump**, where the kick ducks the bass and stabs (M). It's the most "techno" mix move the deck is missing.
- **Scale lock** for bass and stabs (S), plus **chord memory** so one key plays a whole minor-7th chord (S). Beginners can't hit wrong notes, and it teaches harmony on the side.
- **Live recording into the pattern** (M): an armed REC mode that writes pad and key hits to the nearest step. It must be opt-in, because CONCEPT promises that live playing never touches the pattern.
- **Recording knob moves per step** (M–L). This is natural on a groovebox, but say explicitly why it's allowed when CONCEPT ruled out "automation."
- **Performance mode** (M): mute groups and scene launching, to build and drop sections without a timeline.
- **Alternate kits** such as 808 and minimal (S). These are mostly sample curation.

**Learning:**

- **Partial progress** such as "3 of 4 kicks" or "sweep 60% done" (S). Goals are pass/fail today, so a learner can't tell whether they're close. Every goal check could also report a fraction.
- **Escalating hints** (S–M): a `hints[]` field in the lesson JSON. After a stall, show a hint; the last level ghosts the target steps onto the grid.
- **Spotlights for single steps** (`step:kick:1`), not just whole lanes (S).
- **Ear training** (M): the lesson plays a reference groove and you rebuild it, with A/B against yours. This is the biggest teaching upgrade on the list.
- **New arcs that are mostly JSON:**
  - **Dub techno.** The PRD called FX sends "dub techno lesson material," and no lesson uses the sends or the master knobs today.
  - **Mixing**, after per-lane volume.
  - **Acid**, after slide and accent.
  - **Groove**: swing, probability and polymeter.
  - **Arrangement**, after the pattern bank.
- **Challenge links** (M): a share link that also carries a goal ("fix this broken groove"), so anyone can write challenges with no backend.
- **Style starters** (S): Detroit, Berlin, minimal and acid grooves, each with notes on what makes the style.
- **Sampling companion course** for `learning/` (content only). It currently covers just the Techno arc.

## 3. UX

- **The instrument starts below the fold.** At 1440×900 the first drum step is at y≈1073 on a 3,290px-tall page. The header's share text, the curriculum, the lesson card and the 476px Master strip all come first, which works against "playable from the first click." Options:
  - a sticky compact transport bar (play, BPM, mini scope);
  - shrink a completed lesson card to a chip automatically;
  - move Master below the instruments, or make it collapsible;
  - hide empty sampler pad rows (the sampler is 738px tall with every pad empty).
- **Use the width.** The deck is about 870px wide at 1440. Two columns (drums and sampler on the left, bass and stab on the right) would bring most of the deck on screen.
- **Phone:** the page content is 503px wide in a 390px viewport (left open in Phase 9), 4,191px tall, with 269 controls you can tab to. Wrap steps into 2×8 rows, and add a stripped "perform" view with just transport, pads and keys.
- **Undo/redo (M).** The document never changes in place and every edit goes through pure functions, so keeping a history is cheap. Leave out lesson progress (`App.tsx:421` says undoing work must not take back an earned lesson) and sample eviction (`App.tsx:582` says it can't be undone).
- **Editing notes is hard to discover.** Pitch shows only as "C2" text and changes with arrow keys. Dragging a step up or down, or a small piano-roll strip, would help.
- **Drag-paint steps** across a row (S–M). Steps cycle off → on → accent, so painting should copy whatever state the first step ends up in.
- **Header clutter:** move Share, Export and Open, plus their two lines of explanation, into a single Share menu.
- **The sampler's native `<select>` dropdowns** render as white system widgets, the one place the hardware look breaks. A hardware-style toggle would fit.
- **Global shortcuts (S):** Space for play/stop (it doesn't exist yet; it needs care so it doesn't fight focused buttons), `?` for a shortcut overlay, and keys for mute/solo and clearing a lane.

## 4. Performance

Playback performance is already measured and fine: Phase 9 found zero dropped frames at 200 pointer moves a second. What's left is load time and polish.

- **551 kB JavaScript in one file (162 kB gzipped)**, and Vite warns about it.
  - Tone is probably most of that; measure with a bundle visualizer before splitting anything.
  - The certain win is putting Tone in its own vendor file. Right now every deploy forces visitors to re-download all 551 kB, even though Tone rarely changes.
  - Then load the region editor, onset detection, microphone, bundle code and finale screen only when needed.
- **The audio context is created on import**, which logs two autoplay warnings on every load. Create it on the first user gesture instead (S).
- **Installable offline app (S–M):** a manifest plus a service worker that caches the app and `/samples`. The app is already local-first, so it would work on a plane.
- **Measure time to first sound** after the first Play on a cold load. If the kit's samples are still downloading at that moment, fetch them in the background as soon as the page loads.
- **Storage meter** in the sampler, e.g. "34 MB of 2 GB used" (S).

## 5. Small improvements

- Tap tempo; ±1 BPM buttons; type-in BPM (the readout is display-only today).
- Metronome and count-in.
- Double-click a knob to reset it to its default.
- Toggle the scope between spectrum and waveform.
- `prefs` is still `{}`: use it to remember collapsed panels and layout.
- A static preview image for share links so they look good when pasted into chat.
- Run a Playwright smoke test in CI. Every phase was checked by hand in a browser; automating that guards it.
- ESLint/Prettier, deliberately deferred in Phase 1.5.
- A version tag and a "what's new" chip (the package is still `0.1.0`).

## If I were picking the next track

Ranked by "already promised" × small size:

1. **Swing + per-lane volume**: both S, both promised, both lesson-ready.
2. **Fix what blocks the first click:** sticky transport, collapsing finished panels, then mobile reflow.
3. **Export to MIDI/audio**: the graduation path the whole product points toward.
4. **Pattern bank (A–D)**: the cheap first half of song mode, and it unlocks an Arrangement arc.
5. **303 slide/accent with an Acid arc**, plus partial-progress feedback for every lesson.

## Next step

Grill these down and write the chosen ones up as a spec plus an issue track under `docs/`, the same way the sampler release (v2) started.

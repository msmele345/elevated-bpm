# Glossary — Elevated BPM

The project's shared language: the words specs, issues, PRs, code comments and
conversations use, and exactly what each one means here. Last reviewed
2026-10-26: v2 (the SP-04 sampler release) is shipped, v3 is specified in
`docs/specs/v3-groove-bank-acid.md`, and its first slices (EB3-01 swing, EB3-02
voice Level and bass/stab mute & solo, EB3-03a/b the layout seam and the fold
layout, EB3-04a progress chips, EB3-04b the completed strip and scroll to
spotlight, EB3-05 sampler compaction and two columns, EB3-06 phone reflow,
EB3-07a the pattern bank's slots and queued switching, EB3-07b the bank's Copy and Clear, EB3-08 the bank in share links, EB3-09a the bass Accent row and Env Mod) have shipped.

## How to use and maintain this file

- **Look here before naming anything.** If a word already exists, use it with
  this meaning. If two words compete for one idea, pick the one listed here.
- **Update it in the same change.** A spec, issue or PR that introduces,
  renames or redefines a domain term also edits this file. A term that only
  exists in a conversation isn't finished until it's written down here.
- **Entry shape:** `**Term** — definition. Code: \`Identifier\`.` Prefer
  type and function names to file paths, because paths move.
- **Order:** grouped by area, alphabetical within each group.
- **Status tags:** **[v3 spec]** marks a term that has been specified but not built.
  When it ships, remove the tag and correct the definition to match what was
  actually built. A definition describes the code as it is today and then says
  what the spec changes. Spec prose must never stand in for the current build.
- **Founding terms.** Deck, Instrument, Pattern, Lane, Transport, ProjectState,
  Lesson and Arc come from the "Domain model" section of `CONCEPT.md`. Keep
  these entries in agreement with it. Where the code has grown past
  `CONCEPT.md` (for example, a fourth Instrument), this file says so rather than
  editing `CONCEPT.md`, which records settled decisions.
- **Two meanings?** If a word is used for two things, add it to the first
  section below and say which form to use.
- Generic music words (BPM, kick, offbeat) are left out unless the project gives
  them a specific meaning or range.

---

## Words with two meanings (read first)

- **Accent.** On a **drum or pad step**, accent is the third state of the step
  cycle, and the hit plays at full gain instead of 0.62. On a **note step**,
  accent is the 303 flag: about +4 dB through a gain stage plus extra
  filter-envelope depth with a faster decay. The two are separate fields, and
  the drum accent is unchanged by v3.
- **Active.** `activePatternId` names the pattern being *edited* (the selected
  slot), which may differ from the one being *heard* while a switch is queued. Say **selected slot** and **playing
  slot** when the difference matters. "Active lesson" and "active arc" mean the one
  on screen.
- **Bank.** From v3 on, a bare "Bank" means the **pattern bank**: the four
  slots A–D (code: `SLOT_LETTERS`, `bankWithSlots`). The sampler's list of
  loaded audio is the **source bank**. Always
  qualify it, because shipped code already calls it "the bank": the
  `sampler-source-bank` class and comments in `lesson.ts` and `projectState.ts`.
  Learner-facing copy says "sources", never "bank", for the sampler's audio.
- **Lesson.** An **in-app lesson** is one JSON goal in `src/lessons/`. A
  **companion session** is a 17–20 minute guided page in `learning/`, titled
  "Lesson N" there. They are separate systems; see `learning/AGENTS.md`.
- **Met vs. earned.** A goal is **met** while its assertions are true right now.
  A lesson is **earned** (completed) once completion has been recorded in
  `lessonProgress`, and that record is latched. Inheritance is the gap between the two:
  a lesson can be met and still not earned.
- **Slice.** In the sampler, a slice is the rendered audio of a pad's region.
  In planning, a slice is one issue of an issue track ("Slice 9 of 10"). In
  specs and code, "slice" alone means the audio.
- **Step numbers.** Lesson intros, UI labels and conversation count steps
  **1–16**. JSON goals and code index them **0–15**. "Steps 1, 5, 9 and 13" in an
  intro is `[0, 4, 8, 12]` in the goal.
- **Track.**
  - A **curriculum track** is the learner-facing name for an Arc (Techno,
    Sampling, and [v3 spec] Acid). Arc is the model word for the same thing.
  - An **issue track** is a release's ordered set of issue files.
  - In music, a track is a song. In that sense, say "song" or "source" instead.
- **Voice.** In the mixer, a voice is anything with its own channel: the five
  drum lanes, the four pad lanes, bass and stab, eleven in all. Code: `VoiceId`
  (`LaneId | NoteLaneId`), `VOICES`. In the audio engine, a voice is also the
  Tone object that makes a sound (`createBassVoice`, `createStabVoices`, the pad
  voices). Both senses are current; context says which.

---

## The Deck and its instruments

- **Accent row.** The thin row of 16 toggle buttons under the bass lane that
  sets each step's accent flag. Each button is named "Bass accent, step 3, on",
  "… off" or "… on (no note)". It is a `.step-row` with a `.step-grid`, so it
  shares the lane's tracks and wraps 2×8 aligned on phones. Only the bass has
  one. Code: `NoteFlagRow`, `NOTE_FLAG_LANES`.
- **Bass synth (BL-303).** A monophonic 303-style synth: a sawtooth into a
  resonant −24 dB lowpass. Its knobs are Cutoff, Resonance, Decay and Env Mod,
  and it has an Accent row under its lane. It plays the bass note lane. Code:
  `BASS_PARAMS`, `BassSettings`.
- **Deck.** The whole instrument surface: every panel, the transport strip,
  the Master strip, and the curriculum UI woven through them. Top to bottom:
  header (with the Share menu), any share strip, transport strip, curriculum
  line, lesson card, Drums, Sampler, Bass, Stab, Master. At a viewport width
  of 1600px or more the instruments split into two columns, Drums and Sampler
  on the left and Bass and Stab on the right, with everything else spanning
  the width; below that it is one column. The order stays the same either way,
  so skip links and headings follow the screen. Founding term. Code:
  `.deck-instruments`, `.deck-column`.
- **Deck section.** A block of the Deck with an id, a heading and a skip link.
  This one list drives all three, in the order the Deck stacks them
  (transport, curriculum, drums, sampler, bass, stabs, master); adding a panel
  without adding a section fails the accessibility suite (see Eight-control
  rule), and so does a list whose order disagrees with the page. Code:
  `DECK_SECTIONS`.
- **Drum machine (DR-909, "Rhythm Section").** The sample-based kit of five
  drum lanes. Code: `KIT_LANES`, `KIT_SAMPLES`.
- **Instrument.** A sound source that owns its params and its lanes:
  DrumMachine, BassSynth, StabSynth and, since v2, the SP-04 sampler (which
  `CONCEPT.md` predates). Founding term.
- **Knob.** The SVG dial control for one param. It is a `role="slider"` that
  responds to drag (shift for fine) and keys (arrows, Page, Home/End). Code: `Knob`,
  `ParamSpec`.
- **Master strip (MX-01, "Main Out").** The panel with the scope, the master
  macros and the FX controls. It sits at the bottom of the Deck, after the
  Stab, as it sits at the end of the signal chain. It no longer holds the
  transport (see Transport strip).
- **Model plate.** The name/model heading on each panel: DR-909, SP-04,
  BL-303, CS-08, MX-01. EB-01 is the plate on the Techno graduation. These are the
  Deck's own names, not trademarks. Code: `PanelTitle`.
- **Param.** One knob-controlled value with a Deck-unique id, such as
  `cutoff`, `filter`, `drumSend` or `pad1Tune`. Code: `DeckParamId`.
- **Param registry (deck param registry).** Every knob on the Deck in one
  list, so a lesson goal or spotlight can name any of them, and a mistyped one
  fails when the lesson loads. It includes `swing`, whose value lives in the
  Transport rather than an instrument patch, and every voice's Level knob
  (`kickLevel`, `pad1Level`, `bassLevel`, `stabLevel`, …) and the bass `envMod`.
  Code: `DECK_PARAMS`, `isDeckParamId`, `TRANSPORT_PARAMS`.
- **Room (room light).** The beat-synced club backdrop around the Deck. It is
  driven from rAF through CSS variables and never re-renders React. Code:
  `useRoomLight`.
- **Sampler (SP-04).** The four-pad sampler Instrument. See the Sampler section.
- **Scope (spectrum scope).** A 16-bar canvas spectrum in the Master strip,
  drawn from rAF reading the engine. Code: `SpectrumScope`.
- **Stab synth (CS-08).** A polyphonic chord synth with a fixed patch. It is played live
  on the on-screen keyboard or the computer keys A–K, and sequenced on the stab
  note lane. Code: `StabKeyboard`, `createStabVoices`.
- **Transport strip.** The sticky bar pinned to the top of the viewport
  holding Play/Stop, the tempo fader with its BPM readout, and Swing (a compact
  Level-sized knob with its name printed beside it). It is its own deck section,
  one row and 52px tall on desktop and two rows and 86px tall below 600px, where
  the tempo fader shares the first row with Play and the BPM readout and Swing
  takes the second (`--transport-strip-h` carries whichever applies); scroll
  targets clear it through `scroll-padding-top`. The pattern bank's slots A–D
  sit at its right-hand end on desktop and on the second row beside Swing on a
  phone, and the "Editing B · hearing A" notice hangs under it while a switch
  is queued. Copy and Clear sit after the slots, and their inline confirm
  takes the bank's place so the strip never grows (on a phone it hides Swing for
  the moment it is asking). On a phone the two rows are flex rows, not a grid:
  Play, tempo and BPM, then Swing and the bank. Swing's name stacks over its
  readout beside the dial, and below 360px its printed name is hidden. Code:
  `TransportStrip`, `PatternBank`.

## Patterns, lanes and time

- **Accent (drum step).** A single click cycles a step off → on → accented →
  off. An accented hit plays at gain 1; an unaccented one plays at 0.62. Code: `cycleStep`,
  `ACCENT_GAIN`, `UNACCENTED_GAIN`.
- **Accent (note step).** The 303 flag on a bass note. An accented note gets the
  drum accent gap louder (`ACCENT_GAIN` / `UNACCENTED_GAIN`, about 1.61, +4.2 dB)
  through an accent gain stage after the bass filter, because synth velocity
  tops out at 1. It also gets a fixed extra 2 octaves of filter-envelope depth
  (`ACCENT_ENV_OCTAVES`) that decays in half the Decay knob's time, even at
  Env Mod 0; unaccented at Env Mod 0 is exactly the old sound. It is edited on
  the bass Accent row, and kept on steps whose note is off, like pitch and
  length. Spotlight `accentRow:bass`. Code: `bassVoicing`, `BassVoicing`,
  `toggleNoteAccent`, `toggleActivePatternNoteAccent`, `NoteFlagRow`.
- **Audio clock.** Tone's transport time. "Never on the audio clock" means
  playback must not drive React state changes (see Performance rule).
- **Bank (pattern bank).** The four pattern slots A–D. `patterns` always holds
  exactly four, in A–D order, each named by its letter; only programming lives
  in a slot, so tempo, swing, the mixer, the patches, the master, the FX and
  the pad sounds are shared and never change on a switch. A payload may carry
  fewer, and `bankWithSlots` puts each back by letter and fills the gaps empty.
  This is not the source bank. Code: `SLOT_LETTERS`, `createBank`,
  `bankWithSlots`.
- **Choke.** One lane cutting another's still-ringing sample: the closed hat
  chokes the open hat, as on a 909. Code: `CHOKES`, `resolveStep`.
- **Copy / Clear.** Two keys after slots A–D in the transport strip. Copy arms
  copy mode: the other slots pulse an amber ring (steady under reduced motion) and
  the next slot pressed receives a deep copy of the selected slot's lanes (drum,
  pad and note, every step a fresh object). The target keeps its own id and letter
  and becomes the selected slot, so while playing it queues like any slot press.
  An empty target is copied at once. A target with programming asks first with an
  inline "Overwrite B?" (Overwrite / Cancel). Escape or pressing Copy again
  cancels an armed copy, and pressing the selected slot does nothing and disarms.
  Clear empties the selected slot (id and letter kept) after an inline "Clear A?"
  (Clear / Cancel); on an empty slot it does nothing and is `aria-disabled`.
  Focus goes to Cancel when a confirm opens and back to the key asked about when
  it closes. Never a browser dialog. Whether copy is armed is local to the bank,
  never saved or shared. Code: `copySlot`, `clearSlot`, `withProgrammingOf`,
  `emptiedPattern`, `PatternBank`.
- **Drum lane.** A lane of on/off + accent steps that triggers one sample. Its
  ids are `kick`, `snare`, `closedHat`, `openHat` and `perc`. Code: `DrumLane`, `DrumLaneId`.
- **Empty slot.** A slot with no step on in any lane. Pitch, length or flags left
  on off steps don't count. Its slot button says "empty" and reads dimmer. Code:
  `isPatternEmpty`.
- **Env Mod.** The depth of the bass filter envelope: bass param `envMod`, 0 to
  100%, default 0 (neutral), linear, labelled "Env Mod". Each note's filter
  envelope jumps up to `ENV_MOD_MAX_OCTAVES` (4) octaves above Cutoff at 100%
  and falls back over the Decay knob's time. It is a Tone.Envelope scaled in
  cents driving the filter's `detune`, so it rides on top of Cutoff and the
  Cutoff knob keeps moving the base live mid-note. It takes effect on the next
  note. Spotlight `knob:envMod`. Code: `BASS_PARAMS`, `bassVoicing`.
- **Lane.** One row of 16 steps in a Pattern. There are three kinds: drum lane, pad
  lane and note lane. Founding term. The UI may say "row"; code and docs say lane.
- **Live play.** Playing pads or keys by hand over the loop. It is performance
  only: it never writes to the Pattern, and it is never swung. Code:
  `PadHitOrigin` (`'live' | 'sequenced'`), `createStabNoteHolds`.
- **Note lane.** A lane of note steps, with ids `bass` and `stab`. Code: `NoteLane`,
  `NoteLaneId`.
- **Note step.** A step that carries `on`, `pitch` (a MIDI number) and `length` in
  whole steps. A note is clipped where the next one starts. It also carries
  `slide` and `accent` booleans. Both note lanes carry them, but only the bass shows a row and plays them
  (`NOTE_FLAG_LANES`, = `['bass']`). Flags are kept on steps whose note is off,
  like pitch and length. The slide flag has no row and no sound until EB3-09b.
  Code: `NoteStep`, `noteEventAtStep`, `withNoteFlags`.
- **Pad lane.** A sampler pad's lane, with the same shape as a drum lane. Its ids are `pad1`–`pad4`.
  Code: `PadLane`, `StepLane`.
- **Pattern.** A first-class, ID'd 16-step loop holding every lane (drum, pad
  and note). There is one per slot of the bank, and its `name` is the slot's
  letter. Founding term (`CONCEPT.md` expected song mode to chain patterns; v3
  rules chaining out, so the bank is four slots and nothing more). Code:
  `Pattern`.
- **Phone reflow.** Below 600px nothing on the Deck scrolls sideways, down to
  320px. Every step lane puts its label and its M, S and Level on a header line
  and wraps its 16 steps into two rows of 8 (steps 1–8, then 9–16), each row
  holding two whole quads with a thin spacer track between them. Every `.step-grid`
  shares those tracks, so step *n* sits directly over step *n* + 8, and any
  further row built on the same grid (the bass Accent row today, and the Slide
  row in EB3-09b)
  lines up under its note for free. Bass and stab keep M, S and Level on their
  panel plate, above the lane. The keyboard, Master, region editor and finale
  fit 320px too. Held by `e2e/reflow.spec.ts`. Code: `.step-grid`, `.step-row`.
- **Playhead.** The moving step highlight, animated from rAF reading the
  transport. It stays on the straight grid under swing (at most half a step from
  what is heard). Code: `usePlayhead`.
- **Playing slot.** The slot the engine is sounding. Step resolution moves it to
  the selected slot only on step 0; while stopped it always equals the selected
  slot. Its LED (run green) is lit from rAF reading the engine against the audio
  clock, so it changes when the new bar is heard, not when the look-ahead
  scheduled it; never React state. Code: `getSlotLights`, `useSlotLights`.
- **Quad.** A group of four steps (1–4, 5–8, 9–12, 13–16), each wearing its
  909 colour. Phone reflow keeps quads whole: each row of 8 holds two of them.
  Code: `--quad-0`…`--quad-3`.
- **Queued switch.** Pressing a slot while playing selects it at once, so the grid
  shows it, edits go to it and goals read it. The sound changes only when the
  engine reaches step 0 of the next bar. Pressing another slot replaces the
  queue, pressing the playing slot cancels it, and Stop clears it. A press in
  the look-ahead just before the bar cannot cancel a switch already scheduled,
  so that slot shows queued behind it instead. While queued,
  the slot's LED blinks amber, every step grid carries a dashed edge and the
  transport strip says "Editing B · hearing A until the bar ends". Code:
  `selectSlot`, `setBank`, `resolveStep`.
- **Selected slot.** The slot being edited, which `activePatternId` names. Shown
  with `aria-pressed`, persisted, so a reload comes back to it. Code:
  `selectSlot`.
- **Slide** [v3 spec]. The 303 flag on a bass note. The gate stays open into the step
  right after the note ends. If that step holds a note, the line glides into it over
  about 60 ms without restarting the envelopes (legato). If the step is empty, the note
  ties through it and then releases.
- **Slot.** One position in the pattern bank, named by its letter A–D. Each
  slot button's accessible name carries its state: "Slot B, selected, queued,
  empty". Code: `SlotLetter`, `BankSlot`, `bankSlots`.
- **Step.** One 16th-note cell. There are 16 per lane (`STEP_COUNT`), and each lasts
  `secondsPerStep(bpm)`, which is 15/bpm seconds.
- **Step resolution.** The one pure function that decides what sounds on a
  16th. It reads the pattern, the mixer, the Transport and the step index, and
  returns drum and pad starts with their accent gains (after mute/solo), chokes,
  bass and stab note events (pitch and length in steps), and the swing offset in
  seconds for that 16th. Bass and stab note events are filtered by the same
  mute/solo rule as drum and pad hits; Level is not part of resolution (hit gains
  stay accent-only). The Tone callback applies its result and decides nothing
  itself. It also reads the Bank with the selected and playing slots and
  returns the playing slot after this step (see Queued switch). The
  input includes the bass patch (`bass: BassSettings`); every note event
  carries `accent` (always false for stab), and bass events carry a `voicing`
  of gain, filter octaves and filter decay. [v3 spec] Legato and gate tie
  arrive with EB3-09b. Code: `resolveStep`, `StepResolution`, `SequencedNote`,
  `bassVoicing`.
- **Swing.** The Transport's shuffle, from 50 to 75% (stored as 0.50–0.75, default 0.50).
  Every odd 16th of every sequenced voice is delayed by (swing − 0.5) × 2 × one step, so 66%
  is roughly a triplet feel and 75% is dotted; even 16ths never move, and note lengths stay
  whole steps measured from the delayed start. The Deck applies this offset itself and Tone's
  own swing stays at 0, because Tone's swing makes steps mis-index at 75%. Live play is never
  swung. The Swing knob reads whole percent ("54 %"), and `swingInRange` judges that same
  whole percent. Spotlight `knob:swing`. Code: `TransportSettings.swing`,
  `swingOffsetSeconds`, `SWING_PARAM`, `setTransportSwing`.
- **Transport.** BPM (60–200, default 130), swing (50–75%, default 50%), and play
  state. It wraps Tone's transport, the only musical clock. Play state is never
  persisted. Founding term. Code: `TransportSettings` (`{ bpm, swing }`).

## Mixing and the audio path

- **FX bus.** One shared delay into a reverb, fed by per-instrument sends,
  returning into the master input upstream of the master filter. Closing that filter
  therefore dulls the tails too. Code: `FX_PARAMS`, `FxSettings`.
- **Level.** A voice's channel gain, stored linear from 0 (silence, −∞ dB) to
  `MAX_LEVEL` (+6 dB, about 1.995), default 1 (0 dB). One channel `Tone.Gain` per
  voice applies it, after the per-hit accent gain, synth velocity and bass
  filter, so live and sequenced sound pass through it alike and accents keep
  their headroom; it ramps over 20 ms. Each voice has a small Level knob beside
  its M/S, using the `'fader'` taper (silence at the bottom, then even dB steps
  from −24 to +6 dB) and reading out in dB. Level does not mute: a voice at −∞
  still counts as audible to mute/solo. No goal type reads it, but each Level
  knob is a deck param, so `paramSwept` and `knob:` spotlights can name it. Say
  "Level", not "volume". Code: `VoiceMix.level`, `setVoiceLevel`,
  `setLevelParamValue`, `LEVEL_PARAMS`, `levelParamForVoice`, `VoiceMixStrip`.
- **Macro.** A Master-strip knob that works on the whole mix: **Filter** (a −12 dB/oct
  lowpass, 120 Hz–18 kHz) and **Drive** (saturation, 0–100%). Code:
  `MASTER_PARAMS`, `MasterSettings`.
- **Master bus.** Every voice → input → filter → drive → output.
- **Mixer.** The per-voice map in ProjectState, keyed by voice id (drum, pad
  and note lane ids). Each strip is `VoiceMix { muted, soloed, level }`. A
  missing entry, or a missing field on one, reads as unity Level, unmuted,
  unsoloed. Code: `Mixer`, `VoiceMix`, `voiceMix`, `voiceLevel`.
- **Mute / solo.** The hardware rule, across all eleven voices: if any voice is
  soloed, only soloed voices play; solo overrides mute; several solos are
  allowed. It filters events rather than scaling gain: sequenced drum and pad
  hits, bass and stab note events, live pads and live stab keys (a muted or
  out-soloed stab takes no live notes and lights no keys). A note already
  ringing when you mute keeps ringing. Code: `audibleVoiceIds`,
  `voiceIsAudible`, `toggleVoiceMute`, `toggleVoiceSolo`.
- **Neutral.** A param's resting value, at which it changes nothing: sends at 0,
  drive at 0, master filter at 18 kHz, swing 50%, Level 1, Env Mod 0. Every new
  param must default to neutral, so an untouched Deck sounds exactly as it did
  before the param existed.
- **Send / return.** A send is a per-instrument level into the FX bus (`drumSend`,
  `bassSend`, `stabSend`, `samplerSend`). The return is the FX bus output back into
  the master input. Sends are tapped after mute and after Level (the channel gain
  feeds the instrument's send tap), so a muted voice sends nothing.

## Sampler

- **Analysis decode / render decode.** The analysis decode is low-rate and mono; it feeds the
  waveform, onsets and scrubbing, and is held only while the editor is open. The render decode is
  full-rate and transient; it is used only to render a slice when a region is committed.
- **Chop.** The user-facing word for a region cut from a source and the sound it
  makes ("chop a break"). Specs and code say region and slice.
- **Commit.** Making a region a pad's sound, which renders and saves its slice. Code:
  `commitRegionToPad`.
- **Curated source.** The break that ships pre-installed on every Deck. The
  Sampling lessons are written against it. Origin `shipped`. Code:
  `CURATED_SAMPLE_SOURCE`.
- **Eviction.** When storage is full, sources (never slices) are dropped and the write is
  retried. Slices are what make sound, so they are never evicted.
- **Fit (fit-to-steps).** An optional per-pad number of steps (1–16) the region
  should fill. It sets the playback rate, and the pitch moves with it, with no time-stretch.
  Code: `PadSettings.fit`, `padPlaybackRate`.
- **Intake.** The checks on incoming audio before any decode: file size (50 MB), then
  duration (6 minutes). A rejection leaves the project untouched. Code:
  `MAX_SOURCE_BYTES`, `MAX_SOURCE_SECONDS`, `IntakeRejection`.
- **Onset.** A detected transient in a source. Region edges jump between
  onsets with the bracket keys. Code: `jumpRegionEdgeToOnset`.
- **Origin.** Where a source came from: `shipped`, `upload` or `recording`. Goals
  about "a sound you brought in" exclude `shipped`. Code: `SampleOrigin`.
- **Pad.** One of four sampler pads, numbered 1–4 so that the label is the key
  that plays it. A pad holds a region reference, Tune, Fit and a name. Code:
  `PadSettings`, `PAD_LANES`.
- **Pad audio state.** One of four states:
  - `empty`: no region.
  - `ready`.
  - `sourceMissing`: it sounds, but re-chopping is unavailable.
  - `silent`: the slice is missing; the pad keeps its programming and offers relink.

  Code: `PadAudioState`, `padAudioState`.
- **Pad card ("Load a sound" card).** What a pad with no sound and no
  programming shows instead of its full strip and step lane: its number, a
  source picker and a "From file" control, and it still takes a dropped file.
  The lane appears as soon as the pad has a region or any step is on (the
  sound-or-steps rule), so a pad that lost its audio keeps its programming in
  view; a silent pad (region kept, slice gone) stays drawn with its relink. A
  muted or soloed pad also stays drawn, so its S is never hidden. Clearing the
  last step of a soundless pad folds it back into a card and moves focus to the
  card's picker. A lesson spotlighting a card's Tune knob lights the card,
  because there is no knob until the pad has a sound. Code: `padLaneShown`.
- **Region.** A re-editable window into a source: source id, start and
  duration. A pad holds a region, never a copy of the audio. Code: `SampleRegion`.
- **Region editor.** The waveform plus a two-thumb slider for a region's edges.
  Its keys are scoped to focus, and Space is never bound. Code: `RegionEditor`, `RegionHandle`.
- **Relink.** Pointing a silent pad at a source again. Code: `relinkPadToSource`.
- **Slice.** The rendered audio of a pad's committed region. It is small and precious,
  and it is what playback, startup and bundles use. Code: `Slice`, `renderSlice`.
- **Source.** Uploaded, recorded or shipped audio, stored once in the sample
  store. ProjectState holds only its metadata. Sources are large and expendable. Code:
  `SampleSource`.
- **Source bank.** All the sources loaded on this Deck. Always say "source bank", never
  bare "bank" (see the first section).
- **Tune.** A pad's pitch in semitones (±24), which changes the playback rate like a record. Param
  ids `pad1Tune`…`pad4Tune`.

## The document and persistence

- **Autosave.** A trailing 400 ms debounce that writes the whole ProjectState to
  IndexedDB. It flushes on page hide and is suspended while a share link or bundle is
  being previewed. Code: `createAutosaver`.
- **Demo groove.** The shipped opening pattern, in UI step numbers: the kick is empty, the clap is on
  13, the closed hats are on 3/7/11, the open hat is on 15, and the perc is on 4/6/12/14. The bass and stab are
  empty. It plays at 50% swing, in slot A, with B–D empty. Code: `createDemoPattern`.
- **Migration (migration chain).** Each schema bump adds one step that lifts vN
  to vN+1, adding fields with defaults that reproduce the old sound. Saved
  documents, share links and bundles all pass through the same chain. A corrupt or
  unknown version falls back to a fresh document. Code: `migrateProjectState`.
- **Opening deck.** What a first-time visitor gets: the demo groove, the curated
  source, empty pads and nothing earned. Code: `openingProjectState`.
- **prefs.** A reserved slot in ProjectState. It is still `{}`. Layout state
  stays out of it: the curriculum line's expand state is session-only.
- **ProjectState.** The one versioned JSON document and the single source of
  truth. It holds `patterns`, `activePatternId`, `transport`, `instrumentSettings`,
  `sources` (metadata only), `lessonProgress`, `prefs`, `mixer`, `activeArcId` and
  `activeLessonIds`. It never holds audio. It is at v14 today (v11 added swing; v12 keys the
  mixer by voice with Level, and its migration fills `level: 1` on every existing
  strip and repairs missing flags; v13 makes `patterns` the four-slot bank, the
  old pattern becoming slot A under the same id; v14 gives every note step in
  every slot `slide: false` and `accent: false`, and the bass patch `envMod: 0`,
  repaired and clamped by `createBassSettings`). Founding
  term. Code: `ProjectState`, `PROJECT_STATE_VERSION`.
- **Sample store.** A separate IndexedDB store, split into slices (precious) and
  sources (expendable). Code: `saveSlice`, `saveSource`, `loadStoredAudio`.
- **Session observation.** Something the user did this session that is
  never saved: knob motion and chords played. Goals may read it. Code:
  `SessionObservations`, `ParamMotion`, `ChordPlay`.
- **Version ledger.** The table recording which issue spends which ProjectState
  version. The v2 ledger is in `docs/issues/README.md`; the v3 one is in the spec's Further Notes.

## Sharing

- **Bundle.** The share payload with slices included, written to a `.ebpm` file
  instead of a URL. It is the same serializer and validator as a link, with a different carrier.
  It always carries all four slots, with the selected one still selected. Code:
  `readBundle`, `projectForBundle`, `BUNDLE_FILE_EXTENSION`.
- **Inheritance (held back).** When a shared beat or bundle arrives, any lesson
  its content already satisfies is held back rather than credited. It is earned only
  after the goal stops being met and the learner builds it again. This covers every arc and
  every slot, and is held per slot: a lesson stays held in each slot it arrived met in until
  that slot stops meeting it, so selecting an empty slot and coming back is not taking the
  work apart, while the same lesson built in a slot of the learner's own earns at once.
  A copy of a held slot is held too, and a held slot overwritten by a copy of the
  learner's own is released, so Copy can't launder credit.
  Code: `slotsAlreadyMeeting`, `heldAfterCopy`.
- **Link degradation.** A share link says plainly what it couldn't carry.
  Audio never travels, so pads arrive silent with a notice to ask for a bundle.
  A bank too big for 2,000 characters goes as the playing slot alone (the selected
  one when stopped), under its own letter, and the Share menu says "This link holds
  pattern B only — export a bundle to send all four."
  Code: `sharedAudioNotice`, `ShareLink.onlySlot`.
- **Preview (preview-and-confirm).** An incoming link or bundle plays in memory
  with autosave suspended. **Keep this beat** saves it; **Back to my project**
  restores the recipient's document exactly. Code: `projectWithSharedBeat`.
- **Share link (share payload).** `?p=` carrying ProjectState as JSON, then gzip, then
  base64url, kept under 2,000 characters. A link carries the bank: every slot with
  programming under its own letter, plus the selected slot even when empty, and the
  reader fills the letters left out with empty slots, so the sender's B is the
  recipient's B. Over the limit it falls back to one slot (see Link degradation). A link
  from before the bank opens as slot A. Recipient-owned fields (progress, prefs) are
  blanked. Code: `createShareLink`, `ShareLink`, `createShareUrl`, `projectForLink`, `readSharedBeat`,
  `PRACTICAL_SHARE_URL_LIMIT`.
- **Share menu (Share ▾).** The header button that unfolds the three ways a
  beat leaves or arrives: Share beat (a link), Export bundle and Open a bundle,
  with the copy explaining each. A disclosure, not an ARIA menu; Escape or a
  press outside puts it away. It stays disabled until the deck has hydrated.
  Incoming-share choices and share errors are never in it: they are share
  strips, and a strip appearing puts the menu away. Code: `ShareMenu`.
- **Share strip.** A full-width strip under the header that asks for a
  decision about sharing: the incoming beat's Keep this beat / Back to my
  project, or a link, bundle or save error with Dismiss. Event-driven, never
  permanent, never folded into the Share menu. Code: `ShareStrips`.
- **Share validator.** The one check that both links and bundles pass. Every
  version bump updates it. It accepts one to four slots with unique slot letters
  and ids, with `activePatternId` among them. It also requires boolean `slide` and
  `accent` on every note step and an in-range `envMod` (via the bass patch
  check). Code: `isSharedProject`.

## Curriculum

- **Arc.** An ordered list of lessons plus its track title, blurb and finale.
  Today there are Techno (14 lessons) and Sampling (6). [v3 spec] Acid (7) is added and the order becomes
  Techno, Acid, Sampling. Founding term. Code: `CurriculumArc`, `ARCS`.
- **Capstone.** An arc's final lesson, whose goal asks for the whole arc at
  once (for example, "Your First Techno Groove"). Earning it raises the finale.
- **Completed (earned).** Completion recorded in `lessonProgress`. It is latched, so undoing
  the work never takes it back. Code: `LessonProgress.completed`,
  `detectLessonCompletion`.
- **Completed strip.** What an earned lesson card becomes once its celebration is
  over: one row of about 44px with ✓, "Lesson complete", the title, **Reopen** and
  **Next ▸**, and no Progress chips. Reopen unfolds the intro again (Collapse folds
  it); that is session-only and resets on the next lesson. The celebration lasts
  `CELEBRATION_MS`, counted from when any finale closes, and plays only for an edit
  the learner just made, so hydrating or walking onto an earned lesson lands straight
  on the strip. Code: `LessonPanel`, `CELEBRATION_MS`.
- **Curriculum.** Every arc together, behind the track selector.
- **Curriculum line.** The compact curriculum header, one line tall: track
  selector, a short progress meter with n/total, the current lesson's number and
  name, and "Path ▸", which unfolds the numbered path. Whether the path is
  unfolded is session-only component state, never saved to `prefs`. Code:
  `LessonArc`.
- **Demo rule.** The opening deck may groove, but it must never complete a lesson.
  On any lane a lesson asserts, the demo places only steps that lesson also
  wants (the open hat is the one deliberate exception). No slot of the opening deck
  satisfies any lesson in any arc. It is enforced by the shipped-lesson tests.
- **Dismiss / resume / put away.** Dismiss (✕, on an unearned card) collapses the
  lesson card to a "Resume lesson" chip and leaves the deck playable. Putting a
  *completed* lesson away is what advances the path, and **Next ▸** is the only
  control that does it. It reads "Next: <lesson> ▸" naming where it goes, or "Done"
  once the track has nothing left to earn, so a celebration is never cut short.
  Code: `LessonProgress.dismissed`, `handleDismissLesson` (put away), `handleNextLesson`
  (Next ▸: put away, then scroll to spotlight).
- **Finale (graduation moment).** The dialog raised on a capstone's incomplete →
  complete transition, never on reload or on revisiting the capstone. Its scale is `grand` (Techno, EB-01,
  16 lights) or `compact` (Sampling as SP-04; [v3 spec] Acid as BL-303; 8 lights).
  Code: `ArcFinale`, `FinaleMoment`.
- **Goal (goal assertion).** A declarative JSON check over the goal context. A
  lesson is met when every assertion is met. The parser rejects unknown lanes,
  knobs, pads, unreachable counts and out-of-range values when the lesson loads. Types:
  - exact placement: `stepsActive`, `stepsAccented`, `notesActive`;
  - minimum count: `notesPlaced`, `pitchesVaried`, `padStepsPlaced`, `sourceLoaded`,
    `padAssigned`, and [v3 spec] `notesAccented` and `notesSlid`;
  - range: `bpmInRange` and `swingInRange` (in percent, within 50–75);
  - observation: `paramSwept` and `chordPlayed`;
  - sampler value: `regionStartsWithin`, `regionShorterThan`, `fitTargetSet` and `padTuned`.

  Any goal may carry an optional `label` (non-empty) naming its Progress chip.
  Every type has a progress function, and met is read from it, so a lesson is
  met exactly when every assertion's progress says met. Code: `GoalAssertion`,
  `assertionProgress`, `AssertionProgress`, `isGoalMet`, `parseLesson`.
- **Goal context.** The curated view a goal is evaluated against: pattern, bpm,
  swing, motion, chord and sampler. It is not the whole ProjectState. Code:
  `GoalContext`, `goalContextFor`.
- **Lesson.** In-app JSON: `{ id, title, intro, spotlight[], goal[] }`. Adding
  one means a JSON file plus one line in the arc's list. Founding term. Code: `Lesson`.
- **Lesson card.** The lesson's panel on the Deck: position, title, intro and a
  row of Progress chips, plus a **Show me** link that scrolls to the spotlit
  control on demand. When the learner earns it, it shows its celebration, then
  shrinks to the completed strip (see Completed strip). Code: `LessonPanel`.
- **Path.** The numbered row of lessons for the active arc, folded behind the
  curriculum line's "Path ▸" until asked for. Every lesson can be entered, and the
  Deck is never gated. Navigation moves a marker and never touches the sandbox.
  Code: `LessonArc`, `ArcEntry`.
- **Progress chip.** One goal assertion's progress on the lesson card, as text
  generated from the goal type and the lane's, knob's or pad's display label:
  "Kick 3/4 · 1 extra", "Bass notes 2/4", "Cutoff sweep 60%", "Tempo 130 → 138–145",
  "Swing 50% → 54–70%", "Pad 1 start 0.70 s". Placement chips count wanted steps and
  extras and never say which steps are wrong; a sweep reads as a share of the travel
  asked for; range and value chips read the current value. An optional JSON `label`
  overrides the noun. A met chip shows ✓ in run green. The chips sit in one wrapping row
  (about 28px) as a list named "Goal progress". They are computed on the user-edit
  cadence, never the audio clock, from the same progress function completion reads,
  so the two can't disagree. One polite live region (`.lesson-announcer`, outside the
  deck) announces only a chip becoming met or the lesson completing, never a count
  change, and stays quiet on hydration, a shared beat arriving or leaving, and
  walking onto a lesson. Chips show only while a lesson is unearned: an earned card
  (celebration, completed strip, reopened) says it is done instead. Code: `ProgressChip`, `progressChips`, `chipsNewlyMet`.
- **Scroll to spotlight.** When a lesson is *entered* (picked on the path,
  reached by Next ▸, or resumed), the first spotlit control is scrolled into view,
  but only if it is not already wholly visible below the transport strip. A control
  inside the strip counts as always visible. Never on page load or hydration, never
  on an edit while the lesson is worked on; smooth, or instant under reduced
  motion. "Show me" on the lesson card does the same on demand. Code:
  `useSpotlightScroll`, `spotlightNeedsScroll`.
- **Spotlight (spotlight target).** A `kind:id` string in lesson JSON that puts
  an amber ring on a control: `lane:`, `noteLane:`, `knob:`, `pad:`, plus the
  single targets `transport:tempo`, `keyboard:stab` and `sampler:sources`. It also has
  `accentRow:bass`; [v3 spec] `slideRow:bass` is added with EB3-09b. Code: `SpotlightTarget`, `spotlightsTarget`.
- **Track (curriculum track).** The learner-facing name for an Arc on the track
  selector. See the first section.

## Process and project vocabulary

- **AC (acceptance criteria).** The checklist that bounds a phase or issue.
  Work stays inside its AC (see `AGENTS.md`).
- **EB2-NN / EB3-NN.** Issue ids for the v2 and v3 issue tracks (Elevated BPM, release,
  slice number). v2's are files in `docs/issues/`.
- **Eight-control rule.** The accessibility suite fails any block of more than
  eight controls that has no skip link. Code: `src/a11y.test.ts`.
- **First-click promise.** The product promise: the Deck is playable, with sound,
  from the first click. Nothing (login, setup, a lesson) gates the instrument.
- **Fold / fold budget.** The fold is what is visible without scrolling. The v3 budget:
  at 1280×720, on a fresh project with lesson 1's card open, Play and the tempo
  are in view and the bottom of the fifth drum lane sits at or above 720px.
  Checked by `e2e/fold.spec.ts`.
- **Issue track.** A release's ordered set of issue files, sliced from its spec.
  Not a curriculum track.
- **Layout seam.** Seam 6 in the v3 spec's Testing Decisions: the facts jsdom
  cannot measure, checked in a real browser. It runs as the Playwright suite in
  `e2e/`, against the production build, in the `e2e` CI job. It holds the smoke
  check, the fold check, the pinned-transport check and the lesson card checks
  (the completed strip's height, scroll to spotlight clearing the strip) and the two-column check at
  1600 and 1599px wide (`e2e/wide.spec.ts`); the phone reflow checks (`e2e/reflow.spec.ts`: no sideways scroll at 390×844 and
  320×640 on a fresh load, with the region editor open and with the finale open;
  2×8 lanes with step *n* over step *n* + 8; the two-row sticky strip).
  Code: `playwright.config.ts`.
- **Performance rule.** React re-renders on user edits only, never on the audio
  clock. The playhead, meters, LEDs and room light animate from rAF reading the
  engine directly.
- **Phase.** One of the v1 plan's numbered stages (1–9) in
  `plans/elevated-bpm-v1.md`.
- **Seam.** The boundary a feature is tested at: the highest pure function or
  mounted surface that shows its behaviour. Specs list theirs under "Testing
  Decisions".
- **Spec.** A release's PRD in `docs/specs/`: `sp-04-sampler.md` (v2) and
  `v3-groove-bank-acid.md` (v3, also GitHub issue #62).
- **Tracer bullet.** The thinnest end-to-end playable slice, built first, such as
  Phase 1's kick lane or EB2-03's pads-as-lanes.

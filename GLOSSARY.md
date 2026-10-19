# Glossary — Elevated BPM

The project's shared language: the words specs, issues, PRs, code comments and
conversations use, and exactly what each one means here. Last reviewed
2026-10-19: v2 (the SP-04 sampler release) is shipped, and v3 is specified in
`docs/specs/v3-groove-bank-acid.md`.

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
  cycle, and the hit plays at full gain instead of 0.62. On a **note step** [v3 spec],
  accent is the 303 flag: about +4 dB plus a sharper filter "wow". The two are
  separate fields, and the drum accent is unchanged by v3.
- **Active.** `activePatternId` names the pattern being *edited*, which
  [v3 spec] may differ from the one being *heard*. Say **selected slot** and **playing
  slot** when the difference matters. "Active lesson" and "active arc" mean the one
  on screen.
- **Bank.** From v3 on, a bare "Bank" means the **pattern bank**: the four
  slots A–D. The sampler's list of loaded audio is the **source bank**. Always
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
- **Voice.** In the audio engine, a voice is the Tone object that makes a
  sound (`createBassVoice`, `createStabVoices`, the pad voices). In the v3
  mixer [v3 spec], a voice is anything with its own channel: the five drum lanes, the
  four pad lanes, bass and stab.

---

## The Deck and its instruments

- **Bass synth (BL-303).** A monophonic 303-style synth: a sawtooth into a
  resonant −24 dB lowpass. Its knobs are Cutoff, Resonance and Decay, and
  [v3 spec] Env Mod is added. It plays the bass note lane. Code: `BASS_PARAMS`, `BassSettings`.
- **Deck.** The whole instrument surface: every panel, the Master strip, and
  the curriculum UI woven through them. Founding term.
- **Deck section.** A block of the Deck with an id, a heading and a skip link.
  This one list drives all three, and adding a panel without adding a section
  fails the accessibility suite (see Eight-control rule). [v3 spec] The transport strip
  becomes a section. Code: `DECK_SECTIONS`.
- **Drum machine (DR-909, "Rhythm Section").** The sample-based kit of five
  drum lanes. Code: `KIT_LANES`, `KIT_SAMPLES`.
- **Instrument.** A sound source that owns its params and its lanes:
  DrumMachine, BassSynth, StabSynth and, since v2, the SP-04 sampler (which
  `CONCEPT.md` predates). Founding term.
- **Knob.** The SVG dial control for one param. It is a `role="slider"` that
  responds to drag (shift for fine) and keys (arrows, Page, Home/End). Code: `Knob`,
  `ParamSpec`.
- **Master strip (MX-01, "Main Out").** The panel with the scope, the master
  macros and the FX controls. It sits above the instruments today; [v3 spec] it moves to the
  bottom of the Deck.
- **Model plate.** The name/model heading on each panel: DR-909, SP-04,
  BL-303, CS-08, MX-01. EB-01 is the plate on the Techno graduation. These are the
  Deck's own names, not trademarks. Code: `PanelTitle`.
- **Param.** One knob-controlled value with a Deck-unique id, such as
  `cutoff`, `filter`, `drumSend` or `pad1Tune`. Code: `DeckParamId`.
- **Param registry (deck param registry).** Every knob on the Deck in one
  list, so a lesson goal or spotlight can name any of them, and a mistyped one
  fails when the lesson loads. [v3 spec] Adds `swing`, `envMod` and the level knobs.
  Code: `DECK_PARAMS`, `isDeckParamId`.
- **Room (room light).** The beat-synced club backdrop around the Deck. It is
  driven from rAF through CSS variables and never re-renders React. Code:
  `useRoomLight`.
- **Sampler (SP-04).** The four-pad sampler Instrument. See the Sampler section.
- **Scope (spectrum scope).** A 16-bar canvas spectrum in the Master strip,
  drawn from rAF reading the engine. Code: `SpectrumScope`.
- **Stab synth (CS-08).** A polyphonic chord synth with a fixed patch. It is played live
  on the on-screen keyboard or the computer keys A–K, and sequenced on the stab
  note lane. Code: `StabKeyboard`, `createStabVoices`.
- **Transport strip** [v3 spec]. The sticky bar at the top of the Deck holding
  Play/Stop, tempo, Swing, slots A–D, Copy and Clear. It replaces the transport row
  inside the Master strip. Code today: `TransportBar`.

## Patterns, lanes and time

- **Accent (drum step).** A single click cycles a step off → on → accented →
  off. An accented hit plays at gain 1; an unaccented one plays at 0.62. Code: `cycleStep`,
  `ACCENT_GAIN`, `UNACCENTED_GAIN`.
- **Accent (note step)** [v3 spec]. The 303 flag on a bass note. It adds about +4 dB
  through a gain stage with headroom, plus extra filter-envelope depth with a
  shorter decay, even at Env Mod 0. It is edited on the bass Accent row.
- **Audio clock.** Tone's transport time. "Never on the audio clock" means
  playback must not drive React state changes (see Performance rule).
- **Bank (pattern bank)** [v3 spec]. The four pattern slots A–D. `patterns`
  always holds exactly four. This is not the source bank.
- **Choke.** One lane cutting another's still-ringing sample: the closed hat
  chokes the open hat, as on a 909. Code: `CHOKES`, `voiceStep`.
- **Copy / Clear** [v3 spec]. Copy deep-copies the selected slot's lanes onto the next
  slot pressed and then selects that slot. Clear empties the selected slot. Both ask
  with an inline confirm before overwriting programming, never a browser
  dialog.
- **Drum lane.** A lane of on/off + accent steps that triggers one sample. Its
  ids are `kick`, `snare`, `closedHat`, `openHat` and `perc`. Code: `DrumLane`, `DrumLaneId`.
- **Empty slot** [v3 spec]. A slot with no step on in any lane. Pitch, length or flags left
  on off steps don't count.
- **Env Mod** [v3 spec]. The depth of the bass filter envelope, from 0 to 100% (up to about
  four octaves above Cutoff), decaying with the Decay knob. Param id
  `envMod`.
- **Lane.** One row of 16 steps in a Pattern. There are three kinds: drum lane, pad
  lane and note lane. Founding term. The UI may say "row"; code and docs say lane.
- **Live play.** Playing pads or keys by hand over the loop. It is performance
  only: it never writes to the Pattern, and [v3 spec] it is never swung. Code:
  `PadHitOrigin` (`'live' | 'sequenced'`), `createStabNoteHolds`.
- **Note lane.** A lane of note steps, with ids `bass` and `stab`. Code: `NoteLane`,
  `NoteLaneId`.
- **Note step.** A step that carries `on`, `pitch` (a MIDI number) and `length` in
  whole steps. A note is clipped where the next one starts. [v3 spec] It also gets `slide`
  and `accent`. Code: `NoteStep`, `noteEventAtStep`.
- **Pad lane.** A sampler pad's lane, with the same shape as a drum lane. Its ids are `pad1`–`pad4`.
  Code: `PadLane`, `StepLane`.
- **Pattern.** A first-class, ID'd 16-step loop holding every lane (drum, pad
  and note). Founding term. Code: `Pattern`. [v3 spec] There is one per slot.
- **Playhead.** The moving step highlight, animated from rAF reading the
  transport. [v3 spec] It stays on the straight grid under swing. Code: `usePlayhead`.
- **Playing slot** [v3 spec]. The slot the engine is sounding. It differs from the
  selected slot only while a switch is queued, and it is driven from rAF and CSS, never
  React state.
- **Quad.** A group of four steps (1–4, 5–8, 9–12, 13–16), each wearing its
  909 colour. Phone reflow [v3 spec] keeps quads whole. Code: `--quad-0`…`--quad-3`.
- **Queued switch** [v3 spec]. Pressing a slot while playing selects it at once, so the grid
  shows it, edits go to it and goals read it. The sound changes only when the
  engine reaches step 0 of the next bar. Stop clears the queue.
- **Selected slot** [v3 spec]. The slot being edited, which `activePatternId` names.
- **Slide** [v3 spec]. The 303 flag on a bass note. The gate stays open into the step
  right after the note ends. If that step holds a note, the line glides into it over
  about 60 ms without restarting the envelopes (legato). If the step is empty, the note
  ties through it and then releases.
- **Slot** [v3 spec]. One position in the pattern bank, named by its letter A–D.
- **Step.** One 16th-note cell. There are 16 per lane (`STEP_COUNT`), and each lasts
  `secondsPerStep(bpm)`, which is 15/bpm seconds.
- **Step resolution** [v3 spec]. The one pure function that decides what sounds on a
  16th: starts with accent gains, chokes, note events (accent, legato, tie), the
  swing offset, and the playing slot. The Tone callback applies its result and
  decides nothing itself. It consolidates today's `voiceStep`/`hitsAtStep` and
  `noteEventAtStep`.
- **Swing** [v3 spec]. The Transport's shuffle, from 50 to 75% (stored as 0.50–0.75).
  Every odd 16th is delayed by (swing − 0.5) × 2 × one step, so 66% is roughly a triplet feel
  and 75% is dotted. The Deck applies this offset itself and Tone's own swing stays at 0,
  because Tone's swing makes steps mis-index at 75%. Spotlight `knob:swing`.
- **Transport.** BPM (60–200, default 130), [v3 spec] swing, and play state. It wraps
  Tone's transport, the only musical clock. Play state is never persisted.
  Founding term. Code: `TransportSettings` (today `{ bpm }` only).

## Mixing and the audio path

- **FX bus.** One shared delay into a reverb, fed by per-instrument sends,
  returning into the master input upstream of the master filter. Closing that filter
  therefore dulls the tails too. Code: `FX_PARAMS`, `FxSettings`.
- **Level** [v3 spec]. A voice's channel gain: linear from 0 to about 2 (+6 dB), default 1,
  shown in dB with −∞ at 0. It sits after the accent gain and note velocity, so
  live and sequenced sound pass through it alike. Say "Level", not "volume".
- **Macro.** A Master-strip knob that works on the whole mix: **Filter** (a −12 dB/oct
  lowpass, 120 Hz–18 kHz) and **Drive** (saturation, 0–100%). Code:
  `MASTER_PARAMS`, `MasterSettings`.
- **Master bus.** Every voice → input → filter → drive → output.
- **Mixer.** The per-lane mute/solo map in ProjectState, keyed by lane id. A
  missing entry means audible and unsoloed. Code: `Mixer`, `LaneMix` (`muted`,
  `soloed`). [v3 spec] It is re-keyed by voice and adds `level`.
- **Mute / solo.** The hardware rule: if any lane is soloed, only soloed lanes play;
  solo overrides mute; several solos are allowed. Today it covers the drum and pad lanes, both sequenced
  hits and live pads. [v3 spec] It applies per voice, so bass and stab (live keys included) join it.
  Code: `audibleLaneIds`, `laneIsAudible`.
- **Neutral.** A param's resting value, at which it changes nothing: sends at 0,
  drive at 0, master filter at 18 kHz, [v3 spec] swing 50%, Env Mod 0, Level 1. Every new
  param must default to neutral, so an untouched Deck sounds exactly as it did
  before the param existed.
- **Send / return.** A send is a per-instrument level into the FX bus (`drumSend`,
  `bassSend`, `stabSend`, `samplerSend`). The return is the FX bus output back into
  the master input. Sends are tapped after mute, so a muted voice sends nothing.

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
  empty. [v3 spec] It lives in slot A, with 50% swing. Code: `createDemoPattern`.
- **Migration (migration chain).** Each schema bump adds one step that lifts vN
  to vN+1, adding fields with defaults that reproduce the old sound. Saved
  documents, share links and bundles all pass through the same chain. A corrupt or
  unknown version falls back to a fresh document. Code: `migrateProjectState`.
- **Opening deck.** What a first-time visitor gets: the demo groove, the curated
  source, empty pads and nothing earned. Code: `openingProjectState`.
- **prefs.** A reserved slot in ProjectState. It is still `{}`. [v3 spec] Layout state
  stays out of it; the curriculum expand state is session-only.
- **ProjectState.** The one versioned JSON document and the single source of
  truth. It holds `patterns`, `activePatternId`, `transport`, `instrumentSettings`,
  `sources` (metadata only), `lessonProgress`, `prefs`, `mixer`, `activeArcId` and
  `activeLessonIds`. It never holds audio. It is at v10 today; [v3 spec] v11–v14 are planned. Founding
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
  [v3 spec] It always carries all four slots. Code: `readBundle`, `BUNDLE_FILE_EXTENSION`.
- **Inheritance (held back).** When a shared beat or bundle arrives, any lesson
  its content already satisfies is held back rather than credited. It is earned only
  after the goal stops being met and the learner builds it again. This covers every arc, and
  [v3 spec] every slot. Code: `lessonsAlreadyMet`.
- **Link degradation.** A share link says plainly what it couldn't carry.
  Audio never travels, so pads arrive silent with a notice to ask for a bundle.
  [v3 spec] Over 2,000 characters, a link carries only the playing slot and says so.
  Code: `sharedAudioNotice`.
- **Preview (preview-and-confirm).** An incoming link or bundle plays in memory
  with autosave suspended. **Keep this beat** saves it; **Back to my project**
  restores the recipient's document exactly. Code: `projectWithSharedBeat`.
- **Share link (share payload).** `?p=` carrying ProjectState as JSON, then gzip, then
  base64url, kept under 2,000 characters. Recipient-owned fields (progress, prefs) are
  blanked. Code: `createShareUrl`, `readSharedBeat`, `PRACTICAL_SHARE_URL_LIMIT`.
- **Share validator.** The one check that both links and bundles pass. Every
  version bump updates it. Code: `isSharedProject`.

## Curriculum

- **Arc.** An ordered list of lessons plus its track title, blurb and finale.
  Today there are Techno (14 lessons) and Sampling (6). [v3 spec] Acid (7) is added and the order becomes
  Techno, Acid, Sampling. Founding term. Code: `CurriculumArc`, `ARCS`.
- **Capstone.** An arc's final lesson, whose goal asks for the whole arc at
  once (for example, "Your First Techno Groove"). Earning it raises the finale.
- **Completed (earned).** Completion recorded in `lessonProgress`. It is latched, so undoing
  the work never takes it back. Code: `LessonProgress.completed`,
  `detectLessonCompletion`.
- **Curriculum.** Every arc together, behind the track selector.
- **Curriculum line** [v3 spec]. The compact curriculum header: track selector,
  n/total, current lesson name, and "Path ▸" to expand the numbered path.
- **Demo rule.** The opening deck may groove, but it must never complete a lesson.
  On any lane a lesson asserts, the demo places only steps that lesson also
  wants (the open hat is the one deliberate exception). [v3 spec] No slot of the opening deck
  satisfies any lesson in any arc. It is enforced by the shipped-lesson tests.
- **Dismiss / resume / put away.** Dismiss collapses the lesson card to a
  "Resume lesson" chip and leaves the deck playable. Putting a *completed* lesson away is
  what advances the path ([v3 spec] the **Next ▸** button), so a celebration is never cut
  short. Code: `LessonProgress.dismissed`.
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
  - range: `bpmInRange` and [v3 spec] `swingInRange`;
  - observation: `paramSwept` and `chordPlayed`;
  - sampler value: `regionStartsWithin`, `regionShorterThan`, `fitTargetSet` and `padTuned`.

  Code: `GoalAssertion`, `isGoalMet`, `parseLesson`.
- **Goal context.** The curated view a goal is evaluated against: pattern, bpm,
  motion, chord, sampler, and [v3 spec] swing. It is not the whole ProjectState. Code:
  `GoalContext`, `goalContextFor`.
- **Lesson.** In-app JSON: `{ id, title, intro, spotlight[], goal[] }`. Adding
  one means a JSON file plus one line in the arc's list. Founding term. Code: `Lesson`.
- **Lesson card.** The lesson's panel on the Deck. [v3 spec] Once earned, it collapses to
  a strip of about 44px with ✓ and Next ▸.
- **Path.** The numbered row of lessons for the active arc. Every lesson can be
  entered, and the Deck is never gated. Navigation moves a marker and never touches the
  sandbox. Code: `LessonArc`, `ArcEntry`.
- **Progress chip** [v3 spec]. One assertion's progress on the lesson card (for example,
  "Kick 3/4"), shown with ✓ when met and hidden once the lesson is earned. An optional JSON
  `label` overrides the noun. Lesson completion is derived from the same progress
  function, so the two can't disagree.
- **Spotlight (spotlight target).** A `kind:id` string in lesson JSON that puts
  an amber ring on a control: `lane:`, `noteLane:`, `knob:`, `pad:`, plus the
  single targets `transport:tempo`, `keyboard:stab` and `sampler:sources`. [v3 spec] It adds
  `accentRow:bass` and `slideRow:bass`, and scrolls the first spotlit control into
  view when a lesson is entered (never on page load). Code: `SpotlightTarget`,
  `spotlightsTarget`.
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
- **Fold / fold budget** [v3 spec]. The fold is what is visible without scrolling. The v3 budget:
  at 1280×720, on a fresh project with lesson 1's card open, the bottom of the
  fifth drum lane must sit at or above 720px.
- **Issue track.** A release's ordered set of issue files, sliced from its spec.
  Not a curriculum track.
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

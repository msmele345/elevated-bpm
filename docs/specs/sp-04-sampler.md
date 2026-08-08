# Spec: SP-04 Sampler — Elevated BPM v2.0

> Status: ready for implementation
> Supersedes nothing. Extends the v1 architecture described in `CONCEPT.md` and `plans/elevated-bpm-v1.md`.
> Vocabulary follows the ubiquitous language in `CONCEPT.md`: Deck, Instrument, Pattern, Lane, Transport, ProjectState, Lesson, Arc.

---

## Problem Statement

The Deck ships with a fixed palette. A learner can program the 909 kit, play the bass and stabs, and shape the master bus — but every sound they make is a sound the app chose for them. Two things follow from that.

First, the groove has a ceiling. Once the curriculum arc is finished, a learner has built *the* techno groove the app teaches, and the only way to make something that sounds like *theirs* is to change patterns, not sounds. Techno is a genre defined substantially by sound selection, and the Deck currently teaches none of it.

Second, and more important for a learning product: sampling is a core techno production skill that the Deck cannot teach at all. Chopping a break, finding a hit inside a longer recording, trimming it tight, tuning it, and locking it to the grid are foundational craft. A learner who finishes the arc has learned rhythm, bass, sound design, and stabs, and has not been shown the technique that most defines how the genre is actually made.

The user's own framing was "upload tracks to play with the sounds from the deck" — they want their own audio in the instrument, alongside the kit, not instead of it.

## Solution

A fourth Instrument on the Deck: **SP-04**, a four-pad sampler.

The learner brings audio in — from a file, by dragging it onto the Deck, or by recording straight from their microphone. That audio becomes a **source**. They open a source in an editor, find a moment inside it, and trim a **region** down to the sound they want. That region lands on a **pad**, and from there it behaves like every other sound on the Deck: sixteen steps, accents, mute and solo, through the master bus. Pads are also live-playable on the number keys, so a chop can be finger-drummed over a running loop.

Because the region is a reference into the source rather than a copy, chops stay re-editable — pull one edge later, or cut three different pads out of the same break without uploading it three times.

The curriculum grows with the instrument. The Deck's single path becomes a **multi-track curriculum**: the fourteen-lesson techno Arc stays exactly as it is and keeps its graduation moment, and a new Sampling Arc teaches loading, finding a chop, trimming, locking to the grid, tuning, and building a kit from your own sounds. That arc teaches against a curated source that ships with the app, so a learner's first chop is one click away and the lessons can be specific about what a good chop looks like.

Sharing tells the truth about what it can do. A share link carries the pattern and the programming; uploaded audio is two orders of magnitude too large for a URL, so pads arrive silent with a clear explanation. For a faithful copy there is a bundle file that carries the rendered chops.

## User Stories

### Getting audio in

1. As a producer, I want to load an audio file from my computer with a file picker, so that I can use sounds I already have without leaving the Deck.
2. As a producer, I want to drag an audio file straight onto a pad, so that loading a sound is one gesture instead of a dialog.
3. As a producer, I want to record audio directly from my microphone, so that I can sample my own voice, a tap on the desk, or a hardware synth without any other software.
4. As a producer, I want to hear and see that recording is in progress with an obvious stop control, so that I am never unsure whether the app is listening.
5. As a producer, I want a recording I just made to become a source exactly like an uploaded file, so that everything downstream — chopping, tuning, sequencing — works identically regardless of where the audio came from.
6. As a privacy-conscious user, I want the microphone to be requested only when I choose to record and released when I stop, so that granting permission once does not mean being listened to continuously.
7. As a beginner, I want a curated source already installed the first time I open the Deck, so that I can make my first chop immediately without hunting for a file.
8. As a producer, I want to see all my loaded sources in one list, so that I know what material I have to work with.

### Chopping

9. As a producer, I want to open a source in an editor and see its waveform, so that I can visually locate the part I want.
10. As a producer, I want to drag the start and end of a region, so that trimming feels direct.
11. As a producer, I want to jump the region edges to detected transients, so that I can land exactly on a hit instead of hunting frame by frame.
12. As a producer, I want to audition the current region without committing it, so that I can judge a chop by ear before assigning it.
13. As a producer, I want my region to be assigned to a specific pad, so that I control which sound sits where.
14. As a producer, I want to cut several different regions from one source onto different pads, so that I can build a kit out of a single break without loading it repeatedly.
15. As a producer, I want to reopen a pad's region later and move its edges, so that a chop that turned out slightly wrong is a small correction rather than a redo.
16. As a producer, I want the editor to show me where the detected transients are, so that the structure of the audio is visible, not just its shape.

### Making it musical

17. As a producer, I want a Tune control on each pad, so that I can pitch a chop to sit with the rest of the groove.
18. As a producer, I want a pad to play as a one-shot by default, so that it behaves like every other percussive voice on the Deck.
19. As a producer, I want to optionally declare that a chop should fill a given number of steps, so that a rhythmic loop locks to the grid instead of drifting against it.
20. As a producer, I want fitting a chop to the grid to change its pitch the way pitching a record does, so that the result is predictable and musical rather than processed-sounding.
21. As a producer, I want to see what fitting did to the chop's speed and pitch, so that the tradeoff is visible rather than mysterious.

### Sequencing

22. As a producer, I want to program a pad across sixteen steps by clicking, so that sampling uses the same sequencing I already learned.
23. As a producer, I want to accent individual pad steps, so that my chops have the same dynamics the drum lanes have.
24. As a producer, I want pads to mute and solo like every other lane, so that I can audition parts of my groove while building.
25. As a producer, I want pads to run through the master filter and drive, so that the macro knobs shape my whole mix including my own sounds.
26. As a producer, I want pad hits to stay locked to the same clock as the drums, bass, and stabs, so that nothing drifts.

### Playing live

27. As a producer, I want to play the pads from the number keys, so that I can finger-drum a chop over a running loop.
28. As a producer, I want the key I press to match the number printed on the pad, so that there is nothing to memorize.
29. As a producer, I want to play pads and stabs at the same time without the keys interfering, so that I can perform with both hands.
30. As a producer, I want live pad hits to leave my programmed pattern completely untouched, so that I can jam freely without any risk of damaging work I have not saved.
31. As a producer, I want a pad to light up when it sounds — whether I played it or the sequencer did — so that I can see what is making noise.
32. As a producer, I want typing in a text field to never trigger a pad, so that the Deck does not fight me when I am entering text.

### Persistence and recovery

33. As a returning user, I want my chops, tuning, and pad programming to be exactly as I left them after a reload, so that my work is never lost.
34. As a returning user, I want the Deck to be playable immediately on load rather than stalling to process audio, so that the first-click promise survives the sampler.
35. As a producer, I want the app to ask the browser to protect my uploaded audio, so that my own sounds are as durable as the browser allows.
36. As a producer, I want a pad whose audio the browser has cleared to keep its name and its programming and offer to relink, so that losing a file costs me one click rather than my whole beat.
37. As a producer, I want a pad to keep working when only its original source has been cleared, so that losing re-editability does not mean losing the sound.
38. As a producer, I want the Deck to load normally when audio is missing rather than failing, so that a storage problem is never a broken app.
39. As a producer, I want to delete a source I no longer need, so that I can reclaim space.
40. As a producer, I want to be warned which pads use a source before I delete it, so that I understand the consequence before it happens.
41. As a producer, I want pads that used a deleted source to keep sounding, so that housekeeping never silences my beat.

### Sharing

42. As a producer, I want to share a beat that uses my own sounds and have the link still work, so that sharing never simply fails.
43. As a recipient, I want to be told plainly that a shared beat used uploaded sounds that could not travel, so that I understand why pads are silent instead of assuming the app is broken.
44. As a recipient, I want the shared beat's pad programming to arrive intact, so that I can load my own sounds into it and hear the arrangement.
45. As a producer, I want to export a bundle file that reproduces my beat exactly, so that I can send a friend the real thing.
46. As a recipient, I want to open a bundle and get the beat with all its sounds, so that a bundle is worth the extra step over a link.
47. As a recipient, I want opening a bundle or a link to never silently destroy my own saved project, so that trying someone else's beat is safe.
48. As a producer, I want the bundle to stay a reasonable size, so that it is actually sendable.

### Learning

49. As a learner, I want a separate Sampling arc rather than more lessons bolted onto the techno path, so that finishing the techno curriculum still means something.
50. As a learner, I want to see both curriculum paths and my progress on each, so that I know what is available and where I am.
51. As a learner, I want to switch between curriculum paths without losing my place in either, so that I can move between them freely.
52. As a learner, I want sampling lessons that teach loading, finding a chop, trimming, locking to the grid, tuning, and building a kit, so that the arc covers the actual craft.
53. As a learner, I want lessons taught against a source the app knows, so that the guidance can be specific rather than vague.
54. As a learner, I want my sampling progress to be auto-detected and celebrated like every other lesson, so that the two arcs feel like one product.
55. As a learner, I want the sampler to be usable before and during the curriculum, so that learning is never a gate on the instrument.
56. As a learner, I want the sampler to arrive with empty pads, so that every sampling lesson is something I get to do rather than something already done for me.
57. As a lesson author, I want to add a sampling lesson by writing JSON, so that curriculum work does not require code.

### Accessibility

58. As a keyboard-only user, I want to skip past the sampler panel in a few keystrokes, so that the Deck does not become harder to navigate as it grows.
59. As a keyboard-only user, I want to set a region's start and end entirely from the keyboard, so that chopping does not require a mouse.
60. As a keyboard-only user, I want to jump between transients by key, so that finding a hit is as fast for me as scanning a waveform is for a sighted user.
61. As a screen-reader user, I want each region edge announced with its timecode and its position among the detected onsets, so that I can navigate the audio by structure.
62. As a keyboard user, I want the editor's keys to work only while I am in the editor, so that the rest of the Deck keeps behaving exactly as it did.
63. As a keyboard user, I want pressing Space on a focused button to do only what that button does, so that no shortcut ever double-fires.
64. As a screen-reader user, I want the sampler panel to be titled by a real heading, so that it appears in the document outline like every other panel.
65. As a keyboard user, I want visible focus on every sampler control, so that I always know where I am.

### Not breaking what exists

66. As a returning user, I want my existing saved project to migrate cleanly and keep my earned lessons and my beat, so that upgrading costs me nothing.
67. As a producer, I want the 909 kit, bass, and stabs to behave exactly as before, so that the new instrument is an addition and not a disturbance.
68. As a producer, I want a knob drag or a pad hit to never cause an audio glitch or a dropped frame, so that the Deck stays a performance instrument as it grows.

### Limits and failure

69. As a producer, I want to be told immediately that a file is too large or too long, so that I am not left waiting on something that was never going to work.
70. As a producer, I want the size and duration limits stated where I load audio, so that I know the rules before I hit one.
71. As a producer, I want a file the browser cannot decode to produce a clear explanation, so that I understand the file is the problem rather than the app.
72. As a producer, I want any rejected or failed load to leave my project exactly as it was, so that experimenting with files is never risky.
73. As a producer, I want the app to try to make room by discarding original sources before it tells me storage is full, so that I am only asked to give something up when it is genuinely necessary.
74. As a producer, I want to be told which pads are affected when storage really is full, so that I can make an informed choice about what to remove.
75. As a producer, I want my pads to keep sounding even when the app has discarded sources to reclaim space, so that housekeeping is never audible.

## Implementation Decisions

### Instrument model

- SP-04 is a new **Instrument** in the domain sense, alongside DrumMachine, BassSynth, and StabSynth. It gets its own panel, its own section registration, and its own lane id space.
- `DrumLaneId` and the kit lane registry are **frozen**. The sampler introduces a separate closed union of four pad ids. Nothing in the existing kit, curriculum, share validation, or migration path changes shape as a result.
- Pad lanes are **drum-shaped**: on/off plus accent, sixteen steps. They reuse the existing step row component, the step-cycling rule (off → on → accented → off), the accent velocity model in the hit-voicing layer, and the mixer's mute/solo resolution unchanged.
- Pads are numbered **1–4** rather than lettered, so the pad's printed label is the key that plays it.
- Pitch is **per pad**, not per step, expressed as a Tune control driving playback rate. Per-step pitch is explicitly deferred.

### Source and region model

- A **source** is uploaded or recorded audio, stored once. A **region** is a reference into a source: source id, start time, and duration. A pad holds a region, not a copy.
- One source can back multiple pads. Editing a pad's region never mutates the source.
- Each pad optionally carries a **fit-to-steps** target. When set, playback rate is derived as region duration over target duration; pitch moves with it. When unset, the pad is a one-shot at its Tune rate. Both are the same arithmetic — there is no time-stretching and no pitch-independent processing anywhere in this feature.
- Tune and fit compose into a single effective playback rate.

### Storage

- The `ProjectState` document advances to **v9**, with a v8 → v9 migration that defaults sampler settings the same way the master bus macros were defaulted at v7. (This spec originally claimed v8; EB2-02 ships the FX bus at v8 and blocks this slice, so the sampler follows it.) The document gains the sampler's pad state (region reference, tune, fit target, name) and the active curriculum arc id.
- `ProjectState` continues to hold **no binary data**. It stores identifiers only, so it stays JSON, stays diffable, stays migratable, and stays cheap to autosave.
- Audio lives in a **separate object store** in the same IndexedDB database, which advances its own version. That store is deliberately two-part, and the halves have different value:
  - **Slices** — the rendered audio for each pad's committed region. Small. Required to make sound. Treated as precious.
  - **Sources** — the original uploaded or recorded audio. Large. Required only to re-edit a region. Treated as expendable and dropped first under storage pressure.
- The autosave path is unchanged: it continues to write the whole `ProjectState` document on a trailing debounce, and that document remains small because audio is not in it. Audio is written once, at upload or commit, outside the autosave path.
- `navigator.storage.persist()` is requested at first upload — the first moment there is user-created audio worth protecting.

### Memory

Decoding happens at **two different qualities**, because the editor and the renderer need different things.

- **Analysis decode** — low sample rate, mono, produced by decoding into an offline audio context at a reduced rate. This is what the waveform, onset detection, and scrubbing read. A waveform does not need full bandwidth and neither does onset detection, so a six-minute source costs roughly **16 MB** here rather than 127 MB. This buffer is held **only while the source's editor is open** and released when it closes.
- **Render decode** — full rate, full channels, used solely to render a committed region into a slice. It is **transient**: acquired at commit, released immediately after the slice is written.
- Committing a region **renders and persists a slice**. Playback and app startup touch only slices.
- This is a deliberate consequence of the storage split: rebuilding slices from sources on load would put a full-length decode on the startup path, which would break the Deck's first-click promise.
- Decoding is real I/O and is therefore an **injected dependency**, following the existing pattern where the autosaver is constructed with its save function. Onset detection, slice geometry, and rate math remain pure functions over buffer-shaped data.

The transient render decode is the feature's peak memory moment, and it is the reason the source duration cap below exists.

### Limits and failure handling

Incoming audio is gated **before any decode**, by two checks in order:

1. **File size**, read directly off the file — instant, and rejects absurd input with zero work.
2. **Duration**, probed from an audio element's metadata via an object URL — this yields duration *without decoding*, which is the gate that actually matters.

Duration is the gate that matters because it is the **only lever on peak memory**. Decoding preserves the file's channel count, so downmixing cannot reduce the spike; peak is duration × sample rate × channels × 4 bytes. Rendering slices in mono would save storage but would not help here.

| Limit | Value | Why |
|---|---|---|
| Source duration | **6 minutes** | ~127 MB peak render decode. Accepts essentially any full track, which is the stated use case. Rejects DJ mixes and long sets. |
| Source file size | **50 MB** | A cheap first gate that costs nothing to apply. |

Both limits are stated to the user *before* they wait on anything, and a rejected file leaves the project completely untouched.

**Formats are not allowlisted.** The app attempts the decode and reports what happened — the browser is the authority on what it can play, and an allowlist would only go stale. A file extension check is used solely to produce a better error message, never to refuse a file the browser could have decoded.

Failure behavior follows the pattern already established for malformed share links: a dismissible alert that explains the problem, with the user's project left open and unharmed. This applies to an oversized file, an over-length file, a decode rejection, and a failed recording alike.

**Quota exhaustion has a designed answer rather than an error message.** Because sources are already declared expendable, a failed write triggers: evict sources, retry, and only if the write still fails tell the user plainly — naming which pads are affected — that there is not enough room. Slices are never evicted to make space, because slices are what make sound.

### Missing audio

Missing audio is a modelled state, not an error path. It must exist regardless of storage behavior, because share links produce it by design.

| Condition | Pad behavior |
|---|---|
| Slice present, source present | Fully functional |
| Slice present, source missing | Sounds normally; re-chop unavailable, and says so |
| Slice missing | Silent; keeps its name, tune, fit, and programming; offers relink |

- Deleting a source is permitted, preceded by a warning naming the pads that use it. Those pads continue to sound.

### Editor

- Region selection is a **two-thumb slider**. Each edge is an accessible slider control built on the established knob pattern: arrow keys nudge fine, up/down nudge coarse, Home and End park at the source's bounds, and each edge's range is bounded by the other.
- Each edge announces its **timecode and its position within the detected onsets**.
- **Onset detection** is pure math over decoded samples, sitting in the model layer next to the existing spectrum and lighting math. It is not a nicety — it is what makes the editor operable without sight, because a waveform is a visual proxy for something already audible.
- Bracket keys jump between onsets. **Enter auditions the region. Space is never bound**, because Space natively activates focused buttons and the Deck has roughly 160 of them.
- All editor keys are **scoped to focus**. No new global key bindings are introduced.
- The existing global letter-key guard that keeps stab notes out of text fields is generalized to cover digits and to treat the region editor as a control that claims keys, so chopping never fires a stab or a pad.
- The waveform drawing is decorative to assistive technology; the slider controls carry all semantics. This mirrors how the knob's SVG is handled.

### Live play

- Pads are live-playable on digit keys 1–4 via a global key listener, following the stab keyboard's existing source-aware hold model so a pad released by one input is not cut short by another.
- **Live play is performance only.** A pad hit sounds and lights; it never writes to the Pattern. This matches the contract the stab keyboard already sets, keeps programming and performing separate, and avoids introducing record-arm state, quantization rules, and an undo model the app does not have.
- Pad lighting follows the audio clock through the existing animation-frame path, never through React state.

### Sharing

- Share links are unchanged in mechanism. The payload carries pad programming, tune, and fit — everything except the audio.
- On opening a link whose pads reference audio, the recipient sees an explicit notice naming how many sounds could not travel. The message directs them to **ask the sender for a bundle**; it does not offer to fetch one, because with no backend there is nothing to fetch from.
- A **bundle** is a file containing the project document plus the **rendered slices** — not sources. Three chops totalling under two seconds must not ship a multi-megabyte source file. Because slices are already persisted, bundle export is largely assembly rather than processing.
- The bundle is **not a new format**. It is the share payload with a different carrier: the same document serialization, the same gzip compression, the same base64 encoding, and the same validation and typed error codes the share link already uses — with slice audio included, and written to a file instead of a query string. One serializer, one validator, one set of error messages, and no new runtime dependency.

  | | Carrier | Audio |
  |---|---|---|
  | Link | query string | dropped — the URL ceiling makes it impossible |
  | Bundle | file | included |

  Expected size for four one-second stereo slices is roughly 750–850 KB: base64 inflates by a third, and gzip largely recovers it because base64-encoded PCM has low per-character entropy. The accepted cost of this choice is **opacity** — a bundle cannot be opened and inspected by a human the way an archive could, so a failed import cannot be diagnosed by looking inside it. Import validation must therefore be specific about *what* was wrong, since that message is the only diagnostic anyone will get.
- Opening a bundle uses the same preview-and-confirm flow the share link already uses: the incoming beat is previewed with autosave suspended, and the recipient's own project is only replaced on an explicit keep.

### Curriculum

- The curriculum becomes **multi-track**, which is the deferred v2 item named in `CONCEPT.md`. The fourteen-lesson techno Arc is untouched and keeps its graduation moment as a real ending.
- The arc navigation rules are already parameterized by arc, so multi-track support is primarily a matter of registering a second arc, tracking which arc is active in `ProjectState`, and extending the arc UI with a track selector.
- The Sampling Arc is roughly six lessons: load a sound, find the chop, trim it tight, fit a break to the grid, tune a pad, build your own kit.
- Sampling lesson goals are **mechanical assertions over `ProjectState`**, consistent with every existing goal type. Their specificity comes from the **curated source that ships with the app** — because the app knows that file, a goal can assert that a region starts within a particular window and mean something musical by it.
- New goal types are declarative and JSON-authored like the existing vocabulary. The lesson parser is extended to reject goals naming a pad that does not exist or a region window outside the shipped source, consistent with how it already rejects unknown lanes and unreachable counts.
- First run: the sampler panel is **visible with empty pads**, and the curated source is pre-installed. This satisfies the demo rule established in Phase 4 and reinforced in Phase 7 — the opening Deck may groove, but it must never do a lesson's work. Pre-chopped pads would arrive with the first three sampling lessons already earned.

### Accessibility and performance guardrails

- The sampler must be registered in the Deck's section registry, which is the single source of truth for skip links, section ids, and headings. The accessibility contract suite fails on any block of more than eight controls without a skip link, so this is enforced rather than remembered.
- Every sampler control carries a non-empty accessible name, enforced by the existing contract suite.
- The panel is titled by a real heading that its section is labelled by.
- Pointer capture on pads and region handles must follow the rule established in Phase 9: perform the interaction first, then attempt capture inside a guard. Capture is an enhancement; failing to acquire it must never cost the note or the drag.
- Sampler components and their props follow the memoization discipline established in Phase 9 — controls name themselves in their callbacks so the Deck hands down stable handlers, and no lane re-renders because a sibling changed.

### Sequencing of work

SP-04 ships as v2.0. **Song mode is v2.1** and is not part of this spec. The sampler was sequenced first because it lands entirely inside architecture v1 already proved — sixteen steps, drum-shaped lanes, one pattern — whereas song mode introduces a new structural axis.

## Testing Decisions

### What makes a good test here

A good test in this codebase asserts **external behavior through the highest available seam** and says something a user or a maintainer would care about. It does not assert that a particular function was called, that state has a particular internal shape, or that a component rendered a particular element tree. The existing suite is a strong model: it checks that solo overrides mute, that a shared link does not overwrite the recipient's project, that a lane with unchanged props does not render — behavioral claims, not implementation snapshots.

Tests should also encode the *reason* a rule exists where that reason is load-bearing, in the manner of the existing arc tests that assert the shipped demo cannot satisfy a shipped lesson.

### Seams

No new seam types are introduced. All six are in active use.

**1. Pure model functions.** Prior art: the spectrum, knob taper, mixer, note, and room-light math. Carries onset detection, slice geometry, playback-rate math for tune and fit-to-steps, region clamping against source bounds, pad settings clamping and repair, the v8 document and its v7 → v8 migration, the derivation of the three pad audio states, and the intake gate — that size and duration limits accept and reject the right inputs at their boundaries. This is where the majority of the feature's logic should live and be tested, because it is where it can be tested without a browser.

**2. Storage round-trip against a fake IndexedDB.** Prior art: the project store suite. Carries the two-part sample store — that slices and sources round-trip, that a project survives losing a source, that a project survives losing a slice, and that dangling references resolve to the modelled missing states rather than throwing. Also carries the quota policy: a write that exceeds quota evicts sources and retries, never evicts a slice, and reports which pads are affected only once eviction has genuinely failed to make room.

**3. Mounted deck in jsdom with the audio engine mocked.** Prior art: the sharing workflow suite. This is the **headline seam** and the one that proves the feature. Carries: loading a file through the real file input and hearing it become a pad; committing a region and having it persist and survive a reload; a missing slice presenting a relink affordance that restores the pad; a shared link degrading with a visible notice while preserving pad programming; bundle export and import including the preview-and-confirm flow; live pad keys sounding without mutating the Pattern; and text-field focus suppressing pad keys. It also carries the failure surfaces, which are user-visible behavior rather than plumbing: an oversized file, an over-length file, and an undecodable file each produce a specific dismissible alert and leave the project unchanged.

Because the bundle reuses the share pipeline, its round-trip and its rejection cases extend the existing share tests rather than forming a new suite — including that a bundle carrying slices reproduces the beat exactly, and that a truncated or version-mismatched bundle is refused with a message specific enough to act on. That specificity is load-bearing: the format is opaque, so the error message is the only diagnostic a user will ever have.

**4. Shipped-arc contract.** Prior art: the existing curriculum suite, which synthesizes a known-good goal context per lesson and then breaks each assertion in turn. This is **generalized to iterate every registered arc** rather than the single techno arc. It must continue to assert that the opening Deck satisfies no shipped lesson — now including that the pre-installed curated source with empty pads earns nothing in the Sampling Arc.

**5. Accessibility contract.** Prior art: the existing deck accessibility suite. Largely automatic once the sampler is registered as a section — accessible names, skip-link presence, heading-based labelling, and the bypass threshold are all already enforced generically. Adds explicit coverage of the region handles' slider semantics and their announced value text.

**6. Component-level, strictly narrow.** Prior art: the knob and stab keyboard suites, both of which exist because Phase 9 found real pointer-capture bugs that only a component test caught. Limited to exactly that class: a pad and a region handle whose pointer cannot be captured must still sound and still drag.

### Deliberate coverage gaps

Microphone capture plumbing is not tested. `getUserMedia` and `MediaRecorder` are placed behind an injected adapter, and testing stops at the boundary: a completed recording becomes a source indistinguishable from an uploaded file. The browser machinery itself is left to manual verification. This is a conscious trade, recorded here so it is not mistaken for an oversight.

Real audio decoding is likewise not exercised. The decoder is injected, and tests supply buffer-shaped fakes.

### Verification beyond unit tests

Consistent with every prior phase, acceptance should include in-browser verification of the things unit tests cannot claim: that a chop is audibly locked to the grid, that closing the editor actually releases memory, that the Deck remains playable on first click with pads loaded, and that a knob drag or pad hit during playback causes neither an audio dropout nor a dropped frame.

## Out of Scope

- **Song mode.** Chaining Patterns into an arrangement is v2.1 and unaffected by this work beyond keeping Patterns first-class, which they already are.
- **Live recording / step recording.** Pads are performance-only, matching the stab keyboard. If live recording is ever built it should apply to pads and stabs together, with its own arm state, quantization rules, and undo model.
- **Per-step pitch on pads.** Pitch is per pad in this spec.
- **Pitch-preserving time-stretch.** All rate changes move pitch with them. No granular or phase-vocoder processing.
- **Automatic tempo detection** of uploaded sources.
- **Loading audio from a URL.** Cross-origin restrictions make it fail more often than it works, and the failures are opaque.
- **Hosting user audio on a server.** The app remains static-hosted with no backend. This is what makes link degradation necessary rather than optional.
- **Accounts and sync.** Still deferred.
- **More than four pads**, and user-added pads. The pad set is fixed and closed.
- **Swapping the shipped 909 kit samples.** The sampler adds sounds; it does not replace the kit.
- **Sources longer than six minutes.** DJ mixes and long live sets are refused at intake. Supporting them means solving partial decoding, which is a substantially larger piece of work than the rest of this feature.
- **Inspectable or third-party-readable bundle files.** The bundle is an app-private format, not an interchange format.
- **Mobile horizontal reflow.** The Deck already scrolls horizontally below roughly 543px, and the sampler makes it worse. This predates the feature, is a layout concern rather than a sampler concern, and is called out in Further Notes rather than folded in here.

## Further Notes

### Open decisions to resolve during implementation

1. **Copyright framing on bundle export.** Local-only sampling is the user's own business, but the bundle makes redistribution a product feature. Whether the app says anything about this, and where, is a product call. It affects copy and placement only — no architecture depends on it.

Bundle container format and intake limits were previously open here and are now resolved in Implementation Decisions above.

### Notes on rationale

**Why the storage split is not premature optimization.** It was derived from a number, not a preference. A six-minute stereo track decodes to roughly 127 MB of audio buffer while its compressed file is around 6 MB. Holding decoded sources resident across four pads is a quarter of a gigabyte, which is enough to have the tab terminated on a phone — on a product that ships a mobile layout. Rendering and persisting slices is what keeps both memory and startup flat regardless of how long the user's sources are.

**Why link degradation is not a limitation to be engineered around.** A 180 KB sample is roughly 240 KB when base64-encoded, and audio is already compressed so gzip buys effectively nothing. The practical URL ceiling is 2,000 characters. This is a two-orders-of-magnitude gap, not a budget to tune. Any design that promises faithful links without a server is promising something it cannot deliver.

**Why the duration cap is where it is, and why it is the only knob.** Decoding preserves a file's channel count, so a source cannot be downmixed on the way in — peak memory is duration × sample rate × channels × 4 bytes, and duration is the only term the app controls. Six minutes puts the transient render decode at roughly 127 MB. Three minutes would be comfortably safe on any phone but would refuse most full techno tracks, which is precisely the material the feature was asked for. Ten minutes would accept DJ mixes at roughly 211 MB and a real risk of the tab being killed at commit — and an out-of-memory kill cannot be caught, explained, or recovered from, so it is the one failure mode worth designing away rather than handling. Six minutes takes the stated use case and leaves the unbounded one out.

**Why the editor got a second, cheaper decode.** The original design held one decoded source while the editor was open, which put a six-minute track at 127 MB of residency for the entire time a user was chopping. But a waveform and an onset detector do not need full bandwidth. Decoding into a reduced-rate mono offline context serves both at roughly 16 MB, leaving the expensive full-quality decode confined to the instant a region is committed. The editor is where a user spends their time; the renderer is where they spend a moment. Sizing each for what it actually needs is what makes a full-length source workable at all.

**Why the bundle is not an archive.** An archive would be inspectable, which is a real advantage when an import fails — a user could open it and see their beat is still in there. It was rejected anyway, because the share pipeline already serializes, compresses, encodes, validates, and reports typed errors on exactly this document, and all of that is already under test. Reusing it means the bundle inherits a proven path instead of standing up a parallel one. The cost is accepted explicitly: because nobody can look inside a bundle, import errors must be specific enough to act on without looking.

**Why onset detection is scoped as accessibility work rather than a feature.** Every other visual affordance on the Deck describes something that has a non-visual equivalent — a knob has a value, a step has a state. A waveform describes audio, which the user can already hear. Making the editor navigable by structure rather than by pixel is what makes it operable without sight, and it makes chopping faster for everyone else as a side effect.

**Why the demo rule matters here.** Phase 4 established, and Phase 7 reinforced at some cost, that the opening Deck must never do a lesson's work for the user. The shipped demo groove gave up its backbeat clap for exactly this reason. Pre-chopping the curated source across the pads would sound wonderful on first play and would arrive with the first several sampling lessons already earned. Empty pads plus a pre-installed source is the version of "playable from the first click" that does not spend the curriculum to get there.

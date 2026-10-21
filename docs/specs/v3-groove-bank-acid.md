# Spec: Groove, Bank & Acid — Elevated BPM v3.0

> Status: ready for implementation
> Source: `docs/v3_brainstorming.md`, "If I were picking the next track", items 1, 2, 4 and 5. Item 3 (export) is not part of this release.
> Decisions settled in a grilling session on 2026-10-17. Extends the architecture in `CONCEPT.md`, `plans/elevated-bpm-v1.md` and `docs/specs/sp-04-sampler.md`.
> Vocabulary follows `CONCEPT.md`: Deck, Instrument, Pattern, Lane, Transport, ProjectState, Lesson, Arc. New terms are defined under "Vocabulary" below.

---

## Problem Statement

The Deck plays and teaches techno, but five problems stand between a learner and the groovebox the product promises.

**The groove is stiff and unbalanced.** Every 16th lands dead on the grid. Swing is in the Transport domain model but was never built, so nothing on the Deck can shuffle. There is also no way to set one sound louder than another. Mute and solo exist, but the "per-track volume" that v1 promised doesn't. A learner can't sit the hats under the kick or bring the bass up, and the bass and stab have no mixer controls at all.

**The instrument starts below the fold.** The app is meant to be playable from the first click, but on a fresh load at 1280×720 the first drum step is at y≈1,083 on a page about 3,300px tall. Above it sit:

- a share block (122px)
- the curriculum path (153px)
- the lesson card (126px)
- the 476px Master strip

A new visitor sees controls for sharing, a curriculum and a mix bus before seeing the instrument. On a phone the page is 503px wide in a 390px viewport, so it scrolls sideways (open since Phase 9, WCAG 1.4.10).

**A groove is one loop forever.** A learner who builds a groove can't make a variation, a breakdown or a drop. The document has held a list of Patterns since v1, but there's no way to reach a second one.

**The bass is a 303 in name only.** It has pitch and length but no slide and no accent. The filter has no envelope, so a note can't "wow". Acid, the sound the 303 is famous for, can't be made on the Deck, so the curriculum can't teach it.

**Lessons are pass/fail.** A learner working on a goal can't tell whether they're one step away or nowhere near. This matters most in capstones that check five things at once: if a capstone stays incomplete, the learner has no idea which part is missing.

## Solution

v3 ships four strands.

**1. Feel.** A **Swing** knob sits next to tempo: 50% (straight) to 75% (heavy shuffle), MPC-style, on 16ths. It shuffles every sequenced voice. Every voice on the Deck gets a **Level** knob next to its mute and solo: five drum lanes, four sampler pads, bass and stab. Bass and stab gain mute and solo too, so one mixer rule covers the whole Deck.

**2. Playable from the first click.** The top of the Deck is restructured:

- Share, Export and Open fold into a header **Share** menu.
- The curriculum path collapses to one line that expands on request.
- A sticky **transport strip** (Play, BPM, Swing, the pattern bank) stays on screen while the page scrolls.
- The full Master strip (scope, macros, FX) moves below the instruments.

A completed lesson shrinks to a slim "next" strip. A lesson that spotlights a control off-screen scrolls it into view when it opens. An empty sampler compacts. Very wide screens get two columns. On phones every lane wraps into two rows of 8, and nothing scrolls sideways down to 320px. A Playwright suite in CI holds all of this in place.

The guarantee: **on a fresh load at 1280×720, Play, BPM and all five drum lanes are visible without scrolling.**

**3. The pattern bank.** Four slots, **A–D**, each holding one Pattern's programming.

- While playing, pressing a slot queues it, and it takes over at the end of the bar, like hardware. While stopped, the switch is immediate.
- **Copy** makes a variation in two clicks. **Clear** starts a slot over.
- The sound of the Deck (tempo, swing, mixer, patches) doesn't change between slots.
- Share links carry the bank. If the link would be too long, it carries only the playing pattern and says so; bundles always carry the full bank.

**4. Acid.** The bass gets real 303 behaviour:

- **Accent** makes a note louder and gives it a stronger, faster filter "wow".
- **Slide** glides a note into the next one without restarting it.
- An **Env Mod** knob opens the filter on every note.

Accent and slide are edited in two thin rows under the bass lane. A seven-lesson **Acid** Arc teaches it, from a busy line of sixteenths to a shuffled, accented, sliding acid line. Every lesson on the Deck gains **progress chips**, one per goal, such as "Kick 3/4 · 1 extra" or "Swing 50% → 54–70%". Learners can see how close they are without being told the answer.

Every new setting defaults to the sound the Deck makes today: swing 50%, level 0 dB, Env Mod 0, slide and accent off, slots B–D empty. An upgraded project sounds exactly as its owner left it.

## User Stories

### Swing

1. As a producer, I want a Swing knob next to the tempo control, so that I can give a straight loop a shuffle without leaving the transport.
2. As a producer, I want swing shown as a percentage from 50% (straight) to 75% (heavy), so that the number matches what I'd see on an MPC or a TR-8.
3. As a producer, I want swing to delay only the off-beat 16ths, so that the downbeats stay locked while the groove loosens.
4. As a producer, I want swing to move every sequenced voice together (drums, pads, bass and stab), so that the whole groove shuffles as one and the bass never drifts from the kick.
5. As a performer, I want live-played keys and pads to stay unswung, so that what I play by hand lands exactly when I play it.
6. As a producer, I want to sweep swing while the loop plays and hear it change immediately, so that I can find the feel by ear.
7. As a keyboard user, I want the Swing knob to work like every other knob (arrows, Page keys, Home/End), so that I can set it without a mouse.
8. As a returning user, I want my saved project to open at 50% swing, so that upgrading never changes how my beat sounds.
9. As a producer, I want swing saved with my project and carried in share links and bundles, so that whoever I send it to hears the same groove.
10. As a learner, I want swing to stay steady at heavy settings, with no step firing on the wrong 16th, so that I can trust what I hear at 75%.

### Level and mixer

11. As a producer, I want a Level knob on every drum lane, so that I can sit the hats under the kick.
12. As a producer, I want a Level knob on every sampler pad lane, so that a loud chop doesn't swamp the kit.
13. As a producer, I want a Level knob on the bass and the stab, so that I can balance the melodic parts against the drums.
14. As a producer, I want Level shown in dB, from silent (−∞) to +6 dB with 0 dB as the default, so that I'm working in the units every mixer uses.
15. As a producer, I want each Level knob to sit next to that sound's mute and solo, so that the controls for one sound are in one place.
16. As a producer, I want mute and solo on the bass and the stab, so that I can hear the kick and bass alone or drop the stab out.
17. As a producer, I want solo to work the same across all eleven voices (multiple solos allowed, solo overriding mute), so that the mixer has one rule I can learn once.
18. As a performer, I want a voice's Level, mute and solo to apply to my live playing as well as its sequenced steps, as muted pads already do, so that the mixer controls a whole voice and not half of it.
19. As a producer, I want accents to stay louder than unaccented steps at any Level, so that turning a lane down keeps its dynamics.
20. As a producer, I want Level changes to ramp smoothly while playing, so that moving a knob never clicks.
21. As a returning user, I want every Level to open at 0 dB, so that my upgraded project sounds identical.
22. As a producer, I want levels, mutes and solos carried in share links and bundles, so that the recipient hears my mix.
23. As a lesson author, I want every Level knob to be a named knob the curriculum can spotlight and observe, so that a future mixing lesson needs only JSON.

### Playable from the first click

24. As a first-time visitor on a 1280×720 laptop, I want Play, the tempo and all five drum lanes visible without scrolling, so that I can make a beat before reading anything.
25. As a producer, I want Play, BPM, Swing and the pattern bank in a strip that stays at the top of the screen as I scroll, so that I can start, stop and switch patterns while working on the bass or stab.
26. As a producer, I want Share, Export and Open in one header menu, so that sharing is one click away without permanently taking 122px of the Deck.
27. As a recipient of a shared link, I want the "Keep this beat / Back to my project" choice and any link error to still appear as a full-width strip, so that a decision I must make is never hidden in a menu.
28. As a learner, I want the curriculum path collapsed to one line showing my track, my progress and my current lesson, so that it informs me without pushing the instrument down.
29. As a learner, I want to expand the path to see every lesson and jump to any one, so that full navigation is still one click away.
30. As a producer, I want the Master strip (scope, filter and drive macros, FX bus) below the instruments, so that mix controls sit at the end of the signal chain on screen too.
31. As a learner, I want a completed lesson to shrink to a slim "✓ complete · Next: …" strip after its celebration, so that I can keep playing my groove with the Deck back on screen.
32. As a learner, I want the path to wait for me to press Next before moving on, so that a celebration is never cut short (the Phase 7 rule).
33. As a learner, I want to reopen a completed lesson's full text from its strip, so that I can re-read what I just learned.
34. As a learner, I want a lesson that spotlights a control below the fold to scroll that control into view when the lesson opens, so that I'm never hunting for the Env Mod knob or the keyboard.
35. As a learner, I want the page never to scroll by itself while I'm working on a lesson, so that the Deck never moves under a knob I'm dragging.
36. As a learner, I want a "Show me" link on the lesson card that scrolls to the spotlit control again, so that I can find it after scrolling away.
37. As a motion-sensitive user, I want those scrolls to jump instantly under reduced-motion settings, so that the page never glides at me.
38. As a producer who hasn't sampled yet, I want empty sampler pads shown as compact "Load a sound" cards instead of rows of silent steps, so that the sampler isn't 738px of nothing.
39. As a producer, I want a pad's step lane to appear as soon as the pad has a sound, and to stay for a pad that has programmed steps but lost its audio, so that I never lose sight of programming I made.
40. As a producer on a wide monitor (≥1600px), I want drums and sampler in one column and bass and stab in another, so that most of the Deck fits on screen at once.
41. As a phone user, I want every lane to wrap its 16 steps into two rows of 8, with the label, mute, solo and Level on a line above, so that I can program a beat without scrolling sideways.
42. As a phone user, I want the bass lane's accent and slide rows to wrap the same way, with each step aligned to its note, so that I can still see which note an accent belongs to.
43. As a phone user, I want the keyboard, the Master strip, the region editor and the finale to fit a 320px screen, so that no part of the Deck needs sideways scrolling.
44. As a phone user, I want the sticky transport strip to fit in at most two rows, so that it doesn't eat the screen.
45. As a keyboard user, I want a skip link to the transport strip and the existing skip links reordered to match the new layout, so that bypassing blocks of controls still works.
46. As a maintainer, I want the fold and no-sideways-scroll guarantees checked by an automated browser suite on every PR, so that a future panel can't silently push the instrument below the fold again.

### Pattern bank

47. As a producer, I want four pattern slots, A to D, always present, so that I have room for an intro, a main groove, a variation and a drop.
48. As a producer, I want each slot to hold its own drum, pad, bass and stab programming (pitches, lengths, accents and slides included), so that a slot is a complete loop.
49. As a producer, I want tempo, swing, the mixer, every synth patch, the master, the FX and the pad sounds to stay put when I switch slots, so that switching changes what's played, not how the Deck sounds.
50. As a performer, I want pressing a slot while playing to queue it and switch at the end of the bar, so that my groove never breaks mid-bar.
51. As a performer, I want a queued slot to blink and the playing slot to stay lit, so that I can see what's playing and what's coming.
52. As a performer, I want pressing a different slot while one is queued to replace the queued one, and pressing the playing slot to cancel the queue, so that I can change my mind before the bar ends.
53. As a producer, I want a slot I press while stopped to switch immediately, so that editing between slots has no wait.
54. As a producer, I want the grid to show the slot I selected as soon as I press it, so that I can prepare a queued pattern before it comes in.
55. As a producer, I want a clear on-grid indication when the slot I'm editing isn't the one I'm hearing, so that I'm never confused by an edit I can't hear yet.
56. As a producer, I want a Copy button that arms copying, so that the next slot I press receives a copy of the current pattern and I can make a variation in two clicks.
57. As a producer, I want copying onto a slot that already has programming to ask before overwriting, using a control in the Deck rather than a browser pop-up, so that one stray click can't wipe a pattern.
58. As a producer, I want Escape or pressing Copy again to cancel an armed copy, so that arming it is never a trap.
59. As a producer, I want copying to select the target slot, so that I can start changing the variation straight away.
60. As a producer, I want a Clear button that empties the selected slot after confirming, so that I can start a pattern over without losing the others.
61. As a new user, I want slot A to hold the demo groove and B–D to start empty, so that the bank is obvious and the demo still never completes a lesson for me.
62. As a returning user, I want my existing pattern to become slot A, so that upgrading loses nothing.
63. As a learner, I want lessons to check the slot I'm working in, so that building a lesson in B counts.
64. As a learner opening a shared beat, I want lessons the beat already satisfies, in any slot, to be held back as inherited, so that switching to someone else's B can't earn me credit.
65. As a producer, I want my selected slot remembered across reloads, so that I come back where I left off.
66. As a producer, I want a share link to carry every slot that has programming, so that a friend gets my A-to-D drop and not just A.
67. As a producer, I want to be told clearly when my bank is too big for a link and only the playing pattern was included, with a pointer to the bundle, so that I'm never surprised by what the recipient gets.
68. As a producer, I want a bundle to always carry all four slots, so that there's always a lossless way to send the whole bank.
69. As a recipient, I want a shared bank to land in the same slots it was made in, so that the sender's B is my B.
70. As a recipient of an old link (one pattern, any earlier version), I want it to open as slot A, so that links made before v3 keep working.
71. As a screen-reader user, I want each slot's state (selected, playing, queued, empty) announced in its name, so that I can use the bank without seeing the LEDs.

### 303 slide, accent and Env Mod

72. As a producer, I want an Accent row under the bass lane, so that I can mark which notes hit harder.
73. As a producer, I want an accented bass note to be louder and to open the filter further and faster, so that accents give the line its acid bite.
74. As a producer, I want a Slide row under the bass lane, so that I can mark which notes glide.
75. As a producer, I want a slid note to glide into the next step's note without restarting its envelope, so that the line bends like a 303.
76. As a producer, I want a slid note followed by an empty step to hold through that step, so that slide always does something I can hear.
77. As a producer, I want a slid note to draw a tie into the note it glides to, so that I can see the line's shape on the grid.
78. As a producer, I want to set accent and slide on an empty step and have them kept, so that switching a note off and on again doesn't lose them.
79. As a producer, I want an Env Mod knob on the bass, so that every note can open the filter and close again with the Decay knob.
80. As a producer, I want accents to wow audibly even with Env Mod at zero, so that the Accent row is never a control that does nothing.
81. As a producer, I want the Cutoff knob to stay live while Env Mod is up, setting where each note's filter sweep starts, so that sweeping cutoff still does what it always did.
82. As a returning user, I want Env Mod at 0 and every accent and slide off when I upgrade, so that my bass sounds exactly as before.
83. As a keyboard user, I want the accent and slide toggles to be ordinary buttons with names like "Bass accent, step 3, on (no note)", so that I can program a full acid line without a mouse.
84. As a producer, I want accent and slide carried in every pattern slot, share link and bundle, so that an acid line survives everything a pattern does.

### Acid Arc

85. As a learner, I want an Acid track on the curriculum selector between Techno and Sampling, so that it follows the bass work the Techno arc starts.
86. As a learner, I want to start the Acid arc without finishing anything else, so that the curriculum never gates the Deck.
87. As a learner, I want a lesson that asks for a busy line of at least eight bass notes, so that I learn acid lives on sixteenths.
88. As a learner, I want a lesson that asks my line to use at least three pitches, so that it walks instead of droning.
89. As a learner, I want lessons that ask for at least three accents and then at least two slides that connect into a note, so that I learn the two flags that make acid.
90. As a learner, I want a lesson that asks me to sweep Env Mod while the loop plays, so that I hear what the filter envelope does.
91. As a learner, I want a lesson that asks me to set swing between 56% and 66%, so that I learn acid shuffles.
92. As a learner, I want a capstone that asks for all of it at once (eight notes, three pitches, two accents, two slides, swing in range), so that finishing means I made an acid line.
93. As a learner, I want the Acid arc to end in a graduation moment the size of the Sampling one, so that finishing a track feels finished while Techno stays the biggest moment on the Deck.
94. As a learner, I want the opening Deck to satisfy none of the Acid lessons, so that every one is mine to earn.

### Partial progress

95. As a learner, I want a chip for each thing a lesson checks, showing how far along I am, so that I know whether I'm close.
96. As a learner, I want placement goals to show both how many target steps I've filled and how many extra steps I've added, such as "Kick 3/4 · 1 extra", so that I know when I've overdone it without being told which step.
97. As a learner, I want sweep goals to show a percentage of the required travel, so that I know how much further to turn the knob.
98. As a learner, I want range goals to show my current value against the target, such as "Tempo 130 → 138–145", so that I know which way to go.
99. As a learner, I want a finished chip to turn into a green ✓, so that a five-part capstone reads as a checklist.
100. As a screen-reader user, I want to hear when a chip becomes done and when the lesson completes, but not every count change, so that progress is announced without chatter.
101. As a lesson author, I want chip text generated from the goal itself, with an optional label in the JSON to override it, so that all twenty existing lessons get chips with no edits.
102. As a learner, I want chips never to reveal which steps are wrong, so that progress helps me without giving away the answer.

## Implementation Decisions

### Vocabulary

- **Bank**: the four Pattern slots A–D in a ProjectState.
- **Slot**: one position in the Bank, named by its letter.
- **Selected slot**: the edit target, which `activePatternId` names.
- **Playing slot**: the slot the engine is sounding. It differs from the selected slot only while a switch is queued.
- **Voice**: anything with a mixer channel: the five drum lanes, the four pad lanes, bass and stab.
- **Level**: a voice's channel gain.
- **Swing**: the Transport's shuffle amount, 50–75%.
- **Slide** and **Accent** (on a note step): the 303 flags. A drum lane's accent is unchanged.
- **Env Mod**: the depth of the bass filter envelope.
- **Transport strip**: the sticky bar that holds Play, tempo, Swing and the Bank.
- **Progress chip**: one goal assertion's progress, shown on the lesson card.

### Schema and migration

- One ProjectState version bump per issue that changes the document, chained through the existing migration hook. Every step adds fields only, with defaults that reproduce today's sound:
  - **v11**: Transport gains `swing`, a fraction from 0.50 to 0.75, default 0.50.
  - **v12**: the mixer is keyed by voice (drum, pad and note lanes). Each entry gains `level`, a linear gain multiplier from 0 to about 2 (+6 dB), default 1. Missing entries and missing fields still mean "unity, unmuted, unsoloed".
  - **v13**: `patterns` always holds exactly four slots, in A–D order, each named by its letter. The existing pattern becomes A and keeps its id, so `activePatternId` stays valid; B–D are added empty with fresh ids.
  - **v14**: every note step in every slot gains `slide: false` and `accent: false`. The bass patch gains `envMod` with default 0, and the settings repair clamps or defaults it the way it does every other knob.
- The share/bundle validator is updated at each version, and it is the one place both links and bundles are checked. It checks:
  - swing range;
  - mixer voice ids and level range;
  - 1–4 patterns with unique slot letters, with `activePatternId` among them;
  - boolean note flags;
  - the envMod range.
- Old links and bundles go through the same migration chain, so a v10 link opens as slot A at 50% swing.

### Step resolution (the audio seam)

- The pure "what sounds on this 16th" function is the one place the sequencer is decided. It consolidates today's drum/pad voicing and note-event resolution. It takes the Bank, the selected and playing slots, the mixer, the bass patch, the Transport and a step index. It returns:
  - the playing slot after this step;
  - drum/pad starts, each carrying its accent gain;
  - chokes;
  - note events carrying pitch, length in steps, accent, whether the note is glided into (legato), and whether its gate ties on;
  - a swing offset in seconds for this step.
- The Tone callback applies that result as given and decides nothing itself.
- **Swing is applied by the Deck, not by Tone.** Tone's built-in swing delays the time the step callback receives, and the step index is derived by rounding transport ticks at that time. From 75% upward that delay reaches half a 16th, the rounding boundary, so off-beat steps would resolve as the next step.
  - The Tone transport's own swing stays at 0.
  - The step index keeps coming from the straight grid.
  - Odd 16ths get an offset of (swing − 0.5) × 2 × the length of one step, added to the scheduled time.
  - The readout maps linearly to timing: 66% puts the off-beat at triplet position, 75% at dotted.
  - Note lengths stay in whole steps, measured from the delayed start.
  - Live-played keys and pads are never offset.
  - The rAF playhead stays on the straight grid; the difference is at most half a 16th.
- **Level is a channel gain per voice**, ramped over about 20 ms when it changes. It sits after the per-hit accent gain and the note velocity, so live and sequenced sound pass through it alike and accents keep their headroom. Mute and solo keep filtering events through the existing rule, which already applies to live pads and now covers bass and stab too, live keys included.
- **Queued bank switch.**
  - Pressing a slot is an ordinary document edit: `activePatternId` changes at once, so the grid shows it, edits go to it, goals evaluate it, and autosave saves it.
  - The engine keeps its own playing slot and moves it to the selected slot only when it resolves step 0. While stopped, playing always equals selected.
  - Stop clears any pending difference.
  - The playing-slot LED and the queued blink are driven from rAF and CSS, reading the engine the way the playhead does. No React state changes on the audio clock, so the v1 performance rule needs no exception.
  - Edits to the playing slot while it's selected sound at once, as today. Edits to a queued slot are heard when it comes in.
  - A slide that would tie across a bar boundary where the slot changes is released at the boundary.

### Swing control

- Swing is a standard Knob (id `swing`, readout `54%`) in the transport strip beside the tempo fader.
- Its spec joins the deck param registry, so lessons can spotlight it (`knob:swing`) and knob motion is observed like any other knob. Its value lives in the Transport, not in an instrument patch.

### Level and mixer controls

- Each Level control is a smaller version of the existing Knob:
  - on drum and pad rows: in the lane strip after M and S;
  - for bass and stab: in the panel header, beside new M and S buttons.
- The readout is in dB (−∞ at 0). The taper spends most of its travel between −24 and +6 dB.
- Level knobs join the deck param registry with unique ids per voice (e.g. kick level, pad 1 level, bass level), so `paramSwept` and spotlights can name them. No level goal type ships in v3.

### Layout

- **Order of the Deck, top to bottom:**
  1. header (brand, model, **Share ▾** menu)
  2. any incoming-share strip or error strip (event-driven, not permanent)
  3. transport strip (sticky)
  4. curriculum line
  5. lesson card
  6. Drums
  7. Sampler
  8. Bass
  9. Stab
  10. Master (scope, macros, FX bus)
- **Share menu:** Share link, Export bundle and Open bundle, plus the explanatory copy that used to be permanent.
- **Transport strip:** Play/Stop, tempo fader with BPM readout, Swing, slots A–D, Copy, Clear.
  - It is its own deck section with a heading and a skip link. That is required, because the accessibility suite fails any block of more than eight controls without one.
  - It is sticky at the top of the viewport and no taller than about 56px on desktop and two rows on phones.
  - Scroll targets account for its height, so nothing scrolls under it.
- **Curriculum line:**
  - Shows the track selector, a compact progress meter (n/total), the current lesson's name and a "Path ▸" toggle that reveals the existing numbered path.
  - Its expanded state lasts for the session only; nothing is saved to `prefs`.
- **Completed lesson card:**
  - After the celebration it becomes a strip about 44px tall: ✓ complete, **Next ▸**, and a way to reopen the full text.
  - Next ▸ is the existing put-away-and-advance action, so the path still waits for the user.
  - Progress chips are hidden on an earned lesson; the strip says it's done.
- **Scroll to spotlight:**
  - When a lesson is entered (picked on the path, reached via Next ▸, or resumed), the first spotlit control is scrolled into view, but only if it isn't already fully visible.
  - Never on page load or hydration, and never while the lesson is being worked on.
  - Smooth by default, instant under reduced motion.
  - The card carries a "Show me" link that does the same on demand.
- **Sampler compaction:**
  - A pad's step lane renders when the pad has a sound or has programmed steps.
  - Pads with neither show as compact "Load a sound" cards.
- **Two columns at a viewport width of 1600px or more:**
  - Drums and Sampler on the left, Bass and Stab on the right.
  - Header, transport strip, curriculum and lesson card span the full width above; Master spans it below.
  - Below 1600px the single column stays.
- **Phone reflow below 600px:**
  - Every step lane puts its label, M, S and Level on one line and wraps its 16 steps into two rows of 8 (steps 1–8, then 9–16), keeping the four-step colour groups.
  - The bass accent and slide rows wrap the same way, so step *n* lines up across all three rows.
  - The keyboard, Master, region editor and finale reflow to fit 320px.
  - Nothing scrolls the page sideways from 320px up.
- **Fold budget at 1280×720** (measured 2026-10-17; see Further Notes):
  - The bottom edge of the fifth drum lane must be at or above 720px on a fresh project with lesson 1's card open, chips included.
  - The projection leaves only about 11px of margin, so expect to use at least one lever. The order of levers is: clamp the lesson intro to three lines with "more", trim drum-panel chrome above the rows (71px today), then tighten the deck gap.

### Pattern bank

- The bank is the document's `patterns` list, fixed at four slots.
  - New projects: A holds the demo groove, B–D are empty.
  - "Empty" means no step is on in any lane. Pitch, length or flags parked on off steps don't count.
- **Slot controls** are buttons in a labelled group.
  - The selected slot is shown with `aria-pressed`.
  - Each accessible name includes the slot's state: selected, playing, queued, empty.
- **Copy:**
  - Copy arms copy mode, and the slots blink. The next slot pressed receives a deep copy of the selected slot's lanes, keeping its own id and letter.
  - A target with programming asks first, using an inline confirm inside the strip ("Overwrite B?" with Overwrite and Cancel). Never a browser dialog, which would block the session.
  - Copying onto the same slot does nothing. Escape or pressing Copy again cancels.
  - A completed copy selects the target. While playing, that queues it.
- **Clear:** asks with the same kind of inline confirm, then empties the selected slot. The slot stays.
- **Lessons:**
  - Goals evaluate the selected slot.
  - Inheritance for an incoming shared beat or bundle is worked out across every slot (the union of lessons already met), so no slot of someone else's bank can earn credit.
  - The shipped-curriculum contract asserts that no slot of the opening Deck satisfies any lesson in any Arc.
- **Sharing:**
  - A link carries every non-empty slot by letter, plus the selected letter. The reader puts slots back by letter and fills missing letters with empty slots, so the four-slot rule holds when the deck loads it.
  - If the encoded URL would exceed the existing 2,000-character limit, the link carries only the playing slot (the selected one when stopped). The share UI then says: "This link holds pattern A only — export a bundle to send all four."
  - Bundles always carry all four slots.
- **Not shipped:** chaining patterns (A→B→A…), per-slot swing, per-slot mutes.

### Slide, accent and Env Mod

- Both note lanes share the note-step type, so both carry the flags, but only the bass shows the rows and only the bass voice reads them. The stab lane ignores them.
- **Accent:**
  - An unaccented note plays exactly as today.
  - An accented note gets about +4 dB, the same gap the drum accents use, applied above today's level. Tone's velocity tops out at 1, so the boost needs a gain stage with headroom, not a larger velocity.
  - It also gets a fixed extra filter-envelope depth with a shorter filter decay. This applies even at Env Mod 0.
- **Slide:** a slid note keeps its gate open into the step right after the note ends.
  - If that step holds a note, the next note glides in from the slid pitch over a fixed ~60 ms, without restarting the amplitude or filter envelope (legato).
  - If that step is empty, the slid note ties through it and then releases.
  - Slide on a step with no note does nothing and is kept.
  - The bass voice moves from one attack-and-release per note to attack/release pairs, so a slid chain is one gate.
- **Env Mod (`envMod`, 0–100%):**
  - The bass filter gets a frequency envelope based at the Cutoff knob, with a depth in octaves set by Env Mod (up to about four octaves at 100%), decaying with the existing Decay knob.
  - The Cutoff knob keeps moving the base live, mid-note.
  - Env Mod joins the bass patch and the deck param registry.
- **Editing:**
  - Two thin rows of 16 toggles under the bass lane, labelled Accent and Slide.
  - Each toggle is a plain button with `aria-pressed` and a name such as "Bass slide, step 5, on" or "… on (no note)".
  - A slid note draws a tie on the main row into the note it reaches.
  - The rows add 32 tab stops inside the bass section, which already has a skip link.
- **New spotlight targets:** `accentRow:bass` and `slideRow:bass`.

### Lesson vocabulary and progress

- **New goal types**, parsed with the same strictness as existing ones (a wrong lane, an unreachable count or an out-of-range value fails loudly when the lesson loads):
  - `notesAccented { lane, min }` and `notesSlid { lane, min }`: the lane must be one that shows flags (bass only today). `notesSlid` counts only slides that connect into a following note.
  - `swingInRange { min, max }`: in percent, within 50–75. It evaluates a new `swing` field on the goal context.
- Every assertion type gets a pure progress function returning met, done/total, an extra count for exact-placement goals, and a current value for range and value goals. Lesson completion is derived from it ("every assertion met"), so progress and completion can never disagree.
  - Exact-placement goals (`stepsActive`, `stepsAccented`, `notesActive`): done = wanted steps satisfied; extra = satisfied steps not wanted; met = all wanted and no extra.
  - Minimum-count goals (`notesPlaced`, `pitchesVaried`, `notesAccented`, `notesSlid`, `padStepsPlaced`, `sourceLoaded`, `padAssigned`): done = count capped at the minimum; total = the minimum.
  - `paramSwept`: travel against `minTravel`, shown as a percentage.
  - `chordPlayed`: notes held together against `minNotes`.
  - Range goals (`bpmInRange`, `swingInRange`): current value against the range.
  - Sampler value goals (`regionStartsWithin`, `regionShorterThan`, `fitTargetSet`, `padTuned`): met or not, with the current value where it means something to the learner.
- **Chip text** is generated from the goal type plus the lane's or knob's display label. Any goal may carry an optional `label` string in the JSON to override the noun, validated as non-empty.
- **Display:** chips are a single wrapping row (about 28px) in the lesson card.
  - A met chip shows ✓ in the deck's run green.
  - The chips are a list with accessible text.
  - One polite live region announces only a chip becoming met and the lesson completing.
- Progress is computed on the same user-edit cadence as completion detection (step taps, knob moves, slot presses, transport edits). Never on the audio clock.

### Acid Arc

- The third entry in the curriculum registry, ordered Techno, Acid, Sampling.
  - Id: `acid`. Title: Acid. Blurb: "One bassline, endlessly bent."
  - Finale: the compact scale, certified as BL-303 (the Deck's own model name, not a trademark).
- **Lessons, in order:**
  1. **Sixteenths**: `notesPlaced` bass ≥ 8.
  2. **Make It Walk**: `pitchesVaried` bass ≥ 3.
  3. **Accent It**: `notesAccented` bass ≥ 3, spotlight `accentRow:bass`.
  4. **Slide Into It**: `notesSlid` bass ≥ 2, spotlight `slideRow:bass`.
  5. **Env Mod Sweep**: `paramSwept` envMod ≥ 0.5 while playing, spotlight `knob:envMod`.
  6. **Shuffle**: `swingInRange` 56–66, spotlight `knob:swing`.
  7. **Your First Acid Line** (capstone): `notesPlaced` ≥ 8, `pitchesVaried` ≥ 3, `notesAccented` ≥ 2, `notesSlid` ≥ 2, `swingInRange` 54–70.
- The demo groove has an empty bass lane and 50% swing, so it satisfies none of them.
- A returning user's own saved bassline may already satisfy the early ones. As in Phase 7, that's honest: they did the thing.

### Cross-cutting

- **Performance:** no new control re-renders React on the audio clock. The new memoised controls follow the existing pattern: named callbacks, stable props.
- **Accessibility:** every new control has an accessible name, which the existing mounted accessibility suite enforces. The deck-section list gains the transport strip, and the skip links follow the new order.
- **CI:** a second job builds the app, serves the production build and runs the Playwright suite in Chromium. It joins the existing build-and-test job on every PR to `develop` and `main`.

## Testing Decisions

**What a good test is here.** It drives the code from outside and asserts what a user or listener would observe:

- what sounds on a step, and when;
- what a document becomes after an edit or a migration;
- what a lesson reports;
- what a recipient of a link receives;
- where a control is on screen.

It does not inspect private state, internal component structure or Tone node graphs beyond the existing mocked boundary. All work follows the project's red-green-refactor TDD cadence: each behaviour starts as a failing test at the highest of these seams that can see it.

**The six seams.**

1. **Document seam (existing).** Pure ProjectState functions and the migration chain:
   - swing set and clamp;
   - level, mute and solo across all eleven voices;
   - slot select, copy, clear and "empty";
   - toggling note flags;
   - the Env Mod patch;
   - every migration step from v10 to v14, asserting an upgraded document plays identically: same patterns, swing 0.5, level 1, envMod 0, flags off, existing pattern as slot A.

   Prior art: the existing ProjectState and migration tests, and the bass and master settings tests.
2. **Step-resolution seam (existing, consolidated).** The one pure function behind the step callback. It asserts:
   - swing offsets (zero on even steps, the correct seconds on odd steps at 50/66/75%, the step index never shifted);
   - accent gains under any level;
   - mute and solo across note voices;
   - choke behaviour preserved;
   - note events with accent, legato glide-in and tie-through for slides, including a slide into an empty step and a slide on an empty step;
   - the queued bank switch happening only at step 0, cancelled when selected equals playing.

   Engine-side tests use the existing mocked-Tone harness only to prove the callback applies the result as given: offsets added to the scheduled time, channel gains ramped, legato chains as one gate. Prior art: the existing drum-hit, note-event and engine tests.
3. **Lesson seam (existing, extended).** Parsing and progress for the three new goal types: rejects a stab lane for flags, an out-of-range swing range and an empty `label`. Progress for every assertion type, with completion derived from it. The shipped-curriculum contract gains the Acid arc:
   - a known-good context completes every lesson;
   - breaking each assertion in turn leaves it incomplete;
   - no slot of the opening Deck satisfies any lesson in any Arc;
   - every spotlight and param id names something the Deck has.

   Prior art: the existing lesson and shipped-lessons tests, and the arc tests.
4. **Share/bundle seam (existing).** Round trips:
   - a four-slot bank, slots returning to their letters, with gaps filled empty;
   - swing, levels and note flags;
   - the over-2,000-character fallback to the playing slot, with the notice flag;
   - bundles carrying all four slots;
   - old single-pattern links opening as slot A;
   - out-of-range or malformed new fields rejected.

   Prior art: the existing share round-trip, URL-length and damaged-link tests.
5. **Mounted app (existing, jsdom).** Wiring:
   - slot buttons and their accessible states;
   - Copy arming, inline overwrite confirm and cancel;
   - Clear confirm;
   - the accent and slide rows;
   - bass and stab M/S/Level;
   - the Swing knob;
   - chip text and ✓ state;
   - the live-region announcements;
   - scroll-to-spotlight called on entry and not on edits (scrolling mocked);
   - the completed-lesson strip and Next ▸;
   - the Share menu;
   - the inherited-lesson rule across slots.

   The accessibility suite keeps asserting names and skip-link coverage, and the render tests keep asserting that unrelated lanes don't re-render on a knob move. Prior art: the existing mounted-app, accessibility and render-stability tests.
6. **Layout seam (new, Playwright, Chromium).** Only facts jsdom can't measure, against the production build:
   - on a fresh project at 1280×720, Play is visible and the bottom of the fifth drum lane is ≤ 720px;
   - at 390×844 and 320×640, the document is never wider than the viewport, checked with the region editor open and with the finale open. The finale only opens on the transition from incomplete to complete (Phase 7 AC4); reloading an already-complete project doesn't replay it. So the suite seeds a capstone one edit short and makes the last edit through the UI;
   - after scrolling to the stab keyboard, the transport strip is pinned at the top and Play responds;
   - at 1600×900, the Bass panel sits beside the Drums panel.

   The suite may seed persisted state directly to reach a scenario; it never stubs app code.

## Out of Scope

- Export to MIDI or audio (brainstorm item 3), including any finale button for it.
- Song mode and pattern chaining; any arrangement timeline.
- An Arrangement Arc, bank lessons, and the goal types they would need.
- Per-slot swing, per-slot mutes or per-slot patches; 8th-note swing; preset swing steps.
- Mixing lessons and level goal types (Level knobs are registered so these need only JSON later).
- A separate phone "perform" view; Space-bar play/stop and other global shortcuts.
- Saving collapsed or expanded panel state in `prefs`.
- A compact share codec; raising the 2,000-character limit.
- Slide and accent on the stab lane; a 303-style Accent amount knob.
- Undo/redo, escalating hints, drag-painting steps, drag-to-pitch editing.
- Phase 7 AC5 (adding a lesson with JSON only). The Acid Arc is still registered in code like the others.
- Accounts and sync, alternate kits, PWA/offline, bundle splitting.
- Web MIDI (EB2-10): stays parked on its branch; see Further Notes.

## Further Notes

**Agreed issue order** (for cutting an issue track later, as `docs/issues/` did for v2):

| # | Issue | Schema |
|---|---|---|
| EB3-01 | Swing | v11 |
| EB3-02 | Level on every voice, plus bass/stab mute/solo | v12 |
| EB3-03 | Playwright in CI, then the fold layout (Share menu, curriculum line, sticky transport strip, Master below), with the fold test written first | — |
| EB3-04 | Lesson card: completed strip, progress chips, scroll to spotlight | — |
| EB3-05 | Sampler compaction and two columns at ≥1600px | — |
| EB3-06 | Phone reflow, 320px and up | — |
| EB3-07 | Pattern bank A–D: slots, queued switching, copy, clear | v13 |
| EB3-08 | Bank in share links and bundles, with the single-pattern fallback | — |
| EB3-09 | Slide, accent and Env Mod | v14 |
| EB3-10 | Acid Arc (`notesAccented`, `notesSlid`; `swingInRange` arrives with EB3-01) | — |

Sound first because the controls are small and already promised, and they exist before the layout moves them. Layout second, so the transport strip is built knowing Swing exists and has room for the Bank. Progress chips sit with the lesson card because they count against the fold budget. Acid last, because it needs Swing, Env Mod and the flags.

**Fold budget, measured at 1280×720 on 2026-10-17:**

| Block | Today | v3 target |
|---|---|---|
| Top padding | 24 | 24 |
| Header | 46 | 46 (Share menu inside) |
| Share block | 122 | 0 (in menu) |
| Transport | inside the 476px Master strip | 56 (sticky strip) |
| Curriculum | 153 | ~40 |
| Lesson card (lesson 1, open, fresh project) | 126 | 126, plus ~28 for chips |
| Master strip | 476 | 0 (moved below) |
| Drum panel to the bottom of lane 5 | 337 | 337 |
| Gaps (10–14px each) | — | ~52 |
| **Bottom of drum lane 5** | **≈1,349** | **≈709** |

The lesson card and drum panel heights were measured on a wiped IndexedDB, so this is the state the Playwright check will see. A completed card measures 107px. About 11px of margin is too thin to rely on, so the levers listed under Layout are expected to be needed, not optional.

**Share-size measurements** (JSON plus gzip, as shipped):

| Content | URL length |
|---|---|
| One dense pattern | ≈1,200 chars |
| Four variations of one groove | ≈1,650 |
| Two dense patterns, two empty | ≈1,900 |
| Four unrelated dense patterns | ≈2,500 |

Copying and varying, the workflow the bank is built for, fits comfortably; four unrelated dense patterns are what the fallback exists for.

**Why the swing mechanism is specified.** It looks free, because Tone has transport swing, but under this Deck's step indexing it isn't. See Step resolution above. This is the kind of thing a fresh implementer would otherwise rediscover the hard way.

**EB2-10 (Web MIDI)** stays parked on its branch until a controller is available, then gets rebased onto `develop`. v3 rewrites App wiring, the transport and the mixer, so expect merge conflicts there. MIDI remains one more event source into the existing input layer; it should now also respect the voice mixer (live stab notes pass through stab Level, mute and solo).

**Branch protection** on `develop` and `main` (Phase 1.5) is still pending. When it is turned on, the new Playwright job should be a required check alongside build-and-test.

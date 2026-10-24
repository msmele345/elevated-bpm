# EB3-07a — Pattern Bank core: slots A–D and queued switching

> Track: v3.0 · Slice 7a of 15
> Blocked by: EB3-00 (step resolution), EB3-02 (schema chain: v13 follows v12), EB3-03b (slots live in the transport strip)
> Blocks: EB3-07b, EB3-08, EB3-09a (schema chain)
> Branch: `feat/acid-groove-07a-pattern-bank`
> Schema: **v13**
> Spec stories: 47–55, 61–65, 70–71; spec "Pattern bank" and "Queued bank switch"

## What to build

Four **Slots**, A–D, in the transport strip, each holding one Pattern's
programming. Pressing a slot while stopped switches at once; while playing it
**queues** and takes over at the end of the bar, like hardware. The sound of the
Deck (tempo, swing, mixer, patches, master, FX, pad sounds) does not change
between slots.

## Scope

### In

- **Schema v13:** `patterns` always holds exactly four slots in A–D order, each
  named by its letter. The existing pattern becomes A and **keeps its id**, so
  `activePatternId` stays valid; B–D are added empty with fresh ids. New
  projects: A holds the demo groove, B–D empty. "Empty" = no step on in any
  lane (parked pitch/length/flags on off steps don't count).
- **Selected vs playing slot.** Pressing a slot is an ordinary document edit:
  `activePatternId` changes at once, so the grid shows it, edits go to it, goals
  evaluate it, autosave saves it. The engine keeps its own playing slot and moves
  it to the selected one only when it resolves **step 0**. While stopped,
  playing always equals selected. Stop clears any pending difference.
- Step resolution (EB3-00) takes the Bank, selected and playing slots, and
  returns the playing slot after this step.
- **Queue rules:** pressing a different slot while one is queued replaces it;
  pressing the playing slot cancels the queue.
- **Display:** playing slot lit, queued slot blinking — driven from rAF and CSS
  reading the engine like the playhead. **No React state on the audio clock.**
  A clear on-grid indication when the edited slot isn't the one being heard.
- Slot buttons in a labelled group; selected shown with `aria-pressed`; each
  accessible name includes its state (selected, playing, queued, empty).
- Selected slot remembered across reloads.
- **Lessons:** goals evaluate the selected slot. Inheritance for an incoming
  shared beat or bundle is the union across every slot, so no slot of someone
  else's bank earns credit. Shipped-curriculum contract asserts no slot of the
  opening Deck satisfies any lesson in any Arc.
- **Share/bundle validator:** 1–4 patterns, unique slot letters,
  `activePatternId` among them. Bundles carry all four slots. Old single-pattern
  links and bundles open as slot A.
- `GLOSSARY.md`: **Bank**, **Slot**, **Selected slot**, **Playing slot**; update
  **Pattern** and drop the v2 song-mode forward reference if it changes.

### Out (and where it lands)

- Copy and Clear — EB3-07b.
- Share links carrying the whole bank and the over-length fallback — EB3-08.
- Chaining (A→B→A), per-slot swing/mutes/patches — not in v3.

## Intermediate state

Until EB3-08, a share link carries only the selected slot (opening as A for the
recipient). Bundles already carry all four.

## Acceptance criteria

- [x] Four slots A–D appear in the transport strip; B–D empty on a new project,
      A holds the demo — `PatternBank` in `TransportStrip`; `createDemoProjectState`
      builds the bank with `createBank` (`bank.test.ts`, `projectState.test.ts`,
      mounted in `App.test.ts` "puts four slots in the transport strip")
- [x] Stopped: pressing a slot switches grid and sound at once — `selectSlot` is a
      plain document edit; `engine.setBank` puts the playing slot on the selected
      one while stopped (`engine.test.ts` "switches at once while stopped";
      `App.test.ts` "switches grid and sound at once")
- [x] Playing: pressing a slot shows its grid immediately but the sound switches
      only at the next step 0; queued blinks, playing stays lit; re-pressing the
      playing slot cancels; pressing another replaces the queue — `resolveStep`
      moves the playing slot only on step 0 (`stepResolution.test.ts` "the queued
      bank switch"); the engine records the switch on the audio clock so the LED
      changes when the bar is heard (`engine.test.ts`); `useSlotLights` writes
      `data-playing`/`data-queued` and the spoken state from rAF (`App.test.ts`)
- [x] Tempo, swing, mixer, patches, master, FX and pad sounds are unchanged by a
      switch — `selectSlot` hands back transport, mixer, instrumentSettings and
      sources by reference (`projectState.test.ts`)
- [x] v12 documents migrate to v13 with the old pattern as A (same id) and play
      identically; selected slot persists across reload — `migrateV12ToV13`
      (`projectState.test.ts`); persistence mounted in `App.test.ts` and checked
      in-browser (slot B's programming and the selected slot survived a reload)
- [x] Lesson goals evaluate the selected slot; an incoming bundle's lessons are
      inherited across all slots; opening Deck satisfies no lesson in any slot —
      `goalContextFor` reads the selected slot; `slotsAlreadyMeeting` at both
      arrival paths records, per lesson, every slot that arrived meeting it, and
      a slot is released only when *it* stops meeting the goal — so B → A → B
      cannot launder credit, while the same lesson built in the learner's own
      empty slot earns at once (story 63). `arc.test.ts`; `App.test.ts` "holds
      back a lesson any slot of an incoming bank already meets" (fails without
      the rule) and "still credits a lesson the learner builds in a slot of
      their own"; every slot × every lesson in `lessons.test.ts`
- [x] Validator accepts 1–4 unique-letter slots and rejects malformed banks; old
      links/bundles open as slot A — `isSharedProject` + `bankWithSlots` in
      `readSharedDocument` (`share.test.ts`: partial bank filled by letter; empty,
      five, duplicate letter, unknown letter, old name, duplicate id and stray
      `activePatternId` all rejected; v12 link and v6 bundle open as A). Links
      carry the selected slot as A (`projectForLink`); bundles carry all four
      (`projectForBundle`)
- [x] Slot names announce state; a11y suite passes; no audio-clock re-renders
      (LEDs driven by rAF) — names like "Slot B, selected, queued, empty" (React
      owns selected/empty, rAF owns playing/queued in a childless span);
      `a11y.test.ts` and `render.test.ts` pass; the bank prop is memoized on each
      slot's id, letter and emptiness
- [x] In-browser: queue B mid-bar at 130 BPM — the switch lands exactly on the
      next downbeat across three trials, transport never stalls — dev build,
      B holding a kick on step 1 and the demo in A: pressed on step 6 three times,
      the first kick landed on ticks 6912 / 8448 / 9984, each exactly the next bar
      line; the queued blink showed within one frame (~15 ms); the LED moved when
      the audio clock reached the bar; over 3 s the transport advanced 1400 ticks
      against 1401 expected from the audio clock with no repeated sample; zero
      console errors. `npm run test:e2e` (fold, reflow at 390 and 320, wide) green
- [x] `GLOSSARY.md` updated — Bank, Slot, Selected slot, Playing slot, Queued
      switch, Empty slot shipped; Pattern, ProjectState (v13), Transport strip,
      Bundle, Share link, Share validator, Inheritance and Demo rule updated;
      Copy/Clear stay tagged for EB3-07b

**Note (review):** a press in the ~100 ms look-ahead just before the bar
cannot cancel a switch the sequencer has already scheduled; the engine now
shows the pressed slot queued behind it instead of claiming the cancel took
(`engine.test.ts` "owns up to a switch already scheduled"). Until EB3-08,
**Keep this beat** on a link replaces the recipient's whole bank with the one
slot the link carried (their B–D empty), which is where the bank-by-letter rule
lands once links carry every slot.

**Note:** a bundle file is now named `Elevated BPM beat.ebpm` rather than after
the pattern, since it carries the whole bank and a pattern's name is now its
slot letter.

## Testing decisions

- Document seam: select, "empty", v12 → v13.
- Step-resolution seam: switch only at step 0; cancelled when selected equals
  playing; stop clears.
- Mounted app: slot buttons and accessible states; inherited-lesson rule across
  slots. Share seam: bank validation, old payloads as slot A.

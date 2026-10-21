# EB3-07a — Pattern Bank core: slots A–D and queued switching

> Track: v3.0 · Slice 7a of 15
> Blocked by: EB3-00 (step resolution), EB3-02 (schema chain: v13 follows v12), EB3-03b (slots live in the transport strip)
> Blocks: EB3-07b, EB3-08, EB3-09a (schema chain)
> Branch: `feat/pattern-bank`
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

- [ ] Four slots A–D appear in the transport strip; B–D empty on a new project,
      A holds the demo
- [ ] Stopped: pressing a slot switches grid and sound at once
- [ ] Playing: pressing a slot shows its grid immediately but the sound switches
      only at the next step 0; queued blinks, playing stays lit; re-pressing the
      playing slot cancels; pressing another replaces the queue
- [ ] Tempo, swing, mixer, patches, master, FX and pad sounds are unchanged by a
      switch
- [ ] v12 documents migrate to v13 with the old pattern as A (same id) and play
      identically; selected slot persists across reload
- [ ] Lesson goals evaluate the selected slot; an incoming bundle's lessons are
      inherited across all slots; opening Deck satisfies no lesson in any slot
- [ ] Validator accepts 1–4 unique-letter slots and rejects malformed banks; old
      links/bundles open as slot A
- [ ] Slot names announce state; a11y suite passes; no audio-clock re-renders
      (LEDs driven by rAF)
- [ ] In-browser: queue B mid-bar at 130 BPM — the switch lands exactly on the
      next downbeat across three trials, transport never stalls
- [ ] `GLOSSARY.md` updated

## Testing decisions

- Document seam: select, "empty", v12 → v13.
- Step-resolution seam: switch only at step 0; cancelled when selected equals
  playing; stop clears.
- Mounted app: slot buttons and accessible states; inherited-lesson rule across
  slots. Share seam: bank validation, old payloads as slot A.

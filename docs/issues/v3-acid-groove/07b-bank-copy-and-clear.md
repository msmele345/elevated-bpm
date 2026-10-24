# EB3-07b — Bank Copy and Clear

> Track: v3.0 · Slice 7b of 15
> Blocked by: EB3-07a
> Blocks: none
> Branch: `feat/bank-copy-clear`
> Spec stories: 56–60; spec "Pattern bank → Copy / Clear"

## What to build

Make a variation in two clicks, and start a slot over without losing the
others.

## Scope

### In

- **Copy** arms copy mode; the slots blink. The next slot pressed receives a deep
  copy of the selected slot's lanes (pitches, lengths, accents, any flags),
  keeping its own id and letter.
  - A target that already has programming asks first with an **inline confirm
    inside the strip** ("Overwrite B?" — Overwrite / Cancel). Never a browser
    dialog: it would block the session.
  - Copying onto the same slot does nothing. Escape or pressing Copy again
    cancels.
  - A completed copy selects the target; while playing, that queues it.
- **Clear** asks with the same kind of inline confirm, then empties the selected
  slot. The slot stays.
- Copy/Clear and the confirm fit within the transport strip's height budget
  (desktop ~56px; two rows on phones if EB3-06 landed).

### Out (and where it lands)

- Undo/redo — not in v3.

## Acceptance criteria

- [x] Copy → press target copies the selected slot into an empty target and
      selects it (queued while playing) — `copySlot` (`projectState.test.ts`
      `copySlot`) deep-copies via `withProgrammingOf` and selects the target;
      mounted in `App.test.ts` "App pattern bank › Copy and Clear" ("arms Copy,
      then copies the selected slot onto an empty slot and selects it", "queues
      the copy while playing, like any other press")
- [x] A non-empty target asks "Overwrite X?" inline; Cancel leaves it intact —
      `PatternBank` confirm with Overwrite / Cancel; `App.test.ts` "asks inline
      before overwriting a slot with programming; Cancel leaves it intact" and
      "overwrites the slot once the inline confirm is answered"
- [x] Escape or Copy again cancels an armed copy; copying onto itself is a no-op —
      `copySlot` returns state unchanged for the same slot or an unknown id
      (`projectState.test.ts`); `App.test.ts` "cancels an armed copy with
      Escape or by pressing Copy again", "cancels an open overwrite confirm with
      Escape" and "does nothing when the armed copy lands on its own slot"
- [x] Clear asks inline, then empties only the selected slot — `clearSlot` via
      `emptiedPattern` keeps id and letter and returns an already-empty slot
      unchanged (`projectState.test.ts` `clearSlot`); `App.test.ts` "clears only
      the selected slot, after asking inline" and "keeps the slot when Clear is
      cancelled, by button or by Escape"
- [x] Copied slots are deep copies — editing one never changes the other —
      `withProgrammingOf` gives every step a fresh object (`projectState.test.ts`);
      `App.test.ts` "makes a copy that editing never reaches back through"
- [x] No browser dialogs anywhere in the flow; all new controls named (a11y
      suite passes); confirm is keyboard-operable — `window.confirm` is spied and
      asserted never called (`App.test.ts`); names "Copy slot A", "Overwrite B",
      "Clear A"; focus moves to Cancel and back; `a11y.test.ts` passes
- [x] Mounted tests cover arming, overwrite confirm, cancel paths and Clear;
      document-seam tests cover copy and clear — 11 mounted tests in `App.test.ts`
      "App pattern bank › Copy and Clear"; `copySlot` and `clearSlot` describes in
      `projectState.test.ts`; `heldAfterCopy` cases in `arc.test.ts` ("goals and
      the pattern bank"), plus "carries a held shared slot’s hold onto its copy, so
      copying never earns credit"
- [x] Fits the strip's height budget — desktop strip stays 52px with the confirm
      open; at 320×640 the phone strip stays 86px with no sideways scroll, idle
      and confirming (`e2e/reflow.spec.ts`)

**Note:** the issue's branch name differs: work landed on
`feat/acid-groove-07b-bank-copy-clear`, not `feat/bank-copy-clear`.

**Note (edge cases decided):** Clear on an empty slot does nothing and the key is
`aria-disabled`. Pressing the source (selected) slot while armed disarms. Copying
a held shared slot carries its hold (`heldAfterCopy`, applied by `App`'s
`handleCopySlot`), and a held target overwritten by a copy of a non-held slot is
released, so Copy can't launder lesson credit.

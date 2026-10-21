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

- [ ] Copy → press target copies the selected slot into an empty target and
      selects it (queued while playing)
- [ ] A non-empty target asks "Overwrite X?" inline; Cancel leaves it intact
- [ ] Escape or Copy again cancels an armed copy; copying onto itself is a no-op
- [ ] Clear asks inline, then empties only the selected slot
- [ ] Copied slots are deep copies — editing one never changes the other
- [ ] No browser dialogs anywhere in the flow; all new controls named (a11y
      suite passes); confirm is keyboard-operable
- [ ] Mounted tests cover arming, overwrite confirm, cancel paths and Clear;
      document-seam tests cover copy and clear

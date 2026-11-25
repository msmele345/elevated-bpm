# EB3-08 — Bank in share links, with the single-pattern fallback

> Track: v3.0 · Slice 8 of 15
> Blocked by: EB3-07a
> Blocks: none
> Branch: `feat/acid-groove-08-bank-share`
> Spec stories: 66–70; spec "Pattern bank → Sharing" and Further Notes "Share-size measurements"

## What to build

A share link carries the whole bank, so a friend gets the A-to-D drop and not
just A — and when that won't fit in a link, the sender is told exactly what was
sent and pointed at the bundle.

## Scope

### In

- A link carries **every non-empty slot by letter**, plus the selected letter.
  The reader puts slots back by letter and fills missing letters with empty
  slots, so the four-slot rule holds when the Deck loads it.
- If the encoded URL would exceed the existing **2,000-character** limit, the
  link carries only the **playing slot** (the selected one when stopped), and the
  share UI says: "This link holds pattern A only — export a bundle to send all
  four." (letter varies).
- Bundles always carry all four slots (already true after EB3-07a; keep it
  tested).
- Recipient preview, Keep and Back to my project behave as before; inherited
  lessons are computed across every received slot.

### Out (and where it lands)

- A compact share codec or raising the 2,000-character limit — not in v3.

## Acceptance criteria

- [x] A four-variation bank round-trips through a link with each slot returning
      to its letter; gaps fill as empty slots — `projectForLink` carries every
      non-empty slot under its own letter plus the selected slot (even empty);
      the reader's `bankWithSlots` fills the rest. `share.test.ts` "carries every
      slot with programming back to its own letter, filling the gaps empty" and
      "leaves empty slots out of the link, apart from the selected one"
- [x] An over-length bank falls back to the playing slot and the share UI shows
      the notice naming the letter and pointing to the bundle — `createShareLink`
      measures the full-bank URL against `PRACTICAL_SHARE_URL_LIMIT` and re-encodes
      the playing slot alone under its letter, reporting `onlySlot`; App passes
      `engine.getSlotLights().playing ?? activePatternId`, and `ShareMenu` prints
      "This link holds pattern C only — export a bundle to send all four." inside
      the result's `role="status"`. `share.test.ts` "falls back to the playing slot
      alone, under its letter, when the bank will not fit" and "falls back to the
      selected slot when nothing is playing"; `App.test.ts` "tells the sender a bank
      too big for a link went as the playing slot alone" (and no notice when it fits)
- [x] Bundles carry all four slots in every case — `share.test.ts` "carries all
      four slots, each in its own letter, and the selected one" and "carries all
      four slots of a bank too big for a link"
- [x] Old single-pattern links of any earlier version open as slot A —
      `share.test.ts` v0 ("lifts a payload through every migration step"), v6
      (free-text pattern name "Pattern 1") and v12 ("opens a link written before
      the bank as slot A") all land as A with B–D empty
- [x] Malformed banks (duplicate letters, active id not among slots) are rejected
      with the existing clear error — `isBank` in the share validator;
      `share.test.ts` "rejects a malformed bank" (empty, five slots, duplicate
      letter, unknown letter, free-text name, duplicate id, active id absent) →
      `malformed`. Inheritance across every received slot now runs through the
      real link writer: `App.test.ts` "holds back a lesson any slot of an incoming
      bank already meets", "still credits a lesson the learner builds in a slot of
      their own…" and "carries a held shared slot's hold onto its copy…"
- [x] In-browser: a shared bank opened in a fresh profile lands in the sender's
      slots, plays, and Keep persists it; measured link lengths recorded for the
      four cases in the spec's share-size table — Chromium, dev build, IndexedDB
      wiped (project store empty) before opening a link for A/B/D programmed, C
      empty, D selected at 133 BPM: preview strip shown, slots read "A, B, C empty,
      D selected", the B and D grids matched the sender step for step; Play sounded
      slot D (`getSlotLights().playing === 'pattern-d'`, playhead advancing, 133 BPM);
      Keep wrote a v13 document with all four slots identical to the sender's and D
      selected. With an over-length bank saved and B selected, Share beat showed the
      B-only notice and a 1,114-character link. Zero console errors. Measurements:
      1,116 / 1,527 / 1,444 / 2,039 (→ 1,116 fallback), recorded in the spec

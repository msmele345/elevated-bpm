# EB3-08 — Bank in share links, with the single-pattern fallback

> Track: v3.0 · Slice 8 of 15
> Blocked by: EB3-07a
> Blocks: none
> Branch: `feat/bank-share`
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

- [ ] A four-variation bank round-trips through a link with each slot returning
      to its letter; gaps fill as empty slots
- [ ] An over-length bank falls back to the playing slot and the share UI shows
      the notice naming the letter and pointing to the bundle
- [ ] Bundles carry all four slots in every case
- [ ] Old single-pattern links of any earlier version open as slot A
- [ ] Malformed banks (duplicate letters, active id not among slots) are rejected
      with the existing clear error
- [ ] In-browser: a shared bank opened in a fresh profile lands in the sender's
      slots, plays, and Keep persists it; measured link lengths recorded for the
      four cases in the spec's share-size table

# EB3-09b — Bass Slide

> Track: v3.0 · Slice 9b of 15
> Blocked by: EB3-09a
> Blocks: EB3-10
> Branch: `feat/bass-slide`
> Spec stories: 74–78, 83 (slide parts); spec "Slide, accent and Env Mod → Slide"

## What to build

A **Slide** row under the bass lane: a slid note glides into the next step's note
without restarting its envelope, so the line bends like a 303.

## Scope

### In

- **Slide semantics:** a slid note keeps its gate open into the step right after
  the note ends.
  - If that step holds a note, the next note glides in from the slid pitch over a
    fixed ~60 ms, **without restarting** the amplitude or filter envelope
    (legato).
  - If that step is empty, the slid note ties through it and then releases.
  - Slide on a step with no note does nothing and is kept.
- Step resolution: note events gain "glided into" (legato) and "gate ties on".
  A slide that would tie across a bar boundary where the playing slot changes is
  released at the boundary.
- The bass voice moves from one attack-and-release per note to **attack/release
  pairs**, so a slid chain is one gate.
- **Slide row:** a thin row of 16 toggles under the Accent row, named like "Bass
  slide, step 5, on" / "… on (no note)". Wraps on phones aligned with the lane.
- A slid note draws a **tie** on the main bass row into the note it reaches.
- Spotlight target `slideRow:bass`.
- The two rows add 32 tab stops inside the bass section (which already has a
  skip link).
- `GLOSSARY.md`: **Slide**; drop its `[v3 spec]` tag.

### Out (and where it lands)

- Stab slide — not in v3.

## Acceptance criteria

- [ ] A slid note into a following note glides (~60 ms) with no envelope restart
- [ ] A slid note before an empty step ties through it, then releases
- [ ] Slide on an empty step is silent and kept when a note is added later
- [ ] A slid chain is one gate (mocked Tone: one attack, one release)
- [ ] A slide across a bar where the playing slot changes releases at the bar
- [ ] Tie drawn on the main row from the slid note to its target; Slide row named
      and keyboard-operable; a11y suite passes
- [ ] Slide flags survive slots, Copy, links and bundles
- [ ] Phone: Slide row wraps aligned with notes and accents (Playwright 320/390
      no overflow)
- [ ] In-browser: a two-note slide shows a continuous pitch glide and no second
      amplitude attack in the captured envelope
- [ ] `GLOSSARY.md` updated

## Testing decisions

- Step-resolution seam: legato glide-in, tie-through, slide on empty step, bar
  boundary with slot change.
- Engine (mocked Tone): legato chain as one gate.
- Mounted app: Slide row and tie rendering.

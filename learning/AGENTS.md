# Authoring guide — `learning/`

How to add a lesson to the companion course without re-deriving the format. Read this
before writing anything in this directory.

---

## 1. What this directory is

A **standalone static companion course**. No build step, no bundler, no route in the SPA:
the `.html` files open directly from disk or from any static host, and the `.md` files are
the same lesson in plain text.

**It is not the in-app curriculum.** There are two separate systems and confusing them is
the most expensive mistake available here:

| | `learning/` (this directory) | `src/lessons/*.json` |
|---|---|---|
| Format | Hand-written HTML + Markdown pairs | Pure JSON data |
| Runs where | Its own static page, outside the app | Inside the deck, in the lesson panel |
| Verified by | The learner's ears and a checklist | `isGoalMet` — declarative assertions over `ProjectState` |
| Length | 17–20 minute guided sessions | One goal each, seconds to minutes |
| Count today | 5 sessions | 14 lessons (Techno) + 6 (Sampling) |

The 5 sessions here **bundle** the 14-lesson in-app Techno arc into sit-down practice
sessions with theory, ear experiments, and vocabulary the JSON goals can't carry. Adding
content here **never** requires touching `src/`, and adding a JSON lesson never requires
touching this directory. Keep them in sync in *content*, never in *code*.

Current course (`Elevated BPM · First Groove`), covering the in-app **Techno** arc:

| # | File stem | Covers |
|---|---|---|
| 01 | `01-build-the-pulse` | Grid literacy, four on the floor, tempo |
| 02 | `02-make-the-drums-move` | Offbeat hats, backbeat clap, open-hat choke, accents |
| 03 | `03-write-bass-in-the-gaps` | Note lane, pitch, note length |
| 04 | `04-shape-an-acid-voice` | Cutoff / resonance / decay, one-variable testing |
| 05 | `05-finish-and-perform-the-groove` | Stabs, live chords, mute/solo, master macros, share |

---

## 2. The pair contract

Every lesson is **two files with the same stem**:

```
NN-kebab-case-title.html    the primary visual aid
NN-kebab-case-title.md      the same lesson as text
assets/lesson.css           ONE shared stylesheet — never fork it per lesson
```

- `NN` is zero-padded and defines course order.
- The HTML links to its twin from the nav: `<a href="NN-stem.md">Markdown</a>`.
- The Markdown links back in its front block: `**Primary visual aid:** [Open the HTML lesson](NN-stem.html)`.
- The two must **agree on every concrete instruction** — step numbers, BPM, knob values,
  key names. When you change one, change the other in the same edit.
- Need a new visual component? Add a class to `assets/lesson.css` using the existing
  `:root` tokens. Do not add `<style>` blocks to a lesson page.

---

## 3. HTML skeleton

Copy this whole block, then fill the `<!-- -->` placeholders. Everything in it is load-bearing.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="<!-- One sentence: duration, level, what it teaches. -->" />
    <title>Lesson N — <!-- Title --> · Elevated BPM</title>
    <link rel="stylesheet" href="assets/lesson.css" />
  </head>
  <body>
    <a class="skip-link" href="#lesson">Skip to lesson</a>
    <nav class="course-nav" aria-label="Course lessons">
      <strong>Elevated BPM · First Groove</strong>
      <ol>
        <!-- EVERY lesson in the course, in order. aria-current="page" on this one only. -->
        <li><a href="01-build-the-pulse.html" aria-label="Lesson 1, Build the Pulse">01</a></li>
        <!-- … -->
      </ol>
      <a href="NN-this-stem.md">Markdown</a>
    </nav>

    <main class="page-shell" id="lesson">
      <header class="hero">
        <p class="eyebrow">Lesson NN · N minutes · <!-- First session | Beginner | Beginner capstone --></p>
        <h1><!-- Imperative, short, ends with a period. --></h1>
        <p class="hero-copy"><!-- Two sentences on what the learner will do and hear. --></p>
        <ul class="chips" aria-label="Lesson focus">
          <li><!-- 3–4 lowercase concept tags --></li>
        </ul>
      </header>

      <div class="lesson-grid">
        <div class="stack">
          <!-- MAIN COLUMN -->

          <section class="card card-accent">
            <p class="kicker">The one idea</p>
            <h2><!-- The single sentence the lesson exists to install. --></h2>
            <p><!-- Explain it. --></p>
            <!-- Optional sequence diagram — see §5 -->
            <p class="legend"><span class="hit">hit</span><span class="accented">accented hit</span></p>
          </section>

          <section class="card">
            <p class="kicker">Guided lab</p>
            <h2><!-- What the hands do. --></h2>
            <ol class="time-list">
              <li><span class="timecode">00:00–03:00</span><span><!-- One instruction block. --></span></li>
              <!-- 5 rows; timecodes must tile the full stated duration with no gaps. -->
            </ol>
            <aside class="callout listen"><strong>Listen for:</strong> <!-- The ear target. --></aside>
          </section>

          <section class="card">
            <p class="kicker"><!-- Ear experiment | Mixer drill | Control map | Patch notebook --></p>
            <h2><!-- … --></h2>
            <!-- .checklist, or .control-strip of .control blocks -->
          </section>
        </div>

        <aside class="stack" aria-label="Lesson support">
          <!-- SUPPORT RAIL: 3–5 short cards. Last two are always these two. -->

          <section class="card">
            <p class="kicker"><!-- Target state | Vocabulary | Control behavior | Finish line --></p>
            <h2><!-- … --></h2>
            <p><!-- … --></p>
          </section>

          <section class="card">
            <p class="kicker">Retrieval check</p>
            <h2><!-- A challenge, not a heading. e.g. "No peeking." --></h2>
            <p><!-- Questions asked before the answer is available. --></p>
            <details><summary>Reveal answer</summary><p><!-- … --></p></details>
          </section>

          <section class="card">
            <p class="kicker">Trusted references</p>
            <h2>Go deeper</h2>
            <ul class="source-list">
              <li><a href="…">Ableton · …</a></li>
              <li><a href="…">Roland · …</a></li>
            </ul>
          </section>
        </aside>
      </div>

      <footer class="lesson-footer">
        <p><a href="PREV.html">← Previous: <!-- title --></a></p>
        <p>Ask your agent <!-- a specific diagnostic prompt --></p>
        <p><a href="NEXT.html">Next: <!-- title --> →</a></p>
      </footer>
    </main>
  </body>
</html>
```

Notes:

- Lesson 01 has **no** previous link; the last lesson's "next" points back to 01
  (`Repeat from memory ↺`).
- The main column is 2–3 cards; the support rail is 3–5. Support cards are short —
  a `<h2>` and one paragraph or one `.checklist`.
- Exactly one `.card-accent` per page: the "one idea" card.

### Available CSS classes

| Class | Use |
|---|---|
| `.card` / `.card-accent` | Panel; accent variant is the orange-bordered "one idea" |
| `.kicker` | Mono uppercase label above a card's `<h2>` |
| `.chips` | Hero concept tags |
| `.time-list` + `.timecode` | Timecoded lab steps (`<li><span class="timecode">…</span><span>…</span></li>`) |
| `.callout` | Cyan side note; add `.listen` for the green "Listen for:" variant |
| `.checklist` | `<li><label><input type="checkbox" /><span>…</span></label></li>` |
| `.control-strip` / `.control` / `.knob` | Three-up control diagram; knob angle via `style="--knob-angle: -42deg"` |
| `.sequence-wrap` / `.sequence` / `.sequence-row` | Step-grid diagram (§5) |
| `.legend` + `.hit` / `.accented` / `.note-key` | Symbol key under a diagram |
| `.source-list` | Reference links |
| `details` / `summary` | Hidden answers — always "Reveal answer" |

---

## 4. Markdown skeleton

```markdown
# Lesson N — Title Case Title

**Time:** N minutes
**Level:** First session | Beginner | Beginner capstone
**Use:** Elevated BPM's **Panel · MODEL** controls this lesson touches
**Primary visual aid:** [Open the HTML lesson](NN-stem.html)

## The win

One paragraph: what the learner can do at the end. Then one paragraph lowering the
barrier ("You do not need music theory for this…").

## 00:00–03:00 — <Section name>

Numbered steps. One action per step. Bold every literal UI control name.

## 03:00–08:00 — <Section name>
… one `##` per timecode block, tiling the full duration, matching the HTML `.time-list`.

## Retrieval check

**HH:MM–HH:MM — <last block name>**

Questions first, then:

<details>
<summary>Check your answers</summary>
…
</details>

## Finish line

- [ ] Concrete, checkable end state
- [ ] …

## Keep the idea            ← optional; a 10-second next-day recall drill

## Sources

- Ableton Learning Music, ["Page title"](url) — what it backs up.
- Roland, [Product/manual](url) — what it backs up.

Something unclear? Ask your agent about <specific diagnostic>.
```

The lines in the front block end with **two trailing spaces** (hard line breaks). ASCII step
grids go in a ```text fence and mirror the HTML diagram exactly.

---

## 5. Sequence diagrams — the fiddly part

```html
<div class="sequence-wrap" role="img" aria-label="A 16-step pattern with kicks on 1 5 9 13 and closed hats on 3 7 11 15">
  <div class="sequence" aria-hidden="true">
    <div class="sequence-row">
      <span class="sequence-label">Step</span>
      <span class="sequence-number">1</span><!-- … through 16 -->
    </div>
    <div class="sequence-row"><span class="sequence-label">Kick</span>
      <span class="step-cell on"></span><span class="step-cell"></span><!-- … 16 cells total -->
    </div>
  </div>
</div>
```

Rules — each of these breaks silently if ignored:

1. **17 spans per row, always**: one `.sequence-label` + exactly 16 cells. The quad
   colouring is `:nth-child(2)`–`(17)` on the row, so the label span is a *positional*
   element. Drop it, or add anything before the cells, and every colour shifts.
2. The wrapper carries `role="img"` and an `aria-label` that **spells out the whole
   pattern in prose**. The inner grid is `aria-hidden="true"`. Screen readers get the
   label only, so it must be complete and it must match what is drawn.
3. Cell states: nothing = off, `.on` = `●`, `.accent` = `▲`, `.note` = renders its own
   text content (`C`, `E♭`, `■`). `.note` cells carry the pitch as their inner text.
4. Colour follows the beat, not the lane: steps 1–4 red, 5–8 orange, 9–12 yellow,
   13–16 cream. That grouping *is* the lesson-01 teaching aid; don't override it.
5. Lane label text must match the app's lane labels exactly (§6).
6. Rows read top-down in the order the lab introduces them, kick first — lesson 02 draws
   Kick, Closed Hat, Clap, Open Hat because that is the order it builds them, not deck order.

---

## 6. Ground truth — verify before you write

Lessons name real controls. **Check the source, don't trust this table** — it is a
snapshot, and the deck moves.

| What | Value | Authority |
|---|---|---|
| Drum panel | `Drum Machine` · `RHYTHM SECTION · DR-909` | `src/App.tsx` |
| Master panel | `Master` · `MAIN OUT · MX-01` | `src/App.tsx` |
| Bass panel | `Bass Line` · `MONO SYNTH · BL-303` | `src/components/BassPanel.tsx` |
| Stab panel | `Chord Stab` · `POLY SYNTH · CS-08` | `src/components/StabKeyboard.tsx` |
| Sampler panel | `Sampler` · `4-PAD SAMPLER · SP-04` | `src/components/SamplerPanel.tsx` |
| Drum lanes | Kick, Clap, Closed Hat, Open Hat, Perc | `KIT_LANES`, `src/model/pattern.ts` |
| Note lanes | Bass (C1–C3), Stab (C4–C5) | `NOTE_LANES`, `src/model/note.ts` |
| Sampler pads | Pad 1–4, computer keys `1`–`4` | `PAD_LANES`, `src/model/sampler.ts` |
| Drum step tap cycle | off → on → accented → off | `cycleStep`, `src/model/pattern.ts` |
| Bass Cutoff | 120 Hz – 12 kHz, default 900 Hz, log taper | `BASS_PARAMS`, `src/model/bass.ts` |
| Bass Resonance | 0.5 – 18 Q, default 6 | `BASS_PARAMS` |
| Bass Decay | 0.05 – 0.8 s, default 0.22 | `BASS_PARAMS` |
| Master Filter | 120 Hz – 18 kHz, default 18 kHz (open), log taper | `MASTER_PARAMS`, `src/model/master.ts` |
| Master Drive | 0 – 100 %, default 0 | `MASTER_PARAMS` |
| Live stab keys | A W S E D F T G Y H U J K = MIDI 60–72 (C4–C5) | `STAB_KEYS`, `src/model/stab.ts` |
| Note step keys | ↑/↓ semitone, Shift+↑/↓ octave, ←/→ length | `src/components/NoteRow.tsx` |
| Deck sections | Curriculum, Master, Drums, Sampler, Bass, Stabs | `src/model/deckSections.ts` |
| Tracks / arcs | Techno (14 lessons), Sampling (6) | `src/lessons/index.ts` |

The **shipped demo groove** (`DEMO_GROOVE`, `src/model/pattern.ts`) deliberately leaves
every lesson's work undone — no kick, a half-time clap on step 13, hats stopping a step
short. If a lesson tells the learner to "clear the existing hits", check what actually
ships first; usually there is nothing to clear.

---

## 7. Gotchas

- **The course nav is duplicated in every HTML file.** Adding lesson 06 means editing the
  `<ol>` in `01`…`05` *and* fixing the footer `next` link in `05`. There is no shared
  partial. Grep for `course-nav` and update all of them in one pass.
- **Prose is 1-indexed, code is 0-indexed.** Content says kicks on **1, 5, 9, 13**; the
  JSON goal says `steps: [0,4,8,12]`. Never let a code index reach a lesson page, and
  never copy a step list out of `src/lessons/*.json` without adding one.
- **`min-width: 0` on `.stack` and `.stack > *` is load-bearing** (commit `a6186f0`). Grid
  items default to `min-width: auto`, so the 760 px-minimum sequence diagram would push
  the main column past its track and slide under the support rail. Any new wide element
  belongs inside a `.sequence-wrap`-style `overflow-x: auto` container, not loose in a card.
- **There is a print stylesheet** at the bottom of `lesson.css` (light palette, nav hidden,
  single column, diagrams un-clipped). New components need a print rule or they will render
  as dark boxes on paper.
- **Typography uses real punctuation**: `·` separators, `—` em dashes, `–` en-dash ranges,
  curly quotes, `♭` for flats. Match it.
- **Timecodes must tile.** The hero says "17 minutes"; the five `.time-list` rows must run
  `00:00` → `17:00` with no gaps or overlaps, and the Markdown `##` sections must use the
  same boundaries.
- **No JavaScript.** Interactivity is `<details>` and unchecked checkboxes only. Checkbox
  state is deliberately not persisted.

---

## 8. Voice and pedagogy

The rules the first five lessons follow. Keep them.

- **Hear first, explain second.** Every lesson starts with playback, not with a definition.
- **One idea per lesson**, stated in the `.card-accent` `<h2>` in one sentence.
- **Break it to understand it.** Every lesson removes or misplaces something on purpose,
  listens to the damage, and restores it. One variable at a time, judged over a full loop.
- **Retrieval before answers.** Ask, then hide the answer in `<details>`. Never lead with it.
- **Concrete over conceptual.** "Cutoff 300–600 Hz, Resonance 3–7 Q" beats "make it darker".
- **Name the job, not the sound.** Floor, lift, reply, turnaround.
- **Second person, imperative, short sentences.** No hype, no exclamation marks, no emoji.
- **Sources are primary**: Ableton Learning Music for concepts, Roland product pages and
  manuals for the hardware lineage. 2–4 per lesson, each earning its place.
- **Every footer ends with an "Ask your agent…" prompt** pointed at a specific confusion
  this lesson can produce — the learner has an agent, and the course should use it.

---

## 9. Before you call it done

- [ ] Both files exist, same stem, and link to each other.
- [ ] Open the `.html` in a browser. Check at desktop width **and** under 800 px (the grid
      collapses to one column there).
- [ ] Every `course-nav` link in every lesson resolves; `aria-current="page"` is on exactly
      one entry per page; prev/next footers form an unbroken chain.
- [ ] Every sequence row has 17 spans; the `aria-label` prose matches the cells drawn.
- [ ] Every control name, range, and key is verified against the files in §6 — not memory.
- [ ] Markdown and HTML give identical step numbers, BPMs, and knob values.
- [ ] Timecodes tile the stated duration in both files.
- [ ] No new `<style>` block, no inline styles except `--knob-angle`.
- [ ] Print preview is legible.

---

## 10. What's missing

- **The Sampling track has no coverage here.** `SP-04` ships with six in-app lessons (load
  a sound → find the chop → trim it tight → fit the break → tune a pad → build your own
  kit) and zero companion sessions. That is the obvious next course.
- **A second course needs the nav to become per-course.** `Elevated BPM · First Groove` is
  hardcoded in every `course-nav`, and the `<ol>` assumes one flat list. Decide the file
  naming (`sampling-01-…`? a subdirectory?) before writing page one, because renaming
  later means touching every file in both courses.
- **There is no index page.** Lessons are only reachable from each other. A course landing
  page is worth adding when the second course lands.

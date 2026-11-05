# Field Guide 04 — Acid: Accent, Slide and Env Mod

**Covers:** the **Accent** and **Slide** rows under the Bass Line, the **Env Mod** knob, and the **Acid** track  
**Level:** Any — easiest after First Groove [Lesson 4](../04-shape-an-acid-voice.md)  
**Primary visual aid:** [Open the HTML page](04-acid-accent-slide-env-mod.html)

## The one idea

A 303 line is one busy bassline that bends: accents make some notes bite, slides make some notes glide, and Env Mod makes every note open the filter and close it again.

## Where the controls are

Everything is in the **Bass Line** panel (MONO SYNTH · BL-303):

1. The **Bass** note row — unchanged. Click a step to place a note; **↑/↓** moves it a semitone, **Shift+↑/↓** an octave, **←/→** sets its length.
2. The **Accent** row — 16 thin toggles directly under the notes.
3. The **Slide** row — 16 thin toggles under that.
4. The knobs — **Cutoff**, **Resonance**, **Decay** and now **Env Mod**.

Each toggle sits under the note it belongs to. On a phone all three rows wrap into two rows of eight together, so step 5's accent and slide are still under step 5's note.

## Accent

Switch on the Accent toggle under a note and that note:

- plays about 4 dB louder — the same gap as a drum accent;
- throws the filter open further and faster, so it barks while the rest purrs.

An accent works even with Env Mod at 0%, so the Accent row always does something you can hear.

Accents off the beat — on steps 2, 4, 6 … — sound most like acid.

## Slide

Switch on the Slide toggle under a note and that note holds its gate open into the next step:

- **If the next step has a note**, the line glides into it over about 60 ms without starting the note again. You hear one bending note, not two. A **tie** mark on the Bass row joins the slid note to the note it reaches.
- **If the next step is empty**, the slid note holds through that step and then stops. Slide always does something you can hear.
- **On a step with no note**, the slide does nothing yet, but it is kept. Place a note there later and the slide comes into play.

Slides between two different pitches are the easiest to hear.

## Toggles on empty steps

The toggles are ordinary buttons: **Tab** to one and press **Enter** or **Space** to flip it, so a whole line can be programmed without a mouse.

Accent and Slide stay set when there is no note under them. Turning a note off and on again keeps its flags. A screen reader says so: "Bass slide, step 5, on (no note)".

## Env Mod

**Where:** the fourth knob in the Bass Line panel, labelled **Env Mod**. 0–100%, default 0%.

Env Mod sets how far every note opens the filter before **Decay** closes it again — the "wow" at the front of each note.

- **0%** — the filter stays wherever **Cutoff** puts it. This is how the bass sounded before v3.
- **Halfway** — each note opens with a squelch.
- **100%** — each note throws the filter open about four octaves above Cutoff.

**Cutoff** still works while Env Mod is up: it sets where each note's sweep starts. **Decay** sets how fast it closes. **Resonance** sets how hard the moving edge rings.

**Keyboard:** Tab to the knob. **↑/↓** nudge, **Page Up/Down** jump, **Home** is 0%, **End** is 100%.

## A worked acid line

Twelve notes on three pitches, three accents, two slides that glide into the next note:

```text
Step     1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16
Bass     C2  C2  ·   C3  C2  E♭2 C2  ·   C2  C2  ·   C3  C2  ·   E♭2 C2
Accent   ·   ·   ·   ▲   ·   ·   ·   ·   ·   ▲   ·   ▲   ·   ·   ·   ·
Slide    ·   ·   ·   ·   ·   ●   ·   ·   ·   ·   ·   ●   ·   ·   ·   ·
```

The slide on step 6 bends E♭2 down into step 7's C2; the slide on step 12 bends C3 down into step 13's C2.

### Build it

1. Press **Play**.
2. On the **Bass** row, click steps 1, 2, 4, 5, 6, 7, 9, 10, 12, 13, 15 and 16. Each new note is C2.
3. Focus step 4 and press **Shift+↑** to make it C3. Do the same on step 12.
4. Focus step 6 and press **↑** three times for E♭2. Do the same on step 15.
5. On the **Accent** row, switch on steps 4, 10 and 12.
6. On the **Slide** row, switch on steps 6 and 12. Two ties appear on the Bass row.
7. Set **Env Mod** to about 50% and **Resonance** to about 12 Q.
8. Set **Swing** to about 58%.
9. Ride **Cutoff** and **Env Mod** while it plays.

## The Acid track

**Where:** the **Acid** button on the Curriculum line, between **Techno** and **Sampling**. "One bassline, endlessly bent." You can start it without finishing anything else.

| # | Lesson | What it checks | Chip |
|---|---|---|---|
| 1 | **Sixteenths** | At least 8 bass notes | **Bass notes 5/8** |
| 2 | **Make It Walk** | At least 3 different bass pitches | **Bass pitches 2/3** |
| 3 | **Accent It** | At least 3 accented bass notes | **Bass accents 1/3** |
| 4 | **Slide Into It** | At least 2 slides that glide into a following note | **Bass slides 1/2** |
| 5 | **Env Mod Sweep** | Env Mod turned across at least half its range while playing | **Env Mod sweep 40%** |
| 6 | **Shuffle** | Swing between 56% and 66% | **Swing 50% → 56–66%** |
| 7 | **Your First Acid Line** | 8 notes, 3 pitches, 2 accents, 2 slides, Swing 54–70% | five chips |

The chips above show an example in progress. A slide into an empty step does not count for lesson 4 — it has to glide into a note.

The worked line above, with Swing at 58%, completes lessons 1–4, 6 and 7. Lesson 5 needs you to turn the knob while the loop plays.

Finishing lesson 7 opens the Acid graduation: **Acid track complete · BL-303 certified**.

## Retrieval check

1. You switched on a slide under step 8 and step 9 is empty. What happens?
2. Env Mod is at 0%. Does an accented note still sound different?
3. Lesson 4's chip says **Bass slides 1/2**, but you have two slides on. Why?

<details>
<summary>Check your answers</summary>

1. Step 8's note holds through step 9 and then stops.
2. Yes. Accents always add level and their own filter kick.
3. One of them leads into an empty step. Only slides into a following note count.

</details>

## Finish line

- [ ] I can program an accent and a slide from the keyboard
- [ ] I can hear the difference between a slide into a note and a slide into a rest
- [ ] I have swept Env Mod while the loop plays
- [ ] I have finished the Acid track

## Sources

- Roland, [TB-303 graphic tour](https://static.roland.com/assets/media/pdf/TB-303-Graphic-Tour.pdf) — the original accent, slide and Env Mod controls.
- Roland, [TB-3](https://www.roland.com/us/products/tb-3/) — the modern take on the same voice.
- Ableton Learning Music, ["Make basslines"](https://learningmusic.ableton.com/make-basslines/make-basslines.html) — basslines that move.

Something unclear? Ask your agent why a slide you set does not make a tie appear.

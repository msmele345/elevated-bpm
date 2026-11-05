# Field Guide 03 — The Pattern Bank

**Covers:** slots **A–D** in the transport strip, queued switching, **Copy**, **Clear**, sharing a bank  
**Level:** Any  
**Primary visual aid:** [Open the HTML page](03-the-pattern-bank.html)

## The one idea

A slot holds *what is played*; the Deck holds *how it sounds*. Switching slots swaps the programming and nothing else, so a variation always sounds like the same machine.

## What a slot holds

The bank is four slots, **A**, **B**, **C** and **D**, always there, at the right-hand end of the transport strip.

Each slot holds one complete pattern:

- every drum lane, with its accents;
- every sampler pad lane;
- the bass line — pitches, lengths, accents and slides;
- the stab lane.

These stay the same whichever slot you are on: tempo, swing, every Level, mute and solo, the bass patch, the Master macros, the FX and the sounds loaded on the pads.

A new project starts with the demo groove in **A** and **B–D** empty. If you had a beat before v3, it is now slot **A**, unchanged. The Deck remembers which slot you were on when you reload.

## Reading the slot buttons

| What you see | What it means |
|---|---|
| Pressed-in button | The **selected** slot — the one the grid shows and your edits go to. |
| Steady LED | The **playing** slot — the one you hear. |
| Blinking LED | A **queued** slot — it takes over at the end of the bar. |
| Dim letter | An **empty** slot — no step is on in any lane. |

A screen reader hears all of it in the button's name, for example "Slot B, selected, queued, empty".

## Switching slots

**While stopped:** press a slot. It switches at once.

**While playing:** press a slot and it is **queued**. The current slot keeps playing to the end of the bar, then the new one takes over on step 1. Your groove never breaks mid-bar.

The moment you press it, the grid already shows the queued slot, so you can get it ready before it comes in. Under the transport strip a notice tells you what is going on:

> Editing B · hearing A until the bar ends

Edits to the queued slot are heard when it comes in. You can change your mind before the bar ends:

- Press a **different** slot to queue that one instead.
- Press the **playing** slot to cancel the queue.
- Press **Stop** and the switch happens at once.

### Try it

1. Press **Play** with the demo in **A**.
2. Press **B**. The grid goes empty; the demo keeps playing. Watch **B** blink.
3. At the end of the bar, **B** comes in. The loop is silent.
4. Press **A** to bring the demo back at the next bar line.

## Copy — a variation in two clicks

1. Select the slot you want to copy from.
2. Press **Copy**. The other slots blink to say Copy is armed.
3. Press the slot to copy onto.

The target gets an exact copy of the pattern and becomes the selected slot, so you can start changing it straight away. While playing, that means it is queued and comes in at the end of the bar.

If the target already has programming, the strip asks first: **Overwrite B?** with **Overwrite** and **Cancel**. Focus lands on **Cancel**, so a stray **Enter** never wipes a pattern.

To back out of an armed Copy, press **Copy** again or press **Escape**. Pressing the slot you are copying from also does nothing.

## Clear — start a slot over

1. Select the slot.
2. Press **Clear**. The strip asks **Clear A?**
3. Press **Clear** to empty it, or **Cancel** to keep it.

The slot stays; only its steps go. **Clear** does nothing on a slot that is already empty. Other slots are untouched.

## A breakdown and a drop

A worked plan for four slots:

| Slot | Job | How to build it |
|---|---|---|
| **A** | Main groove | Your full beat |
| **B** | Breakdown | **Copy** A onto B, then take out the kick |
| **C** | Build | **Copy** B onto C, then add an open hat and a few bass notes |
| **D** | Drop | **Copy** A onto D, then add one more percussion hit and an accent or two |

Then play: A for four bars, B, C, D, back to A. Press each slot a little before the bar line you want it on.

The bank does not chain patterns for you. You perform the order by pressing slots.

## Lessons and the bank

Lessons check the **selected** slot. If you build lesson 1's four-on-the-floor in **B**, it counts.

When you open someone else's shared beat, any lesson their bank already satisfies — in any slot — is held back. Switching to their **B** never earns you a lesson you did not do.

## Sharing a bank

- A **share link** (Share ▾ · **Share beat**) carries every slot that has programming, and which slot was selected. The person you send it to gets your slots in the same letters: your **B** is their **B**.
- If all four slots are too much for a link, it carries only the **playing** slot (the selected one when stopped) and says so: **This link holds pattern A only — export a bundle to send all four.** Copies of one groove nearly always fit; four completely different, busy patterns may not.
- A **bundle** (Share ▾ · **Export bundle**) always carries all four slots.
- A link made before v3 opens as slot **A**.

## Retrieval check

1. You are playing **A** and press **C**. Which slot do your step clicks change?
2. You copy **A** onto **B** and then turn the kick's Level down. Is **A**'s kick quieter too?
3. Your link says it holds pattern **A** only. How do you send all four?

<details>
<summary>Check your answers</summary>

1. **C**. The grid and your edits move to the selected slot at once; you hear them when **C** comes in at the end of the bar.
2. Yes. Level belongs to the Deck, not to a slot.
3. Export a bundle from **Share ▾**. Bundles always carry all four slots.

</details>

## Finish line

- [ ] I have queued a slot while playing and watched it come in on the bar
- [ ] I have copied a slot and changed the copy
- [ ] I have cancelled an armed Copy with **Escape**
- [ ] I know what a link carries and what a bundle carries

## Sources

- Ableton Learning Music, ["Song structures"](https://learningmusic.ableton.com/song-structure/song-structure.html) — why a groove needs a breakdown and a drop.
- Roland, [TR-909 owner's manual](https://cdn.roland.com/assets/media/pdf/TR-909_OM.pdf) — pattern banks and switching at the end of a bar on the original hardware.

Something unclear? Ask your agent why a step you just clicked is not sounding yet.

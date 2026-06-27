# 02 · GAMEPLAY & FEEL

> The play loop and the rules that make it *feel* right. Mechanics here are
> contracts the ENGINE/RUNTIME must honor.

## The loop

1. Load a song → pick a **Version** (density-ranked buttons, see 07). Picked
   **before** play; not changed mid-song.
2. Notes fall onto the piano. Each note shows the **computer key** you press
   (not the pitch letter), colored by hand, the letter pinned at **both ends** of
   the note (keep — players love it).
3. You play with the computer keyboard. **The rest of the song plays alongside
   you** (engine fills what your two hands don't cover). Default mode = **PLAY**.
4. **LISTEN** mode = sit back, everything auto-plays; the slices glide on the
   solved plan so you can watch how it's meant to move.

## The two-hand slice mechanic (the soul of TKG)

- Two hands. Each hand = a **one-octave window ("slice")** on the piano.
- You move each slice **independently** with shift keys (octave up/down per
  hand). Hands **never cross** (right ≥ left).
- **One note per hand at a time is the ideal.** A **2-note chord in one hand is
  allowed; 3 only if the other hand is silent.** Enforce this as a comfort
  target in extraction (07) and as a soft constraint in the solver.
- **Octave jumps are encouraged** — moving around the piano *is* the feeling of
  playing. Don't penalize a line that leaps registers; do penalize *needless*
  rapid shifting (already in the solver cost model).
- **Two hands stay two hands.** Do **not** collapse a single line onto one hand.
  A monophonic line should be split across both hands (alternating) so the player
  is using both — that left/right lock-in is the point. *(This reverses an
  earlier wrong call.)*

## The slice highlight (must match what sounds — known bug)

The glowing slice on the piano must highlight **the exact octave of keys that
will sound** when you press a hand's keys *right now*. Cause of the mismatch:
in LISTEN the highlight followed the *solver's planned* position while the keys
that fire follow the *live* hand position. Fix: **one source of truth** — the
live `PlayState.slice`. In PLAY the player drives it; in LISTEN it's driven by
the plan; either way the highlight, the audible octave, and the key-tint all
read the same value.

## Input model

- Computer keyboard **is the instrument**: pressing a mapped key sounds its note
  at that hand's current slice octave (standard TKG map; remappable later).
- Shift keys move slices (Tab/⏎ up, ⇧L/⇧R down, per the repo's scheme). They
  must `preventDefault` — and that is exactly why key-ups can get eaten, which is
  the ghost-note trap (see 04).
- Pointer (click piano) and Web MIDI play raw pitch (a real keyboard = truest
  feel) — keep both.

## Keyboard-map viewer (build this)

A toggle that pops up the **computer keyboard with the piano directly beneath
it**, so players see the mapping.

- **Opacity, not lines:** every *mapped* computer key renders **fully opaque**;
  unmapped keys are dimmed. Same for the piano keys that are reachable.
- **Press to reveal:** pressing a letter lights **both** the computer key and its
  piano key, so the correspondence is obvious by doing.
- **Optional lines toggle:** a *separate* button overlays simple straight lines
  from each letter to its piano key. Off by default.

## Scoring & "you sound good" (the fork)

> CONFIRMED direction: scoring **is** coming (not stage 1). At song end, a
> **report** shows which notes you **hit vs missed**, an **accuracy** number, and
> **timing drift** (lagging / dragging), evolving into **Chess.com-style tips on
> how to improve**. The stage-1 default below stays expression-forward; the
> report/score layer lands in stage 2.

- **Expression-forward default:** it should sound good even when you're loose.
  Lean toward *not* making wrong notes sound jarring in the default experience.
- **Optional precision layer** (for the game crowd / the ladder): timing
  judgment (Perfect/Great/Good/Miss) feeding a score + combo, surfaced only when
  the player opts into a "challenge" framing. The `judge()` engine fn computes
  tiers regardless; the *runtime* decides whether to punish or forgive.
- Two correction philosophies to choose between (pick per mode, not globally):
  - **Forgiving / toy:** mistakes are quiet or softened; the backing track
    carries the song. Great for office time-kill & "I sound good."
  - **Honest / game:** you hear your mistakes; tight windows; score matters.
    Great for the rhythm-gamer & mastery.
- Whatever we choose, **never** let scoring gate *hearing yourself play*.

## Difficulty = density + ladder

- **Density Versions** are the primary difficulty dial (Core → Two-Voice → Full).
- **Progression ladder** (Duolingo/Chess.com flavor) sits on top — unlock harder
  songs/versions by clearing easier ones, with **skip-ahead test-outs** for
  players who already have the skills. (Full design in 05.)

## Assist options (reserve)

Half-speed (SPEED slider — keep), wait-for-press (note holds until you hit it),
hand-isolation (play just the right-hand line), ghost/listen overlay. Define the
hooks; ship what's cheap.

## Layout constraint (small but real)

The creator uses **Wispr Flow**, which occupies the **center of the screen**.
**Leave a clear center gap** in any control/HUD layout so center-screen taps
don't collide with it. Treat dead-center as reserved negative space.

## Acceptance criteria

- [ ] Defaults to PLAY; backing track audibly plays with the player.
- [ ] Slice highlight octave == audible octave == key-tint, in both modes, frame-
      accurate.
- [ ] Single-line songs use **both** hands (no one-hand collapse).
- [ ] ≤2 notes/hand enforced; 3 only when the other hand is empty.
- [ ] Keyboard-map viewer: opacity-based, press-to-reveal, separate lines toggle.
- [ ] No interactive control sits in the dead-center zone.
- [ ] `judge()` exists and is pure even if scoring UI is hidden in stage 1.

# 08 · ONBOARDING & TUTORIAL

> The first ten minutes decide whether someone stays. The job: make the whole
> system (keyboard→piano, slices, shifting) easy to understand, and make the first
> experience a guaranteed win. Build in Stage 2 (after the core feels right).

## Landing page (chess.com-style)

- TKG branding; on the left: **"Piano rhythm game on your QWERTY keyboard"**, the
  bold **TKG**, and a tagline ("Play the piano on your computer like no one ever
  has").
- Two choices: **"First time playing"** and **"I'm already a pro."**
- Shown on first visit (local memory / storage interface). "Pro" skips to the game;
  "first time" runs the walkthrough.

## Blurt — the guide

A small character with text-box lines who hosts the walkthrough. Keep him to the
tutorial for now (personality TBD — see QUESTIONS). The walkthrough:

1. "Welcome to TKG — the best way to play piano on the computer. Let's play a song."
2. Before the first note, Blurt points at the **bottom of a falling note and the
   hit line**: *"when the bottom of this note hits this line, press the key on it."*
   Practice **one** note. → then a full song.
3. Play **Baa Baa Black Sheep** (simplest version) start to finish — a guaranteed
   win.
4. "That was awesome — let me show you the easy buttons." A *"press me"* prompt /
   Blurt points at the **Teklet**; player opens it.
5. Inside the Teklet, Blurt explains **Auto-Shift**, **Rest-of-Song**, **Auto-Slow**
   (one text box each), then **song select/upload** and **speed** (80%, 100%…).

## Two-hand / shifting tutorial

1. Load a deliberately hard song (e.g. a Beethoven symphony); notes flood in.
2. After ~10s of the player missing, Blurt: **"Whoa, that's a lot of notes."**
3. He explains: left hand maps here, right hand there; move the left with
   **Shift+Tab**, the right with **Shift+Enter** — "try shifting up and down."
4. A **shift-drill mini-game**: a ball pops above a note; race your shifter (the
   correct shift key highlighted on-screen) to reach it, per hand. 2–3 short
   tutorial songs in this mode teach shifting by doing.

## Why this exact shape

The most common quit is "tried a too-hard song, missed, left." The "I can't do
this" moment is seeing 3 notes, missing 2. The tutorial removes that by making the
first song trivial and *then* revealing the assists that tame hard songs.

## Accessibility hooks (reserve; serve later)

The founder wants the vision- and dexterity-impaired to play: **bigger notes**, the
**sparsest core** (one note at a time, 4 keys/hand), and **Auto-Shift/Auto-Slow**.
Keep note size and slice shape config-driven (10) so an "accessible" config is just
a config.

## Acceptance criteria

- [ ] Landing page with the two choices; first-time path launches the walkthrough,
      "pro" skips it; choice remembered via the storage interface.
- [ ] Blurt walkthrough runs the exact beat sequence above, ending on Baa Baa Black
      Sheep as a guaranteed completion, then surfaces the Teklet + assists.
- [ ] One-note practice gates the first full song.
- [ ] Shift tutorial + a working shift-drill mini-game with on-screen key prompts.
- [ ] Note size and slice shape are config-driven (accessible config possible with
      no code change).

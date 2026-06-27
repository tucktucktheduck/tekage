# 00 · VISION

> The anchor doc. If a decision elsewhere contradicts this, this wins (or this
> gets updated on purpose). Everything else is downstream.

## What TKG is

A rhythm/piano hybrid. Notes fall onto a full piano; the player presses the
matching **computer-keyboard** keys to sound them. The player drives **two
hands**, each a **one-octave "slice"** of the keyboard they slide independently.
You don't need real piano skill — the game reduces any song to a playable core
and shows you exactly which key to hit — but it should *feel* like playing.

The origin, in the creator's words: *used to play piano, now mostly types; hears
"the discordant symphony of percussion" under his fingers and it recalls the
music he could play at seven.* TKG turns typing-feel back into music-feel.

## Who it's for

The **intersection of people who play piano and people who play on a keyboard.**
The tell: pianists say "this is a cool *game*," gamers say "this is cool for
*piano players*." Each points at the other — the audience lives in between.

Three identities to hold simultaneously (design should serve all three):

- **The favorite game** of someone who loves video games. → it must be a *good
  game*: feel, flow, mastery, unlocks.
- **The time-killer** for someone in a boring office. → instant, low-friction,
  satisfying in 60 seconds, quietly playable.
- **The piano** for the traveling musician. → expressive, real-feeling, "I made
  that sound." (Acknowledged as the hardest of the three to fully deliver — aim
  at it, don't bet the design on it.)

## The feeling we're chasing

Two feelings at once: **"this is such a fun game"** *and* **"I sound really
good."** It is the answer to "why do you play a rhythm game?" *and* "why do you
play the piano?" in the same motion.

The bar for "yes, that's it": **load a song, play it, and feel the song come out
of your fingers.**

**Scoring is coming** (not stage 1): an **end-of-song report** showing which
notes you hit and missed, **accuracy**, and timing drift (lagging/dragging),
growing into **Chess.com-style "how to get better" tips**. Until then the
working default is **expression-forward** (it should sound good even when you're
loose), with the precision/scoring layer added later for the game crowd. See 02.

## Business shape

- **TKG itself ships free** (publish wide; web now, **Steam / proper game**
  later).
- **Monetization = cosmetics + content.** Custom skins, backgrounds, teklet
  consoles, and eventually **songs** (licensed MIDI/MusicXML you can buy to
  play) are paid. Personal-expression skins free; premium packs paid; a possible
  community/marketplace later.
- Song **acquisition** (most people don't have MIDI files lying around) is a real
  long-term design problem — flagged, not solved yet. The end state is a **free,
  wide "music interface": a library and a community** where consoles,
  backgrounds, and songs can all be updated/shared — the computer keyboard is
  dry, but *the screen can project anything*, and TKG turns falling notes into
  that canvas.

## Guiding principles

1. **Feel over features.** Every iteration is judged by whether it feels better
   to play, not by feature count.
2. **Reduce, don't dumb down.** The magic is capturing a song's *core* (the
   "hero notes") so a beginner can play something that still sounds like the
   song. (See 07.)
3. **Infinitely customizable, eventually.** The aesthetic is a platform. Build
   seams for skins/backgrounds/mappings now; ship only the default look now.
4. **Sandbox first, ladder alongside.** It's an instrument you open and play,
   *with* a Duolingo/Chess.com-style unlock ladder for those who want to climb
   (and skip-ahead test-outs for those who already can). See 05.
5. **Don't paint into a corner.** Stay a single HTML for now, but architect as if
   it will become a multi-module app with accounts, a store, and UGC. See 01.

## Non-goals (for now)

- Not a MIDI editor / DAW.
- Not teaching real two-handed classical piano technique.
- Not (yet) a social network — sharing comes after the core feels right.

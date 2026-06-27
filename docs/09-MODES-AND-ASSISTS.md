# 09 · MODES & ASSISTS

> The play modes and the "make it 10× easier" buttons. Auto-Slow and Auto-Shift
> are the heart of TKG's accessibility promise.

## Modes

- **PLAY** (default). Your version's notes are yours; the **backing plays with
  you** (Rest-of-Song). The core experience.
- **LISTEN**. Everything auto-plays; the slices glide on the solved plan so you can
  watch how it's meant to move. Used to preview a song before playing it.

Switching modes calls `allNotesOff()` (04) and re-seeds the live slice.

## Assists (each independently toggleable, in the Teklet)

### Auto-Slow — the headline button
On a missed note, the transport **slows** (smoothly, not a hard stop) to give the
player time to catch the note, then eases back toward target tempo as they recover.
This is the "thank god for this button" moment. Design:
- Trigger: a yours-to-play note passes its hit window unplayed.
- Behavior: scale playback rate down toward a floor (e.g. 0.4×) over a short ramp;
  recover toward 1.0× (or the speed-slider target) as subsequent notes are hit.
- It must never desync audio from the falling notes — drive everything off the one
  transport clock (the audio-locked clock in 01), not wall-time timers.
- Off by default; a strong candidate for the "your accuracy is low — try these"
  nudge (see Progression 05).

### Auto-Shift — must ship
The engine moves the player's slices for them along the solved `sliceTimeline`, so
a beginner can play the right notes without managing octave shifts. Design:
- When on, the live slice follows the solved plan (like LISTEN's slice motion) but
  the player still presses the note keys.
- Pairs with the shift tutorial (08): teach manual shifting, then offer Auto-Shift
  as the assist.

### Rest-of-Song
The engine sounds every note the player's hands don't cover (backing). On in PLAY
by default so the song always sounds whole. (This is the `backing`/`skip`
playback already specified in 02/Transport.)

### Speed
The SPEED slider scales target tempo for practice (e.g. 0.25×–1.25×). Independent
of Auto-Slow (which reacts to misses); both feed the same transport rate.

## Interaction rules

- Difficulty is **player-controlled** — assists are opt-in; the game never changes
  difficulty on its own. (DECISIONS)
- If accuracy is poor, a **non-blocking nudge** may surface ("struggling? these
  buttons help") linking to Auto-Slow / Auto-Shift / Rest-of-Song — suggestion
  only, never auto-applied.
- All assists are config flags (`assists.*`, `slices.autoShift`, see 10) so they
  bake into an exported HTML.

## Acceptance criteria

- [ ] PLAY is default; backing audibly plays with the player; LISTEN auto-plays all.
- [ ] Auto-Slow: a miss smoothly slows the transport and it recovers on hits, with
      audio and falling notes staying in lock-step (clock-driven, no timer drift).
- [ ] Auto-Shift: live slices follow the solved plan while the player still presses
      keys; toggled by config.
- [ ] Rest-of-Song on/off changes whether uncovered notes sound.
- [ ] Low-accuracy nudge appears as a dismissible suggestion and never changes
      settings by itself.
- [ ] Every assist is a `TKGConfig` flag and survives export.

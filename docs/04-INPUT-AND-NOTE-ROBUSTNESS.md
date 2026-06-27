# 04 · INPUT & NOTE ROBUSTNESS (kill the ghost notes)

> The recurring, morale-killing bug: a note turns on and **stays on** forever.
> This doc specifies a fix that removes the *class* of bug, not one instance.
> Prior attempts were buggy; this is a from-first-principles design grounded in
> how the repo and the current build actually fail.

## Why notes get stuck (root causes)

1. **Missed key-up.** Shift keys `preventDefault` (Tab/Enter/Shift) to stop
   browser behavior; combined with focus changes, OS shortcuts, or fast play,
   the matching `keyup` for a *note* key can never arrive → the voice is never
   released.
2. **Retrigger orphan.** The current build keys live voices by **MIDI number**.
   Press the same note again before release and the second voice overwrites the
   first handle → the first oscillator is orphaned and rings forever.
3. **Scheduled-stop reliance.** Song notes self-schedule a stop via `setTimeout`/
   fixed `o.stop(t)`. Backgrounding the tab desyncs timers from the audio clock;
   rapid **seek/restart** spawns/cancels notes whose stop never fires.
4. **Window/visibility loss.** Alt-tab mid-press: keyup goes to the OS, not the
   page. Voice hangs.

The repo's mitigation (good bones, incomplete): `mxClearFallingNotes()` iterates
`state.activeAudio` and force-stops everything `mx:`-prefixed. We adopt the
**force-stop-all** idea and harden it.

## The design: a VoiceManager + panic + watchdog

All sound goes through **one** `VoiceManager` inside `AudioEngine`. Nothing
creates an oscillator/sample voice outside it.

```ts
class VoiceManager {
  voices: Map<voiceId, Voice>          // voiceId = unique per press, NOT midi
  noteOn(midi, {source, key}) -> voiceId   // returns a handle
  noteOff(voiceId | key)                   // release one
  releaseByKey(key)                        // release the voice a given input key owns
  allNotesOff(immediate=false)             // PANIC: release everything, now
  tick(songTime, ctxTime)                  // WATCHDOG: see below
}
```

Rules:

- **Unique voiceId per press** (monotonic counter), never keyed by MIDI →
  retriggers can't orphan each other.
- **One voice per input key at a time.** On `noteOn` for an input `key` that
  already owns a live voice, **release the old one first** (legato re-strike).
- **Watchdog (per frame):** every voice carries an absolute `endByCtxTime`
  (for scheduled song notes) or an `isHeld` flag (for user notes). `tick()`
  force-releases any **non-held** voice whose `endByCtxTime` has passed, plus any
  voice older than a hard `MAX_VOICE_SEC` ceiling (e.g. 12 s) regardless. This
  catches every missed-stop, independent of `setTimeout`.
- **Held-note safety:** user-held voices are exempt from the duration watchdog
  but are killed by `allNotesOff` and by the input-side guarantees below.

## Input-side guarantees

- **Release on every exit path**, not just `keyup`:
  - `window` `blur`, `document` `visibilitychange→hidden`, `pagehide` →
    `allNotesOff()` and clear held-key set.
  - On **pause / seek / restart / mode-switch / version-change / song-end** →
    `allNotesOff()`.
- **Key-repeat guard:** ignore `keydown` with `repeat===true` for note keys.
- **Track held keys explicitly** in a `Set`; on focus loss, release all and empty
  it (so a key physically still down doesn't leave a phantom on return — next
  real `keydown` re-presses cleanly).
- **Shift keys never sound** and must still not block their own `keyup`
  accounting (they don't own voices, so they can't stick — but ensure their
  `preventDefault` doesn't swallow *note* keys' events; handle them in distinct
  branches, as the current build does).

## Determinism / verification

- **Unit (headless):** simulate event sequences — press without release, double-
  press, press+blur, seek-during-hold, 100 random on/offs — then assert
  `voices.size === 0` after the terminating event. Pure VoiceManager logic with a
  fake clock; no real audio needed.
- **Property test:** after any sequence ending in `allNotesOff()`/blur/pause,
  **zero** live voices. Invariant: a voice's lifetime ≤ `MAX_VOICE_SEC`.
- **Manual matrix:** alt-tab mid-hold; hold a note and hit pause; spam one key;
  hold a key and drag the seek bar; switch mode while holding. None may leave a
  ringing note.

## Acceptance criteria

- [ ] No oscillator/sample voice is created outside `VoiceManager`.
- [ ] Voices keyed by unique id; retrigger releases the prior voice.
- [ ] `allNotesOff()` fires on blur, visibilitychange-hidden, pagehide, pause,
      seek, restart, mode-switch, version-change, song-end.
- [ ] Per-frame watchdog kills overdue/over-age non-held voices.
- [ ] Headless test: every terminating sequence ends with `voices.size === 0`.
- [ ] Manual matrix above produces zero stuck notes.

## Note

If, after this, a stuck note ever appears, it is now observable: `VoiceManager`
should expose `voices.size` (and ideally log on watchdog kills in debug) so the
failure is diagnosable instead of mysterious.

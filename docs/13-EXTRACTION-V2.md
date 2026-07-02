# 13 — Extraction & Solver v2: "the feel" rework

Founder complaints this addresses (from the July 2026 transcript):

1. **Easy·Core showed ZERO notes for the first third of Clair de Lune.**
2. **Hard·Full skipped notes — even notes inside the current octave range — so no
   tier actually "plays every note."** (Viva la Vida had no all-notes mode.)
3. **Removing notes doesn't make a song easier, it makes it boring** — the player
   just sits through gaps.
4. **The difficulty score doesn't match how a typer feels.** Peak speed is a bad
   proxy; awkward finger shapes (u+i then y+;) are the real difficulty.
5. **The no-hand-crossing rule is wrong** — grabbing the C an octave up with the
   other hand is fun and should be legal.
6. **40 pts/note for violating the source MIDI's hand split is too much faith in
   the file.**
7. **Slices shift at the last second**, making Hard meticulous instead of hard.

## Root causes found in the code

- **(1) & (3)** `thinToDifficulty()` was a *global* greedy: keep anchors, then add
  notes in global salience order until a global difficulty score is hit. On a
  song with a busy middle, the entire budget lands on the busy sections and the
  intro gets nothing. Worse: Easy·Core was built from the **lead voice only** —
  and Clair de Lune's famous opening has *no lead voice at all* (it's arpeggiated
  accompaniment). The tier's input set was empty for 37 seconds, so no thinning
  strategy could have saved it.
- **(2)** In `solvePlan()`, `eventSolutions()` did hard `continue`s: any chord
  split with a crossed pair, or with an unplayable per-hand shape (e.g. two
  notes of the same pitch class needing the same key), was discarded. If **every**
  split of an event was discarded, the candidate list came back empty and the
  Viterbi silently carried state forward — **every note in that event became a
  skip**. That's why notes "inside the current octave range" vanished: they were
  collateral of one impossible neighbor note.
- **(7)** Shift cues were scheduled at `noteTime − 0.45s × count` — the slice was
  still moving as the note crossed the hit line.

## What changed (engine only; all pure, all tested)

### `deriveVersions.js` — windowed, coverage-guaranteed thinning
`thinToDifficulty(notes, target, dur, {coveragePool, windowSec=3, maxGapSec=2})`

1. **Coverage first.** Before spending any difficulty budget: every 3-second
   window in which the *song* plays, the *player* plays. If the tier's own note
   set (lead line) is silent in a window but the song isn't, the best note is
   **borrowed from the full song** (`coveragePool = base`). A second pass caps
   silent gaps at 2 s.
2. **Even fill.** The remaining budget is spent round-robin: repeatedly add the
   highest-salience pending note from the **sparsest** window, re-scoring
   difficulty in batches of 4. Density rises evenly through the song instead of
   piling onto the chorus.
3. Fidelity anchors (strong beats / motif members) still can never disappear, and
   every tier remains an identity-preserving subset of the real notes.

Measured result: Clair de Lune Easy·Core went from first note @ 37.5 s / 37.5 s
max gap → **first note @ 0.5 s / 3.0 s max gap** (98 → 293 notes, still 2★).

### `difficulty.js` — typing-strain descriptor
Because the standard layout maps each pitch class to a fixed key (mirrored on
both hands), finger geometry is computable straight from pitch classes, before
hand assignment. New `typingStrain()`:

- per-chord: same-finger pairs, top+bottom-row "claw" spans, stacked
  same-column verticality (u over j), wide-spread + uneven-row shapes (y + ;)
- per-bigram: same-finger consecutive keys and same-finger row leaps, scaled by
  how little time there is between them

Weights rebalanced to the founder's feel calibration: **typing 0.18** (new),
**peak speed 0.20 → 0.10** (demoted), density 0.26, displacement 0.14,
stretch 0.10, polyphony 0.08, entropy 0.08, irregularity 0.06. The thinning loop
targets this score, so awkward-shape passages now *count as harder* and tiers
thin accordingly. The finger table (`_KEYGEO`) is the calibration surface —
tune it from playtesting, not from theory.

### `solvePlan.js` — soft constraints + full-fidelity fallback
- **Crossing is a soft penalty (18 + overlap), not a ban.** The melody-hand +
  other-hand-grabs-the-high-C pattern is now legal; the solver just prefers not
  to cross when uncrossed is as good. *(Supersedes the "no crossing" line in
  DECISIONS.md per the founder's transcript.)*
- **Never skip a whole event.** If a chord has no playable split, its
  least-salient notes are dropped one at a time until one exists. Dropped notes
  fall through the existing skip→backing path (they still *sound* via Rest of
  Song; they just don't fall). Chord cap raised 9→10 (= 5+5 hand capacity) and
  truncation now drops by salience, not by pitch.
- **srcHand penalty 40 → 12** — the file's staff split is a hint, not law.
- **New voice-continuity cost (6/note):** notes the extractor tagged as the lead
  keep to one hand so the tune doesn't ping-pong between hands.
- **Shift cues fire 0.85 s early** (was 0.45 s), clamped to never precede the
  previous event — slices settle before the note lands.

Remaining honest limitation: on genuinely dense piano writing (Clair de Lune
Full: 218/1468; Entertainer Full: 533/2621) some notes still can't be reached by
two one-octave slices at once. Those are backing, by design. Making Full mean
"everything falls" requires either wider slices or diad/triad keys — both are
already on the customization roadmap (docs/03, DECISIONS "Slices").

## Next (not in this change)
- **Calibrate `_KEYGEO` and the strain constants from real play data** — log
  per-note accuracy vs. predicted strain, fit the weights.
- **Per-tier window density caps** (Easy ≤ ~1.5 notes/s per window) as a second
  guardrail alongside the global target.
- **Custom slice configs in the solver**: `handStates()` and `keyForMidi()` are
  the only functions that assume one-octave slices; generalize them over the
  `MAP` object (N keys/hand, asymmetric ranges, one mega-slice) and the Viterbi
  needs no other change. This is the path to "2 keys left / 18 right."
- **Runtime slice-shift animation**: the plan now cues early; verify the
  renderer honors `timeSec` rather than animating on arrival.

## Verification
- `node tests/run-headless.js` → ALL CHECKS PASSED (goldens regenerated for the
  new thinning; export-test's "no fetch in bundle" failure predates this change).
- `node scripts/build.mjs` → tkg.html builds clean.
- Also found: `songs/canon-in-d.mid` is not a valid MIDI file (bad download).

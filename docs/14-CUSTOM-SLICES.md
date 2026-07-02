# 14 — Custom Slices: the generalized N-slice core

Founder ask: *"map any number of slices to any number of notes across the whole
keyboard — two on the left and 18 on the right, or one mega slice, or eight
slices all over — and re-run the solver to good hand positions."*

## The model (`src/engine/slices.js`)

A **slice** is a named group of computer keys, each at a fixed **semitone
offset** from the slice's movable **anchor** (a MIDI note). Shifting moves the
anchor by `step` semitones (12 for the standard octave slices, but configurable).

```js
makeSlice('right', { j:0, k:2, l:4, ... }, { step:12, minAnchor:12, maxAnchor:96, order:1 })
```

- `keys` values are numeric offsets or pitch-class names (`'C#'` → 1), so legacy
  octave maps convert losslessly. Offsets may exceed 11 — an 18-key slice spans
  17 semitones.
- `order` is the slice's spatial rank (low = "left"), used only for the soft
  crossing penalty.
- Duplicate offsets are legal (two keys → the same note); the assigner picks an
  unused key, which is the future hook for diads/triads.

## The solver (`solvePlanSlices(notes, slices)`)

The two-hand beam-search Viterbi, generalized: **state = the tuple of slice
anchors** instead of (leftOctave, rightOctave). Per onset event it enumerates
every assignment of notes → slices (N^n, budget-capped), finds each slice's
feasible anchors (the intersection of every assigned note's reachable anchors,
with distinct keys), and beam-searches the cheapest anchor path. The cost model
is the same one the game already plays: shift count ×10, time-pressure spikes,
register preference, soft crossing (18+overlap), soft srcHand (12/note), melody
continuity (6/note). The never-skip-a-whole-event fallback carries over: an
unplayable chord sheds its least-salient notes one at a time.

**Physics fall out of the model for free.** A 2-key {root, fifth} slice that
shifts by octaves can only ever reach two pitch classes — the solver correctly
refuses a D when the slice holds C and G, rather than faking it. A 24-key mega
slice can't reach a 29-semitone simultaneous spread. These aren't bugs; they're
the honest reachability of the shape you configured, and the warning-dialog path
(parseConfidence) is where to surface them per song.

## `solvePlan()` is now an adapter

The legacy entry point builds the two current slices from `MAP` (whatever shape
it holds), runs `solvePlanSlices`, and converts anchors back to the
left/right-octave contract the runtime, tests, and goldens speak. **The standard
game now runs on the generalized core** — proven by the untouched headless
suite passing and identical skip counts on the real library (Clair de Lune full:
218, Für Elise: 31, Entertainer: 533; core/two-voice: 0 everywhere).

## What is playable TODAY vs. what needs runtime work

**Playable today (in the real game, via config):** any **two-slice** shape.
`slices.mapping.{left,right}` values now accept numeric offsets, and
`applyMapping` / `keyForMidi` / `midiForGameKey` are offset-based, so
2-left/18-right or a single 24-key mega hand (`hands:'right'` + a wide right
map) solve, render falling keys, and sound at the shown anchor. Covered by
`tests/slices.test.js` case 5 through the legacy `solvePlan()` path.

**Engine-ready, runtime-pending (N > 2 slices):** `solvePlanSlices` solves 3+
slices (test case 4), but the runtime still speaks two hands:
- `userSlice{L,R}` + Tab/Enter/Shift shift keys → needs `userSlice` keyed by
  slice id and per-slice up/down keys in config
  (`slices.list[i].shiftKeys:{up,down}`).
- `render.js` slice highlight and `ui.js` map viewer assume one-octave windows —
  highlight width should come from `slice.span+1`, and colors from a per-slice
  palette instead of the two-hand skin.
- `resolvePlan()`/`Song.slicePlan` carry `{leftOctave,rightOctave}` — switch to
  the anchors object once the renderer reads it.
- Config schema: add `slices.list` (validated array of `{id, keys, step,
  shiftKeys, color}`) alongside legacy `slices.mapping`; when `list` is absent,
  build the two legacy slices. `loadConfig` must keep its never-throw contract.

That runtime pass is mechanical — the solver, the state, the cues, and the
tests already exist underneath it.

## Tests
`node tests/slices.test.js` — legacy parity, 2+18 asymmetric (including
*fewer shifts than the standard layout on the same melody*, 2 vs 4 — wider
slices are measurably easier, which should eventually feed the difficulty
score), one mega slice, three slices, and a custom MAP through the legacy path.
Wire it into `scripts/verify.sh` alongside `run-headless.js`.

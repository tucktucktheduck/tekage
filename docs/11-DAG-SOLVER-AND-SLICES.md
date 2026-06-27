# 11 · DAG SOLVER & SLICES

> The slices are the single biggest differentiator and "must be perfect." This doc
> bounds what the solver must do now vs. later so it never becomes an unbuildable
> general engine.

## Contract (unchanged)

`solvePlan(notes, sliceConfig) → plan` groups onsets, assigns each note a
`{hand, key}` and an octave-shift timeline, enforces **no hand-crossing** and **one
window per hand**, and penalizes shifts. You change **which notes** reach it (07)
and the **slice config** (10); you do **not** change how it assigns. It already
tolerates chords and skips infeasible notes (→ Rest-of-Song covers them).

## Scope: build the common case excellently

- **Now:** 2 hands, **1–2 notes/hand**, standard QWERTY mapping. This must be rock
  solid — comfortable, few shifts, no crossing, two hands genuinely used.
- **Configurable but not required to be optimal:** **1–60 keys per hand** (full
  keyboard incl. number row), asymmetric hands, one-hand mode, custom key→note
  mappings — all supplied via `slices` in `TKGConfig` (10).
- **Fallback:** if a slice/mapping config makes solving intractable or low-quality,
  degrade to **Auto-Shift** (engine drives the slices) rather than failing.
- **Later (reserve, don't build):** **diads/triads** (one key → multiple piano
  notes). Leave a config field; the solver treats them as a future case.

"Good enough for 90% with defaults; power users accept complexity." (DECISIONS)

## Two hands stay two hands

A monophonic line is split across both hands by register (never collapsed to one),
so the player locks in with both hands. Octave leaps between phrases are
encouraged, not penalized. (See 02; the one-hand-collapse path is removed.)

## Confidence + the warning dialog

On load, compute a **parse/solve confidence**: does the file ship a baked melody?
can we extract a strong core? how many notes does the solver skip? If confidence is
low, show the exact dialog (copy in DECISIONS / 05):
*"Our note loader is not that complicated (yet). There might be some bugs from your
MIDI file."* — **Play Anyway / Go Back to Library**, **Don't show again**.

## Difficulty signal

Primary = **density (notes/sec)** → **1–5 stars**. Later, fold in shift-complexity
and rhythm-pattern into a richer rating (method open — see QUESTIONS). Density is
the proven litmus; keep it as the backbone.

## Acceptance criteria

- [ ] Default config (2 hands, 1–2 notes/hand, QWERTY): solves comfortably, both
      hands used, no crossing, minimal shifts on the test set.
- [ ] Slice config from `TKGConfig` (one-hand / asymmetric / N keys / custom map)
      changes solving with no code change; intractable configs fall back to
      Auto-Shift, never crash.
- [ ] Load confidence computed; low confidence shows the exact warning dialog with
      the three controls.
- [ ] Each version exposes a density value and a 1–5 star rating.
- [ ] Diads/triads remain a reserved config field, unimplemented.

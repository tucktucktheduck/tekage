# 12 · TESTING & VERIFICATION

> An autonomous loop is only as safe as its verification. No feature is "done"
> without a check that proves it. This is what lets the founder walk away.

## Layers

1. **Headless engine tests** (`node tests/run-headless.js`) — fast, pure, no
   browser. Cover everything in the ENGINE layer (parse, `deriveVersions`,
   `solvePlan`, scoring, `VoiceManager` logic, config). This is the workhorse;
   run it constantly.
2. **Browser smoke** (`npx playwright test`) — the built `tkg.html` (or dev page)
   loads with **no console errors**, version buttons render, the keyboard-map
   viewer opens, a note can be played, mode/version switches don't throw.
3. **Console-error gate** — any console error during smoke fails the run.
4. **Golden tests** — a fixed song + config must yield an identical `plan` /
   versions JSON; catches silent regressions in extraction/solver.

`./scripts/verify.sh` runs 1–3 and is the **commit gate**. Green = safe to commit.

## What to assert (engine)

A proven reference harness ships in `tests/reference-harness.js` (it runs against
the visual-identity reference `tekage-synth.html` and passes today). Port its
assertions to `src/` modules. It checks, at minimum:

- `deriveVersions` returns ≥2 versions, **ranked ascending by density**; Easy <
  Medium ≤ Full; Full == whole song; version notes are **references into the full
  note set** (identity preserved so backing works).
- After solve: every active note has a `hand` + `key`; **both hands used** on a
  non-trivial version (no one-hand collapse); every note is yours, backing, or skip.
- `VoiceManager`: N `noteOn` → N live; `noteOff(key)` releases exactly one;
  re-press same key retriggers (no orphan); `allNotesOff()` → **0 live**; 200
  presses without release + panic → 0; the per-frame watchdog reaps overdue voices.
- Draw/update stress across play+listen and all versions throws nothing.
- (Add per feature) Auto-Slow reacts to a miss and recovers; config round-trips
  through `loadConfig`/`exportHTML`; lead-line accuracy vs. labeled fixtures.

## Fixtures (the agent creates these early)

`tests/fixtures/`: `simple-melody.mid` (C scale), `pop-song.mid`, `dense-piano.mid`,
`chord-heavy.mid`, `octave-jump.mid`, `multi-part.mid`, plus hand-labeled lead
notes for a few, and `golden-*.json` expected outputs. Building these is the first
backlog task in Stage 1 (the loop can't self-verify extraction without them).

## Commands (must work)

```bash
node tests/run-headless.js     # engine assertions
npx playwright test            # browser smoke
./scripts/verify.sh            # both + console-error gate  → commit gate
./scripts/smoke-test.sh        # quick "does it boot" check
python3 -m http.server 8000    # local dev server
```

## Rules

- Every feature lands with a test asserting each acceptance-criteria box.
- Never delete a test or weaken an assertion to go green (AGENTS §5).
- Performance targets (smooth 60fps, <50ms audio latency, <5s load) are goals; a
  perf regression is a warning, a correctness regression is a blocker.

## Acceptance criteria (for the test setup itself)

- [ ] `tests/run-headless.js` runs with `node`, exits non-zero on any failure.
- [ ] `tests/fixtures/` populated with the MIDIs + golden JSON above.
- [ ] Playwright smoke loads the game, asserts zero console errors, exercises
      version + map viewer.
- [ ] `./scripts/verify.sh` returns 0 only when all of the above pass.

# AGENTS.md — How to build TKG autonomously

You are an AI agent (Claude Code) building **TKG**, a piano rhythm game played on
the QWERTY keyboard. You work in a loop, mostly unsupervised. This file is your
operating manual. Read it at the start of **every** session.

## 0. Prime directive

Ship working, verifiable increments toward the spec in `/docs`, one backlog task
at a time, never breaking what works. When in doubt, prefer the smallest change
that satisfies the current task's acceptance criteria and keeps all tests green.

## 1. Source of truth (read order)

1. `docs/DECISIONS.md` — every settled product decision, dense. **This wins** over
   anything else if they conflict.
2. `docs/00-VISION.md` … `docs/12-…` — the specs. Each ends in **acceptance
   criteria** (checkboxes) — those are your definition of done per feature.
3. `backlog/STAGE-*.md` — the ordered task list you execute. Start at the top
   unchecked task of the lowest-numbered stage.
4. `docs/SOURCE-founder-transcript.md` — the founder's own words (raw). Use to
   resolve nuance the structured docs don't cover. Never contradict DECISIONS.md.

If a task is ambiguous and the answer isn't in the above, **write your assumption
into the task's notes, choose the option that best serves `00-VISION.md`, and
proceed** — do not stall. Log the open question in `backlog/QUESTIONS.md`.

## 2. The loop (do this, repeatedly)

```
1. git pull; run ./scripts/verify.sh   → must be green before you start
2. Pick the top unchecked task in the lowest open backlog stage
3. Read the docs it references; restate its acceptance criteria to yourself
4. Implement the smallest change that meets them
5. ./scripts/verify.sh                  → engine + browser + smoke
   - fail → fix and retry (max 3 attempts); still failing → see §5
6. green → check the task's boxes, update the doc's acceptance criteria
7. git add -A && git commit -m "tkg(stage-N): <task> — <one line>"
8. Append one line to backlog/PROGRESS.md (what changed, what's verified)
9. Go to 2
```

Never skip step 5. Never commit red. Never check a box you didn't verify.

## 3. Where you build (architecture in one paragraph)

TKG has two halves: a **modular engine/runtime in `src/`** (where you build and
where tests run) and a **single self-contained `tkg.html`** that players run,
produced by `npm run build` bundling `src/` + a config object. Develop in `src/`;
the bundle is an output, not the source. Keep engine logic (parse, extraction,
solver, scoring) **pure** — no DOM/audio — so it's unit-testable headless. See
`docs/01-ARCHITECTURE.md` and `docs/10-CONFIG-AND-HTML-GENERATOR.md`. The existing
`tekage-synth.html` is the **visual-identity reference**, not the build target.

## 4. Hard rules (do not violate)

- **Don't break the solver contract.** `solvePlan(notes) → plan` keeps its
  signature; you change *which notes* reach it, not how it assigns hands. (07, 11)
- **All sound goes through `VoiceManager`.** No oscillator/voice created elsewhere.
  Every exit path calls `allNotesOff()`. (04) Ghost notes are a release blocker.
- **Renderer reads every visual from the skin/config interface** — no hard-coded
  colors/images. (03)
- **Keep engine modules free of `document`/`AudioContext`.** (01)
- **Preserve the visual identity** of `tekage-synth.html` (retro-futurist, space,
  Teklet console). Don't restyle without a task that says so.
- **No `localStorage` in engine logic** — go through the storage interface. (01)
- **Never commit code that fails `./scripts/verify.sh`.**
- Don't add dependencies without recording why in the commit message.

## 5. When stuck

- A test fails 3× on the same task → revert your change (`git checkout -- .`),
  write the failure + your hypothesis to `backlog/QUESTIONS.md`, mark the task
  `BLOCKED` in its backlog file, and move to the next unblocked task.
- A bug resists ~10 attempts across sessions → stop touching it, leave it BLOCKED
  with a written repro, and continue elsewhere. Do not thrash.
- Never delete tests to make them pass. Never weaken an assertion to go green.

## 6. Stop conditions (end the session, summarize)

Stop and write a session summary to `backlog/PROGRESS.md` when any is true:
- the current stage's tasks are all checked and `verify.sh` is green, **or**
- everything left in the open stage is BLOCKED, **or**
- you've made 0 net progress in 3 consecutive loop iterations.

Do **not** advance past the stage marked `STOP-FOR-REVIEW` in the backlog without
human sign-off — leave it for the founder to review.

## 7. Verification you can trust

- `node tests/run-headless.js` — pure-engine assertions (extraction ranks by
  density, solver places notes, two hands stay two hands, VoiceManager → 0 live
  voices after panic, etc.). Fast; run constantly.
- `npx playwright test` — browser smoke: loads with no console errors, version
  buttons render, map viewer opens, a note can be played.
- `./scripts/verify.sh` — runs both + a console-error gate. Green = safe to commit.
- Add a test with every feature. A feature without a check is not done.

## 8. Definition of done (per task)

A task is done only when: its acceptance criteria boxes are checked **and** a test
asserts each one **and** `verify.sh` is green **and** the change is committed with a
clear message **and** `PROGRESS.md` has a line for it.

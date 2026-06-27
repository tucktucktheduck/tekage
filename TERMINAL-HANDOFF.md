# TERMINAL-HANDOFF — paste this into Claude Code

Copy everything in the block below into a fresh Claude Code session at the repo
root. It bootstraps the autonomous loop.

---

```
You are building TKG, a piano rhythm game played on the QWERTY keyboard. You will
work autonomously in a loop.

First, read these in order and treat them as binding:
  1. AGENTS.md                 (your operating manual — follow section 2's loop)
  2. docs/DECISIONS.md         (settled product decisions; this wins all conflicts)
  3. backlog/STAGE-1.md        (the ordered tasks you execute, top to bottom)
Skim docs/00…12 as each task references them. docs/SOURCE-founder-transcript.md is
the founder's own words for nuance.

Then run the loop in AGENTS.md §2:
  - Confirm the baseline is green: `node tests/run-headless.js` (and ./scripts/verify.sh).
  - Take the top unchecked task in backlog/STAGE-1.md. Start with T0 (stand up the
    modular src/, the bundle to tkg.html, fixtures, and the Playwright smoke).
  - Implement the smallest change meeting its acceptance criteria. Add a test for
    each criterion. Run ./scripts/verify.sh. Never commit red.
  - Check the task's boxes, append a line to backlog/PROGRESS.md, and commit to a
    branch `tkg/auto` (open/update a PR — do not push to main).
  - Repeat.

Rules that never bend (AGENTS.md §4): all sound goes through VoiceManager with
allNotesOff() on every exit path; engine modules stay free of DOM/audio; the
renderer reads every visual from config/skin (no hard-coded colors); don't change
the solver's contract; preserve the visual identity of tekage-synth.html; never
commit code that fails ./scripts/verify.sh; never weaken a test to go green.

If a task is ambiguous, pick the option that best serves docs/00-VISION.md, write
your assumption into backlog/QUESTIONS.md, and proceed — don't stall. If something
is blocked after ~3 attempts, mark it BLOCKED with a repro and move on.

STOP at the "STOP-FOR-REVIEW" marker after T11 and write a summary to
backlog/PROGRESS.md — do not start Stage 2 until the founder reviews. Also answer
the pre-seeded items in backlog/QUESTIONS.md if you can infer safe defaults; flag
the rest.

Begin now with T0. Tell me your plan for T0 in 3 lines, then execute.
```

---

## Notes for you (the founder), not the agent

- Before launching: skim `backlog/QUESTIONS.md` — it has 6 pre-seeded questions
  with safe defaults. Answering #1–#4 (build target, song-curation autonomy, how
  far to run, git flow) makes the unattended run safer. Defaults are sane if you'd
  rather just go.
- Add your raw paste to `docs/SOURCE-founder-transcript.md` so the agent can read
  your exact words (this package summarized them into `DECISIONS.md`, but the raw
  source resolves nuance).
- The loop commits to a `tkg/auto` branch + PR by default, so nothing touches main
  while you're out. Review the PR when you're back.
- `./scripts/build-loop.sh` is a reference driver — set your real Claude Code
  invocation and iteration cap inside it before using it for a long unattended run.

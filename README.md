# TKG — autonomous build handoff

This package turns TKG into something an AI coding agent (Claude Code) can build on
a loop, mostly unsupervised. Drop it into the repo root
(`github.com/tucktucktheduck/tekage`), point your terminal Claude at it, and walk
away.

## What's here

```
AGENTS.md                      ← the agent's operating manual (read first, every loop)
TERMINAL-HANDOFF.md            ← the exact prompt to paste into Claude Code to start
README.md                      ← this file
tekage-synth.html              ← visual-identity reference + a working build, used by
                                 the headless harness (NOT the build target)
docs/
  DECISIONS.md                 ← authoritative settled decisions (wins all conflicts)
  00-VISION … 12-TESTING       ← the specs; each ends in acceptance criteria
  SOURCE-founder-transcript.md ← the founder's own words (add the raw paste here)
backlog/
  STAGE-1.md                   ← ordered task cards the loop executes (start here)
  STAGE-2.md                   ← next stage (gated on review)
  PROGRESS.md / QUESTIONS.md   ← the loop's running log + open questions
scripts/
  verify.sh                    ← commit gate (engine + browser + console-error)
  smoke-test.sh / build-loop.sh
tests/
  run-headless.js              ← engine assertions (green today against the reference)
  reference-harness.js         ← frozen proven example to port to src/
  fixtures/                    ← MIDIs + golden outputs (agent's first task)
```

## How to launch the loop

1. Put this folder's contents at the repo root and commit.
2. Open Claude Code in the repo.
3. Paste the prompt from `TERMINAL-HANDOFF.md`.
4. (Optional) let it run hands-off: `./scripts/build-loop.sh 50` — but read that
   script first and set your Claude Code invocation + git flow.
5. Come back; read `backlog/PROGRESS.md` and the open PR / branch.

## The two-minute mental model

- **One config object** drives everything (look, slices, mapping, mode, assists).
  Dynamic in dev; **Export bakes it into a scrappy standalone `tkg.html`** players
  run. (`docs/10`)
- **Engine is pure** (parse, extraction, solver, scoring) → headless-testable.
  Runtime (audio/canvas/input) is impure and swappable. (`docs/01`)
- **No feature is done without a test.** `./scripts/verify.sh` is the commit gate.
- **`docs/DECISIONS.md` is law.** When anything conflicts, it wins.

## Verify it's wired right now

```bash
node tests/run-headless.js   # should print "ALL CHECKS PASSED" and exit 0
```

That green baseline is what the loop protects and grows.

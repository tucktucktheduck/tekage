# OPEN QUESTIONS (agent appends; founder answers between sessions)
# When blocked or assuming, log it here with your chosen default so the loop continues.

## Pre-seeded for the founder (answer when convenient — defaults in brackets)
1. Build target: modular `src/` compiling to `tkg.html`, with `tekage-synth.html`
   as visual reference. [DEFAULT: yes — agents build in src/, bundle to tkg.html]
2. Song-library autonomy: should the agent fetch/curate Mutopia MIDIs and build the
   difficulty map itself, or stage candidates for human review? [DEFAULT: stage a
   candidate list + auto difficulty stars, but DON'T ship songs without review]
3. How far unsupervised: stop at Stage-1 STOP-FOR-REVIEW, or continue into Stage 2?
   [DEFAULT: stop at STOP-FOR-REVIEW]
4. Git flow: commit to a `tkg/auto` branch and open a PR, or commit to main?
   [DEFAULT: branch + PR]
5. Richer difficulty rating (shifts + rhythm) — method open; density+stars for now.
6. Blurt's personality/voice — TBD; placeholder copy from docs/08 for now.

## Logged by the build agent
- [T0 assumption] "Modular src/" was implemented as the **single-file-now, split-later**
  model from docs/01 (§"Single-file now, split later"): the engine was cut VERBATIM from
  tekage-synth.html into src/ files (one per MODULE banner) that the build concatenates in
  src/manifest.json order — NOT yet ES modules with import/export. This preserved the proven
  behavior exactly (all baseline checks + goldens green) and avoided a risky logic rewrite.
  Converting to true ESM (add imports/exports) is a clean follow-up when desired; it just
  needs build.mjs + tests/run-headless.js updated to load via imports. OK as the stage-1 shape?
- [Defaults taken] #1 build-in-src/bundle-to-tkg.html = YES (done). #4 git flow = branch
  `tkg/auto` (commits land there). #3 will stop at STOP-FOR-REVIEW after T11.

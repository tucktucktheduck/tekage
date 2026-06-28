# PROGRESS LOG (append one line per completed task; newest at bottom)
# format: <date> <stage/task> — <what changed> — <what's verified>

2026-06-27 T0 — Split the proven engine from tekage-synth.html VERBATIM into modular src/ (engine/runtime/content/shell, 12 files, MODULE banners preserved); added scripts/build.mjs (concatenates src/ per src/manifest.json into self-contained tkg.html) and src/shell/template.html; re-pointed tests/run-headless.js at src/; added 6 fixtures (scripts/gen-fixtures.mjs) + golden extraction/solver outputs; added Playwright smoke (tests/ui/smoke.spec.js, builds tkg.html in globalSetup). Cleaned junk a prior run appended to tekage-synth.html. — Verified: ./scripts/verify.sh green (engine 20+ checks + 6 goldens + 2 browser smoke, zero console errors). NOTE: src/ files are concatenation fragments in src/manifest.json order (the "single-file now, split later" model in docs/01) — they are NOT yet ESM modules with imports. Edit a section's file; the build/test reassemble in order. Do not add `import`/`export` between them without updating build.mjs + run-headless.js.
2026-06-27 T1 - VoiceManager exit-path assertions - verified node tests/run-headless.js green [model:qwen3-coder:30b]
2026-06-28 T2 - T2 extraction edge-case coverage - verified node tests/run-headless.js green [model:qwen3-coder:30b]
2026-06-28 T4 - T4 two-hands coverage - verified node tests/run-headless.js green [model:qwen3-coder:30b]
2026-06-28 T6 - T6 isYours partition coverage - verified node tests/run-headless.js green [model:qwen3-coder:30b]

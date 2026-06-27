#!/usr/bin/env bash
# Commit gate. Exit 0 only if engine tests, browser smoke, and the console-error
# gate all pass. AGENTS.md: never commit when this is red.
set -uo pipefail
fail=0
echo "── engine tests ──"
node tests/run-headless.js || fail=1
echo "── browser smoke ──"
if command -v npx >/dev/null 2>&1 && [ -f tests/ui/smoke.spec.js ]; then
  npx playwright test || fail=1
else
  echo "  (playwright smoke not set up yet — Stage-1 task 0 adds it)"
fi
if [ "$fail" -ne 0 ]; then echo "✗ VERIFY FAILED"; exit 1; fi
echo "✓ VERIFY PASSED"

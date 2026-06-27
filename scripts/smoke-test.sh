#!/usr/bin/env bash
# Quick "does it boot without console errors" check on the built artifact.
set -uo pipefail
node tests/run-headless.js >/dev/null 2>&1 && echo "✓ engine boots" || { echo "✗ engine broken"; exit 1; }

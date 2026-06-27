#!/usr/bin/env bash
# Reference driver for an autonomous Claude Code loop. Claude Code reads AGENTS.md
# and works the backlog itself; this script just keeps invoking it and gates each
# pass on ./scripts/verify.sh. Adapt the invocation to your runner.
set -uo pipefail
MAX_ITERS="${1:-50}"
for i in $(seq 1 "$MAX_ITERS"); do
  echo "═══ loop iteration $i ═══"
  # Replace the next line with your non-interactive Claude Code invocation, e.g.:
  #   claude -p "Read AGENTS.md. Do the next backlog task. Verify and commit."
  claude -p "Read AGENTS.md and follow the loop in section 2. Complete the next unchecked backlog task, verify with ./scripts/verify.sh, and commit. If everything is blocked or the stage is done or you hit a STOP-FOR-REVIEW, say so and stop." || true
  if ! ./scripts/verify.sh; then echo "verify red after iteration $i — stopping for review"; exit 1; fi
done

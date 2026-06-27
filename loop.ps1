<#
  loop.ps1 -- Windows-native autonomous build loop for TKG, using a LOCAL model
  (Qwen3-Coder-30B via Ollama) driven by Aider, in place of `claude -p`.

  This is the local-model equivalent of scripts/build-loop.sh. Each iteration:
    1. invokes Aider with the AGENTS.md bootstrap (read-only context: AGENTS,
       DECISIONS, STAGE-1). Aider edits files, runs the engine test, and commits.
    2. gates on `node tests/run-headless.js`. If red, it stops for review.

  Usage:
    .\loop.ps1            # 20 iterations (default)
    .\loop.ps1 -Iters 50
    .\loop.ps1 -Iters 1   # single pass, good for first-run sanity check
#>
param([int]$Iters = 20)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Make freshly-installed tools visible in this session.
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Ollama / model runtime knobs.
$env:OLLAMA_API_BASE   = "http://127.0.0.1:11434"
$env:OLLAMA_CONTEXT_LENGTH = "16384"   # match .aider.model.settings.yml num_ctx
$env:OLLAMA_KEEP_ALIVE = "30m"         # keep the 18 GB model resident between calls

# Work on a branch, never main (mirrors AGENTS.md / TERMINAL-HANDOFF).
git rev-parse --verify tkg/auto *> $null
if ($LASTEXITCODE -ne 0) { git checkout -b tkg/auto } else { git checkout tkg/auto }

$bootstrap = @'
Read AGENTS.md and follow the loop in its section 2. Take the top unchecked task
in backlog/STAGE-1.md (start at T0: stand up the modular src/, the bundle to
tkg.html, fixtures, and the Playwright smoke). Implement the smallest change that
meets its acceptance criteria, add a test for each criterion, and keep
node tests/run-headless.js green. Never weaken a test to pass. Check the task's
boxes, append one line to backlog/PROGRESS.md, and commit. If a task is ambiguous,
pick what best serves docs/00-VISION.md, note your assumption in
backlog/QUESTIONS.md, and proceed. If blocked after ~3 tries, mark it BLOCKED with
a repro and move on. STOP at the STOP-FOR-REVIEW marker after T11. Do ONE task now.
'@

for ($i = 1; $i -le $Iters; $i++) {
  Write-Host "`n=== loop iteration $i / $Iters ===" -ForegroundColor Cyan

  python -m aider `
    --read AGENTS.md --read docs/DECISIONS.md --read backlog/STAGE-1.md `
    --message $bootstrap

  Write-Host "-- gate: node tests/run-headless.js --" -ForegroundColor Yellow
  node tests/run-headless.js
  if ($LASTEXITCODE -ne 0) {
    Write-Host "verify RED after iteration $i -- stopping for review." -ForegroundColor Red
    exit 1
  }
}
Write-Host "`nLoop finished ($Iters iterations). Review backlog/PROGRESS.md and the tkg/auto branch." -ForegroundColor Green

<#
  bench.ps1 -- fair, scoped bake-off across local models.
  Runs the IDENTICAL tightly-scoped task through each model and reports whether it
  applied a clean edit, whether the engine test stayed green, and how fast.
  Fixes the prior loop's flaw: the task names exactly one file (already in chat),
  so the model never needs to go pulling the whole repo into a tiny context.

  Usage: .\bench.ps1
  Artifacts (edits + logs) land in $env:TEMP\tkg_bench for review.
#>
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$env:OLLAMA_API_BASE = "http://127.0.0.1:11434"
$env:OLLAMA_CONTEXT_LENGTH = "16384"
$env:OLLAMA_KEEP_ALIVE = "2m"      # free each model's RAM promptly between runs
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$target = "tests/run-headless.js"
$bench = Join-Path $env:TEMP "tkg_bench"
New-Item -ItemType Directory -Force -Path $bench | Out-Null
$baseline = Join-Path $bench "baseline.js"
Copy-Item $target $baseline -Force      # snapshot the clean file

# Task passed via a FILE (--message-file), not a command-line arg, so PowerShell
# never mangles quotes/parens in it. No embedded double-quotes either, to be safe.
$task = @'
Open tests/run-headless.js. Find the VOICEMANAGER ghost-note invariants test block
(it contains assertions like A.noteOn(...) and A.allNotesOff(true) using a helper ok).
Add exactly ONE more assertion in that block using the existing helper ok(condition, message):
after three A.noteOn calls with distinct keys, calling A.allNotesOff(false) must make
A.liveCount() equal 0. Match the one-line style of the surrounding assertions.
Edit ONLY tests/run-headless.js. Do not create, import, or add any other files.
'@
$taskFile = Join-Path $bench "task.txt"
Set-Content -LiteralPath $taskFile -Value $task -Encoding ASCII

$models = @(
  'ollama_chat/qwen3-coder:30b',
  'ollama_chat/devstral',
  'ollama_chat/deepseek-coder-v2:16b',
  'ollama_chat/gemma3:12b'
)

$results = @()
foreach ($m in $models) {
  $safe = ($m -replace '[/:]', '_')
  Write-Host "`n=== $m ===" -ForegroundColor Cyan
  Copy-Item $baseline $target -Force        # restore clean state

  $t0 = Get-Date
  python -m aider --model $m --file $target --no-auto-commits --no-pretty --no-stream `
    --yes-always --no-show-model-warnings --message-file $taskFile > (Join-Path $bench "$safe.aider.log") 2>&1
  $secs = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)

  $changed = (Get-FileHash $target).Hash -ne (Get-FileHash $baseline).Hash
  node $target > (Join-Path $bench "$safe.test.log") 2>&1
  $green = ($LASTEXITCODE -eq 0)
  # any stray files the model created/edited beyond the target?
  $stray = (git status --porcelain | Where-Object { $_ -notmatch 'run-headless\.js' }) -join '; '
  Copy-Item $target (Join-Path $bench "$safe.edited.js") -Force

  $results += [pscustomobject]@{
    Model    = ($m -replace 'ollama_chat/', '')
    Edited   = $changed
    TestPass = $green
    Sec      = $secs
    Stray    = if ($stray) { $stray } else { '-' }
  }
  Copy-Item $baseline $target -Force        # reset for next model
}

Write-Host "`n================ BAKE-OFF RESULTS ================" -ForegroundColor Green
$results | Format-Table -AutoSize
Write-Host "Artifacts (edits + logs): $bench"
Write-Host "A good result = Edited:True AND TestPass:True AND Stray:- (clean, correct, scoped)."

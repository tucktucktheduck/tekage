<#
  loop.ps1 -- card-driven local build loop for TKG.

  Rebuilt around what the bake-off proved: a small local model succeeds when each
  task is SCOPED to its files and the prompt is passed cleanly. So instead of
  "read AGENTS.md and figure out the whole repo" (which buried the model in an
  80 KB context), each task is a card in tasks/*.json naming exactly the file(s)
  to edit, the file(s) to read for reference, and a precise prompt.

  Each iteration: run Aider scoped to one card -> gate on node tests/run-headless.js
  -> commit + mark done if green, or revert the edit and stop if red. Never commits
  red; only ever touches the tkg/auto branch.

  Usage:
    .\loop.ps1                              # next pending card, model qwen3-coder:30b
    .\loop.ps1 -Model devstral              # give another model a fair shake
    .\loop.ps1 -Model gemma3:12b -Task T1   # run a specific card
    .\loop.ps1 -Iters 5                     # work up to 5 cards in a row
  (Use .\loop.cmd ... if PowerShell's execution policy blocks the script.)
#>
param(
  [string]$Model = "qwen3-coder:30b",
  [string]$Task  = "",
  [int]$Iters    = 1
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$env:OLLAMA_API_BASE       = "http://127.0.0.1:11434"
$env:OLLAMA_CONTEXT_LENGTH = "16384"
$env:OLLAMA_KEEP_ALIVE     = "30m"
$env:PYTHONUTF8            = "1"
$env:PYTHONIOENCODING      = "utf-8"

$aiderModel   = "ollama_chat/$Model"
$completedLog = "tasks/.completed"
$promptFile   = Join-Path $env:TEMP "tkg_task_prompt.txt"

# Work on a branch, never main.
if ([string]::IsNullOrWhiteSpace((git branch --list tkg/auto))) { git checkout -b tkg/auto } else { git checkout tkg/auto }

for ($i = 1; $i -le $Iters; $i++) {
  $completed = @(Get-Content $completedLog -ErrorAction SilentlyContinue)
  $cards = Get-ChildItem "tasks" -Filter "*.json" | Sort-Object Name

  if ($Task) {
    $card = $cards | Where-Object { $_.BaseName -eq $Task } | Select-Object -First 1
    if (-not $card) { Write-Host "No task card named '$Task' in tasks/." -ForegroundColor Red; break }
  } else {
    $card = $cards | Where-Object { $completed -notcontains $_.BaseName } | Select-Object -First 1
    if (-not $card) { Write-Host "`nNo pending task cards. All done." -ForegroundColor Green; break }
  }

  $c = Get-Content $card.FullName -Raw | ConvertFrom-Json
  Write-Host "`n=== $($card.BaseName): $($c.title)  (model: $Model) ===" -ForegroundColor Cyan
  Set-Content -LiteralPath $promptFile -Value $c.prompt -Encoding ASCII

  # Build a SCOPED aider invocation: only the card's files in the chat.
  $pyArgs = @('-m','aider','--model',$aiderModel,'--no-pretty','--no-stream',
              '--yes-always','--no-show-model-warnings','--no-auto-commits')
  foreach ($f in $c.files) { $pyArgs += '--file'; $pyArgs += $f }
  foreach ($r in $c.read)  { $pyArgs += '--read'; $pyArgs += $r }
  $pyArgs += '--message-file'; $pyArgs += $promptFile
  python @pyArgs

  Write-Host "-- gate: node tests/run-headless.js --" -ForegroundColor Yellow
  node tests/run-headless.js
  if ($LASTEXITCODE -eq 0) {
    $changed = git status --porcelain
    if ($changed) {
      git add -A
      git commit -q -m "tkg($($card.BaseName)): $($c.title) [model:$Model]"
      Add-Content $completedLog $card.BaseName
      Add-Content "backlog/PROGRESS.md" ("{0} {1} - {2} - verified node tests/run-headless.js green [model:{3}]" -f (Get-Date -Format yyyy-MM-dd), $card.BaseName, $c.title, $Model)
      Write-Host "COMMITTED $($card.BaseName) (tests green)." -ForegroundColor Green
    } else {
      Write-Host "Model produced no change for $($card.BaseName) -- not marking done. Stopping." -ForegroundColor Yellow
      break
    }
  } else {
    Write-Host "TEST RED on $($card.BaseName) -- reverting the model's edit, leaving card un-done." -ForegroundColor Red
    git checkout -- .
    break
  }
  if ($Task) { break }   # -Task runs exactly one card
}
Write-Host "`nDone. Review: git log --oneline  |  type backlog\PROGRESS.md" -ForegroundColor Green

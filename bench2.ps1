<#
  bench2.ps1 -- graded bake-off. Runs every model through every harder card in
  tasks/bench/*.json (scoped, prompt via file, fresh baseline each run) and records
  the signals needed to grade accuracy/precision: did it edit, did the test pass,
  how many lines it added (minimalism), did it touch stray files, and how long.
  Edited files + logs land in $env:TEMP\tkg_bench2 for line-by-line grading.
#>
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$env:OLLAMA_API_BASE = "http://127.0.0.1:11434"
$env:OLLAMA_CONTEXT_LENGTH = "16384"
$env:OLLAMA_KEEP_ALIVE = "10m"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$target = "tests/run-headless.js"
$out = Join-Path $env:TEMP "tkg_bench2"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$baseline = Join-Path $out "baseline.js"
Copy-Item $target $baseline -Force
$promptFile = Join-Path $out "prompt.txt"

$models = @('qwen3-coder:30b','devstral','gemma3:12b','deepseek-coder-v2:16b')
$cards = Get-ChildItem "tasks/bench" -Filter "*.json" | Sort-Object Name

$results = @()
foreach ($model in $models) {
  $aiderModel = "ollama_chat/$model"
  foreach ($card in $cards) {
    $c = Get-Content $card.FullName -Raw | ConvertFrom-Json
    $tag = ($model -replace '[/:]', '_') + "." + $card.BaseName
    Write-Host "`n=== $model / $($card.BaseName) ===" -ForegroundColor Cyan
    Copy-Item $baseline $target -Force
    Set-Content -LiteralPath $promptFile -Value $c.prompt -Encoding ASCII

    $t0 = Get-Date
    python -m aider --model $aiderModel --file $target --read $c.read[0] `
      --no-auto-commits --no-pretty --no-stream --yes-always --no-show-model-warnings `
      --message-file $promptFile > (Join-Path $out "$tag.aider.log") 2>&1
    $secs = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)

    $edited = (Get-FileHash $target).Hash -ne (Get-FileHash $baseline).Hash
    $added = (Compare-Object (Get-Content $baseline) (Get-Content $target) | Where-Object SideIndicator -eq '=>').Count
    node $target > (Join-Path $out "$tag.test.log") 2>&1
    $pass = ($LASTEXITCODE -eq 0)
    $stray = (git status --porcelain | Where-Object { $_ -notmatch 'run-headless\.js' }) -join '; '
    Copy-Item $target (Join-Path $out "$tag.edited.js") -Force

    $results += [pscustomobject]@{
      Model = $model; Card = $card.BaseName; Edited = $edited; Pass = $pass
      Added = $added; Sec = $secs; Stray = (if ($stray) { 'Y' } else { '-' })
    }
    Copy-Item $baseline $target -Force
  }
}

Write-Host "`n================ GRADED BAKE-OFF (raw signals) ================" -ForegroundColor Green
$results | Format-Table -AutoSize
Write-Host "Edits + logs: $out"

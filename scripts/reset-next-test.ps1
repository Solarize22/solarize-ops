$ErrorActionPreference = "Stop"

$workspace = "C:\Users\tomyo\Projects\solarize-ops"
$envPath = Join-Path $workspace ".env.test.local"
$logPath = Join-Path $workspace ".codex-next-test-combined.log"
$nextPath = Join-Path $workspace ".next"

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Missing $envPath. Copy .env.test.example to .env.test.local and fill in the test database settings first."
}

foreach ($port in @(3000, 3001)) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $listeners) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300
  }
}

if (Test-Path -LiteralPath $nextPath) {
  Remove-Item -LiteralPath $nextPath -Recurse -Force
}

if (Test-Path -LiteralPath $logPath) {
  Remove-Item -LiteralPath $logPath -Force
}

Get-Content -LiteralPath $envPath | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }

  $pair = $line -split "=", 2
  if ($pair.Length -ne 2) {
    return
  }

  $name = $pair[0].Trim()
  $value = $pair[1]

  if (
    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
    ($value.StartsWith("'") -and $value.EndsWith("'"))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
}

if (-not $env:APP_URL) {
  $env:APP_URL = "http://localhost:3001"
}

if (-not $env:NEXT_PUBLIC_APP_URL) {
  $env:NEXT_PUBLIC_APP_URL = $env:APP_URL
}

Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm.cmd run dev -- --port 3001 > .codex-next-test-combined.log 2>&1" -WorkingDirectory $workspace | Out-Null

Write-Output "Solarize CRM TEST is restarting on http://localhost:3001"

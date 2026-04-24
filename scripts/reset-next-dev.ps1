$ErrorActionPreference = "Stop"

$workspace = "C:\Users\tomyo\Projects\solarize-ops"
$logPath = Join-Path $workspace ".codex-next-dev-combined.log"
$nextPath = Join-Path $workspace ".next"

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Stop-Process -Id $listener.OwningProcess -Force
  Start-Sleep -Milliseconds 500
}

if (Test-Path -LiteralPath $nextPath) {
  Remove-Item -LiteralPath $nextPath -Recurse -Force
}

Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm.cmd run dev > .codex-next-dev-combined.log 2>&1" -WorkingDirectory $workspace | Out-Null

Write-Output "Reset complete. Dev server is restarting on http://localhost:3000"

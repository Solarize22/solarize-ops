$ErrorActionPreference = "Stop"

$workspace = "C:\Users\tomyo\Projects\solarize-ops"
$startLogPath = Join-Path $workspace ".codex-next-start.log"
$nextPath = Join-Path $workspace ".next"

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Stop-Process -Id $listener.OwningProcess -Force
  Start-Sleep -Seconds 1
}

if (Test-Path -LiteralPath $nextPath) {
  Remove-Item -LiteralPath $nextPath -Recurse -Force
}

if (Test-Path -LiteralPath $startLogPath) {
  Remove-Item -LiteralPath $startLogPath -Force
}

Push-Location $workspace
try {
  & cmd.exe /c "npm.cmd run build"
  if ($LASTEXITCODE -ne 0) {
    throw "Next production build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

Start-Process -FilePath "cmd.exe" -ArgumentList "/k","cd /d $workspace && npm.cmd run start" -WorkingDirectory $workspace | Out-Null

$isListening = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  $currentListener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($currentListener) {
    $isListening = $true
    break
  }
}

if (-not $isListening) {
  throw "Next preview server did not start on http://localhost:3000"
}

Write-Output "Preview reset complete. Production server is running on http://localhost:3000"

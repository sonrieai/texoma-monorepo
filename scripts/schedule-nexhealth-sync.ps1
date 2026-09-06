# Register or remove a daily Windows task that triggers NexHealth → Mongo sync via HTTP.
#
# Usage:
#   .\scripts\schedule-nexhealth-sync.ps1 -Register
#   .\scripts\schedule-nexhealth-sync.ps1 -Register -BaseUrl "https://texoma.vercel.app" -At "06:00"
#   .\scripts\schedule-nexhealth-sync.ps1 -Unregister
#
# Reads SYNC_SECRET from .env.local in repo root (or -EnvFile).

param(
  [switch]$Register,
  [switch]$Unregister,
  [string]$BaseUrl = "http://localhost:5001",
  [string]$At = "06:00",
  [string]$EnvFile = "",
  [string]$TaskName = "Texoma-NexHealth-Sync"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) { $EnvFile = Join-Path $RepoRoot ".env.local" }

function Get-SyncSecret {
  if (-not (Test-Path $EnvFile)) {
    throw "Env file not found: $EnvFile (set SYNC_SECRET or pass -EnvFile)"
  }
  $line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*SYNC_SECRET\s*=' } | Select-Object -First 1
  if (-not $line) { throw "SYNC_SECRET not found in $EnvFile" }
  $value = ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
  if (-not $value) { throw "SYNC_SECRET is empty in $EnvFile" }
  return $value
}

$ActionScript = Join-Path $RepoRoot "scripts\invoke-nexhealth-sync.ps1"

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed scheduled task: $TaskName"
  exit 0
}

if (-not $Register) {
  Write-Host @"
Texoma NexHealth sync scheduler

  -Register     Create daily task ($At local time)
  -Unregister    Remove task
  -BaseUrl       Dashboard URL (default: http://localhost:5001)
  -At            Daily time HH:mm (default: 06:00)
"@
  exit 0
}

$secret = Get-SyncSecret
$triggerTime = [DateTime]::ParseExact($At, "HH:mm", $null)

$invokeContent = @"
`$ErrorActionPreference = 'Stop'
`$uri = '$BaseUrl/api/sync/nexhealth'
`$headers = @{ 'x-sync-secret' = '$secret' }
try {
  `$res = Invoke-RestMethod -Uri `$uri -Method GET -Headers `$headers -TimeoutSec 600
  `$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Write-Output "`[$ts`] OK lastSyncedAt=`$(`$res.lastSyncedAt)"
} catch {
  `$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Write-Error "`[$ts`] Sync failed: `$_"
  exit 1
}
"@

Set-Content -Path $ActionScript -Value $invokeContent -Encoding UTF8

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ActionScript`""

$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Description "Daily NexHealth to Mongo warehouse sync for Texoma dashboard" -Force | Out-Null

Write-Host "Registered task: $TaskName"
Write-Host "  Schedule: daily at $At (local)"
Write-Host "  URL: $BaseUrl/api/sync/nexhealth"
Write-Host "  Runner: $ActionScript"

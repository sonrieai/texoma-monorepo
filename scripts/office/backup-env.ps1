# Copies .env.local to a dated backup folder (login DB is Mongo Atlas — no SQLite data\).
#
# Example:
#   .\scripts\office\backup-env.ps1 -InstallDir C:\texoma-dashboard
#   .\scripts\office\backup-env.ps1 -InstallDir C:\texoma-dashboard -BackupRoot D:\backups\texoma

param(
  [Parameter(Mandatory = $false)]
  [string]$InstallDir = "C:\texoma-dashboard",

  [Parameter(Mandatory = $false)]
  [string]$BackupRoot = ""
)

$ErrorActionPreference = "Stop"

$InstallDir = (Resolve-Path $InstallDir).Path
$envFile = Join-Path $InstallDir ".env.local"
if (-not (Test-Path $envFile)) {
  throw ".env.local not found at $envFile"
}

if (-not $BackupRoot) {
  $BackupRoot = Join-Path $InstallDir "backups"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destDir = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Path $destDir -Force | Out-Null

$dest = Join-Path $destDir ".env.local"
Copy-Item -Path $envFile -Destination $dest -Force

Write-Host "Backed up .env.local -> $dest"
Write-Host "Keep this folder offline / restricted. Do not commit to git."

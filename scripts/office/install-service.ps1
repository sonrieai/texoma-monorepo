# Requires: Run as Administrator. NSSM must be on PATH or passed via -NssmPath.
# Installs Windows service "TexomaKPI" that runs npm run start:lan from the install dir.
#
# Prerequisites (do these first):
#   1. Node 24 installed
#   2. Repo at InstallDir with npm ci + npm run build completed
#   3. .env.local configured (OD_MYSQL_* + Mongo auth)
#
# Example:
#   .\scripts\office\install-service.ps1 -InstallDir C:\texoma-dashboard

param(
  [Parameter(Mandatory = $false)]
  [string]$InstallDir = "C:\texoma-dashboard",

  [Parameter(Mandatory = $false)]
  [string]$ServiceName = "TexomaKPI",

  [Parameter(Mandatory = $false)]
  [string]$NssmPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-Nssm {
  param([string]$Explicit)
  if ($Explicit -and (Test-Path $Explicit)) { return (Resolve-Path $Explicit).Path }
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    "C:\nssm\nssm.exe",
    "C:\Program Files\nssm\nssm.exe",
    "C:\Tools\nssm\nssm.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return $c }
  }
  throw "nssm.exe not found. Install NSSM and add to PATH, or pass -NssmPath."
}

$InstallDir = (Resolve-Path $InstallDir).Path
if (-not (Test-Path (Join-Path $InstallDir "package.json"))) {
  throw "package.json not found in $InstallDir — point -InstallDir at the Texoma repo root."
}
if (-not (Test-Path (Join-Path $InstallDir ".next"))) {
  throw ".next missing — run 'npm ci' and 'npm run build' in $InstallDir first."
}

$node = (Get-Command node -ErrorAction Stop).Source
$npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
$nssm = Resolve-Nssm -Explicit $NssmPath

Write-Host "InstallDir: $InstallDir"
Write-Host "Node:       $node"
Write-Host "npm:        $npmCmd"
Write-Host "NSSM:       $nssm"
Write-Host "Service:    $ServiceName"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Stopping and removing existing service $ServiceName..."
  & $nssm stop $ServiceName | Out-Null
  Start-Sleep -Seconds 2
  & $nssm remove $ServiceName confirm | Out-Null
}

# NSSM runs npm.cmd with AppParameters "run start:lan" (binds 0.0.0.0:8080)
& $nssm install $ServiceName $npmCmd
& $nssm set $ServiceName AppParameters "run start:lan"
& $nssm set $ServiceName AppDirectory $InstallDir
& $nssm set $ServiceName AppStdout (Join-Path $InstallDir "logs\service-stdout.log")
& $nssm set $ServiceName AppStderr (Join-Path $InstallDir "logs\service-stderr.log")
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateBytes 1048576
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName ObjectName LocalSystem

$logsDir = Join-Path $InstallDir "logs"
if (-not (Test-Path $logsDir)) {
  New-Item -ItemType Directory -Path $logsDir | Out-Null
}

Write-Host "Starting $ServiceName..."
& $nssm start $ServiceName

Write-Host "Done. Service $ServiceName should listen on http://0.0.0.0:8080"
Write-Host "Check: Get-Service $ServiceName ; Get-Content $logsDir\service-stderr.log -Tail 40"

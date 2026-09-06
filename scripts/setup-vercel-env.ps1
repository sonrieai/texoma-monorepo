# Push environment variables from .env.local to Vercel (Production + Preview + Development).
# Prerequisites: npx vercel login && npx vercel link --project texoma-dashboard --scope sonrie

$ErrorActionPreference = "Stop"
$envFile = Join-Path (Join-Path $PSScriptRoot "..") ".env.local" | Resolve-Path -ErrorAction SilentlyContinue

if (-not $envFile) {
  Write-Error ".env.local not found. Copy .env.example to .env.local and fill in values first."
}

$scope = if ($env:VERCEL_SCOPE) { $env:VERCEL_SCOPE } else { "sonrie" }
function Invoke-Vercel {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & npx vercel@latest @Args
}

function Add-VercelEnv {
  param([string]$Key, [string]$Value)
  $temp = New-TemporaryFile
  try {
    Set-Content -Path $temp -Value $Value -NoNewline -Encoding utf8
    Get-Content -Path $temp -Raw | Invoke-Vercel env add $Key production preview development --scope $scope --force
  } finally {
    Remove-Item -Path $temp -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Linking project texoma-monorepo (scope: $scope)..." -ForegroundColor Cyan
Invoke-Vercel link --project texoma-monorepo --scope $scope --yes

$keys = @(
  "MONGODB_URI",
  "MONGODB_URL",
  "MONGODB_DB",
  "NEXHEALTH_API_KEY",
  "NEXHEALTH_SUBDOMAIN",
  "NEXHEALTH_LOCATION_ID",
  "NEXHEALTH_BASE_URL",
  "NEXHEALTH_API_VERSION",
  "NEXHEALTH_TIMEZONE",
  "NEXHEALTH_DEBUG",
  "SYNC_SECRET",
  "SYNC_NEXHEALTH_ENABLED",
  "GHL_API_KEY",
  "GHL_LOCATION_ID",
  "GHL_BASE_URL",
  "GHL_SOURCE_CUSTOM_FIELD_ID"
)

$lines = Get-Content $envFile | Where-Object { $_ -and $_ -notmatch '^\s*#' }

foreach ($key in $keys) {
  $match = $lines | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
  if (-not $match) { continue }

  $value = ($match -split "=", 2)[1].Trim()
  if (-not $value) { continue }

  Write-Host "Adding $key ..." -ForegroundColor Green
  Add-VercelEnv -Key $key -Value $value
}

Write-Host "Done. Redeploy: npx vercel deploy --prod --scope $scope" -ForegroundColor Cyan

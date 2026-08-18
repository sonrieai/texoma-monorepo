# Push environment variables from .env.local to Vercel (Production + Preview + Development).
# Prerequisites: npx vercel login && npx vercel link --project texoma-dashboard --scope sonrie

$ErrorActionPreference = "Stop"
$envFile = Join-Path $PSScriptRoot ".." ".env.local" | Resolve-Path -ErrorAction SilentlyContinue

if (-not $envFile) {
  Write-Error ".env.local not found. Copy .env.example to .env.local and fill in values first."
}

$scope = if ($env:VERCEL_SCOPE) { $env:VERCEL_SCOPE } else { "sonrie" }
$vercel = "npx vercel@latest"

Write-Host "Linking project texoma-dashboard (scope: $scope)..." -ForegroundColor Cyan
& $vercel link --project texoma-dashboard --scope $scope --yes

$keys = @(
  "MONGODB_URI",
  "MONGODB_URL",
  "MONGODB_DB",
  "NEXHEALTH_API_KEY",
  "NEXHEALTH_SUBDOMAIN",
  "NEXHEALTH_LOCATION_ID",
  "NEXHEALTH_BASE_URL",
  "NEXHEALTH_API_VERSION",
  "NEXHEALTH_NP_CONSULT_TYPE_IDS",
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
  $value | & $vercel env add $key production preview development --scope $scope --force
}

Write-Host "Done. Redeploy: npx vercel deploy --prod --scope $scope" -ForegroundColor Cyan

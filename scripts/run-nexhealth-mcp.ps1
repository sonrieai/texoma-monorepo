# Loads NexHealth creds from .env.local and starts the nexhealth-mcp server for Cursor.
# Requires: uv + `uv tool install git+https://github.com/ChrisKildunne/nexhealth-mcp.git`

$ErrorActionPreference = "Continue"
$env:PYTHONWARNINGS = "ignore"

$repoRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $repoRoot ".env.local"

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

if (-not $env:NEXHEALTH_API_KEY) {
  Write-Error "NEXHEALTH_API_KEY missing. Add it to $envFile (see .env.example)."
}

if ($env:NEXHEALTH_TIMEZONE -and -not $env:NEXHEALTH_TIMEZONE_OVERRIDE) {
  $env:NEXHEALTH_TIMEZONE_OVERRIDE = $env:NEXHEALTH_TIMEZONE
}

$mcpExe = Join-Path $env:USERPROFILE ".local\bin\nexhealth-mcp.exe"
if (-not (Test-Path $mcpExe)) {
  Write-Error "nexhealth-mcp.exe not found at $mcpExe. Run: uv tool install git+https://github.com/ChrisKildunne/nexhealth-mcp.git"
}

& $mcpExe @args

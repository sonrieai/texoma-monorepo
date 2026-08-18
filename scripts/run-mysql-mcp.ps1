# Loads Open Dental MySQL creds from .env.local and starts MySQL MCP for Cursor.
# Requires: Node.js + npx (@benborla29/mcp-server-mysql)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path $PSScriptRoot -Parent
$launcher = Join-Path $PSScriptRoot "run-mysql-mcp.mjs"

if (-not (Test-Path $launcher)) {
  Write-Error "Missing $launcher"
  exit 1
}

& node $launcher @args

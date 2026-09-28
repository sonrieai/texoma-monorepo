# Requires: Run as Administrator on the Open Dental Windows Server.
# Opens inbound TCP 8080 for LocalSubnet only (office LAN — not the public internet).

$ErrorActionPreference = "Stop"
$RuleName = "Texoma KPI Dashboard (8080 LocalSubnet)"
$Port = 8080

Write-Host "Configuring Windows Firewall rule: $RuleName"

$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Rule already exists — removing and recreating..."
  Remove-NetFirewallRule -DisplayName $RuleName
}

New-NetFirewallRule `
  -DisplayName $RuleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -RemoteAddress LocalSubnet `
  -Profile Domain,Private `
  -Description "Texoma Next.js KPI dashboard — office LAN only (LocalSubnet)."

Write-Host "Done. Inbound TCP $Port allowed from LocalSubnet (Domain/Private profiles)."
Write-Host "Verify from an office PC: http://<SERVER-IP>:$Port/login"

# Run once: adds Node on D: to your user PATH so npm works in any new terminal.
$nodeDir = "D:\node-portable\node-v24.11.0-win-x64"
if (-not (Test-Path "$nodeDir\npm.cmd")) {
  Write-Error "Node not found at $nodeDir"
  exit 1
}
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$nodeDir*") {
  $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $nodeDir } else { "$nodeDir;$userPath" }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  Write-Host "Added Node to user PATH. Close and reopen PowerShell/Cursor terminal."
} else {
  Write-Host "Node is already on user PATH."
}
$env:Path = "$nodeDir;$env:Path"
node -v
npm -v

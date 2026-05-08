# tau - CLI companion for the Tau app
# Runs the CLI script using Electron's Node.js runtime

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ElectronBin = Join-Path $ScriptDir "..\..\Tau.exe"
$CliEntry = Join-Path $ScriptDir "index.js"
$AppModules = Join-Path $ScriptDir "..\app.asar.unpacked\node_modules"
$AsarModules = Join-Path $ScriptDir "..\app.asar\node_modules"

if (-not (Test-Path $ElectronBin)) {
  Write-Error "Tau is not installed or the binary was not found at: $ElectronBin"
  exit 1
}

if (-not (Test-Path $CliEntry)) {
  Write-Error "CLI entry point not found at: $CliEntry"
  exit 1
}

$env:ELECTRON_RUN_AS_NODE = "1"
$env:NODE_PATH = "$AppModules;$AsarModules;$env:NODE_PATH"
& $ElectronBin $CliEntry $args

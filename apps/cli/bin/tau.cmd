@echo off
rem tau - CLI companion for the Tau app
rem Runs the CLI script using Electron's Node.js runtime

set "SCRIPT_DIR=%~dp0"
set "ELECTRON_BIN=%SCRIPT_DIR%..\..\Tau.exe"
set "CLI_ENTRY=%SCRIPT_DIR%index.js"
set "APP_MODULES=%SCRIPT_DIR%..\app.asar.unpacked\node_modules"
set "ASAR_MODULES=%SCRIPT_DIR%..\app.asar\node_modules"

if not exist "%ELECTRON_BIN%" (
  echo Error: Tau is not installed or the binary was not found at: >&2
  echo   %ELECTRON_BIN% >&2
  exit /b 1
)

if not exist "%CLI_ENTRY%" (
  echo Error: CLI entry point not found at: >&2
  echo   %CLI_ENTRY% >&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
set "NODE_PATH=%APP_MODULES%;%ASAR_MODULES%;%NODE_PATH%"
"%ELECTRON_BIN%" "%CLI_ENTRY%" %*

#!/bin/bash
# dev runner for tau CLI - finds electron from the monorepo
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MONO_ROOT="$(cd "$CLI_ROOT/../.." && pwd)"

# Find electron binary from the monorepo's node_modules
ELECTRON_BIN="$MONO_ROOT/node_modules/.pnpm/electron@34.5.8/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

if [ ! -f "$ELECTRON_BIN" ]; then
  # Fallback: try to find any electron in node_modules
  ELECTRON_BIN=$(find "$MONO_ROOT/node_modules/.pnpm" -path "*/electron/dist/Electron.app/Contents/MacOS/Electron" -type f 2>/dev/null | head -1)
fi

if [ -z "$ELECTRON_BIN" ] || [ ! -f "$ELECTRON_BIN" ]; then
  echo "Error: Cannot find Electron binary in monorepo." >&2
  echo "Make sure 'pnpm install' has been run in the root." >&2
  exit 1
fi

export ELECTRON_RUN_AS_NODE=1
exec "$ELECTRON_BIN" "$CLI_ROOT/dist/index.js" "$@"

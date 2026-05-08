#!/bin/bash
# tau - CLI companion for the Tau app
# Runs the CLI script using Electron's Node.js runtime

SOURCE="$0"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"

ELECTRON_BIN="${SCRIPT_DIR}/../../MacOS/Tau"
CLI_ENTRY="${SCRIPT_DIR}/index.js"
APP_MODULES="${SCRIPT_DIR}/../app.asar.unpacked/node_modules"
ASAR_MODULES="${SCRIPT_DIR}/../app.asar/node_modules"

if [ ! -f "$ELECTRON_BIN" ]; then
  echo "Error: Tau.app is not installed or the binary was not found at:" >&2
  echo "  $ELECTRON_BIN" >&2
  exit 1
fi

if [ ! -f "$CLI_ENTRY" ]; then
  echo "Error: CLI entry point not found at:" >&2
  echo "  $CLI_ENTRY" >&2
  exit 1
fi

export ELECTRON_RUN_AS_NODE=1
export NODE_PATH="${APP_MODULES}:${ASAR_MODULES}${NODE_PATH:+:$NODE_PATH}"
exec "$ELECTRON_BIN" "$CLI_ENTRY" "$@"

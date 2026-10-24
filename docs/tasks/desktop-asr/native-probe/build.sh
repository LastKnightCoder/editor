#!/bin/bash
set -euo pipefail

probe_sources="$(cd "$(dirname "$0")" && pwd)"
probe_output="${1:-/tmp/tau-asr-p1}"
probe_app="$probe_output/Tau ASR P1 Probe.app"
mkdir -p "$probe_app/Contents/MacOS"
cp "$probe_sources/Info.plist" "$probe_app/Contents/Info.plist"
xcrun swiftc -parse-as-library -swift-version 6 -warnings-as-errors \
  -target "$(uname -m)-apple-macos26.0" \
  "$probe_sources/Probe.swift" -o "$probe_app/Contents/MacOS/probe"
codesign --force --sign - --options runtime \
  --entitlements "$probe_sources/Entitlements.plist" "$probe_app"
codesign --verify --strict "$probe_app"
printf '%s\n' "$probe_app"

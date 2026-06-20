#!/usr/bin/env bash
# Build of the Driftpane demo (does NOT require building the monorepo).
#
# Compiles:
#   1) the layer  driftpane/src/*.ts  ->  demo/lib/*.js   (+ .d.ts)
#   2) the entry  demo/main.ts         ->  demo/main.js
#
# Tweakpane is NOT compiled: at runtime it is resolved via import-map to a CDN
# (see index.html). The 'tweakpane' types used by the demo are in the ambient
# demo/tweakpane.d.ts.
#
# Requirements: tsc (TypeScript) in PATH.
# Usage:        ./build.sh   (from the driftpane/demo folder)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "[driftpane] build layer  -> demo/lib"
tsc -p tsconfig.lib.json

echo "[driftpane] build demo   -> demo/main.js"
tsc -p tsconfig.demo.json

echo "[driftpane] done. Serve the folder with an HTTP server and open index.html:"
echo "             python3 -m http.server 8080   (then http://localhost:8080/)"

#!/usr/bin/env bash
# Genera audio, frames y MP4 de varios episodios en cola.
# Uso: bash tools/run_all.sh episodes/cap02-60-cajas episodes/cap03-perro-comision ...
set -uo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
for EP in "$@"; do
  EP="${EP%/}"
  echo "=== $EP: audio"
  "$PY" tools/build.py "$EP" || { echo "FALLO build $EP"; continue; }
  echo "=== $EP: frames"
  node tools/render.js --ep "$EP" || { echo "FALLO render $EP"; continue; }
  echo "=== $EP: mp4"
  bash tools/mux.sh "$EP" && echo "LISTO $EP" || echo "FALLO mux $EP"
done
echo "=== COLA TERMINADA"

#!/usr/bin/env bash
# Genera audio, frames y MP4 de varios episodios en cola.
# Uso: bash tools/run_all.sh episodes/cap02-60-cajas episodes/cap03-perro-comision ...
#   SKIP_DONE=1  salta los capítulos cuyo out/<cap>.mp4 es más nuevo que su script.json (para retomar tras un reinicio)
set -uo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
if ! curl -s -o /dev/null http://127.0.0.1:8777/web/index.html; then
  nohup python3 -m http.server 8777 --bind 127.0.0.1 > /dev/null 2>&1 &
  sleep 1
fi
for EP in "$@"; do
  EP="${EP%/}"; NAME="$(basename "$EP")"
  if [ "${SKIP_DONE:-0}" = "1" ] && [ "out/$NAME.mp4" -nt "$EP/script.json" ]; then echo "SALTO $EP (ya hecho)"; continue; fi
  echo "=== $EP: audio"
  "$PY" tools/build.py "$EP" || { echo "FALLO build $EP"; continue; }
  echo "=== $EP: frames"
  node tools/render.js --ep "$EP" || { echo "FALLO render $EP"; continue; }
  echo "=== $EP: mp4"
  bash tools/mux.sh "$EP" && echo "LISTO $EP" || echo "FALLO mux $EP"
done
echo "=== COLA TERMINADA"

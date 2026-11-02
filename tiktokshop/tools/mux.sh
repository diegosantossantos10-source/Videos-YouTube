#!/usr/bin/env bash
# Une frames + audio de un episodio en el MP4 final (H.264 + AAC, -14 LUFS para TikTok/Reels/Shorts)
# Uso: bash tools/mux.sh episodes/cap02-60-cajas   ->  out/cap02-60-cajas.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
EP="${1:-episodes/cap01-afiliado}"; EP="${EP%/}"
NAME="$(basename "$EP")"
mkdir -p out
ffmpeg -v error -y -framerate 30 -i "$EP/build/frames/%06d.jpg" -i "$EP/build/mix.wav" \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 192k -ar 48000 -shortest \
  "out/$NAME.mp4"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "out/$NAME.mp4"

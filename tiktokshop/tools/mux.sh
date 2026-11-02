#!/usr/bin/env bash
# Une frames + audio en el MP4 final (H.264 + AAC, -14 LUFS para TikTok/Reels/Shorts)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out
ffmpeg -v error -stats -y -framerate 30 -i build/frames/%06d.jpg -i build/mix.wav \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 192k -ar 48000 -shortest \
  out/claude_tiktokshop.mp4
ffprobe -v error -show_entries format=duration,size -of default=nw=1 out/claude_tiktokshop.mp4

# Claude me hizo afiliado de TikTok Shop — sketch 3D vertical

Vídeo vertical 1080x1920 a 30 fps (~71 s) al estilo del sketch "Claude… ¿por qué YouTube me va a pagar $5,000?":
Leo, con su gorro rojo, y el cubo naranja de Claude en una azotea de noche, con subtítulos arriba y tarjetas de datos animadas.
Aquí el tema es el programa de afiliados de TikTok Shop: Leo no tiene productos; Claude lo hizo afiliado, subió 3 videos
recomendando productos de otras marcas (2,000 ventas con su link, $8,000 en comisiones), pidió muestras gratis a 40 marcas
mientras Leo hablaba dormido y rentó una bodega para las cajas.

## Estructura

| Archivo | Qué hace |
|---|---|
| `script.json` | Guion: cada línea lleva quién habla, plano, gesto, subtítulo (`text`) y texto para la voz (`say`) |
| `tools/build.py` | Voces neuronales (edge-tts), `build/timeline.json`, efectos y música sintetizados, mezcla `build/mix.wav` |
| `web/scene.js` | Escena three.js (personajes low-poly, ciudad desenfocada, pantalla LED, cajas) + tarjetas y subtítulos en 2D |
| `tools/render.js` | Renderiza los frames en Chromium headless (Playwright) en paralelo |
| `tools/mux.sh` | Une los frames y el audio, y normaliza a -14 LUFS → `out/claude_tiktokshop_afiliados.mp4` |

## Regenerar

```bash
npm install                                   # three@0.160.0
pip install edge-tts numpy                    # en un venv
python tools/build.py                         # voces + timeline + audio
python3 -m http.server 8777 --bind 127.0.0.1 &   # desde esta carpeta
node tools/render.js --workers 3              # frames → build/frames
bash tools/mux.sh                             # vídeo final
```

Para cambiar diálogos, edita `script.json` y vuelve a correr todo; la duración de cada plano se ajusta sola a la voz.
`node tools/render.js --stills 57,145 --out build/stills` renderiza solo unos frames para revisarlos rápido.

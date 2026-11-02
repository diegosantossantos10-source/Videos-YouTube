# Serie «Mi IA me hizo afiliado» — sketches 3D verticales de TikTok Shop

Vídeos verticales 1080x1920 a 30 fps en el estilo del sketch "Claude… ¿por qué YouTube me va a pagar $5,000?":
Leo, con su gorro rojo, y el cubo naranja de Claude en una azotea de noche, con subtítulos arriba y tarjetas de datos animadas.
Nicho: afiliados de TikTok Shop. Desde el cap. 2, cada capítulo termina con un CTA de seguir la serie con la marca DiegoMastery
(degradado #00E5FF → #FF2E93 sobre #1E1E22, Montserrat ExtraBold), y cada CTA adelanta el capítulo siguiente.

| Capítulo | Historia | Escena | Tarjetas | Vídeo |
|---|---|---|---|---|
| 1 · Afiliado | Claude hizo afiliado a Leo: $8,000 en comisiones sin productos propios | Azotea clásica | números, mensaje | `out/cap01-afiliado.mp4` |
| 2 · 60 cajas | Las marcas mandan 60 muestras gratis; Leo se comió las papas de la freidora | Azotea llena de cajas | notificaciones, barras | `out/cap02-60-cajas.mp4` |
| 3 · El perro Comisión | Claude renta un perro para vender cepillos al 40% y luego lo contrata de planta | Cielo verde azulado, perro | barras, chat | `out/cap03-perro-comision.mp4` |
| 4 · Dormido en 4K | Leo se vuelve viral roncando con una máquina de ruido blanco | Cielo morado, antifaz, máquina | números, mensaje | `out/cap04-dormido-4k.mp4` |
| 5 · El primo copión | Brayan le copia los 14 videos; Claude lo convierte en socio | Atardecer | chat, gráfica | `out/cap05-primo-copion.mp4` |
| 6 · Pantuflas dino | Leo dice que las pantuflas son horribles y se agotan; las trae puestas | Pantuflas de dinosaurio | gráfica, notificaciones | `out/cap06-pantuflas-dino.mp4` |

## Estructura

| Archivo | Qué hace |
|---|---|
| `episodes/<cap>/script.json` | Guion del capítulo: diálogos (quién, plano, gesto, subtítulo `text`, voz `say`), tarjetas, CTA, decorado (`set`), pantalla LED (`screen`) y música |
| `tools/build.py` | Voces neuronales (edge-tts), `<cap>/build/timeline.json`, efectos y música sintetizados, mezcla `<cap>/build/mix.wav` |
| `web/scene.js` | Escena three.js (personajes low-poly, ciudad desenfocada, pantalla LED, props) + tarjetas, subtítulos y CTA en 2D |
| `tools/render.js` | Renderiza los frames en Chromium headless (Playwright) |
| `tools/mux.sh` | Une frames y audio, normaliza a -14 LUFS → `out/<cap>.mp4` |
| `tools/run_all.sh` | Cola: audio + frames + MP4 de varios capítulos |
| `tools/stills.py` | Lista de frames de prueba (un frame por plano) |

### Piezas disponibles para nuevos capítulos

- **Planos**: `wide`, `two`, `claude`, `claudeClose`, `claudeLow`, `leo`, `leoClose`, `leoXClose` (zoom de golpe), `leoFull`, `leoFeet`, `dog`, `cta`.
- **Gestos**: Leo `shock`, `angry`, `serious`, `calm`, `armsUp`; Claude `smug`, `happy`, `sad`.
- **Tarjetas** (`card`): `stats`, `message`, `notifs`, `compare`, `graph`, `chat`, `billboard` (miniatura en la pantalla gigante).
- **Decorado** (`set`): `sky` (`night`, `purple`, `teal`, `dusk`), `boxes: "many"`, `dog`, `slippers`, `sleepMask`, `noise`, `moon`, `seed`.
- **Iconos de producto**: `moon`, `led`, `termo`, `audif`, `aro`, `soporte`, `box`, `brush`, `noise`, `slipper`, `fryer`.
- **CTA**: una línea con `"shot": "cta"` y `"cta": {"name", "sub", "tag"}`.

## Regenerar

```bash
npm install                                      # three@0.160.0 + Montserrat
pip install edge-tts numpy                       # en un venv
python3 -m http.server 8777 --bind 127.0.0.1 &   # desde esta carpeta
PYTHON=venv/bin/python bash tools/run_all.sh episodes/cap02-60-cajas   # audio + frames + mp4
```

Para revisar un capítulo sin renderizarlo entero:
`node tools/render.js --ep episodes/cap02-60-cajas --stills $(python3 tools/stills.py episodes/cap02-60-cajas) --out episodes/cap02-60-cajas/build/stills`.
El render tarda unos 0.85 s por frame (unos 25 minutos por capítulo de 50 s).

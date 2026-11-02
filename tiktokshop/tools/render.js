// Render determinista de frames con Chromium headless (WebGL por SwiftShader).
// Uso: node tools/render.js --ep episodes/cap02-60-cajas [--workers 1] [--frames 0:1500] [--stills 10,200,...] [--out <ep>/build/frames]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('port', 8777);
const EP = arg('ep', 'episodes/cap01-afiliado').replace(/\/$/, '');
const OUT = path.resolve(ROOT, arg('out', `${EP}/build/frames`));
const WORKERS = +arg('workers', 2);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const tl = JSON.parse(fs.readFileSync(path.join(ROOT, EP, 'build/timeline.json')));
  const total = Math.round(tl.duration * tl.fps);
  let frames;
  if (arg('stills')) frames = arg('stills').split(',').map(Number);
  else { const [a, b] = (arg('frames', `0:${total}`)).split(':').map(Number); frames = []; for (let f = a; f < b; f++) frames.push(f); }
  if (!arg('stills') && !process.argv.includes('--force')) frames = frames.filter(f => !fs.existsSync(path.join(OUT, `${String(f).padStart(6, '0')}.jpg`)));
  console.log(`frames a renderizar: ${frames.length} con ${WORKERS} workers`);
  const chunks = Array.from({ length: WORKERS }, (_, k) => frames.filter((_, i) => i % WORKERS === k));
  const t0 = Date.now(); let done = 0;
  await Promise.all(chunks.map(async (list, k) => {
    if (!list.length) return;
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[w${k}]`, m.text()); });
    page.on('pageerror', e => console.log(`[w${k}] pageerror`, e.message));
    await page.goto(`http://localhost:${PORT}/web/index.html?ep=${encodeURIComponent(EP)}`);
    await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
    for (const f of list) {
      const url = await page.evaluate(n => window.frame(n), f);
      fs.writeFileSync(path.join(OUT, `${String(f).padStart(6, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
      done++;
      if (done % 100 === 0) { const el = (Date.now() - t0) / 1000; console.log(`${done}/${frames.length}  ${(el / done).toFixed(2)}s/frame  ETA ${((frames.length - done) * el / done / 60).toFixed(1)} min`); }
    }
    await browser.close();
  }));
  console.log(`listo en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})();

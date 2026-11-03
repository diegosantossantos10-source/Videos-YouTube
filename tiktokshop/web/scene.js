// Escena 3D + overlays 2D, guiada por los datos del episodio.
// Render determinista por frame: window.frame(n) -> dataURL JPEG.  URL: index.html?ep=episodes/<cap>
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const W = 1080, H = 1920;
const QS = new URLSearchParams(location.search);
const EP = QS.get('ep') || 'episodes/cap01-afiliado';
const TL = await (await fetch(`/${EP}/build/timeline.json`)).json();
const SET = Object.assign({ sky: 'night', boxes: 'normal', moon: true, exposure: 1.15 }, TL.set || {});
const V2 = TL.style === 'v2';
const HL = new Set((TL.hl || []).map(w => w.toUpperCase()));
const FPS = TL.fps;
for (const wt of [500, 600, 700, 800, 900]) await document.fonts.load(`${wt} 60px Inter`);
for (const wt of [800, 900]) document.fonts.add(await new FontFace('Montserrat', `url(/node_modules/@fontsource/montserrat/files/montserrat-latin-${wt}-normal.woff2)`, { weight: String(wt) }).load());

// ------------------------------------------------------------------ utilidades
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const backOut = t => { t = clamp(t); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .78, metalness: 0, flatShading: true }, o));
const RB = (w, h, d, r = .03) => new RoundedBoxGeometry(w, h, d, 2, r);
function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }
function fmtVal(v, o = {}) {
  let s;
  if (o.fmt === 'short') s = v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : fmtNum(v);
  else s = fmtNum(v);
  return (o.prefix || '') + s + (o.suffix || '');
}

// ------------------------------------------------------------------ renderer
const glc = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: QS.get('aa') !== '0', preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = SET.exposure;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.05, 400);

// ------------------------------------------------------------------ ciudad (escena aparte, se desenfoca)
const SKIES = {
  night: ['#010208', '#060a1c', '#151540', '#241a48', 0x0a0d1c],
  purple: ['#05010c', '#140a2c', '#33145a', '#5a1f66', 0x140a22],
  teal: ['#01060a', '#03131c', '#0a2b3a', '#14464f', 0x061820],
  dusk: ['#060814', '#1b1b3d', '#5c2b52', '#b4573f', 0x1c1426],
};
const SK = SKIES[SET.sky] || SKIES.night;
const city = new THREE.Scene();
city.fog = new THREE.Fog(SK[4], 40, 150);
{
  const [c, g] = canvas(16, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, SK[0]); gr.addColorStop(.45, SK[1]); gr.addColorStop(.75, SK[2]); gr.addColorStop(1, SK[3]);
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(700, 260), new THREE.MeshBasicMaterial({ map: tex(c), fog: false, toneMapped: false }));
  sky.position.set(0, 60, -140); city.add(sky);
}
{ // estrellas
  const r = mulberry(11 + (SET.seed || 0)), pts = [], col = [];
  for (let i = 0; i < 700; i++) {
    pts.push((r() - .5) * 520, 15 + r() * 160, -130 + r() * 8);
    const b = .35 + r() * .65; col.push(b, b, b * (.9 + r() * .2));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  city.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, toneMapped: false })));
}
const windowTex = [];
for (let v = 0; v < 7; v++) {
  const r = mulberry(100 + v + (SET.seed || 0) * 7), [c, g] = canvas(256, 512);
  g.fillStyle = '#070a13'; g.fillRect(0, 0, 256, 512);
  const litP = [.22, .35, .5, .3, .6, .18, .42][v];
  const palette = v % 3 === 0 ? ['#ffd27a', '#ffe6b0', '#ffc25c'] : v % 3 === 1 ? ['#ffe6b0', '#bcd4ff', '#ffd27a'] : ['#9cc0ff', '#d6e4ff', '#ffd27a'];
  for (let row = 0; row < 32; row++) {
    const floorLit = r() < .12 ? 1 : r() < .15 ? -1 : 0;
    for (let col = 0; col < 16; col++) {
      const on = floorLit === 1 ? r() < .9 : floorLit === -1 ? false : r() < litP;
      g.fillStyle = on ? palette[Math.floor(r() * palette.length)] : '#111828';
      g.globalAlpha = on ? .55 + r() * .45 : .9;
      g.fillRect(col * 16 + 4, row * 16 + 4, 9, 8);
    }
  }
  g.globalAlpha = 1;
  windowTex.push(c);
}
{
  const r = mulberry(5 + (SET.seed || 0));
  const facade = new THREE.MeshBasicMaterial({ color: 0x05070d, toneMapped: false });
  const placeRow = (n, zMin, zMax, xSpan, hMin, hMax) => {
    for (let i = 0; i < n; i++) {
      const w = 4 + r() * 9, d = 4 + r() * 8, h = hMin + r() * (hMax - hMin);
      const x = (r() - .5) * xSpan, z = zMin + r() * (zMax - zMin);
      const t = tex(windowTex[Math.floor(r() * windowTex.length)]);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, w / 9), Math.max(1, h / 18)); t.offset.set(r(), r());
      const front = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color().setScalar(.5 + r() * .4) });
      const ts = t.clone(); ts.repeat.set(Math.max(1, d / 9), Math.max(1, h / 18)); ts.needsUpdate = true;
      const side = new THREE.MeshBasicMaterial({ map: ts, toneMapped: false, color: new THREE.Color().setScalar(.45) });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, facade, facade, front, front]);
      m.position.set(x, -45 + h / 2, z); city.add(m);
    }
  };
  placeRow(26, -22, -34, 90, 40, 62);
  placeRow(34, -38, -60, 150, 42, 85);
  placeRow(40, -64, -100, 240, 40, 110);
}
const blurRT = [0, 1].map(() => new THREE.WebGLRenderTarget(W / 3, H / 3, { type: THREE.HalfFloatType }));
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() }, dim: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: `uniform sampler2D tex; uniform vec2 dir; uniform float dim; varying vec2 vUv;
    void main(){ vec4 c=vec4(0.); float w[5]; w[0]=.227; w[1]=.1945; w[2]=.1216; w[3]=.054; w[4]=.0162;
      c+=texture2D(tex,vUv)*w[0];
      for(int i=1;i<5;i++){ c+=texture2D(tex,vUv+dir*float(i))*w[i]; c+=texture2D(tex,vUv-dir*float(i))*w[i]; }
      gl_FragColor=vec4(c.rgb*(1.-dim),1.); }`,
  depthTest: false, depthWrite: false,
});
const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
fsScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat));
function renderCity(blur, dim) {
  renderer.setRenderTarget(blurRT[0]); renderer.render(city, camera);
  const passes = Math.max(1, Math.round(blur));
  for (let p = 0; p < passes; p++) {
    const s = blur <= 0 ? 0 : (1 + p * .6);
    blurMat.uniforms.tex.value = blurRT[0].texture; blurMat.uniforms.dir.value.set(s / (W / 3), 0); blurMat.uniforms.dim.value = 0;
    renderer.setRenderTarget(blurRT[1]); renderer.render(fsScene, fsCam);
    blurMat.uniforms.tex.value = blurRT[1].texture; blurMat.uniforms.dir.value.set(0, s / (H / 3)); blurMat.uniforms.dim.value = p === passes - 1 ? dim : 0;
    renderer.setRenderTarget(blurRT[0]); renderer.render(fsScene, fsCam);
  }
  renderer.setRenderTarget(null);
  scene.background = blurRT[0].texture;
}

// ------------------------------------------------------------------ azotea
{
  const [c, g] = canvas(1024, 1024), r = mulberry(3);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const v = 38 + Math.floor(r() * 10);
    g.fillStyle = `rgb(${v},${v + 2},${v + 7})`; g.fillRect(i * 128, j * 128, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(i * 128 + 6, j * 128 + 6, 116, 3);
  }
  g.fillStyle = '#121318';
  for (let i = 0; i <= 8; i++) { g.fillRect(i * 128 - 3, 0, 6, 1024); g.fillRect(0, i * 128 - 3, 1024, 6); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3.5, 3.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), new THREE.MeshStandardMaterial({ map: t, roughness: .38, metalness: .15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 4); floor.receiveShadow = true; scene.add(floor);
  const par = new THREE.Mesh(new THREE.BoxGeometry(28, .55, .35), mat(0x1a1c24, { flatShading: false }));
  par.position.set(0, .27, -9.8); scene.add(par);
}

// pantalla LED gigante
const SCR_W = 1600, SCR_H = 1000;
const [scrC, scrG] = canvas(SCR_W, SCR_H);
const scrTex = tex(scrC);
{
  const screen = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.95, 2.55, .14), mat(0x15171d, { flatShading: false, roughness: .5 }));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.76, 2.35), new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false, color: 0xd8d8d8 }));
  panel.position.z = .075;
  const SY = 4.0, LL = SY - 1.27;
  const legs = [-1.3, 1.3].map(x => { const l = new THREE.Mesh(new THREE.BoxGeometry(.12, LL, .12), mat(0x15171d)); l.position.set(x, -1.27 - LL / 2, -.05); return l; });
  screen.add(frame, panel, ...legs);
  screen.position.set(-.55, SY, -4.4); screen.rotation.y = .06;
  frame.castShadow = true; scene.add(screen);
  const sl = new THREE.PointLight(0x9fb8ff, 6, 9, 2); sl.position.set(-.55, 3.4, -3.0); scene.add(sl);
}

// cajas de envío
const boxMat = (() => {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#a8794a'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 40; i++) g.fillRect(0, i * 7, 256, 2);
  g.fillStyle = '#c9a272'; g.fillRect(110, 0, 36, 256);
  g.fillStyle = '#f4efe6'; g.fillRect(30, 170, 70, 46); g.fillStyle = '#333'; for (let i = 0; i < 4; i++) g.fillRect(38, 178 + i * 9, 54 - i * 8, 4);
  return new THREE.MeshStandardMaterial({ map: tex(c), roughness: .9 });
})();
function addBox(x, y, z, w, h, d, ry) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
  m.position.set(x, y + h / 2, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; scene.add(m); return m;
}
{
  const boxes = [[2.55, -1.6, .9, .7, .7, .2], [3.4, -1.3, .8, .65, .65, -.25], [2.95, -1.5, .7, .6, .6, .5, 1], [2.3, -2.9, .9, .8, .8, .1], [3.3, -2.8, .9, .9, .8, -.1], [2.75, -2.9, .7, .7, .6, .3, 1],
    [-2.85, -1.9, .8, .75, .7, .3], [-3.6, -2.4, .9, .8, .8, -.2], [-3.2, -2.2, .7, .6, .6, .1, 1]];
  for (const [x, z, w, h, d, ry, stack] of boxes) addBox(x, stack ? .76 : 0, z, w, h, d, ry);
  if (SET.boxes === 'many') { // pilas de muestras alrededor de la azotea
    const r = mulberry(21);
    const clusters = [[1.9, 4.9, -4.6, -.6], [-5.0, -2.0, -4.6, -.9], [-2.2, 1.6, -7.2, -5.4], [3.6, 5.6, -.4, 1.6], [-5.8, -3.8, -.6, 1.4]];
    for (const [x0, x1, z0, z1] of clusters) {
      for (let x = x0; x < x1; x += .82) for (let z = z0; z < z1; z += .82) {
        if (r() < .25) continue;
        const n = 1 + Math.floor(r() * 3); let y = 0;
        for (let k = 0; k < n; k++) { const s = .55 + r() * .25, h = .45 + r() * .3; addBox(x + (r() - .5) * .12, y, z + (r() - .5) * .12, s, h, s * (.9 + r() * .2), (r() - .5) * .5); y += h; }
      }
    }
  }
  if (SET.moon) {
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(.17, 2), new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd98a, emissiveIntensity: 1.6, roughness: .9, flatShading: true }));
    moon.position.set(2.95, .76 + .6 + .2, -1.5); scene.add(moon);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, .06, 8), mat(0x6b4a2e)); base.position.set(2.95, .76 + .6 + .03, -1.5); scene.add(base);
    const ml = new THREE.PointLight(0xffd48a, 2.2, 4, 2); ml.position.copy(moon.position); scene.add(ml);
  }
  if (SET.noise) { // máquina de ruido blanco
    const g = new THREE.Group(); g.position.set(-3.2, 1.36, -2.2);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.15, .16, .14, 18), mat(0xf2f4f7, { flatShading: false, roughness: .4 })); body.position.y = .07;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.12, .015, 6, 24), new THREE.MeshBasicMaterial({ color: 0x7fe9ff, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = .145;
    g.add(body, ring); scene.add(g);
    const nl = new THREE.PointLight(0x7fe9ff, 2.5, 4, 2); nl.position.set(-3.2, 1.7, -2.0); scene.add(nl);
  }
}

// ------------------------------------------------------------------ luces
scene.add(new THREE.HemisphereLight(0x3d4f86, 0x15110d, .75));
const key = new THREE.DirectionalLight(0xffd9bd, 1.9);
key.position.set(3.5, 6, 6.5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -3, near: 1, far: 25 });
key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 4;
scene.add(key);
const rim = new THREE.DirectionalLight(SET.sky === 'dusk' ? 0xffa98a : 0x8fa8ff, 1.6); rim.position.set(-4, 5, -6); scene.add(rim);
const fill = new THREE.PointLight(0x5c7cff, 4, 12, 2); fill.position.set(-3.2, 2.2, 3); scene.add(fill);

// ------------------------------------------------------------------ Leo
function partialIco(r, detail, pred) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, out = [];
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (pred(cx, cy, cz)) for (let k = 0; k < 3; k++) out.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
  }
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); ng.computeVertexNormals(); return ng;
}
const shadowAll = o => o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

const leo = {};
{
  const root = new THREE.Group(); leo.root = root;
  const skin = mat(0xb9784f), skinD = mat(0x9c623f), teal = mat(0x23786a), tealD = mat(0x1b5f54), navy = mat(0x1b2136), white = mat(0xeeeeee), red = mat(0xc4262c), redD = mat(0xa61e24), black = mat(0x0d0d10, { roughness: .3, flatShading: false });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.23, .6, .26), navy); leg.position.set(s * .125, .4, 0); root.add(leg);
    if (SET.slippers) { // pantuflas de dinosaurio
      const g = new THREE.Group(); g.position.set(s * .13, 0, .05);
      const green = mat(0x58b84f), greenD = mat(0x3f8c3a);
      const sl = new THREE.Mesh(RB(.3, .17, .46, .06), green); sl.position.y = .085; g.add(sl);
      for (let k = 0; k < 4; k++) { const tth = new THREE.Mesh(new THREE.ConeGeometry(.022, .05, 4), white); tth.rotation.x = Math.PI; tth.position.set(-.09 + k * .06, .07, .235); g.add(tth); }
      for (const e of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), white); eye.position.set(e * .07, .18, .14); g.add(eye);
        const pu = new THREE.Mesh(new THREE.SphereGeometry(.02, 6, 4), black); pu.position.set(e * .07, .19, .175); g.add(pu);
      }
      for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(.035, .08, 4), greenD); sp.position.set(0, .2, -.02 - k * .09); g.add(sp); }
      root.add(g);
    } else {
      const shoe = new THREE.Mesh(RB(.25, .11, .36), white); shoe.position.set(s * .125, .065, .04); root.add(shoe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(.26, .03, .37), mat(0x9aa0a8)); sole.position.set(s * .125, .015, .04); root.add(sole);
    }
  }
  const torso = new THREE.Group(); torso.position.y = .68; root.add(torso); leo.torso = torso;
  const body = new THREE.Mesh(RB(.66, .62, .38, .05), teal); body.position.y = .31; torso.add(body);
  const band = new THREE.Mesh(RB(.67, .07, .39), tealD); band.position.y = .03; torso.add(band);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(.42, .17, .03), tealD); pocket.position.set(0, .17, .19); torso.add(pocket);
  for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(.025, .2, .025), white); st.position.set(s * .07, .48, .2); torso.add(st); }
  const hood = new THREE.Mesh(new THREE.TorusGeometry(.17, .075, 6, 12), tealD); hood.rotation.x = Math.PI / 2; hood.position.set(0, .63, -.02); torso.add(hood);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, .14, 8), skinD); neck.position.y = .66; torso.add(neck);
  leo.arms = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * .41, .56, 0); torso.add(piv);
    const arm = new THREE.Mesh(RB(.18, .52, .21, .04), teal); arm.position.y = -.25; piv.add(arm);
    const hand = new THREE.Mesh(RB(.15, .14, .17), skin); hand.position.y = -.57; piv.add(hand);
    piv.userData.s = s; leo.arms.push(piv);
  }
  const head = new THREE.Group(); head.position.y = .72; torso.add(head); leo.head = head;
  const face = new THREE.Group(); face.position.y = .25; head.add(face); leo.face = face;
  const R = .3, SX = 1, SY = 1.05, SZ = .95;
  const surfZ = (x, y) => SZ * Math.sqrt(Math.max(0, R * R - x * x - (y / SY) ** 2));
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 2), skin); skull.scale.set(SX, SY, SZ); face.add(skull);
  const beard = new THREE.Mesh(partialIco(R * 1.012, 2, (x, y, z) => y < -.1 && z > -.05 && Math.abs(x) < .27), mat(0x86593b)); beard.scale.copy(skull.scale); face.add(beard);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(.05, .1, .08), skin); ear.position.set(s * .295, -.01, 0); face.add(ear); }
  leo.eyes = []; leo.brows = [];
  for (const s of [-1, 1]) {
    const x = s * .108, y = .02;
    const eye = new THREE.Mesh(RB(.082, .102, .04, .016), black);
    eye.position.set(x, y, surfZ(x, y) - .006); eye.rotation.y = Math.atan2(x, surfZ(x, y)); face.add(eye); leo.eyes.push(eye);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(.018, .022, .01), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(-.02, .025, .021); eye.add(gl);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(.11, .026, .03), mat(0x2a1a12));
    brow.position.set(x, .135, surfZ(x, .135) + .004); brow.rotation.y = eye.rotation.y; brow.userData.base = brow.position.clone(); face.add(brow); leo.brows.push(brow);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.038, .07, 3), skinD); nose.geometry.rotateX(Math.PI / 2); nose.position.set(0, -.045, surfZ(0, -.045) + .012); nose.rotation.x = .2; face.add(nose);
  const mg = new THREE.CylinderGeometry(.055, .055, .02, 10); mg.rotateX(Math.PI / 2);
  const mouth = new THREE.Mesh(mg, mat(0x150a08, { roughness: 1 })); mouth.position.set(0, -.15, surfZ(0, -.15) + .004); mouth.rotation.x = .5; face.add(mouth); leo.mouth = mouth;
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.296, .3, .13, 14), redD); cuff.position.y = .235; face.add(cuff);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.292, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), red); dome.position.y = .295; dome.scale.set(1, 1.08, 1); face.add(dome);
  const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), red); pom.position.y = .61; face.add(pom);
  if (SET.sleepMask) { // antifaz subido sobre el gorro
    const purple = mat(0x5b3fa0);
    const band2 = new THREE.Mesh(new THREE.CylinderGeometry(.305, .305, .045, 16, 1, true), purple); band2.position.y = .33; face.add(band2);
    const mask = new THREE.Mesh(RB(.44, .12, .06, .04), purple); mask.position.set(0, .33, .285); mask.rotation.x = -.12; face.add(mask);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.1, .014, .01), new THREE.MeshBasicMaterial({ color: 0xffffff })); l.position.set(s * .1, .32, .32); l.rotation.z = s * .12; face.add(l); }
  }
  root.position.set(-.95, 0, 0); root.rotation.y = .3;
  shadowAll(root); scene.add(root);
}

// ------------------------------------------------------------------ Claude (cubo naranja)
const cl = {};
{
  const root = new THREE.Group(); cl.root = root;
  const orange = new THREE.MeshStandardMaterial({ color: 0xe4703a, roughness: .55, emissive: 0x7a2a0a, emissiveIntensity: .25 });
  const legM = new THREE.MeshStandardMaterial({ color: 0xe06a34, roughness: .6, emissive: 0xff6a20, emissiveIntensity: .35 });
  const bodyG = new THREE.Group(); bodyG.position.y = .66; root.add(bodyG); cl.body = bodyG;
  bodyG.add(new THREE.Mesh(new RoundedBoxGeometry(1.06, .6, .68, 4, .07), orange));
  const under = new THREE.Mesh(new THREE.PlaneGeometry(.9, .5), new THREE.MeshBasicMaterial({ color: 0xffb070, toneMapped: false })); under.rotation.x = Math.PI / 2; under.position.y = -.301; bodyG.add(under);
  cl.eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(RB(.075, .17, .03, .014), new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: .25 }));
    eye.position.set(s * .2, .06, .34); bodyG.add(eye); cl.eyes.push(eye);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(.022, .05, .01), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(-.013, .045, .016); eye.add(gl);
  }
  cl.nubs = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * .53, .03, 0); bodyG.add(piv);
    const nub = new THREE.Mesh(RB(.22, .22, .3), orange); nub.position.x = s * .1; piv.add(nub);
    piv.userData.s = s; cl.nubs.push(piv);
  }
  cl.legs = [];
  for (const x of [-.4, -.27, .27, .4]) for (const z of [.2, -.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.085, .37, .085), legM); leg.position.set(x, .185, z); root.add(leg); cl.legs.push(leg);
  }
  const glow = new THREE.PointLight(0xff8a3c, 1.4, 2.6, 2); glow.position.set(0, .2, 0); root.add(glow);
  const faceL = new THREE.PointLight(0xff9a5a, 1.2, 3.5, 2); faceL.position.set(-.3, .7, .9); root.add(faceL);
  const [gc, gg] = canvas(256, 256); const rg = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, 'rgba(255,235,200,1)'); rg.addColorStop(.18, 'rgba(255,170,90,.85)'); rg.addColorStop(.5, 'rgba(255,110,40,.25)'); rg.addColorStop(1, 'rgba(255,90,20,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 256, 256);
  const spot = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), new THREE.MeshBasicMaterial({ map: tex(gc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  spot.rotation.x = -Math.PI / 2; spot.position.y = .006; root.add(spot); cl.spot = spot;
  root.position.set(1.0, 0, .15); root.rotation.y = -.3;
  shadowAll(root); spot.castShadow = false; under.castShadow = false; scene.add(root);
}

// ------------------------------------------------------------------ perro "Comisión" (opcional)
const dog = {};
if (SET.dog) {
  const root = new THREE.Group(); dog.root = root;
  const tan = mat(0xc8915a), tanL = mat(0xe8c191), dark = mat(0x5a3a22), black = mat(0x0d0d10, { roughness: .3, flatShading: false });
  const body = new THREE.Mesh(RB(.64, .32, .3, .06), tan); body.position.y = .42; root.add(body);
  const chest = new THREE.Mesh(RB(.2, .26, .26, .05), tanL); chest.position.set(.25, .4, 0); root.add(chest);
  dog.legs = [];
  for (const [x, z] of [[.22, .1], [.22, -.1], [-.22, .1], [-.22, -.1]]) { const l = new THREE.Mesh(RB(.08, .3, .08, .02), tan); l.position.set(x, .15, z); root.add(l); dog.legs.push(l); }
  const head = new THREE.Group(); head.position.set(.38, .66, 0); root.add(head); dog.head = head;
  head.add(new THREE.Mesh(RB(.28, .26, .26, .05), tan));
  const snout = new THREE.Mesh(RB(.16, .12, .16, .03), tanL); snout.position.set(.17, -.05, 0); head.add(snout);
  const nose = new THREE.Mesh(RB(.05, .045, .06, .015), black); nose.position.set(.255, -.02, 0); head.add(nose);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(RB(.03, .05, .03, .01), black); eye.position.set(.135, .05, s * .07); head.add(eye);
    const ear = new THREE.Mesh(RB(.1, .16, .04, .015), dark); ear.position.set(-.02, .02, s * .15); ear.rotation.x = s * .25; head.add(ear);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.12, .02, 6, 14), mat(0xd33a2c)); collar.rotation.y = Math.PI / 2; collar.position.set(.3, .55, 0); root.add(collar);
  const tag = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .01, 10), mat(0xf3c24b, { metalness: .6, roughness: .3 })); tag.rotation.z = Math.PI / 2; tag.position.set(.36, .47, 0); root.add(tag);
  const tail = new THREE.Group(); tail.position.set(-.32, .52, 0); root.add(tail); dog.tail = tail;
  const tm = new THREE.Mesh(RB(.05, .22, .05, .02), tan); tm.position.y = .1; tail.add(tm); tail.rotation.z = .6;
  root.position.set(-.15, 0, -.9); root.rotation.y = -1.1; root.scale.setScalar(1.1);
  shadowAll(root); scene.add(root);
}

// ------------------------------------------------------------------ dibujos 2D compartidos
function drawMoonLamp(g, x, y, r, glow = 1) {
  g.save();
  g.shadowColor = `rgba(255,215,140,${.8 * glow})`; g.shadowBlur = r * 1.2;
  const gr = g.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r);
  gr.addColorStop(0, '#fffbea'); gr.addColorStop(.7, '#f8e2a8'); gr.addColorStop(1, '#e8c47a');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0; g.fillStyle = 'rgba(190,150,80,.35)';
  for (const [dx, dy, rr2] of [[-.35, -.2, .18], [.25, .3, .14], [.3, -.35, .1], [-.1, .4, .08], [.05, -.02, .07]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, rr2 * r, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#6b4a2e'; g.beginPath(); g.moveTo(x - r * .45, y + r * 1.22); g.lineTo(x + r * .45, y + r * 1.22); g.lineTo(x + r * .3, y + r * .98); g.lineTo(x - r * .3, y + r * .98); g.fill();
  g.restore();
}
function drawBag(g, cx, cy, s, col = '#fff') {
  g.save(); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = s * .12; g.lineCap = 'round';
  rr(g, cx - s * .5, cy - s * .25, s, s * .8, s * .12); g.fill();
  g.beginPath(); g.arc(cx, cy - s * .25, s * .26, Math.PI, 0); g.stroke(); g.restore();
}
function drawClaudeIcon(g, x, y, w) {
  const h = w * .66; g.fillStyle = '#e4703a'; rr(g, x, y, w, h, w * .14); g.fill();
  g.fillStyle = '#111'; g.fillRect(x + w * .27, y + h * .3, w * .08, h * .32); g.fillRect(x + w * .65, y + h * .3, w * .08, h * .32);
}
// cara 2D low-poly (Leo y variantes). opt: hat, hatD, skin, beard, eyes:'open'|'closed', mouth:'o'|'smile'|'flat'
function drawFace2D(g, cx, cy, r, opt = {}) {
  const o = Object.assign({ hat: '#c4262c', hatD: '#a61e24', skin: '#c2825a', beard: true, eyes: 'open', mouth: 'o' }, opt);
  g.save();
  const pts = []; for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 9; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.04]); }
  g.fillStyle = o.skin; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
  const shades = ['rgba(0,0,0,.08)', 'rgba(255,255,255,.06)', 'rgba(0,0,0,.14)'];
  for (let i = 0; i < 9; i++) { const a = pts[i], b = pts[(i + 1) % 9]; g.fillStyle = shades[i % 3]; g.beginPath(); g.moveTo(cx, cy); g.lineTo(...a); g.lineTo(...b); g.fill(); }
  if (o.beard) { g.fillStyle = 'rgba(80,50,30,.55)'; g.beginPath(); g.moveTo(pts[2][0], pts[2][1]); for (let i = 3; i <= 7; i++) g.lineTo(...pts[i]); g.lineTo(cx - r * .6, cy + r * .15); g.lineTo(cx + r * .6, cy + r * .15); g.closePath(); g.fill(); }
  g.fillStyle = o.hat; g.beginPath(); g.ellipse(cx, cy - r * .55, r * 1.0, r * .75, 0, Math.PI, 0); g.fill();
  g.fillStyle = o.hatD; rr(g, cx - r * 1.02, cy - r * .62, r * 2.04, r * .32, r * .08); g.fill();
  g.fillStyle = o.hat; g.beginPath(); g.arc(cx, cy - r * 1.32, r * .14, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111';
  if (o.eyes === 'closed') { g.lineWidth = r * .07; g.strokeStyle = '#111'; g.lineCap = 'round'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * .35 * r, cy - r * .02, r * .14, Math.PI * .15, Math.PI * .85); g.stroke(); } }
  else {
    rr(g, cx - r * .5, cy - r * .2, r * .3, r * .36, r * .06); g.fill(); rr(g, cx + r * .2, cy - r * .2, r * .3, r * .36, r * .06); g.fill();
    g.fillStyle = '#fff'; g.fillRect(cx - r * .44, cy - r * .14, r * .08, r * .08); g.fillRect(cx + r * .26, cy - r * .14, r * .08, r * .08);
  }
  g.fillStyle = '#2a1a12'; g.save(); g.translate(cx - r * .35, cy - r * .32); g.rotate(-.15); g.fillRect(-r * .2, -r * .04, r * .4, r * .08); g.restore();
  g.save(); g.translate(cx + r * .35, cy - r * .32); g.rotate(.15); g.fillRect(-r * .2, -r * .04, r * .4, r * .08); g.restore();
  g.fillStyle = '#150a08';
  if (o.mouth === 'o') { g.beginPath(); g.ellipse(cx, cy + r * .45, r * .2, r * .26, 0, 0, Math.PI * 2); g.fill(); }
  else if (o.mouth === 'smile') { g.beginPath(); g.ellipse(cx, cy + r * .38, r * .32, r * .2, 0, 0, Math.PI); g.fill(); }
  else { g.fillRect(cx - r * .16, cy + r * .42, r * .32, r * .06); }
  g.restore();
}
// iconos de producto
function drawProduct(g, type, x, y, r) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  if (type === 'moon') drawMoonLamp(g, x, y - r * .1, r * .78);
  else if (type === 'led') {
    const cols = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3ddc84', '#2ec4ff', '#9b5cff'];
    g.lineWidth = r * .16; g.strokeStyle = '#2b3147'; g.beginPath();
    for (let k = 0; k <= 30; k++) { const px = x - r + k * r / 15, py = y + Math.sin(k / 30 * Math.PI * 2) * r * .35; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
    for (let k = 0; k < 12; k++) { const px = x - r + k * r * 2 / 11, py = y + Math.sin(k / 11 * Math.PI * 2) * r * .35; g.fillStyle = cols[k % 6]; g.shadowColor = cols[k % 6]; g.shadowBlur = r * .35; g.beginPath(); g.arc(px, py, r * .1, 0, Math.PI * 2); g.fill(); }
  } else if (type === 'termo') {
    g.fillStyle = '#5ec8e8'; rr(g, x - r * .32, y - r * .62, r * .64, r * 1.45, r * .16); g.fill();
    g.fillStyle = '#2b3147'; rr(g, x - r * .26, y - r * .86, r * .52, r * .3, r * .08); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; rr(g, x - r * .2, y - r * .45, r * .1, r * 1.0, r * .05); g.fill();
  } else if (type === 'audif') {
    g.strokeStyle = '#e8ebf2'; g.lineWidth = r * .16; g.beginPath(); g.arc(x, y + r * .05, r * .62, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.fillStyle = '#ff8a4c'; rr(g, x - r * .78, y - r * .05, r * .32, r * .58, r * .12); g.fill(); rr(g, x + r * .46, y - r * .05, r * .32, r * .58, r * .12); g.fill();
  } else if (type === 'aro') {
    g.strokeStyle = '#fff6e0'; g.shadowColor = 'rgba(255,240,200,.9)'; g.shadowBlur = r * .5; g.lineWidth = r * .2;
    g.beginPath(); g.arc(x, y - r * .2, r * .58, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
    g.strokeStyle = '#59607a'; g.lineWidth = r * .07; g.beginPath(); g.moveTo(x, y + r * .38); g.lineTo(x, y + r * .95); g.moveTo(x - r * .35, y + r * .95); g.lineTo(x + r * .35, y + r * .95); g.stroke();
  } else if (type === 'soporte') {
    g.strokeStyle = '#59607a'; g.lineWidth = r * .07; g.beginPath(); g.moveTo(x, y + r * .35); g.lineTo(x - r * .45, y + r * .95); g.moveTo(x, y + r * .35); g.lineTo(x + r * .45, y + r * .95); g.moveTo(x, y + r * .35); g.lineTo(x, y + r * .95); g.stroke();
    g.fillStyle = '#20263a'; rr(g, x - r * .3, y - r * .75, r * .6, r * 1.1, r * .1); g.fill();
    const gr = g.createLinearGradient(0, y - r * .7, 0, y + r * .3); gr.addColorStop(0, '#ff3b5c'); gr.addColorStop(1, '#2ec4ff');
    g.fillStyle = gr; rr(g, x - r * .25, y - r * .68, r * .5, r * .96, r * .06); g.fill();
  } else if (type === 'box') {
    g.fillStyle = '#b5834f'; g.beginPath(); g.moveTo(x - r * .8, y - r * .3); g.lineTo(x, y - r * .7); g.lineTo(x + r * .8, y - r * .3); g.lineTo(x, y + r * .1); g.closePath(); g.fill();
    g.fillStyle = '#a8794a'; g.beginPath(); g.moveTo(x - r * .8, y - r * .3); g.lineTo(x, y + r * .1); g.lineTo(x, y + r * .95); g.lineTo(x - r * .8, y + r * .55); g.closePath(); g.fill();
    g.fillStyle = '#8f643b'; g.beginPath(); g.moveTo(x + r * .8, y - r * .3); g.lineTo(x, y + r * .1); g.lineTo(x, y + r * .95); g.lineTo(x + r * .8, y + r * .55); g.closePath(); g.fill();
    g.strokeStyle = '#d9b98a'; g.lineWidth = r * .1; g.beginPath(); g.moveTo(x - r * .4, y - r * .5); g.lineTo(x + r * .4, y - r * .1); g.stroke();
  } else if (type === 'brush') {
    g.fillStyle = '#e4703a'; rr(g, x - r * .15, y - r * .1, r * .3, r * 1.0, r * .14); g.fill();
    g.fillStyle = '#2b3147'; rr(g, x - r * .62, y - r * .7, r * 1.24, r * .62, r * .2); g.fill();
    g.strokeStyle = '#e8ebf2'; g.lineWidth = r * .05;
    for (let k = 0; k < 9; k++) { const px = x - r * .5 + k * r * .125; g.beginPath(); g.moveTo(px, y - r * .7); g.lineTo(px, y - r * .9); g.stroke(); }
  } else if (type === 'noise') {
    g.fillStyle = '#f2f4f7'; g.beginPath(); g.ellipse(x, y + r * .2, r * .62, r * .5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7fe9ff'; g.shadowColor = '#7fe9ff'; g.shadowBlur = r * .5; g.beginPath(); g.ellipse(x, y + r * .05, r * .32, r * .14, 0, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(127,233,255,.8)'; g.lineWidth = r * .07;
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(x, y - r * .1, r * (.3 + k * .2), Math.PI * 1.25, Math.PI * 1.75); g.stroke(); }
  } else if (type === 'slipper') {
    g.fillStyle = '#58b84f'; g.beginPath(); g.ellipse(x, y + r * .25, r * .85, r * .45, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3f8c3a'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - r * .5 + k * r * .3, y - r * .15); g.lineTo(x - r * .35 + k * r * .3, y - r * .5); g.lineTo(x - r * .2 + k * r * .3, y - r * .15); g.fill(); }
    g.fillStyle = '#fff'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + r * .35 + k * r * .1, y + r * .35); g.lineTo(x + r * .4 + k * r * .1, y + r * .5); g.lineTo(x + r * .45 + k * r * .1, y + r * .35); g.fill(); }
    g.beginPath(); g.arc(x + r * .45, y + r * .02, r * .12, 0, Math.PI * 2); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x + r * .48, y + r * .03, r * .06, 0, Math.PI * 2); g.fill();
  } else if (type === 'fryer') {
    g.fillStyle = '#2b3147'; rr(g, x - r * .55, y - r * .7, r * 1.1, r * 1.5, r * .3); g.fill();
    g.fillStyle = '#e8ebf2'; rr(g, x - r * .4, y - r * .5, r * .8, r * .3, r * .1); g.fill();
    g.fillStyle = '#ff8a4c'; g.beginPath(); g.arc(x, y + r * .25, r * .26, 0, Math.PI * 2); g.fill();
  } else if (type === 'dog') {
    drawProduct(g, 'brush', x, y, r);
  }
  g.restore();
}

// ------------------------------------------------------------------ pantalla: vitrina / miniatura
const SCREEN = Object.assign({ title: 'Mi vitrina', badge: 'AFILIADO', live: '● EN VIVO 3:00', tiles: [] }, TL.screen || {});
function drawStore() {
  const g = scrG; g.fillStyle = '#0e1322'; g.fillRect(0, 0, SCR_W, SCR_H);
  g.fillStyle = '#151b2e'; g.fillRect(0, 0, SCR_W, 130);
  g.fillStyle = '#e4703a'; g.beginPath(); g.arc(85, 65, 40, 0, Math.PI * 2); g.fill(); drawBag(g, 85, 64, 40);
  g.fillStyle = '#fff'; g.font = '800 54px Inter'; g.textBaseline = 'middle'; g.fillText(SCREEN.title, 145, 66);
  const tw0 = g.measureText(SCREEN.title).width;
  if (SCREEN.badge) {
    g.font = '700 28px Inter'; const bw = g.measureText(SCREEN.badge).width + 60;
    g.fillStyle = '#2b3550'; rr(g, 165 + tw0, 40, bw, 52, 26); g.fill();
    g.fillStyle = '#9fb4ff'; g.fillText(SCREEN.badge, 195 + tw0, 67);
  }
  if (SCREEN.live) {
    g.font = '700 32px Inter'; const lw = g.measureText(SCREEN.live).width + 60;
    g.fillStyle = '#ff3b5c'; rr(g, SCR_W - 40 - lw, 38, lw, 56, 28); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(SCREEN.live, SCR_W - 40 - lw / 2, 67); g.textAlign = 'left';
  }
  const cols = 3, rows = 2, pad = 40, tw = (SCR_W - pad * (cols + 1)) / cols, th = (SCR_H - 130 - pad * (rows + 1)) / rows;
  SCREEN.tiles.slice(0, 6).forEach((tile, k) => {
    const i = k % cols, j = Math.floor(k / cols);
    const x = pad + i * (tw + pad), y = 130 + pad + j * (th + pad);
    g.fillStyle = tile.hot ? '#2a2440' : '#1c2438'; rr(g, x, y, tw, th, 26); g.fill();
    if (tile.hot) { g.strokeStyle = '#ff8a4c'; g.lineWidth = 6; rr(g, x + 3, y + 3, tw - 6, th - 6, 24); g.stroke(); }
    drawProduct(g, tile.type, x + tw * .25, y + th * .45, th * .27);
    g.fillStyle = '#e8ebf2'; g.font = '700 34px Inter'; g.fillText(tile.name, x + tw * .5, y + th * .2);
    g.fillStyle = '#c3c8d4'; g.font = '600 32px Inter'; g.fillText(tile.price || '', x + tw * .5, y + th * .37);
    g.fillStyle = '#ff8a4c'; g.font = '800 38px Inter'; g.fillText(tile.line || '', x + tw * .5, y + th * .56);
    if (tile.pill) {
      g.font = '700 27px Inter'; const pw = g.measureText(tile.pill).width + 44;
      g.fillStyle = tile.pillColor || '#16a34a'; rr(g, x + tw * .5, y + th * .7, pw, 50, 25); g.fill();
      g.fillStyle = '#fff'; g.fillText(tile.pill, x + tw * .5 + 22, y + th * .7 + 26);
    }
  });
  scrTex.needsUpdate = true;
}
function drawThumb(lt, ev, d) {
  const g = scrG; g.fillStyle = '#f1f2f4'; g.fillRect(0, 0, SCR_W, SCR_H);
  g.fillStyle = d.color || '#c8202b'; rr(g, 60, 60, SCR_W - 120, 600, 34); g.fill();
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  const lines = d.lines || [];
  lines.forEach((ln, i) => { let fs = 112; g.font = `900 ${fs}px Inter`; while (g.measureText(ln).width > 900 && fs > 70) { fs -= 4; g.font = `900 ${fs}px Inter`; } g.fillText(ln, 120, 230 + i * 130); });
  g.fillStyle = '#ffd23f'; g.font = '900 140px Inter'; g.fillText(d.big || '', 120, 515);
  if (d.bigSub) { g.font = '900 56px Inter'; g.fillText(d.bigSub, 126, 600); }
  if (d.prop && d.prop !== 'none') drawProduct(g, d.prop, 1120, 480, 95);
  const faces = d.faces || [{}];
  if (faces.length === 1) drawFace2D(g, 1330, 330, 190, faces[0]);
  else { drawFace2D(g, 1200, 360, 150, faces[0]); drawFace2D(g, 1420, 300, 130, faces[1]); }
  const v = (d.views || 1) * 1e6 * easeOut((lt - ev.views[0]) / (ev.views[1] - ev.views[0]));
  g.fillStyle = '#d0202b'; g.font = '800 92px Inter'; g.fillText((v / 1e6).toFixed(1) + 'M vistas', 90, 800);
  g.fillStyle = '#7b8089'; g.font = '500 50px Inter'; g.fillText(d.foot || '', 90, 890);
  if (lt > ev.stamp && d.stamp) {
    const k = backOut((lt - ev.stamp) / .35), s = lerp(2.2, 1, k);
    g.save(); g.translate(1290, 820); g.rotate(-.12); g.scale(s, s); g.globalAlpha = clamp((lt - ev.stamp) / .12);
    g.font = '900 64px Inter'; const sw = Math.max(380, g.measureText(d.stamp).width + 90);
    g.strokeStyle = '#16a34a'; g.lineWidth = 12; rr(g, -sw / 2, -70, sw, 140, 20); g.stroke();
    g.fillStyle = '#16a34a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.stamp, 0, 4);
    g.restore(); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  scrTex.needsUpdate = true;
}
drawStore();
let screenMode = 'store';

// ------------------------------------------------------------------ cámaras
const SHOTS = {
  wide: { pos: [0.05, 1.55, 7.2], look: [0.05, 1.75, 0], fov: 50, push: .45, blur: 1, dim: .1 },
  two: { pos: [0.05, 1.35, 5.4], look: [0.05, 1.15, 0], fov: 48, push: .3, blur: 2, dim: .1 },
  claude: { target: [1.0, .58, .15], yaw: -.3, d: 4.3, h: .5, fov: 40, push: .18, blur: 2, dim: .1 },
  claudeClose: { target: [1.0, .64, .15], yaw: -.55, d: 3.1, h: .22, fov: 40, push: .12, blur: 3, dim: .1 },
  claudeLow: { target: [1.0, .8, .15], yaw: -.18, d: 3.0, h: -.5, fov: 42, push: .15, blur: 3, dim: .1 },
  leo: { target: [-.95, 1.5, 0], yaw: .3, d: 3.5, h: .05, fov: 42, push: .15, blur: 2, dim: .1 },
  leoClose: { target: [-.95, 1.6, 0], yaw: .28, d: 2.35, h: .02, fov: 40, push: .1, blur: 3, dim: .1 },
  leoXClose: { target: [-.95, 1.66, 0], yaw: .24, d: 1.3, h: 0, fov: 40, push: .04, snap: true, blur: 3, dim: .1 },
  leoFull: { target: [-.95, 1.4, 0], yaw: .3, d: 4.6, h: .15, fov: 46, push: .2, blur: 2, dim: .1 },
  leoFeet: { target: [-.95, .22, .05], yaw: .4, d: 1.9, h: .3, fov: 42, push: .12, snap: true, blur: 3, dim: .1 },
  dog: { target: [0, .55, -.8], yaw: -.15, d: 2.7, h: .25, fov: 42, push: .15, blur: 3, dim: .1 },
  sky: { pos: [0, 2.8, 2.0], look: [16, 7.5, -20], fov: 52, push: .3, blur: 4, dim: .4 },
  sky2: { pos: [0, 2.8, 2.0], look: [-16, 7.5, -20], fov: 52, push: .3, blur: 4, dim: .4 },
  billboard: { pos: [-.25, 2.25, 7.4], look: [-.5, 3.1, -4.4], fov: 46, push: 1.3, blur: 2, dim: .1 },
  cta: { pos: [0.05, 1.6, 6.4], look: [0.05, .55, 0], fov: 50, push: .35, blur: 2, dim: .15 },
};
const SHOT_ALIAS = { claudeOTS: 'claudeClose' };
const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _d = new THREE.Vector3();
function placeCamera(shotName, lt, dur, t) {
  const s = SHOTS[SHOT_ALIAS[shotName] || shotName] || SHOTS.wide;
  if (s.pos) { _p.set(...s.pos); _l.set(...s.look); }
  else {
    _l.set(...s.target);
    let d = s.d;
    if (s.snap) d = lerp(s.d * 2.1, s.d, easeOut(lt / .16));
    _p.set(_l.x + Math.sin(s.yaw) * d, _l.y + s.h, _l.z + Math.cos(s.yaw) * d);
  }
  _d.subVectors(_l, _p).normalize();
  _p.addScaledVector(_d, s.push * easeInOut(lt / Math.max(dur, .1)));
  _p.x += Math.sin(t * .9) * .008 + Math.sin(t * 2.3) * .003;
  _p.y += Math.sin(t * 1.3) * .006;
  if (s.snap && lt < .35) { const k = (1 - lt / .35) * .012; _p.x += Math.sin(lt * 90) * k; _p.y += Math.cos(lt * 77) * k; }
  camera.position.copy(_p); camera.fov = s.fov; camera.updateProjectionMatrix(); camera.lookAt(_l);
  return s;
}

// ------------------------------------------------------------------ animación de personajes
function blink(t, off) { const ph = (t + off) % 3.4; return ph < .14 ? Math.max(.08, 1 - Math.sin(ph / .14 * Math.PI)) : 1; }
function animate(t, beat) {
  const lt = t - beat.start;
  const speaking = beat.type === 'line' && t >= beat.a0 && t <= beat.a1;
  let env = 0;
  if (speaking) { const i = Math.floor((t - beat.a0) * FPS); env = beat.env[Math.min(beat.env.length - 1, i)] || 0; }
  const leoTalk = speaking && beat.who === 'leo' ? env : 0;
  const clTalk = speaking && beat.who === 'claude' ? env : 0;
  const mood = beat.type === 'line' ? beat.mood : '';
  const isCta = !!beat.cta;
  const leoMood = isCta ? 'wave' : beat.who === 'leo' ? mood : '';
  const clMood = isCta ? 'wave' : beat.who === 'claude' ? mood : (beat.type === 'card' && beat.card === 'billboard' ? 'happy' : '');

  // ---- Leo
  const L = leo;
  L.root.position.y = 0; L.torso.scale.set(1, 1 + .012 * Math.sin(t * 2.2), 1);
  L.head.rotation.set(.025 * Math.sin(t * 1.25) - leoTalk * .05, beat.who === 'claude' ? .3 : .06, .02 * Math.sin(t * .8));
  for (const a of L.arms) a.rotation.set(0, 0, a.userData.s * (.07 + .015 * Math.sin(t * 2.2)));
  let eyeS = blink(t, 0), eyeSX = 1, browY = 0, browR = 0, mOpen = .1 + leoTalk * .95, mW = 1 - leoTalk * .2;
  if (leoMood === 'shock') {
    const k = easeOut(lt / .12);
    eyeS = lerp(1, 1.3, k); eyeSX = lerp(1, 1.15, k); browY = .04 * k; mOpen = Math.max(.75, .75 + leoTalk * .6); mW = .78;
    L.head.rotation.x -= .08 * k;
  } else if (leoMood === 'armsUp') {
    for (const a of L.arms) a.rotation.z = a.userData.s * (2.55 + .12 * Math.sin(t * 14));
    L.root.position.y = .05 * Math.abs(Math.sin(t * 8)); browY = .03; mOpen = .5 + leoTalk * .8; eyeS = 1.15;
  } else if (leoMood === 'serious') {
    browR = .28; browY = -.012; eyeS *= .85;
  } else if (leoMood === 'angry') {
    browR = .42; browY = -.02; eyeS *= .8; mOpen = .3 + leoTalk * .9; mW = 1.15; L.head.rotation.x += .06;
    for (const a of L.arms) a.rotation.z = a.userData.s * (.35 + .05 * Math.sin(t * 16));
  } else if (leoMood === 'calm') {
    eyeS = .22; browR = -.15; L.head.rotation.x += .07; L.head.rotation.z += .04;
  } else if (leoMood === 'wave') {
    const a = L.arms[1]; a.rotation.z = 2.5 + .38 * Math.sin(t * 9); a.rotation.x = -.15;
    L.head.rotation.y = -.15; mOpen = Math.max(mOpen, .25); browY = .015;
  }
  if (beat.type === 'card' && beat.card === 'billboard') { L.head.rotation.x = -.35; L.head.rotation.y = -.1; mOpen = .7; eyeS = 1.2; }
  L.eyes.forEach(e => e.scale.set(eyeSX, eyeS, 1));
  L.brows.forEach((b, i) => { b.position.copy(b.userData.base); b.position.y += browY; b.rotation.z = (i ? -1 : 1) * browR; });
  L.mouth.scale.set(mW, clamp(mOpen, .08, 2), 1);

  // ---- Claude
  const C = cl;
  let hop = 0;
  if (clMood === 'happy' || clMood === 'wave') hop = .045 * Math.abs(Math.sin(t * 7));
  C.body.position.y = .66 + .008 * Math.sin(t * 2.4) + clTalk * .035 + hop;
  C.body.scale.set(1 - clTalk * .02, 1 + clTalk * .045, 1);
  C.body.rotation.z = .02 * Math.sin(t * 1.7) + clTalk * .025 * Math.sin(t * 18);
  C.root.rotation.y = isCta ? -.15 : beat.who === 'leo' ? -.42 : -.3;
  C.nubs.forEach((n, i) => { n.rotation.z = n.userData.s * (.12 + .06 * Math.sin(t * 3 + i) + clTalk * .45); n.rotation.x = clTalk * .2 * Math.sin(t * 9 + i * 2); });
  if (clMood === 'wave') C.nubs[1].rotation.z = .9 + .5 * Math.sin(t * 10);
  C.legs.forEach((g, i) => { g.position.y = .185 + (clTalk > .3 ? .012 * Math.max(0, Math.sin(t * 22 + i * 1.7)) : 0); });
  let ceS = blink(t, 1.3), ceX = 1;
  if (clMood === 'smug') { ceS = .16; ceX = 1.7; }
  if (clMood === 'happy' || clMood === 'wave') { ceS = Math.min(ceS, .55); }
  if (clMood === 'sad') { ceS = .6; C.body.position.y -= .03; }
  C.eyes.forEach(e => e.scale.set(ceX, ceS, 1));
  C.spot.material.opacity = .85 + .15 * Math.sin(t * 3.1);

  // ---- perro
  if (dog.root) {
    dog.tail.rotation.x = Math.sin(t * 16) * .7;
    dog.head.rotation.z = .08 * Math.sin(t * 1.4); dog.head.rotation.x = .12 * Math.sin(t * .9);
    dog.root.position.y = .008 * Math.sin(t * 5);
  }
}

// ------------------------------------------------------------------ overlay 2D
const out = document.getElementById('out'), ctx = out.getContext('2d');
function wrap(g, text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const tst = cur ? cur + ' ' + w : w; if (g.measureText(tst).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tst; }
  if (cur) lines.push(cur); return lines;
}
function subtitle(text, lt) {
  ctx.save();
  ctx.font = '600 52px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text, 880);
  ctx.globalAlpha = clamp(lt / .08);
  lines.forEach((ln, i) => {
    ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff'; ctx.fillText(ln, W / 2, 268 + i * 66);
  });
  ctx.restore();
}
function cardFrame(lt, x, y, w, h, fn) {
  const k = backOut(lt / .38), s = lerp(.86, 1, k);
  ctx.save();
  ctx.globalAlpha = clamp(lt / .18);
  const fy = Math.sin(lt * 1.4) * 5;
  ctx.translate(x + w / 2, y + h / 2 + fy + (1 - easeOut(lt / .35)) * 40); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 18;
  ctx.fillStyle = '#eef0f3'; rr(ctx, 0, 0, w, h, 34); ctx.fill();
  ctx.shadowColor = 'transparent';
  const hl = ctx.createLinearGradient(0, 0, 0, h); hl.addColorStop(0, 'rgba(255,255,255,.7)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; rr(ctx, 0, 0, w, Math.min(h, 160), 34); ctx.fill();
  fn();
  ctx.restore();
}
function pill(x, y, text, col, k, font = '700 32px Inter', padX = 30, h = 60) {
  if (k <= 0) return 0;
  ctx.save(); ctx.font = font; const w = ctx.measureText(text).width + padX * 2;
  const s = lerp(.5, 1, backOut(k)); ctx.globalAlpha *= clamp(k * 3);
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s);
  ctx.fillStyle = col; rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 2);
  ctx.restore(); return w;
}
function cardHeader(P, d, icon = 'bag') {
  ctx.fillStyle = '#e4703a'; ctx.beginPath(); ctx.arc(P + 38, 92, 38, 0, Math.PI * 2); ctx.fill();
  if (icon === 'bag') drawBag(ctx, P + 38, 92, 36); else drawProduct(ctx, icon, P + 38, 92, 24);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#16181d'; ctx.font = '800 46px Inter'; ctx.fillText(d.title || '', P + 98, d.sub ? 76 : 92);
  if (d.sub) { ctx.fillStyle = '#7a7f87'; ctx.font = '500 30px Inter'; ctx.fillText(d.sub, P + 98, 122); }
  ctx.textBaseline = 'alphabetic';
}

// ---- tarjeta: números (contador + fila + pill + panel de dinero)
function statsCard(lt, ev, d) {
  const gk = d.money ? easeOut((lt - ev.money[0]) / .4) : 0, x = 80, w = 920, h = lerp(560, 1000, gk), y = lerp(600, 430, gk);
  cardFrame(lt, x, y, w, h, () => {
    const P = 60; cardHeader(P, d, d.icon);
    const c = d.count.to * easeOut((lt - ev.count[0]) / (ev.count[1] - ev.count[0]));
    ctx.fillStyle = '#111317'; ctx.font = '900 150px Inter'; ctx.fillText(fmtVal(c, d.count), P - 4, 340);
    ctx.fillStyle = '#6b7078'; ctx.font = '500 34px Inter'; ctx.fillText(d.count.label || '', P, 392);
    if (d.row) {
      ctx.fillStyle = '#e3e6ea'; rr(ctx, P, 420, w - P * 2, 70, 18); ctx.fill();
      drawProduct(ctx, d.row.icon || 'moon', P + 42, 455, 22);
      ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a2e35'; ctx.font = '600 30px Inter'; ctx.fillText(d.row.text, P + 86, 456);
      ctx.fillStyle = '#e4703a'; ctx.font = '800 30px Inter'; ctx.textAlign = 'right'; ctx.fillText(d.row.right || '', w - P - 24, 456); ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    if (d.pill) pill(P, 506, d.pill, '#16a34a', (lt - ev.badge) / .3);
    const mk = d.money ? easeOut((lt - ev.money[0]) / .35) : 0;
    if (mk > 0) {
      const M = d.money;
      ctx.save(); ctx.globalAlpha *= mk; ctx.translate(0, (1 - mk) * 30);
      ctx.fillStyle = '#ddf3e4'; rr(ctx, 36, 600, w - 72, 362, 26); ctx.fill();
      ctx.fillStyle = '#4b5563'; ctx.font = '500 32px Inter'; ctx.fillText(M.label, 76, 666);
      const m = M.to * easeOut((lt - ev.money[0]) / (ev.money[1] - ev.money[0]));
      let fs = 132; const txt = fmtVal(m, M); const full = fmtVal(M.to, M);
      ctx.font = `900 ${fs}px Inter`; while (ctx.measureText(full).width > w - 150 && fs > 80) { fs -= 4; ctx.font = `900 ${fs}px Inter`; }
      ctx.fillStyle = '#15a04a'; ctx.fillText(txt, 68, 810);
      ctx.globalAlpha *= clamp((lt - ev.deposit) / .25); ctx.fillStyle = '#1f2937'; ctx.font = '700 38px Inter'; ctx.fillText(M.foot || '', 76, 895);
      ctx.restore();
    }
  });
}
// ---- tarjeta: mensaje enviado + respuesta
function messageCard(lt, ev, d) {
  const x = 80, w = 920, rk = d.reply ? easeOut((lt - ev.reply) / .4) : 0, h = lerp(500, 760, rk), y = 560 - rk * 120;
  cardFrame(lt, x, y, w, h, () => {
    const P = 60; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8a8f98'; ctx.font = '500 34px Inter'; ctx.fillText('Para:', P, 82); ctx.fillText('Asunto:', P, 140);
    ctx.fillStyle = '#16181d'; ctx.font = '700 34px Inter'; ctx.fillText(d.to, P + 150, 82); ctx.fillText(d.subject, P + 150, 140);
    drawClaudeIcon(ctx, w - P - 64, 56, 64);
    ctx.fillStyle = '#d9dce1'; ctx.fillRect(P, 186, w - P * 2, 3);
    let fs = 62; ctx.font = `800 ${fs}px Inter`; while (ctx.measureText(d.body).width > w - P * 2 && fs > 40) { fs -= 2; ctx.font = `800 ${fs}px Inter`; }
    ctx.fillStyle = '#111317'; ctx.fillText(d.body, P, 268);
    const sent = d.sent || '', n = Math.floor(sent.length * clamp((lt - ev.time) / .45));
    ctx.fillStyle = '#8a8f98'; ctx.font = '500 32px Inter'; ctx.fillText(sent.slice(0, n), P, 330);
    pill(P, 378, d.pill || 'Enviado ✓', '#16a34a', (lt - ev.sent) / .3);
    if (rk > 0) {
      ctx.save(); ctx.globalAlpha *= rk; ctx.translate(0, (1 - rk) * 50);
      ctx.fillStyle = '#e1e6f0'; rr(ctx, 36, 480, w - 72, 240, 24); ctx.fill();
      ctx.fillStyle = '#6b7280'; ctx.font = '500 32px Inter'; ctx.fillText(d.reply.from, 76, 540);
      let fs2 = 72; ctx.font = `800 ${fs2}px Inter`; while (ctx.measureText(d.reply.text).width > w - 160 && fs2 > 44) { fs2 -= 2; ctx.font = `800 ${fs2}px Inter`; }
      ctx.fillStyle = '#111317'; ctx.fillText(d.reply.text, 76, 630);
      ctx.restore();
    }
  });
}
// ---- tarjeta: pila de notificaciones
function notifsCard(lt, ev, d) {
  const n = d.items.length, rowH = 126, top = 170;
  const tk = d.total ? easeOut((lt - ev.total[0]) / .35) : 0;
  const shown = ev.items.filter(a => lt >= a).length;
  const h = top + Math.max(1, shown) * rowH + 30 + tk * 230, x = 80, w = 920, y = (H - (top + n * rowH + 260)) / 2 - 40;
  cardFrame(lt, x, y, w, h, () => {
    const P = 60; cardHeader(P, d, d.icon);
    d.items.forEach((it, i) => {
      const k = easeOut((lt - ev.items[i]) / .3); if (k <= 0) return;
      const ry = top + i * rowH;
      ctx.save(); ctx.globalAlpha *= k; ctx.translate((1 - k) * 120, 0);
      ctx.fillStyle = '#ffffff'; rr(ctx, 36, ry, w - 72, rowH - 16, 22); ctx.fill();
      ctx.fillStyle = '#1c2438'; ctx.beginPath(); ctx.arc(36 + 62, ry + (rowH - 16) / 2, 40, 0, Math.PI * 2); ctx.fill();
      drawProduct(ctx, it.icon || 'box', 36 + 62, ry + (rowH - 16) / 2, 26);
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#16181d'; ctx.font = '800 34px Inter'; ctx.fillText(it.title, 36 + 124, ry + 36);
      ctx.fillStyle = '#6b7078'; ctx.font = '500 28px Inter'; ctx.fillText(it.body, 36 + 124, ry + 78);
      ctx.fillStyle = it.timeColor || '#16a34a'; ctx.font = '700 28px Inter'; ctx.textAlign = 'right'; ctx.fillText(it.time || 'ahora', w - 60, ry + 36); ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    });
    if (tk > 0) {
      const T = d.total, ty = top + n * rowH + 20;
      ctx.save(); ctx.globalAlpha *= tk; ctx.translate(0, (1 - tk) * 30);
      ctx.fillStyle = '#ddf3e4'; rr(ctx, 36, ty, w - 72, 200, 26); ctx.fill();
      ctx.fillStyle = '#4b5563'; ctx.font = '500 32px Inter'; ctx.fillText(T.label, 76, ty + 62);
      const m = T.to * easeOut((lt - ev.total[0]) / (ev.total[1] - ev.total[0]));
      ctx.fillStyle = '#15a04a'; ctx.font = '900 104px Inter'; ctx.fillText(fmtVal(m, T), 68, ty + 168);
      ctx.restore();
    }
  });
}
// ---- tarjeta: barras comparativas
function compareCard(lt, ev, d) {
  const n = d.bars.length, x = 80, w = 920, h = 250 + n * 170 + 110, y = (H - h) / 2 - 60;
  const max = Math.max(...d.bars.map(b => b.value));
  cardFrame(lt, x, y, w, h, () => {
    const P = 60; cardHeader(P, d, d.icon);
    d.bars.forEach((b, i) => {
      const by = 210 + i * 170, k = easeOut((lt - ev.bars[i][0]) / (ev.bars[i][1] - ev.bars[i][0]));
      ctx.fillStyle = '#4b5563'; ctx.font = '600 32px Inter'; ctx.fillText(b.label, P, by);
      const bw = w - P * 2;
      ctx.fillStyle = '#dde0e5'; rr(ctx, P, by + 22, bw, 70, 20); ctx.fill();
      const fw = Math.max(40, bw * (b.value / max) * k);
      if (k > 0) { ctx.fillStyle = b.color || '#16a34a'; rr(ctx, P, by + 22, fw, 70, 20); ctx.fill(); }
      const val = fmtVal(b.value * k, d);
      ctx.font = '900 44px Inter'; const tw = ctx.measureText(val).width;
      const inside = fw > tw + 50;
      ctx.fillStyle = inside ? '#fff' : '#111317';
      ctx.textBaseline = 'middle'; ctx.fillText(val, inside ? P + fw - tw - 24 : P + fw + 18, by + 58); ctx.textBaseline = 'alphabetic';
    });
    if (d.foot) pill(P, 210 + n * 170, d.foot, '#16a34a', (lt - ev.foot) / .3, '700 32px Inter', 30, 64);
  });
}
// ---- tarjeta: gráfica de línea con marca
function graphCard(lt, ev, d) {
  const x = 80, w = 920, h = 1000, y = 430;
  cardFrame(lt, x, y, w, h, () => {
    const P = 60; cardHeader(P, d, d.icon);
    const gx = P, gy = 200, gw = w - P * 2, gh = 430;
    ctx.strokeStyle = '#d9dce1'; ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(gx, gy + gh * i / 4); ctx.lineTo(gx + gw, gy + gh * i / 4); ctx.stroke(); }
    const pts = d.points, n = pts.length - 1;
    const prog = clamp((lt - ev.line[0]) / (ev.line[1] - ev.line[0]));
    const px = i => gx + gw * i / n, py = v => gy + gh * (1 - v);
    const upto = prog * n;
    ctx.beginPath(); ctx.moveTo(px(0), py(pts[0]));
    for (let i = 1; i <= Math.floor(upto); i++) ctx.lineTo(px(i), py(pts[i]));
    const fi = Math.floor(upto), fr = upto - fi;
    let ex = px(fi), ey = py(pts[fi]);
    if (fi < n) { ex = lerp(px(fi), px(fi + 1), fr); ey = lerp(py(pts[fi]), py(pts[fi + 1]), fr); ctx.lineTo(ex, ey); }
    const area = new Path2D(); area.moveTo(px(0), gy + gh); area.lineTo(px(0), py(pts[0]));
    for (let i = 1; i <= fi; i++) area.lineTo(px(i), py(pts[i])); area.lineTo(ex, ey); area.lineTo(ex, gy + gh); area.closePath();
    const ag = ctx.createLinearGradient(0, gy, 0, gy + gh); ag.addColorStop(0, 'rgba(228,112,58,.35)'); ag.addColorStop(1, 'rgba(228,112,58,0)');
    ctx.fillStyle = ag; ctx.fill(area);
    ctx.strokeStyle = '#e4703a'; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    ctx.fillStyle = '#e4703a'; ctx.beginPath(); ctx.arc(ex, ey, 13, 0, Math.PI * 2); ctx.fill();
    if (d.xlabels) { ctx.fillStyle = '#8a8f98'; ctx.font = '500 26px Inter'; ctx.textAlign = 'center'; d.xlabels.forEach((lb, i) => ctx.fillText(lb, gx + gw * i / (d.xlabels.length - 1), gy + gh + 42)); ctx.textAlign = 'left'; }
    if (d.mark) {
      const mk = backOut((lt - ev.mark) / .35);
      if (lt > ev.mark) {
        const mi = d.mark.at * n, mx = gx + gw * d.mark.at, myv = lerp(pts[Math.floor(mi)], pts[Math.min(n, Math.floor(mi) + 1)], mi - Math.floor(mi)), my = py(myv);
        ctx.save(); ctx.setLineDash([10, 10]); ctx.strokeStyle = '#16181d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(mx, gy); ctx.lineTo(mx, gy + gh); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.translate(mx, my); ctx.scale(mk, mk); ctx.fillStyle = '#16181d'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.save(); ctx.globalAlpha *= clamp((lt - ev.mark) / .2); ctx.font = '800 30px Inter';
        const lw = ctx.measureText(d.mark.label).width + 40, lx = clamp(mx - lw / 2, gx, gx + gw - lw), ly = gy - 10;
        ctx.fillStyle = '#16181d'; rr(ctx, lx, ly - 30, lw, 56, 16); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(d.mark.label, lx + 20, ly - 1); ctx.restore();
      }
    }
    if (d.big) {
      const bk = easeOut((lt - ev.big[0]) / .3);
      if (bk > 0) {
        ctx.save(); ctx.globalAlpha *= bk;
        const v = d.big.to * easeOut((lt - ev.big[0]) / (ev.big[1] - ev.big[0]));
        ctx.fillStyle = '#111317'; ctx.font = '900 150px Inter'; ctx.fillText(fmtVal(v, d.big), P - 4, gy + gh + 210);
        ctx.fillStyle = '#6b7078'; ctx.font = '500 34px Inter'; ctx.fillText(d.big.label || '', P, gy + gh + 262);
        ctx.restore();
      }
    }
  });
}
// ---- tarjeta: chat
function chatCard(lt, ev, d) {
  const x = 80, w = 920;
  ctx.save(); ctx.font = '600 38px Inter';
  const bubbles = d.msgs.map(m => { const lines = wrap(ctx, m.text, 560); return { ...m, lines, bh: 40 + lines.length * 50 }; });
  ctx.restore();
  let total = 0; bubbles.forEach(b => total += b.bh + 22);
  const shownH = bubbles.reduce((a, b, i) => a + (lt >= ev.msgs[i] - (b.me ? 0 : .55) ? b.bh + 22 : 0), 0);
  const h = 190 + Math.max(90, shownH) + 30, y = (H - (190 + total + 30)) / 2 - 40;
  cardFrame(lt, x, y, w, h, () => {
    const P = 60;
    ctx.fillStyle = d.avatarColor || '#f0b400'; ctx.beginPath(); ctx.arc(P + 38, 92, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 36px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.initials || '?', P + 38, 94); ctx.textAlign = 'left';
    ctx.fillStyle = '#16181d'; ctx.font = '800 44px Inter'; ctx.fillText(d.title, P + 98, d.sub ? 76 : 92);
    if (d.sub) { ctx.fillStyle = '#16a34a'; ctx.font = '600 28px Inter'; ctx.fillText(d.sub, P + 98, 122); }
    ctx.fillStyle = '#d9dce1'; ctx.fillRect(P, 160, w - P * 2, 3);
    let cy = 190;
    bubbles.forEach((b, i) => {
      const at = ev.msgs[i];
      if (!b.me && lt >= at - .55 && lt < at) { // escribiendo...
        ctx.fillStyle = '#e1e4ea'; rr(ctx, P, cy, 150, 70, 35); ctx.fill();
        for (let k = 0; k < 3; k++) { ctx.fillStyle = `rgba(80,86,98,${.4 + .6 * Math.max(0, Math.sin(lt * 10 - k))})`; ctx.beginPath(); ctx.arc(P + 45 + k * 30, cy + 35, 9, 0, Math.PI * 2); ctx.fill(); }
        cy += b.bh + 22; return;
      }
      if (lt < at) return;
      const k = backOut((lt - at) / .3);
      ctx.save(); ctx.font = '600 38px Inter';
      const bw = Math.max(...b.lines.map(l => ctx.measureText(l).width)) + 56;
      const bx = b.me ? w - P - bw : P;
      ctx.translate(bx + (b.me ? bw : 0), cy + b.bh / 2); ctx.scale(lerp(.6, 1, k), lerp(.6, 1, k)); ctx.translate(-(bx + (b.me ? bw : 0)), -(cy + b.bh / 2));
      ctx.globalAlpha *= clamp((lt - at) / .12);
      ctx.fillStyle = b.me ? '#e4703a' : '#e1e4ea'; rr(ctx, bx, cy, bw, b.bh, 30); ctx.fill();
      ctx.fillStyle = b.me ? '#fff' : '#16181d'; ctx.textBaseline = 'middle';
      b.lines.forEach((ln, j) => ctx.fillText(ln, bx + 28, cy + 45 + j * 50));
      ctx.restore();
      cy += b.bh + 22;
    });
  });
}
// ---- CTA de seguimiento (marca DiegoMastery)
const CY = 1180;
function ctaCard(lt, b) {
  const c = b.cta, ev = b.ev;
  const k = backOut((lt - ev.show) / .4); if (lt < ev.show) return;
  const w = 920, h = 250, x = (W - w) / 2, y = CY;
  ctx.save();
  ctx.globalAlpha = clamp((lt - ev.show) / .15);
  ctx.translate(W / 2, y + h / 2); ctx.scale(lerp(.7, 1, k), lerp(.7, 1, k)); ctx.translate(-W / 2, -(y + h / 2));
  const grad = ctx.createLinearGradient(x, 0, x + w, 0); grad.addColorStop(0, '#00E5FF'); grad.addColorStop(1, '#FF2E93');
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 14;
  ctx.fillStyle = grad; rr(ctx, x - 4, y - 4, w + 8, h + 8, 42); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#1E1E22'; rr(ctx, x, y, w, h, 38); ctx.fill();
  // avatar: Claude + Leo
  const ax = x + 110, ay = y + h / 2;
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(ax, ay, 74, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2a31'; ctx.beginPath(); ctx.arc(ax, ay, 66, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, 66, 0, Math.PI * 2); ctx.clip();
  drawFace2D(ctx, ax - 14, ay + 18, 44, { mouth: 'smile' });
  drawClaudeIcon(ctx, ax + 4, ay + 12, 56);
  ctx.restore();
  // texto
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.font = '800 46px Montserrat'; ctx.fillText(c.name || 'DiegoMastery', x + 210, y + 92);
  ctx.fillStyle = '#b8bcc6'; ctx.font = '600 28px Inter';
  wrap(ctx, c.sub || '', 380).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, x + 210, y + 146 + i * 36));
  // botón seguir
  const tapped = lt >= ev.tap;
  const bw = 250, bh = 96, bx = x + w - bw - 36, by = y + (h - bh) / 2;
  const press = lt >= ev.tap - .08 && lt < ev.tap + .1 ? .92 : 1;
  ctx.save(); ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(press, press); ctx.translate(-(bx + bw / 2), -(by + bh / 2));
  if (!tapped) { const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0); bg.addColorStop(0, '#00E5FF'); bg.addColorStop(1, '#FF2E93'); ctx.fillStyle = bg; }
  else ctx.fillStyle = '#3a3a43';
  rr(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '800 36px Montserrat'; ctx.textAlign = 'center';
  ctx.fillText(tapped ? 'Siguiendo ✓' : '+ Seguir', bx + bw / 2, by + bh / 2 + 2); ctx.textAlign = 'left';
  ctx.restore();
  // toque + chispas
  if (lt > ev.tap - .35 && lt < ev.tap + .7) {
    const tt = (lt - ev.tap + .35) / 1.05;
    const fx = bx + bw * .62, fy = by + bh * .62 + (1 - easeOut(clamp(tt * 3))) * 120;
    ctx.save(); ctx.globalAlpha = 1 - clamp((lt - ev.tap) / .7);
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(fx, fy, 26, 0, Math.PI * 2); ctx.fill();
    if (lt > ev.tap) { const rk = easeOut((lt - ev.tap) / .5); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(fx, fy, 26 + rk * 70, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  if (lt > ev.tap && lt < ev.tap + 1.0) {
    const sk = (lt - ev.tap) / 1.0, cols = ['#00E5FF', '#FF2E93', '#ffffff', '#ffd23f'];
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + .3, dd = easeOut(sk) * (110 + (i % 3) * 30);
      ctx.save(); ctx.globalAlpha = 1 - sk; ctx.fillStyle = cols[i % 4];
      ctx.beginPath(); ctx.arc(bx + bw / 2 + Math.cos(a) * dd, by + bh / 2 + Math.sin(a) * dd * .7, 9 - sk * 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  ctx.restore();
  // etiqueta de la serie sobre la tarjeta
  if (c.tag) {
    const tk = easeOut((lt - ev.show - .15) / .3);
    ctx.save(); ctx.globalAlpha = tk; ctx.font = '800 34px Montserrat';
    const tw = ctx.measureText(c.tag).width + 56, tx = (W - tw) / 2, ty = CY - 86 + (1 - tk) * 20;
    const g2 = ctx.createLinearGradient(tx, 0, tx + tw, 0); g2.addColorStop(0, '#00E5FF'); g2.addColorStop(1, '#FF2E93');
    ctx.fillStyle = g2; rr(ctx, tx, ty, tw, 62, 31); ctx.fill();
    ctx.fillStyle = '#1E1E22'; ctx.textBaseline = 'middle'; ctx.fillText(c.tag, tx + 28, ty + 33);
    ctx.restore();
  }
}
// ---- v2: subtítulos grandes palabra a palabra (tiempos reales de la voz)
const CAP_FONT = '900 78px Montserrat';
const isKey = w => /[0-9$%]/.test(w) || HL.has(w.replace(/[^0-9A-ZÁÉÍÓÚÑÜ$%]/gi, '').toUpperCase());
function chunkWords(words) {
  ctx.save(); ctx.font = CAP_FONT;
  const chunks = []; let cur = [], wsum = 0;
  const sp = ctx.measureText(' ').width * 1.5 + 12;
  for (const w of words) {
    const up = w.w.toUpperCase(), wd = ctx.measureText(up).width;
    const prevEnds = cur.length && /[.?!,…]$/.test(cur[cur.length - 1].w);
    if (cur.length && (cur.length >= 3 || wsum + sp + wd > 900 || prevEnds)) { chunks.push(cur); cur = []; wsum = 0; }
    cur.push({ ...w, up, wd }); wsum += (cur.length > 1 ? sp : 0) + wd;
  }
  if (cur.length) chunks.push(cur);
  ctx.restore();
  return chunks.map(c => ({ words: c, t0: c[0].t0 }));
}
function captions(b, t, y) {
  if (!b.words || !b.words.length) return;
  if (!b._chunks) b._chunks = chunkWords(b.words);
  const rel = t - b.a0;
  let ci = 0; b._chunks.forEach((c, i) => { if (rel >= c.t0 - .04) ci = i; });
  const ch = b._chunks[ci];
  ctx.save(); ctx.font = CAP_FONT; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const sp = ctx.measureText(' ').width * 1.5 + 12;
  const total = ch.words.reduce((a, w, i) => a + w.wd + (i ? sp : 0), 0);
  const fit = Math.min(1, 960 / total);
  const k = backOut((rel - ch.t0 + .04) / .14), s0 = lerp(.82, 1, k) * fit;
  ctx.translate(W / 2, y); ctx.scale(s0, s0);
  let x = -total / 2;
  ch.words.forEach((w, i) => {
    const active = rel >= w.t0 - .02 && rel < w.t1 + .02;
    const cx = x + w.wd / 2;
    ctx.save(); ctx.translate(cx, 0);
    if (active) { const p = backOut((rel - w.t0 + .02) / .12); ctx.scale(lerp(1, 1.07, p), lerp(1, 1.07, p)); ctx.rotate(-.015); }
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.lineWidth = 16; ctx.strokeStyle = '#0b0b0f'; ctx.strokeText(w.up, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = isKey(w.w) ? '#FF2E93' : active ? '#00E5FF' : '#ffffff';
    ctx.fillText(w.up, 0, 0);
    ctx.restore();
    x += w.wd + sp;
  });
  ctx.restore();
}
function hookBanner(t) {
  const hk = TL.hook; if (!hk || t > hk.until + .3) return;
  const a = t < hk.until ? 1 : 1 - (t - hk.until) / .3;
  const s = lerp(.9, 1, backOut(t / .22));
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 330); ctx.scale(s, s);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  let fs = 80; ctx.font = `900 ${fs}px Montserrat`;
  while (ctx.measureText(hk.lines[0]).width > 960 && fs > 50) { fs -= 2; ctx.font = `900 ${fs}px Montserrat`; }
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 20; ctx.lineWidth = 16; ctx.strokeStyle = '#0b0b0f'; ctx.strokeText(hk.lines[0], 0, -62);
  ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff'; ctx.fillText(hk.lines[0], 0, -62);
  if (hk.lines[1]) {
    let f2 = 72; ctx.font = `900 ${f2}px Montserrat`;
    while (ctx.measureText(hk.lines[1]).width > 900 && f2 > 44) { f2 -= 2; ctx.font = `900 ${f2}px Montserrat`; }
    const tw = ctx.measureText(hk.lines[1]).width + 70, th = f2 * 1.45;
    const gr = ctx.createLinearGradient(-tw / 2, 0, tw / 2, 0); gr.addColorStop(0, '#00E5FF'); gr.addColorStop(1, '#FF2E93');
    ctx.save(); ctx.rotate(-.025);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 24; ctx.fillStyle = gr; rr(ctx, -tw / 2, 58 - th / 2, tw, th, 22); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#1E1E22'; ctx.fillText(hk.lines[1], 0, 62);
    ctx.restore();
  }
  ctx.restore();
}
function vignette() {
  const g = ctx.createRadialGradient(W / 2, H * .48, H * .25, W / 2, H * .5, H * .75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${V2 ? .32 : .55})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
const CARDS = { stats: statsCard, message: messageCard, order: messageCard, notifs: notifsCard, compare: compareCard, graph: graphCard, chat: chatCard };

// ------------------------------------------------------------------ frame
const LAST = TL.beats[TL.beats.length - 1];
function beatAt(t) { for (const b of TL.beats) if (t >= b.start && t < b.end) return b; return LAST; }
window.frame = (n, quality = .92) => {
  const t = n / FPS, b = beatAt(t), lt = t - b.start, dur = b.end - b.start;
  const shot = b.type === 'line' ? (b.cta ? 'cta' : b.shot) : (b.card === 'billboard' ? 'billboard' : (b.cardIndex % 2 ? 'sky2' : 'sky'));
  if (b.type === 'card' && b.card === 'billboard') { drawThumb(lt, b.ev, b.data); screenMode = 'thumb'; }
  else if (screenMode !== 'store' && !b.cta) { drawStore(); screenMode = 'store'; }
  animate(t, b);
  const s = placeCamera(shot, lt, dur, t);
  renderCity(s.blur, s.dim);
  renderer.render(scene, camera);
  ctx.drawImage(glc, 0, 0);
  vignette();
  if (b.type === 'line') {
    if (V2 && b.words) captions(b, t, b.cta ? 330 : 1290); else subtitle(b.text, lt);
    if (b.cta) ctaCard(lt, b);
  }
  else if (CARDS[b.card]) { ctx.fillStyle = 'rgba(5,8,16,.25)'; ctx.fillRect(0, 0, W, H); CARDS[b.card](lt, b.ev, b.data); }
  if (V2) hookBanner(t);
  let fade = V2 ? 0 : clamp(1 - t / .35);
  if (b === LAST) fade = Math.max(fade, clamp((t - (TL.duration - .8)) / .65));
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  return quality ? out.toDataURL('image/jpeg', quality) : null;
};
window.TOTAL_FRAMES = Math.round(TL.duration * FPS);
window.READY = true;

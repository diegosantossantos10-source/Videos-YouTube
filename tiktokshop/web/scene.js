// Escena 3D + overlays 2D. Render determinista por frame: window.frame(n) -> dataURL JPEG.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const W = 1080, H = 1920;
const TL = await (await fetch('/build/timeline.json')).json();
const FPS = TL.fps;
await document.fonts.load('800 60px Inter');
await document.fonts.load('600 60px Inter');
await document.fonts.load('500 60px Inter');
await document.fonts.load('900 60px Inter');

// ------------------------------------------------------------------ utilidades
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const backOut = t => { t = clamp(t); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .78, metalness: 0, flatShading: true }, o));

// ------------------------------------------------------------------ renderer
const glc = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.05, 400);

// ------------------------------------------------------------------ ciudad (escena aparte, se desenfoca)
const city = new THREE.Scene();
city.fog = new THREE.Fog(0x0a0d1c, 40, 150);
{
  const [c, g] = canvas(16, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#010208'); gr.addColorStop(.45, '#060a1c'); gr.addColorStop(.75, '#151540'); gr.addColorStop(1, '#241a48');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(700, 260), new THREE.MeshBasicMaterial({ map: tex(c), fog: false, toneMapped: false }));
  sky.position.set(0, 60, -140); city.add(sky);
}
{ // estrellas
  const r = mulberry(11), pts = [], col = [];
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
  const r = mulberry(100 + v), [c, g] = canvas(256, 512);
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
  const r = mulberry(5);
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
const screen = new THREE.Group();
{
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
{
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#a8794a'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 40; i++) g.fillRect(0, i * 7, 256, 2);
  g.fillStyle = '#c9a272'; g.fillRect(110, 0, 36, 256);
  g.fillStyle = '#f4efe6'; g.fillRect(30, 170, 70, 46); g.fillStyle = '#333'; for (let i = 0; i < 4; i++) g.fillRect(38, 178 + i * 9, 54 - i * 8, 4);
  const bt = tex(c);
  const bm = new THREE.MeshStandardMaterial({ map: bt, roughness: .9 });
  const boxes = [[2.55, -1.6, .9, .7, .7, .2], [3.4, -1.3, .8, .65, .65, -.25], [2.95, -1.5, .7, .6, .6, .5, 1], [2.3, -2.9, .9, .8, .8, .1], [3.3, -2.8, .9, .9, .8, -.1], [2.75, -2.9, .7, .7, .6, .3, 1],
    [-2.85, -1.9, .8, .75, .7, .3], [-3.6, -2.4, .9, .8, .8, -.2], [-3.2, -2.2, .7, .6, .6, .1, 1]];
  const r = mulberry(9);
  const heights = {};
  for (const [x, z, w, h, d, ry, stack] of boxes) {
    const key = Math.round(x * 2) + ',' + Math.round(z * 2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bm);
    const base = stack ? .76 : 0;
    m.position.set(x, base + h / 2, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  // lámpara luna sobre las cajas
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(.17, 2), new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd98a, emissiveIntensity: 1.6, roughness: .9, flatShading: true }));
  moon.position.set(2.95, .76 + .6 + .2, -1.5); scene.add(moon);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, .06, 8), mat(0x6b4a2e)); base.position.set(2.95, .76 + .6 + .03, -1.5); scene.add(base);
  const ml = new THREE.PointLight(0xffd48a, 2.2, 4, 2); ml.position.copy(moon.position); scene.add(ml);
}

// ------------------------------------------------------------------ luces
scene.add(new THREE.HemisphereLight(0x3d4f86, 0x15110d, .75));
const key = new THREE.DirectionalLight(0xffd9bd, 1.9);
key.position.set(3.5, 6, 6.5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -3, near: 1, far: 25 });
key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 4;
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fa8ff, 1.6); rim.position.set(-4, 5, -6); scene.add(rim);
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
  // piernas y zapatos
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.23, .6, .26), navy); leg.position.set(s * .125, .4, 0); root.add(leg);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(.25, .11, .36, 2, .03), white); shoe.position.set(s * .125, .065, .04); root.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(.26, .03, .37), mat(0x9aa0a8)); sole.position.set(s * .125, .015, .04); root.add(sole);
  }
  // torso (sudadera)
  const torso = new THREE.Group(); torso.position.y = .68; root.add(torso); leo.torso = torso;
  const body = new THREE.Mesh(new RoundedBoxGeometry(.66, .62, .38, 2, .05), teal); body.position.y = .31; torso.add(body);
  const band = new THREE.Mesh(new BoxGeometryRounded(.67, .07, .39), tealD); band.position.y = .03; torso.add(band);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(.42, .17, .03), tealD); pocket.position.set(0, .17, .19); torso.add(pocket);
  for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(.025, .2, .025), white); st.position.set(s * .07, .48, .2); torso.add(st); }
  const hood = new THREE.Mesh(new THREE.TorusGeometry(.17, .075, 6, 12), tealD); hood.rotation.x = Math.PI / 2; hood.position.set(0, .63, -.02); torso.add(hood);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, .14, 8), skinD); neck.position.y = .66; torso.add(neck);
  // brazos
  leo.arms = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * .41, .56, 0); torso.add(piv);
    const arm = new THREE.Mesh(new RoundedBoxGeometry(.18, .52, .21, 2, .04), teal); arm.position.y = -.25; piv.add(arm);
    const hand = new THREE.Mesh(new RoundedBoxGeometry(.15, .14, .17, 2, .03), skin); hand.position.y = -.57; piv.add(hand);
    piv.userData.s = s; leo.arms.push(piv);
  }
  // cabeza
  const head = new THREE.Group(); head.position.y = .72; torso.add(head); leo.head = head;
  const face = new THREE.Group(); face.position.y = .25; head.add(face); leo.face = face;
  const R = .3, SX = 1, SY = 1.05, SZ = .95;
  const surfZ = (x, y) => SZ * Math.sqrt(Math.max(0, R * R - x * x - (y / SY) ** 2));
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 2), skin); skull.scale.set(SX, SY, SZ); face.add(skull);
  const beard = new THREE.Mesh(partialIco(R * 1.012, 2, (x, y, z) => y < -.1 && z > -.05 && Math.abs(x) < .27), mat(0x86593b)); beard.scale.copy(skull.scale); face.add(beard);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(.05, .1, .08), skin); ear.position.set(s * .295, -.01, 0); face.add(ear); }
  leo.eyes = []; leo.brows = []; leo.glints = [];
  for (const s of [-1, 1]) {
    const x = s * .108, y = .02;
    const eye = new THREE.Mesh(new RoundedBoxGeometry(.082, .102, .04, 2, .016), black);
    eye.position.set(x, y, surfZ(x, y) - .006); eye.rotation.y = Math.atan2(x, surfZ(x, y)); face.add(eye); leo.eyes.push(eye);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(.018, .022, .01), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(-.02, .025, .021); eye.add(gl);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(.11, .026, .03), mat(0x2a1a12));
    brow.position.set(x, .135, surfZ(x, .135) + .004); brow.rotation.y = eye.rotation.y; brow.userData.base = brow.position.clone(); face.add(brow); leo.brows.push(brow);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.038, .07, 3), skinD); nose.geometry.rotateX(Math.PI / 2); nose.position.set(0, -.045, surfZ(0, -.045) + .012); nose.rotation.x = .2; face.add(nose);
  const mg = new THREE.CylinderGeometry(.055, .055, .02, 10); mg.rotateX(Math.PI / 2);
  const mouth = new THREE.Mesh(mg, mat(0x150a08, { roughness: 1 })); mouth.position.set(0, -.15, surfZ(0, -.15) + .004); mouth.rotation.x = .5; face.add(mouth); leo.mouth = mouth;
  // gorro
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.296, .3, .13, 14), redD); cuff.position.y = .235; face.add(cuff);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.292, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), red); dome.position.y = .295; dome.scale.set(1, 1.08, 1); face.add(dome);
  const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), red); pom.position.y = .61; face.add(pom);
  root.position.set(-.95, 0, 0); root.rotation.y = .3;
  shadowAll(root); scene.add(root);
}
function BoxGeometryRounded(w, h, d) { return new RoundedBoxGeometry(w, h, d, 2, .03); }

// ------------------------------------------------------------------ Claude (cubo naranja)
const cl = {};
{
  const root = new THREE.Group(); cl.root = root;
  const orange = new THREE.MeshStandardMaterial({ color: 0xe4703a, roughness: .55, emissive: 0x7a2a0a, emissiveIntensity: .25 });
  const legM = new THREE.MeshStandardMaterial({ color: 0xe06a34, roughness: .6, emissive: 0xff6a20, emissiveIntensity: .35 });
  const bodyG = new THREE.Group(); bodyG.position.y = .66; root.add(bodyG); cl.body = bodyG;
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.06, .6, .68, 4, .07), orange); bodyG.add(body);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(.9, .5), new THREE.MeshBasicMaterial({ color: 0xffb070, toneMapped: false })); under.rotation.x = Math.PI / 2; under.position.y = -.301; bodyG.add(under);
  cl.eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new RoundedBoxGeometry(.075, .17, .03, 2, .014), new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: .25 }));
    eye.position.set(s * .2, .06, .34); bodyG.add(eye); cl.eyes.push(eye);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(.022, .05, .01), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(-.013, .045, .016); eye.add(gl);
  }
  cl.nubs = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * .53, .03, 0); bodyG.add(piv);
    const nub = new THREE.Mesh(new RoundedBoxGeometry(.22, .22, .3, 2, .03), orange); nub.position.x = s * .1; piv.add(nub);
    piv.userData.s = s; cl.nubs.push(piv);
  }
  cl.legs = [];
  for (const x of [-.4, -.27, .27, .4]) for (const z of [.2, -.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.085, .37, .085), legM); leg.position.set(x, .185, z); root.add(leg); cl.legs.push(leg);
  }
  const glow = new THREE.PointLight(0xff8a3c, 1.4, 2.6, 2); glow.position.set(0, .2, 0); root.add(glow);
  const face = new THREE.PointLight(0xff9a5a, 1.2, 3.5, 2); face.position.set(-.3, .7, .9); root.add(face);
  const [gc, gg] = canvas(256, 256); const rg = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, 'rgba(255,235,200,1)'); rg.addColorStop(.18, 'rgba(255,170,90,.85)'); rg.addColorStop(.5, 'rgba(255,110,40,.25)'); rg.addColorStop(1, 'rgba(255,90,20,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 256, 256);
  const spot = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), new THREE.MeshBasicMaterial({ map: tex(gc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  spot.rotation.x = -Math.PI / 2; spot.position.y = .006; root.add(spot); cl.spot = spot;
  root.position.set(1.0, 0, .15); root.rotation.y = -.3;
  shadowAll(root); spot.castShadow = false; under.castShadow = false; scene.add(root);
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
function drawLeoFace2D(g, cx, cy, r) {
  g.save();
  const pts = []; for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 9; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.04]); }
  g.fillStyle = '#c2825a'; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
  const shades = ['rgba(0,0,0,.08)', 'rgba(255,255,255,.06)', 'rgba(0,0,0,.14)'];
  for (let i = 0; i < 9; i++) { const a = pts[i], b = pts[(i + 1) % 9]; g.fillStyle = shades[i % 3]; g.beginPath(); g.moveTo(cx, cy); g.lineTo(...a); g.lineTo(...b); g.fill(); }
  g.fillStyle = 'rgba(80,50,30,.55)'; g.beginPath(); g.moveTo(pts[2][0], pts[2][1]); for (let i = 3; i <= 7; i++) g.lineTo(...pts[i]); g.lineTo(cx - r * .6, cy + r * .15); g.lineTo(cx + r * .6, cy + r * .15); g.closePath(); g.fill();
  g.fillStyle = '#c4262c'; g.beginPath(); g.ellipse(cx, cy - r * .55, r * 1.0, r * .75, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#a61e24'; rr(g, cx - r * 1.02, cy - r * .62, r * 2.04, r * .32, r * .08); g.fill();
  g.fillStyle = '#c4262c'; g.beginPath(); g.arc(cx, cy - r * 1.32, r * .14, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111'; rr(g, cx - r * .5, cy - r * .2, r * .3, r * .36, r * .06); g.fill(); rr(g, cx + r * .2, cy - r * .2, r * .3, r * .36, r * .06); g.fill();
  g.fillStyle = '#fff'; g.fillRect(cx - r * .44, cy - r * .14, r * .08, r * .08); g.fillRect(cx + r * .26, cy - r * .14, r * .08, r * .08);
  g.fillStyle = '#2a1a12'; g.save(); g.translate(cx - r * .35, cy - r * .32); g.rotate(-.15); g.fillRect(-r * .2, -r * .04, r * .4, r * .08); g.restore();
  g.save(); g.translate(cx + r * .35, cy - r * .32); g.rotate(.15); g.fillRect(-r * .2, -r * .04, r * .4, r * .08); g.restore();
  g.fillStyle = '#150a08'; g.beginPath(); g.ellipse(cx, cy + r * .45, r * .2, r * .26, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

// pantalla: tienda / miniatura
function drawStore() {
  const g = scrG; g.fillStyle = '#0e1322'; g.fillRect(0, 0, SCR_W, SCR_H);
  g.fillStyle = '#151b2e'; g.fillRect(0, 0, SCR_W, 130);
  g.fillStyle = '#e4703a'; g.beginPath(); g.arc(85, 65, 40, 0, Math.PI * 2); g.fill(); drawBag(g, 85, 64, 40);
  g.fillStyle = '#fff'; g.font = '800 54px Inter'; g.textBaseline = 'middle'; g.fillText('Mi Tienda', 145, 66);
  g.fillStyle = '#ff3b5c'; rr(g, SCR_W - 330, 38, 290, 56, 28); g.fill();
  g.fillStyle = '#fff'; g.font = '700 32px Inter'; g.textAlign = 'center'; g.fillText('● EN VIVO 3:00', SCR_W - 185, 67); g.textAlign = 'left';
  const cols = 3, rows = 2, pad = 40, tw = (SCR_W - pad * (cols + 1)) / cols, th = (SCR_H - 130 - pad * (rows + 1)) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = pad + i * (tw + pad), y = 130 + pad + j * (th + pad);
    g.fillStyle = '#1c2438'; rr(g, x, y, tw, th, 26); g.fill();
    drawMoonLamp(g, x + tw * .3, y + th * .44, th * .24);
    g.fillStyle = '#e8ebf2'; g.font = '700 36px Inter'; g.fillText('Lámpara Luna', x + tw * .55, y + th * .3);
    g.fillStyle = '#ff8a4c'; g.font = '800 54px Inter'; g.fillText('$19.99', x + tw * .55, y + th * .52);
    g.fillStyle = '#16a34a'; rr(g, x + tw * .55, y + th * .66, 200, 50, 25); g.fill();
    g.fillStyle = '#fff'; g.font = '700 28px Inter'; g.fillText('AGOTADO', x + tw * .55 + 32, y + th * .66 + 26);
  }
  scrTex.needsUpdate = true;
}
function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }
function drawThumb(lt, ev) {
  const g = scrG; g.fillStyle = '#f1f2f4'; g.fillRect(0, 0, SCR_W, SCR_H);
  g.fillStyle = '#c8202b'; rr(g, 60, 60, SCR_W - 120, 600, 34); g.fill();
  g.fillStyle = '#fff'; g.font = '900 112px Inter'; g.textBaseline = 'alphabetic';
  g.fillText('MI IA VENDIÓ', 120, 230); g.fillText('500 LÁMPARAS', 120, 360);
  g.fillStyle = '#ffd23f'; g.font = '900 150px Inter'; g.fillText('$8,000', 120, 540);
  drawMoonLamp(g, 1130, 470, 95, 1.3);
  drawLeoFace2D(g, 1330, 330, 190);
  const v = 2.4e6 * easeOut((lt - ev.views[0]) / (ev.views[1] - ev.views[0]));
  g.fillStyle = '#d0202b'; g.font = '800 92px Inter'; g.fillText((v / 1e6).toFixed(1) + 'M vistas', 90, 800);
  g.fillStyle = '#7b8089'; g.font = '500 54px Inter'; g.fillText('312 lámparas vendidas con este video', 90, 890);
  if (lt > ev.stamp) {
    const k = backOut((lt - ev.stamp) / .35), s = lerp(2.2, 1, k);
    g.save(); g.translate(1290, 820); g.rotate(-.12); g.scale(s, s); g.globalAlpha = clamp((lt - ev.stamp) / .12);
    g.strokeStyle = '#16a34a'; g.lineWidth = 12; rr(g, -230, -70, 460, 140, 20); g.stroke();
    g.fillStyle = '#16a34a'; g.font = '900 72px Inter'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TOP VENTAS', 0, 4);
    g.restore(); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  scrTex.needsUpdate = true;
}
drawStore();
let screenMode = 'store';

// ------------------------------------------------------------------ cámaras
const SHOTS = {
  wide: { pos: [0.05, 1.55, 7.2], look: [0.05, 1.75, 0], fov: 50, push: .45, blur: 1, dim: .1 },
  claude: { target: [1.0, .58, .15], yaw: -.3, d: 4.3, h: .5, fov: 40, push: .18, blur: 2, dim: .1 },
  leo: { target: [-.95, 1.5, 0], yaw: .3, d: 3.5, h: .05, fov: 42, push: .15, blur: 2, dim: .1 },
  leoClose: { target: [-.95, 1.6, 0], yaw: .28, d: 2.35, h: .02, fov: 40, push: .1, blur: 3, dim: .1 },
  leoXClose: { target: [-.95, 1.66, 0], yaw: .24, d: 1.3, h: 0, fov: 40, push: .04, snap: true, blur: 3, dim: .1 },
  leoFull: { target: [-.95, 1.4, 0], yaw: .3, d: 4.6, h: .15, fov: 46, push: .2, blur: 2, dim: .1 },
  claudeClose: { target: [1.0, .64, .15], yaw: -.55, d: 3.1, h: .22, fov: 40, push: .12, blur: 3, dim: .1 },
  sky: { pos: [0, 2.8, 2.0], look: [16, 7.5, -20], fov: 52, push: .3, blur: 4, dim: .4 },
  billboard: { pos: [-.25, 2.25, 7.4], look: [-.5, 3.1, -4.4], fov: 46, push: 1.3, blur: 2, dim: .1 },
};
const SHOT_ALIAS = { claudeOTS: 'claudeClose' };
const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _d = new THREE.Vector3();
function placeCamera(shotName, lt, dur, t) {
  const s = SHOTS[SHOT_ALIAS[shotName] || shotName];
  if (s.pos) { _p.set(...s.pos); _l.set(...s.look); }
  else {
    _l.set(...s.target);
    let d = s.d;
    if (s.snap) d = lerp(s.d * 2.1, s.d, easeOut(lt / .16));
    _p.set(_l.x + Math.sin(s.yaw) * d, _l.y + s.h, _l.z + Math.cos(s.yaw) * d);
  }
  _d.subVectors(_l, _p).normalize();
  _p.addScaledVector(_d, s.push * easeInOut(lt / Math.max(dur, .1)));
  // respiración de cámara (handheld muy sutil)
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
  const leoMood = beat.who === 'leo' ? mood : '';
  const clMood = beat.who === 'claude' ? mood : (beat.type === 'card' && beat.card === 'billboard' ? 'happy' : '');

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
  } else if (leoMood === 'calm') {
    eyeS = .22; browR = -.15; L.head.rotation.x += .07; L.head.rotation.z += .04;
  }
  if (beat.type === 'card' && beat.card === 'billboard') { L.head.rotation.x = -.35; L.head.rotation.y = -.1; mOpen = .7; eyeS = 1.2; }
  L.eyes.forEach(e => e.scale.set(eyeSX, eyeS, 1));
  L.brows.forEach((b, i) => { b.position.copy(b.userData.base); b.position.y += browY; b.rotation.z = (i ? -1 : 1) * browR; });
  L.mouth.scale.set(mW, clamp(mOpen, .08, 2), 1);

  // ---- Claude
  const C = cl;
  let hop = 0;
  if (clMood === 'happy') hop = .045 * Math.abs(Math.sin(t * 7));
  C.body.position.y = .66 + .008 * Math.sin(t * 2.4) + clTalk * .035 + hop;
  C.body.scale.set(1 - clTalk * .02, 1 + clTalk * .045, 1);
  C.body.rotation.z = .02 * Math.sin(t * 1.7) + clTalk * .025 * Math.sin(t * 18);
  C.root.rotation.y = beat.who === 'leo' ? -.42 : -.3;
  C.nubs.forEach((n, i) => { n.rotation.z = n.userData.s * (.12 + .06 * Math.sin(t * 3 + i) + clTalk * .45); n.rotation.x = clTalk * .2 * Math.sin(t * 9 + i * 2); });
  C.legs.forEach((g, i) => { g.position.y = .185 + (clTalk > .3 ? .012 * Math.max(0, Math.sin(t * 22 + i * 1.7)) : 0); });
  let ceS = blink(t, 1.3), ceX = 1;
  if (clMood === 'smug') { ceS = .16; ceX = 1.7; }
  if (clMood === 'happy') { ceS = Math.min(ceS, .55); }
  C.eyes.forEach(e => e.scale.set(ceX, ceS, 1));
  C.spot.material.opacity = .85 + .15 * Math.sin(t * 3.1);
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
    const y = 268 + i * 66;
    ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff'; ctx.fillText(ln, W / 2, y);
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
  if (k <= 0) return;
  ctx.save(); ctx.font = font; const w = ctx.measureText(text).width + padX * 2;
  const s = lerp(.5, 1, backOut(k)); ctx.globalAlpha *= clamp(k * 3);
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s);
  ctx.fillStyle = col; rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 2);
  ctx.restore();
}
function statsCard(lt, ev) {
  const gk = easeOut((lt - ev.money[0]) / .4), x = 80, w = 920, h = lerp(560, 1000, gk), y = lerp(600, 430, gk);
  cardFrame(lt, x, y, w, h, () => {
    const P = 60;
    ctx.fillStyle = '#e4703a'; ctx.beginPath(); ctx.arc(P + 38, 92, 38, 0, Math.PI * 2); ctx.fill(); drawBag(ctx, P + 38, 92, 36);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#16181d'; ctx.font = '800 46px Inter'; ctx.fillText('Tu tienda en 60 segundos', P + 98, 76);
    ctx.fillStyle = '#7a7f87'; ctx.font = '500 30px Inter'; ctx.fillText('3 videos · 1 live · 4 días', P + 98, 122);
    const c = 500 * easeOut((lt - ev.count[0]) / (ev.count[1] - ev.count[0]));
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#111317'; ctx.font = '900 150px Inter'; ctx.fillText(fmtNum(c), P - 4, 340);
    ctx.fillStyle = '#6b7078'; ctx.font = '500 34px Inter'; ctx.fillText('lámparas vendidas', P, 392);
    const bw = w - P * 2, p = c / 500;
    ctx.fillStyle = '#dde0e5'; rr(ctx, P, 428, bw, 24, 12); ctx.fill();
    if (p > 0) { ctx.fillStyle = p >= .999 ? '#16a34a' : '#e4703a'; rr(ctx, P, 428, Math.max(24, bw * p), 24, 12); ctx.fill(); }
    ctx.fillStyle = '#8a8f98'; ctx.font = '500 28px Inter'; ctx.textAlign = 'right'; ctx.fillText(`Stock: ${fmtNum(500 - c)}`, w - P, 500); ctx.textAlign = 'left';
    pill(P, 470, 'Agotado ✓', '#16a34a', (lt - ev.badge) / .3);
    const mk = easeOut((lt - ev.money[0]) / .35);
    if (mk > 0) {
      ctx.save(); ctx.globalAlpha *= mk; ctx.translate(0, (1 - mk) * 30);
      ctx.fillStyle = '#ddf3e4'; rr(ctx, 36, 572, w - 72, 390, 26); ctx.fill();
      ctx.fillStyle = '#4b5563'; ctx.font = '500 32px Inter'; ctx.fillText('Ganancia estimada del mes', 76, 640);
      const m = 8000 * easeOut((lt - ev.money[0]) / (ev.money[1] - ev.money[0]));
      ctx.fillStyle = '#15a04a'; ctx.font = '900 132px Inter'; ctx.fillText('$' + fmtNum(m) + ' USD', 68, 790);
      const dk = clamp((lt - ev.deposit) / .25);
      ctx.globalAlpha *= dk; ctx.fillStyle = '#1f2937'; ctx.font = '700 38px Inter'; ctx.fillText('Depósito: viernes', 76, 880);
      ctx.restore();
    }
  });
}
function orderCard(lt, ev) {
  const x = 80, w = 920, rk = easeOut((lt - ev.reply) / .4), h = lerp(500, 760, rk), y = 560 - rk * 120;
  cardFrame(lt, x, y, w, h, () => {
    const P = 60; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8a8f98'; ctx.font = '500 34px Inter'; ctx.fillText('Para:', P, 82); ctx.fillText('Asunto:', P, 140);
    ctx.fillStyle = '#16181d'; ctx.font = '700 34px Inter'; ctx.fillText('Proveedor', P + 150, 82); ctx.fillText('Pedido urgente', P + 150, 140);
    drawClaudeIcon(ctx, w - P - 64, 56, 64);
    ctx.fillStyle = '#d9dce1'; ctx.fillRect(P, 186, w - P * 2, 3);
    ctx.fillStyle = '#111317'; ctx.font = '800 62px Inter'; ctx.fillText('5,000 lámparas de luna.', P, 268);
    const sent = 'Enviado a las 3:12 a.m.', n = Math.floor(sent.length * clamp((lt - ev.time) / .45));
    ctx.fillStyle = '#8a8f98'; ctx.font = '500 32px Inter'; ctx.fillText(sent.slice(0, n), P, 330);
    pill(P, 378, 'Enviado ✓', '#16a34a', (lt - ev.sent) / .3);
    if (rk > 0) {
      ctx.save(); ctx.globalAlpha *= rk; ctx.translate(0, (1 - rk) * 50);
      ctx.fillStyle = '#e1e6f0'; rr(ctx, 36, 480, w - 72, 240, 24); ctx.fill();
      ctx.fillStyle = '#6b7280'; ctx.font = '500 32px Inter'; ctx.fillText('Proveedor · ahora', 76, 540);
      ctx.fillStyle = '#111317'; ctx.font = '800 72px Inter'; ctx.fillText('Llegan el lunes.', 76, 630);
      ctx.restore();
    }
  });
}
function vignette() {
  const g = ctx.createRadialGradient(W / 2, H * .48, H * .25, W / 2, H * .5, H * .75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ frame
function beatAt(t) { for (const b of TL.beats) if (t >= b.start && t < b.end) return b; return TL.beats[TL.beats.length - 1]; }
window.frame = (n, quality = .92) => {
  const t = n / FPS, b = beatAt(t), lt = t - b.start, dur = b.end - b.start;
  const shot = b.type === 'line' ? b.shot : (b.card === 'billboard' ? 'billboard' : 'sky');
  if (b.type === 'card' && b.card === 'billboard') { drawThumb(lt, b.ev); screenMode = 'thumb'; }
  else if (screenMode !== 'store') { drawStore(); screenMode = 'store'; }
  animate(t, b);
  const s = placeCamera(shot, lt, dur, t);
  renderCity(s.blur, s.dim);
  renderer.render(scene, camera);
  ctx.drawImage(glc, 0, 0);
  vignette();
  if (b.type === 'line') subtitle(b.text, lt);
  else if (b.card === 'stats') { ctx.fillStyle = 'rgba(5,8,16,.25)'; ctx.fillRect(0, 0, W, H); statsCard(lt, b.ev); }
  else if (b.card === 'order') { ctx.fillStyle = 'rgba(5,8,16,.25)'; ctx.fillRect(0, 0, W, H); orderCard(lt, b.ev); }
  let fade = clamp(1 - t / .35);
  if (b.card === 'billboard') fade = Math.max(fade, clamp((lt - b.ev.fade) / (dur - b.ev.fade - .15)));
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  return quality ? out.toDataURL('image/jpeg', quality) : null;
};
window.TOTAL_FRAMES = Math.round(TL.duration * FPS);
window.READY = true;

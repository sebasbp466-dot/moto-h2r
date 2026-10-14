import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GameAudio, rpmOf } from './audio.js';
import * as M from './models.js';

const $ = id => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- errores visibles en pantalla (para depurar) ---------- */
function showErr(m) { const e = $('err'); if (!e) return; e.style.display = 'block'; e.textContent = String(m).slice(0, 300); }
addEventListener('error', e => showErr((e.message || 'error') + ' ' + ((e.filename || '').split('/').pop()) + ':' + e.lineno));
addEventListener('unhandledrejection', e => showErr((e.reason && e.reason.message) || e.reason));

/* ---------- ajustes guardados ---------- */
const cfg = { q: 1, sfx: true, music: true, view: 0 };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('mpbCfg') || '{}')); } catch (e) {}
const saveCfg = () => { try { localStorage.setItem('mpbCfg', JSON.stringify(cfg)); } catch (e) {} };
let best = 0;
try { best = +localStorage.getItem('mpbBest') || 0; } catch (e) {}

/* ---------- carretera con curvas ---------- */
const cx = s => 20 * Math.sin(s * 0.012) + 10 * Math.sin(s * 0.03 + 1);
const cdx = s => 20 * 0.012 * Math.cos(s * 0.012) + 10 * 0.03 * Math.cos(s * 0.03 + 1);
const cddx = s => -20 * 0.012 * 0.012 * Math.sin(s * 0.012) - 10 * 0.03 * 0.03 * Math.sin(s * 0.03 + 1);
function roadPos(s, l, o) {
  const d = cdx(s), n = Math.sqrt(d * d + 1);
  o.x = cx(s) + l / n; o.z = -s + l * d / n; return o;
}
const tmp = { x: 0, z: 0 };

/* ---------- renderer / escena ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc77a5a, 40, 380);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 650);

// cielo de atardecer (shader)
const sunDir = new THREE.Vector3(-0.3, 0.2, -1).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sunDir: { value: sunDir } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
  void main(){
    vec3 d=normalize(vDir); float h=clamp(d.y,0.0,1.0);
    vec3 horizon=vec3(1.0,0.30,0.06), mid=vec3(0.9,0.12,0.2), top=vec3(0.012,0.02,0.12);
    vec3 col=mix(horizon,mid,smoothstep(0.0,0.2,h)); col=mix(col,top,smoothstep(0.1,0.75,h));
    float s=max(dot(d,sunDir),0.0);
    col+=vec3(1.0,0.6,0.25)*pow(s,20.0)*0.9; col+=vec3(1.0,0.9,0.7)*pow(s,700.0)*6.0;
    if(d.y<0.0) col=horizon*0.8;
    gl_FragColor=vec4(col,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
try { // reflejos del cielo en la moto
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene(); es.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat));
  scene.environment = pm.fromScene(es, 0, 1, 1000).texture;
  pm.dispose();
} catch (e) { showErr('env: ' + e.message); }

scene.add(new THREE.HemisphereLight(0xffd2a8, 0x2b2230, 0.7));
const sun = new THREE.DirectionalLight(0xffa868, 2.2);
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 200 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.08;
scene.add(sun, sun.target);

/* ---------- postprocesado (bloom + efecto de velocidad) ---------- */
const SpeedShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
  void main(){
    vec2 dir=(vUv-vec2(0.5))*strength; vec3 col=vec3(0.0);
    for(int i=0;i<5;i++){ float f=float(i)/4.0; vec2 o=dir*f;
      col.r+=texture2D(tDiffuse,vUv-o*1.07).r; col.g+=texture2D(tDiffuse,vUv-o).g; col.b+=texture2D(tDiffuse,vUv-o*0.93).b; }
    gl_FragColor=vec4(col/5.0,1.0);
  }`
};
let composer = null, bloom = null, speedPass = null;
function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.55, 0.9);
  composer.addPass(bloom);
  speedPass = new ShaderPass(SpeedShader);
  composer.addPass(speedPass);
  composer.addPass(new OutputPass());
}
function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  const pr = [Math.min(dpr, 0.8), Math.min(dpr, 1.0), Math.min(dpr, 1.5)][cfg.q];
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  if (cfg.q >= 1) {
    try {
      if (!composer) buildComposer();
      composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
      bloom.strength = cfg.q === 2 ? 0.85 : 0.6;
    } catch (e) { composer = null; showErr('post: ' + e.message); }
  }
  sun.castShadow = cfg.q === 2;
}

/* ---------- suelo ---------- */
const grass = M.grassTex(); grass.repeat.set(175, 175);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ map: grass, color: 0xd8c8a0 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.3; scene.add(ground);

/* ---------- cintas de carretera ---------- */
const SEG = 110, STEP = 4;
const ribbons = [];
const asphalt = M.asphaltTex();
function makeRibbon(a, b, y, color, dash, o = {}) {
  const n = SEG * 6;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { nor[i * 3] = o.nx || 0; nor[i * 3 + 1] = o.wall ? 0 : 1; }
  const attrP = new THREE.BufferAttribute(pos, 3), attrU = new THREE.BufferAttribute(uv, 2);
  g.setAttribute('position', attrP); g.setAttribute('uv', attrU); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const layer = o.layer || 0;
  const mat = new THREE.MeshLambertMaterial({ color, map: o.map || null, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -(1 + layer * 2), polygonOffsetUnits: -layer });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.receiveShadow = !!o.shadow;
  scene.add(m);
  ribbons.push({ a, b, y, dash, wall: o.wall, pos, uv, attrP, attrU });
}
makeRibbon(-9.2, 9.2, 0.0, 0x8a8472, false, { layer: 0 });
makeRibbon(-7.0, 7.0, 0.01, 0xffffff, false, { layer: 1, map: asphalt, shadow: true });
makeRibbon(-7.25, -6.9, 0.02, 0xffffff, false, { layer: 2 });
makeRibbon(6.9, 7.25, 0.02, 0xffffff, false, { layer: 2 });
makeRibbon(-3.6, -3.4, 0.02, 0xdddddd, true, { layer: 2 });
makeRibbon(-0.1, 0.1, 0.02, 0xffd400, true, { layer: 2 });
makeRibbon(3.4, 3.6, 0.02, 0xdddddd, true, { layer: 2 });
for (const sd of [-1, 1]) { // barreras laterales
  makeRibbon(sd * 7.7, sd * 7.7, 0, 0x707078, false, { wall: [0, 0.5], nx: -sd, layer: 3 });
  makeRibbon(sd * 7.7, sd * 7.7, 0, 0xb8bec6, false, { wall: [0.5, 0.95], nx: -sd, layer: 3 });
}
const RP = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
const ORDER = [0, 1, 2, 1, 3, 2];
let lastBase = -99999;
function updateRoad(s) {
  const base = Math.floor(s / STEP) - 8;
  if (base === lastBase) return;
  lastBase = base;
  for (const r of ribbons) {
    const p = r.pos, uv = r.uv;
    let k = 0, u = 0;
    const y0 = r.wall ? r.wall[0] : r.y, y1 = r.wall ? r.wall[1] : r.y;
    for (let i = 0; i < SEG; i++) {
      const gi = base + i, s0 = gi * STEP, s1 = s0 + STEP;
      const hide = r.dash && (gi & 1);
      roadPos(s0, r.a, RP[0]); roadPos(s0, r.b, RP[1]); roadPos(s1, r.a, RP[2]); roadPos(s1, r.b, RP[3]);
      for (let j = 0; j < 6; j++) {
        const c = ORDER[j];
        p[k++] = RP[c].x; p[k++] = hide ? -50 : ((c & 1) ? y1 : y0); p[k++] = RP[c].z;
        uv[u++] = ((c & 1) ? r.b : r.a) * 0.25; uv[u++] = ((c >> 1) ? s1 : s0) * 0.25;
      }
    }
    r.attrP.needsUpdate = true; r.attrU.needsUpdate = true;
  }
}

/* ---------- objetos instanciados que se reciclan: árboles, postes, luces ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
const hash = g => Math.abs(Math.sin(g * 12.9898) * 43758.5453) % 1;
function makePool(meshes, count, step, behind, apply) {
  const ids = new Int32Array(count).fill(-99999);
  return {
    update(s) {
      const g0 = Math.floor((s - behind) / step);
      let dirty = false;
      for (let g = g0; g < g0 + count; g++) {
        const k = ((g % count) + count) % count;
        if (ids[k] !== g) { ids[k] = g; apply(k, g); dirty = true; }
      }
      if (dirty) for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    }
  };
}
function inst(geo, mat, count) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.frustumCulled = false; scene.add(m);
  for (let i = 0; i < count; i++) { _m.makeScale(0, 0, 0); m.setMatrixAt(i, _m); }
  return m;
}
const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6); trunkGeo.translate(0, 1.2, 0);
const leafGeo = new THREE.ConeGeometry(1.8, 5.2, 7); leafGeo.translate(0, 4.8, 0);
const trunk = inst(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a3b21 }), 100);
const leaf = inst(leafGeo, new THREE.MeshLambertMaterial({ color: 0x2a6b32 }), 100);
const treePool = makePool([trunk, leaf], 100, 8, 60, (k, g) => {
  const h = hash(g);
  roadPos(g * 8, ((g & 1) ? 1 : -1) * (12 + h * 18), tmp);
  const sc = 0.8 + h;
  _p.set(tmp.x, 0, tmp.z); _q.setFromAxisAngle(Y, h * 6.28); _s.set(sc, sc * (0.9 + h * 0.4), sc);
  _m.compose(_p, _q, _s); trunk.setMatrixAt(k, _m); leaf.setMatrixAt(k, _m);
});
const postGeo = new THREE.BoxGeometry(0.12, 0.95, 0.12); postGeo.translate(0, 0.475, 0);
const posts = inst(postGeo, new THREE.MeshLambertMaterial({ color: 0x555a60 }), 120);
const postPool = makePool([posts], 120, 8, 20, (k, g) => {
  const side = (g & 1) ? 1 : -1;
  roadPos(g * 8, side * 7.8, tmp);
  _p.set(tmp.x, 0, tmp.z); _q.setFromAxisAngle(Y, -Math.atan(cdx(g * 8))); _s.set(1, 1, 1);
  _m.compose(_p, _q, _s); posts.setMatrixAt(k, _m);
});
const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 7.5, 6); poleGeo.translate(0, 3.75, 0);
const headGeo = new THREE.BoxGeometry(1.7, 0.16, 0.45); headGeo.translate(0.8, 7.4, 0);
const lampMat = new THREE.MeshBasicMaterial({ toneMapped: false }); lampMat.color.setRGB(5, 3.6, 2);
const poles = inst(poleGeo, new THREE.MeshLambertMaterial({ color: 0x33353a }), 24);
const heads = inst(headGeo, lampMat, 24);
const lampPool = makePool([poles, heads], 24, 40, 40, (k, g) => {
  const side = (g & 1) ? 1 : -1;
  roadPos(g * 40, side * 8.9, tmp);
  _p.set(tmp.x, 0, tmp.z); _q.setFromAxisAngle(Y, -Math.atan(cdx(g * 40)) + (side > 0 ? Math.PI : 0)); _s.set(1, 1, 1);
  _m.compose(_p, _q, _s); poles.setMatrixAt(k, _m); heads.setMatrixAt(k, _m);
});

// montañas lejanas
const mount = new THREE.Group();
const mMat = [new THREE.MeshBasicMaterial({ color: 0x3a2650, fog: false }), new THREE.MeshBasicMaterial({ color: 0x5a3358, fog: false })];
for (let i = 0; i < 30; i++) {
  const a = i / 30 * Math.PI * 2 + rnd(-0.05, 0.05), R = rnd(330, 400), h = rnd(40, 110), w = rnd(70, 140);
  const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4 + ((Math.random() * 3) | 0)), mMat[i % 2]);
  m.position.set(Math.cos(a) * R, h / 2 - 2, Math.sin(a) * R); m.rotation.y = Math.random() * 3;
  mount.add(m);
}
scene.add(mount);

// arco de salida con el nombre del juego
const ARCH_S = 36;
{
  const g = new THREE.Group();
  const pm = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7.4, 8), pm); p.position.set(sd * 8.9, 3.7, 0); g.add(p); }
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(17.8, 3.1), new THREE.MeshBasicMaterial({ map: M.bannerTex('MOTO PIRUETA BRICEÑO'), side: THREE.DoubleSide, toneMapped: false }));
  ban.position.set(0, 6.0, 0); g.add(ban);
  roadPos(ARCH_S, 0, tmp);
  g.position.set(tmp.x, 0, tmp.z); g.rotation.y = -Math.atan(cdx(ARCH_S));
  scene.add(g);
}

/* ---------- moto, haz de luz y tráfico ---------- */
const bike = M.buildBike();
scene.add(bike.root);
const { root: bikeRoot, leanG, pitchG, rW, fW } = bike;
const beam = new THREE.Mesh(new THREE.PlaneGeometry(6, 26), new THREE.MeshBasicMaterial({ map: M.beamTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, toneMapped: false, side: THREE.DoubleSide }));
beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.06, -14); beam.renderOrder = 2;
bikeRoot.add(beam);

const LANES = [-5.25, -1.75, 1.75, 5.25];
const carCols = [0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x27ae60, 0x8e44ad, 0xe67e22, 0x7f8c8d];
const pick = () => carCols[(Math.random() * carCols.length) | 0];
function makeCar() {
  const m = M.buildCar(Math.random() < 0.2, pick(), pick());
  scene.add(m.g);
  return { g: m.g, len: m.len, wid: m.wid, s: 0, l: 0, v: 20, base: 20, nm: false };
}
const cars = [];
for (let i = 0; i < 20; i++) cars.push(makeCar());
function spawn(c, ps, minAhead) {
  for (let t = 0; t < 10; t++) {
    c.l = LANES[(Math.random() * 4) | 0];
    c.s = ps + minAhead + Math.random() * 450;
    if (!cars.some(o => o !== c && o.l === c.l && Math.abs(o.s - c.s) < 30)) break;
  }
  c.base = rnd(14, 34); c.v = c.base; c.nm = false;
}

/* ---------- partículas (chispas, llamas, humo) ---------- */
const NP = 360;
const pPos = new Float32Array(NP * 3).fill(0), pCol = new Float32Array(NP * 3), pBase = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3);
const pLife = new Float32Array(NP), pMax = new Float32Array(NP).fill(1), pGrav = new Float32Array(NP);
for (let i = 0; i < NP; i++) pPos[i * 3 + 1] = -999;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.5, map: M.glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
pts.frustumCulled = false; scene.add(pts);
let pHead = 0;
function emit(x, y, z, vx, vy, vz, life, r, g, b, grav = 9) {
  const i = pHead; pHead = (pHead + 1) % NP;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pLife[i] = pMax[i] = life; pGrav[i] = grav;
  pBase[i * 3] = r; pBase[i * 3 + 1] = g; pBase[i * 3 + 2] = b;
}
function updateParticles(dt) {
  for (let i = 0; i < NP; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
    pVel[i * 3 + 1] -= pGrav[i] * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.03 && pGrav[i] > 0) { pPos[i * 3 + 1] = 0.03; pVel[i * 3 + 1] *= -0.3; }
    const f = pLife[i] / pMax[i];
    pCol[i * 3] = pBase[i * 3] * f; pCol[i * 3 + 1] = pBase[i * 3 + 1] * f; pCol[i * 3 + 2] = pBase[i * 3 + 2] * f;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
function burst(x, y, z, n, spd, r, g, b, life = 0.8) {
  for (let i = 0; i < n; i++) emit(x, y, z, rnd(-1, 1) * spd, rnd(0.2, 1) * spd, rnd(-1, 1) * spd, life * rnd(0.5, 1), r, g, b);
}

/* ---------- audio ---------- */
const audio = new GameAudio();
audio.prefs(cfg.sfx, cfg.music);
const sfx = fn => { try { fn(); } catch (e) {} };

/* ---------- estado, entradas, interfaz ---------- */
const input = { left: false, right: false, gas: false, wheelie: false, nitro: false };
const st = { s: 0, l: 1.75, v: 0, p: 0, w: 0, drift: 0, steer: 0, leanZ: 0, state: 'menu', paused: false, score: 0, crashT: 0, flip: false, side: 1, combo: 1, msgT: 0, nitro: 0.5, nitroOn: false, ry: 0, gear: 0, t: 0, wasWant: false, flash: 0, crashMsg: '', overShown: false };
const cam = { yaw: 0, pitch: 0, idle: 0, drag: null, orbit: 0, shake: 0, l: new THREE.Vector3(0, 3, 6) };
const VIEWS = ['PERSECUCIÓN', 'CERCA', 'CASCO', 'FRONTAL'];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ex = new THREE.Vector3();

function bindBtn(id, key) {
  const el = $(id);
  const on = e => { e.preventDefault(); input[key] = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch (_) {} };
  const off = e => { e.preventDefault(); input[key] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, off));
}
bindBtn('bL', 'left'); bindBtn('bR', 'right'); bindBtn('bG', 'gas'); bindBtn('bW', 'wheelie'); bindBtn('bN', 'nitro');
const keyMap = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'gas', w: 'gas', ' ': 'wheelie', x: 'wheelie', Shift: 'nitro', n: 'nitro' };
addEventListener('keydown', e => {
  const k = keyMap[e.key]; if (k) input[k] = true;
  if (e.key === 'c') cycleView();
  if (e.key === 'Escape' || e.key === 'p') pauseGame();
});
addEventListener('keyup', e => { const k = keyMap[e.key]; if (k) input[k] = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyQuality(); });

// arrastrar la pantalla = mover la cámara
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => { if (cam.drag) return; cam.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; cam.idle = 0; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('pointermove', e => {
  const d = cam.drag; if (!d || d.id !== e.pointerId) return;
  cam.yaw = clamp(cam.yaw - (e.clientX - d.x) * 0.008, -3.2, 3.2);
  cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * 0.005, -0.25, 1.0);
  d.x = e.clientX; d.y = e.clientY; cam.idle = 0;
});
['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, e => { if (cam.drag && cam.drag.id === e.pointerId) { cam.drag = null; cam.idle = 0; } }));

function showMsg(t, secs, color) {
  const m = $('msg'); m.textContent = t; m.style.color = color || '#fff';
  m.classList.remove('show'); void m.offsetWidth; m.classList.add('show'); st.msgT = secs;
}
function cycleView() { cfg.view = (cfg.view + 1) % 4; saveCfg(); showMsg(VIEWS[cfg.view], 0.9); refreshMenu(); sfx(() => audio.click()); }
function refreshMenu() {
  $('mQ').textContent = 'CALIDAD: ' + ['BAJA', 'MEDIA', 'ALTA'][cfg.q];
  $('mS').textContent = 'SONIDO: ' + (cfg.sfx ? 'SÍ' : 'NO');
  $('mM').textContent = 'MÚSICA: ' + (cfg.music ? 'SÍ' : 'NO');
  $('mCam').textContent = 'CÁMARA: ' + VIEWS[cfg.view];
  $('mPlay').textContent = st.paused ? 'CONTINUAR' : 'JUGAR';
  $('mNew').style.display = st.paused ? 'block' : 'none';
  $('mBest').textContent = best ? 'RÉCORD: ' + best : '';
}
function resetWorld() {
  Object.assign(st, { s: 0, l: 1.75, v: 0, p: 0, w: 0, drift: 0, steer: 0, leanZ: 0, score: 0, crashT: 0, flip: false, combo: 1, nitro: 0.5, nitroOn: false, state: 'menu', paused: false, wasWant: false, overShown: false });
  cars.forEach(c => spawn(c, 0, 80));
  $('over').style.display = 'none'; $('menu').style.display = 'flex';
  refreshMenu();
}
function startRun() {
  audio.init(); audio.prefs(cfg.sfx, cfg.music);
  st.state = 'run'; st.paused = false; st.v = 14; st.overShown = false;
  $('menu').style.display = 'none'; $('over').style.display = 'none';
  cam.yaw = 0; cam.pitch = 0;
}
function pauseGame() {
  if (st.state !== 'run') return;
  st.state = 'menu'; st.paused = true; refreshMenu(); $('menu').style.display = 'flex';
  input.left = input.right = input.gas = input.wheelie = input.nitro = false;
}
const click = fn => e => { try { audio.init(); audio.prefs(cfg.sfx, cfg.music); audio.click(); } catch (_) {} fn(e); };
$('mPlay').addEventListener('click', click(() => { if (st.paused) { st.state = 'run'; st.paused = false; $('menu').style.display = 'none'; } else { resetWorld(); startRun(); } }));
$('mNew').addEventListener('click', click(() => { resetWorld(); startRun(); }));
$('mQ').addEventListener('click', click(() => { cfg.q = (cfg.q + 1) % 3; saveCfg(); applyQuality(); refreshMenu(); }));
$('mS').addEventListener('click', click(() => { cfg.sfx = !cfg.sfx; saveCfg(); audio.prefs(cfg.sfx, cfg.music); refreshMenu(); }));
$('mM').addEventListener('click', click(() => { cfg.music = !cfg.music; saveCfg(); audio.prefs(cfg.sfx, cfg.music); refreshMenu(); }));
$('mCam').addEventListener('click', click(() => { cfg.view = (cfg.view + 1) % 4; saveCfg(); refreshMenu(); }));
$('mRetry').addEventListener('click', click(() => { resetWorld(); startRun(); }));
$('mHome').addEventListener('click', click(() => { resetWorld(); }));
$('bP').addEventListener('click', pauseGame);
$('bC').addEventListener('click', cycleView);

function crash(flip, text) {
  st.state = 'crash'; st.flip = flip; st.crashT = 0; st.side = Math.random() < 0.5 ? -1 : 1; st.crashMsg = text;
  if (st.score > best) { best = Math.floor(st.score); try { localStorage.setItem('mpbBest', best); } catch (e) {} }
  const bp = bikeRoot.position;
  burst(bp.x, 0.6, bp.z, 70, 9, 3, 1.4, 0.3, 1.1);
  burst(bp.x, 0.8, bp.z, 25, 6, 1.2, 1.2, 1.4, 0.9);
  st.flash = 0.9; $('flash').style.background = '#ff2a00'; cam.shake = 0.5;
  sfx(() => audio.crash());
}

/* ---------- efectos 2D de velocidad ---------- */
const fxc = $('fx'), fxx = fxc.getContext('2d');
fxc.width = 480; fxc.height = 270;
function drawFx(k, nitro) {
  fxx.clearRect(0, 0, 480, 270);
  if (k < 0.1) return;
  const n = Math.floor(12 + 40 * k);
  fxx.lineWidth = 1 + k * 1.6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, r0 = 60 + Math.random() * 90, len = 18 + Math.random() * 100 * k;
    fxx.strokeStyle = nitro ? `rgba(150,220,255,${0.12 + 0.35 * k})` : `rgba(255,255,255,${0.08 + 0.3 * k})`;
    fxx.beginPath();
    fxx.moveTo(240 + Math.cos(a) * r0 * 1.78, 135 + Math.sin(a) * r0);
    fxx.lineTo(240 + Math.cos(a) * (r0 + len) * 1.78, 135 + Math.sin(a) * (r0 + len));
    fxx.stroke();
  }
}

/* ---------- cámara ---------- */
function updateCamera(dt) {
  const menu = st.state === 'menu';
  const ry = st.ry, sy = Math.sin(ry), cy = Math.cos(ry), bp = bikeRoot.position;
  if (cam.drag === null) {
    cam.idle += dt;
    if (cam.idle > 1.6) { const k = 1 - Math.exp(-2.2 * dt); cam.yaw -= cam.yaw * k; cam.pitch -= cam.pitch * k; }
  }
  const spd = clamp(st.v / 85, 0, 1.4);
  const view = cfg.view;
  let fov = (view === 2 && !menu ? 78 : 62) + spd * 16 + (st.nitroOn ? 10 : 0);

  if (!menu && view === 2) { // primera persona (casco)
    bikeRoot.updateMatrixWorld(true);
    _a.set(0, 1.52, -0.98); pitchG.localToWorld(_a);
    const yw = clamp(cam.yaw, -2.0, 2.0);
    _b.set(-Math.sin(yw) * 30, 1.5 + cam.pitch * 18, -Math.cos(yw) * 30); pitchG.localToWorld(_b);
    camera.position.copy(_a); camera.up.set(0, 1, 0); camera.lookAt(_b);
  } else {
    let lx, ly, lz, ahead = 6;
    if (menu) {
      cam.orbit += dt * 0.4;
      lx = Math.sin(cam.orbit) * 5.3; lz = Math.cos(cam.orbit) * 5.3; ly = 1.5 + Math.sin(cam.orbit * 0.7) * 0.35; ahead = 0;
    } else {
      const back = view === 0 ? 6.2 + st.p : view === 1 ? 3.4 + st.p * 0.6 : -5.4;
      const h = view === 0 ? 2.4 + st.p * 0.8 : view === 1 ? 1.45 + st.p * 0.4 : 1.7;
      lx = back * Math.sin(cam.yaw); lz = back * Math.cos(cam.yaw); ly = h + cam.pitch * Math.abs(back) * 0.8;
      ahead = view === 1 ? 5 : view === 3 ? 0 : 6;
    }
    const k = 1 - Math.exp(-(menu ? 20 : 7) * dt);
    cam.l.x += (lx - cam.l.x) * k; cam.l.y += (ly - cam.l.y) * k; cam.l.z += (lz - cam.l.z) * k;
    camera.position.set(bp.x + cam.l.x * cy + cam.l.z * sy, cam.l.y, bp.z - cam.l.x * sy + cam.l.z * cy);
    const roll = -st.leanZ * 0.18;
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(bp.x - sy * ahead, (menu || ahead === 0 ? 0.9 : 1.0) + st.p * 0.5, bp.z - cy * ahead);
  }
  // temblor por velocidad / nitro / peligro
  const sh = spd * spd * 0.022 + (st.nitroOn ? 0.05 : 0) + Math.max(0, st.p - 0.9) * 0.1 + cam.shake;
  if (sh > 0.001) camera.position.add(_a.set(rnd(-1, 1) * sh, rnd(-1, 1) * sh, rnd(-1, 1) * sh));
  cam.shake = Math.max(0, cam.shake - dt * 1.5);
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-6 * dt));
  camera.updateProjectionMatrix();
}

/* ---------- bucle de juego ---------- */
let hudT = 0;
function update(rdt) {
  st.t += rdt;
  let dt = rdt;
  if (st.state === 'crash' && st.crashT < 1.0) dt *= 0.35; // cámara lenta al chocar
  const run = st.state === 'run';
  let nitroOn = false, gas = false;

  if (run) {
    nitroOn = input.nitro && st.nitro > 0.02 && st.v > 5;
    gas = input.gas || nitroOn;
    const vmax = nitroOn ? 118 : 85;
    if (gas) st.v += (nitroOn ? 46 : 26) * (1 - st.v / vmax) * dt; else st.v = Math.max(0, st.v - 5 * dt);
    st.nitro = clamp(st.nitro + (nitroOn ? -0.3 : 0.02) * dt, 0, 1);
    if (nitroOn && !st.nitroOn) { sfx(() => audio.nitro()); showMsg('¡NITRO!', 1, '#7df9ff'); }
    st.nitroOn = nitroOn;

    const target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    st.steer += (target - st.steer) * (1 - Math.exp(-10 * dt));
    st.l += st.steer * 6.5 * clamp(st.v / 15, 0.2, 1.3) * dt;
    if (Math.abs(st.l) > 6.6) {
      st.l = clamp(st.l, -6.6, 6.6); st.v *= (1 - 1.5 * dt);
      if (st.v > 15) {
        const bp = bikeRoot.position;
        for (let i = 0; i < 3; i++) emit(bp.x, 0.2, bp.z, rnd(-3, 3), rnd(1, 5), rnd(-3, 3), 0.45, 3, 1.5, 0.3);
        if (st.s - (st.scrapeAt || 0) > 4) { st.scrapeAt = st.s; sfx(() => audio.scrape()); }
      }
    }

    // caballito
    const want = input.wheelie && st.v > 8;
    if (want && !st.wasWant) { sfx(() => audio.wheelie()); const bp = bikeRoot.position; burst(bp.x, 0.1, bp.z, 12, 3, 0.5, 0.5, 0.55, 0.9); }
    st.wasWant = want;
    if (want) st.drift = Math.min(st.drift + (gas ? 0.15 : 0.1) * dt, 0.6); else st.drift = Math.max(0, st.drift - 1.5 * dt);
    const tgt = want ? 0.5 + (gas ? 0.25 : 0) + st.drift : 0;
    st.w += (14 * (tgt - st.p) - 3.5 * st.w) * dt;
    st.p += st.w * dt;
    if (st.p < 0) { st.p = 0; st.w = Math.max(0, st.w); }
    if (st.p > 1.25) crash(true, '¡TE VOLTEASTE!');
    if (st.p > 0.35) st.nitro = clamp(st.nitro + 0.06 * dt, 0, 1);
    if (st.p > 0.95 && st.t - st.heartT > 0.45) { st.heartT = st.t; sfx(() => audio.heart()); }

    st.s += st.v * dt;
    st.combo = 1 + (st.p > 0.35 ? 2 : 0) + (nitroOn ? 1 : 0);
    st.score += st.v * dt * 0.1 * st.combo;

    // retroceso del escape
    const rg = rpmOf(st.v);
    if (rg.gear > st.gear && gas && Math.random() < 0.5) st.popNow = true;
    st.gear = rg.gear;
    if (!gas && st.v > 35 && Math.random() < 0.03) st.popNow = true;
  } else if (st.state === 'crash') {
    st.crashT += rdt;
    st.v = Math.max(0, st.v - 40 * dt);
    st.s += st.v * dt;
    if (st.flip) st.p = Math.min(st.p + 5 * dt, 2.8); else st.p = Math.max(0, st.p - 2 * dt);
    st.combo = 1; st.nitroOn = false;
  }

  // tráfico
  if (st.state !== 'menu') {
    const slow = st.state === 'crash' ? Math.max(0, 1 - 2 * dt) : 1;
    for (const c of cars) {
      c.v = c.base;
      for (const o of cars) if (o !== c && o.l === c.l && o.s > c.s && o.s - c.s < (c.len + o.len) / 2 + 8) c.v = Math.min(c.v, o.v);
      if (slow < 1) c.base *= slow;
      c.s += c.v * dt;
      if (c.s < st.s - 40 || c.s > st.s + 650) spawn(c, st.s, 150);
    }
  }

  // colisiones y casi-choques
  if (run && st.state === 'run') {
    for (const c of cars) {
      const dl = Math.abs(c.l - st.l);
      const overlapS = (st.s + 1.7 > c.s - c.len / 2) && (st.s < c.s + c.len / 2);
      const hitW = 0.3 + c.wid / 2;
      if (overlapS && dl < hitW) { crash(false, '¡CHOCASTE!'); break; }
      if (!c.nm && overlapS && dl < hitW + 0.9 && st.v > 20) {
        c.nm = true; st.score += 25; st.nitro = clamp(st.nitro + 0.12, 0, 1);
        showMsg('¡CERCA! +25', 0.9, '#ffd400');
        st.flash = 0.35; $('flash').style.background = '#ffffff'; cam.shake = Math.max(cam.shake, 0.12);
        sfx(() => { audio.nearMiss(); if (Math.random() < 0.4) audio.honk(); });
      }
    }
  }

  // moto: posición y animación
  const d = cdx(st.s);
  st.ry = -Math.atan(d);
  const yawExtra = -st.steer * 0.15 * clamp(st.v / 30, 0, 1);
  const yr = st.v * (-cddx(st.s) / (1 + d * d));
  const leanTarget = st.state === 'crash' ? st.side * 1.45 : 0.4 * Math.atan(st.v * yr / 9.8) - st.steer * 0.45;
  st.leanZ += (leanTarget - st.leanZ) * (1 - Math.exp(-(st.state === 'crash' ? 6 : 8) * dt));
  roadPos(st.s, st.l, tmp);
  bikeRoot.position.set(tmp.x, 0, tmp.z);
  bikeRoot.rotation.y = st.ry + yawExtra;
  leanG.rotation.z = st.leanZ;
  pitchG.rotation.x = st.p;
  rW.rotation.x -= st.v * dt / 0.33; fW.rotation.x -= st.v * dt / 0.33;
  bikeRoot.updateMatrixWorld(true);

  // llamas del escape
  if (st.state === 'run' || st.popNow) {
    pitchG.localToWorld(_ex.copy(bike.exhaust));
    const fx = -Math.sin(st.ry), fz = -Math.cos(st.ry);
    if (nitroOn) {
      for (let i = 0; i < 3; i++) emit(_ex.x, _ex.y, _ex.z, fx * st.v * 0.2 - fx * 12 + rnd(-1, 1), rnd(-0.5, 1), fz * st.v * 0.2 - fz * 12 + rnd(-1, 1), 0.35, 0.6, 1.6, 3.2, 0);
    }
    if (st.popNow) {
      st.popNow = false;
      for (let i = 0; i < 7; i++) emit(_ex.x, _ex.y, _ex.z, fx * st.v * 0.2 - fx * 9 + rnd(-1.5, 1.5), rnd(0, 2), fz * st.v * 0.2 - fz * 9 + rnd(-1.5, 1.5), 0.3, 3.2, 1.3, 0.2, 0);
      sfx(() => audio.pop(0.4));
    }
  }
  updateParticles(dt);

  updateCamera(rdt);

  // mundo
  for (const c of cars) {
    roadPos(c.s, c.l, tmp);
    c.g.position.set(tmp.x, 0, tmp.z);
    c.g.rotation.y = -Math.atan(cdx(c.s));
  }
  updateRoad(st.s);
  treePool.update(st.s); postPool.update(st.s); lampPool.update(st.s);
  const bp = bikeRoot.position;
  roadPos(st.s, 0, tmp);
  ground.position.set(Math.round(tmp.x / 8) * 8, -0.3, Math.round(tmp.z / 8) * 8);
  sky.position.copy(camera.position);
  mount.position.set(camera.position.x, 0, camera.position.z);
  sun.target.position.set(bp.x, 0, bp.z);
  sun.position.set(bp.x + sunDir.x * 70, sunDir.y * 70, bp.z + sunDir.z * 70);
  sun.target.updateMatrixWorld();

  // efectos de pantalla (velocidad = adrenalina)
  const k = clamp((st.v - 25) / 70, 0, 1) + (st.nitroOn ? 0.35 : 0);
  if (speedPass) speedPass.uniforms.strength.value = (st.state === 'run' || st.state === 'crash') ? clamp(k * 0.22, 0, 0.3) : 0;
  $('vig').style.opacity = clamp(k * 0.9, 0, 1);
  if (st.state !== 'menu') drawFx(k, st.nitroOn); else drawFx(0, false);
  if (st.flash > 0) { st.flash = Math.max(0, st.flash - rdt * 2.5); $('flash').style.opacity = st.flash; }

  // música e motor
  audio.intensity = st.state === 'menu' ? 0.25 : st.state === 'crash' ? 0.1 : clamp(st.v / 80 + (st.nitroOn ? 0.3 : 0) + (st.p > 0.35 ? 0.15 : 0), 0.15, 1);
  sfx(() => audio.update({ v: st.v, thr: gas ? 1 : 0, nitro: st.nitroOn, mode: st.state }));

  // HUD
  hudT += rdt;
  if (st.msgT > 0) st.msgT -= rdt;
  if (hudT > 0.05) {
    hudT = 0;
    $('kmh').textContent = Math.round(st.v * 3.6);
    $('score').textContent = Math.floor(st.score);
    $('best').textContent = best ? 'Récord ' + best : '';
    $('dist').textContent = (st.s / 1000).toFixed(2) + ' km';
    $('combo').textContent = st.combo > 1 ? 'x' + st.combo + (st.p > 0.35 ? ' CABALLITO' : '') : '';
    const bal = $('bal');
    bal.style.width = Math.min(100, st.p / 1.25 * 100) + '%';
    bal.style.background = st.p > 1.0 ? '#ff3b30' : st.p > 0.8 ? '#ffb300' : '#3ddc5a';
    $('nit').style.width = Math.floor(st.nitro * 100) + '%';
    $('rpm').style.width = Math.floor(rpmOf(st.v).rpm * 100) + '%';
    if (st.state === 'crash' && st.crashT > 0.9 && !st.overShown) {
      st.overShown = true;
      $('ovt').textContent = st.crashMsg;
      $('ovs').textContent = Math.floor(st.score) + ' pts' + (best ? '  ·  récord ' + best : '');
      $('over').style.display = 'flex';
    }
  }
}

applyQuality();
resetWorld();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  update(dt);
  try {
    if (cfg.q >= 1 && composer) composer.render(); else renderer.render(scene, camera);
  } catch (e) { composer = null; showErr('render: ' + e.message); renderer.render(scene, camera); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

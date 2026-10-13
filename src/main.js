import * as THREE from 'three';

const $ = id => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- Carretera con curvas ---------- */
const cx = s => 20 * Math.sin(s * 0.012) + 10 * Math.sin(s * 0.03 + 1);
const cdx = s => 20 * 0.012 * Math.cos(s * 0.012) + 10 * 0.03 * Math.cos(s * 0.03 + 1);
const cddx = s => -20 * 0.012 * 0.012 * Math.sin(s * 0.012) - 10 * 0.03 * 0.03 * Math.sin(s * 0.03 + 1);
function roadPos(s, l, o) {
  const d = cdx(s), n = Math.sqrt(d * d + 1);
  o.x = cx(s) + l / n;
  o.z = -s + l * d / n;
  return o;
}
const tmp = { x: 0, z: 0 };

/* ---------- Escena ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const SKY = 0x8ec5ff;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 60, 420);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 520);
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6a3a, 0.95));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.0);
sun.position.set(30, 60, 20);
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ color: 0x3f7d3a }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.3;
scene.add(ground);

/* ---------- Cintas de asfalto (se reconstruyen cada 4 m) ---------- */
const SEG = 110, STEP = 4;
const ribbons = [];
function makeRibbon(a, b, y, color, dash) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 6 * 3), 3));
  const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -Math.max(1, y * 100), polygonOffsetUnits: -1 });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  scene.add(m);
  ribbons.push({ g, a, b, y, dash });
}
makeRibbon(-9.2, 9.2, 0.0, 0x8a8a80, false);
makeRibbon(-7.0, 7.0, 0.01, 0x34343a, false);
makeRibbon(-7.25, -6.9, 0.02, 0xffffff, false);
makeRibbon(6.9, 7.25, 0.02, 0xffffff, false);
makeRibbon(-3.6, -3.4, 0.02, 0xdddddd, true);
makeRibbon(-0.1, 0.1, 0.02, 0xffd400, true);
makeRibbon(3.4, 3.6, 0.02, 0xdddddd, true);
const P = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
let lastBase = -99999;
function updateRoad(s) {
  const base = Math.floor(s / STEP) - 8;
  if (base === lastBase) return;
  lastBase = base;
  for (const r of ribbons) {
    const p = r.g.attributes.position.array;
    let k = 0;
    for (let i = 0; i < SEG; i++) {
      const gi = base + i, s0 = gi * STEP, s1 = s0 + STEP;
      const y = (r.dash && (gi & 1)) ? -50 : r.y;
      roadPos(s0, r.a, P[0]); roadPos(s0, r.b, P[1]); roadPos(s1, r.a, P[2]); roadPos(s1, r.b, P[3]);
      const order = [0, 1, 2, 1, 3, 2];
      for (const o of order) { p[k++] = P[o].x; p[k++] = y; p[k++] = P[o].z; }
    }
    r.g.attributes.position.needsUpdate = true;
  }
}

/* ---------- Árboles ---------- */
const POOL = 64, TSTEP = 12;
const trees = [];
const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 5);
const leafGeo = new THREE.ConeGeometry(1.8, 5, 6);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3b21 });
const leafMat = new THREE.MeshLambertMaterial({ color: 0x1f6b2e });
for (let i = 0; i < POOL; i++) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(trunkGeo, trunkMat); t.position.y = 1.2; g.add(t);
  const l = new THREE.Mesh(leafGeo, leafMat); l.position.y = 4.5; g.add(l);
  g.userData.g = -99999;
  scene.add(g);
  trees.push(g);
}
function updateTrees(s) {
  const g0 = Math.floor((s - 60) / TSTEP);
  for (let g = g0; g < g0 + POOL; g++) {
    const t = trees[((g % POOL) + POOL) % POOL];
    if (t.userData.g !== g) {
      t.userData.g = g;
      const h = Math.abs(Math.sin(g * 12.9898) * 43758.5453) % 1;
      roadPos(g * TSTEP, ((g & 1) ? 1 : -1) * (12 + h * 16), tmp);
      t.position.set(tmp.x, 0, tmp.z);
      t.scale.setScalar(0.8 + h * 0.9);
    }
  }
}

/* ---------- Helpers de modelado ---------- */
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
function ball(r, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
function limb(a, b, r, mat, parent) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  parent.add(m); return m;
}

/* ---------- Kawasaki Ninja H2R (negra) + conductora ---------- */
const mBlack = new THREE.MeshPhongMaterial({ color: 0x0b0b0d, shininess: 90, specular: 0x666666 });
const mGloss = new THREE.MeshPhongMaterial({ color: 0x151518, shininess: 130, specular: 0xaaaaaa });
const mGreen = new THREE.MeshPhongMaterial({ color: 0x2bd14a, shininess: 60 });
const mSilver = new THREE.MeshPhongMaterial({ color: 0xb8bcc4, shininess: 120, specular: 0xffffff });
const mTire = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
const mSuit = new THREE.MeshPhongMaterial({ color: 0x0c0c0e, shininess: 40, specular: 0x333333 });
const mSuit2 = new THREE.MeshPhongMaterial({ color: 0x23232a, shininess: 30 });
const mVisor = new THREE.MeshPhongMaterial({ color: 0x0d1822, shininess: 160, specular: 0xaaccff });
const mLamp = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
const mTail = new THREE.MeshBasicMaterial({ color: 0xff2222 });

const bikeRoot = new THREE.Group();
const leanG = new THREE.Group();
const pitchG = new THREE.Group();
scene.add(bikeRoot); bikeRoot.add(leanG); leanG.add(pitchG);
pitchG.position.y = 0.33;

function makeWheel(z) {
  const w = new THREE.Group(); w.position.set(0, 0, z);
  const tg = new THREE.CylinderGeometry(0.33, 0.33, 0.2, 20); tg.rotateZ(Math.PI / 2);
  w.add(new THREE.Mesh(tg, mTire));
  const rg = new THREE.CylinderGeometry(0.21, 0.21, 0.22, 14); rg.rotateZ(Math.PI / 2);
  w.add(new THREE.Mesh(rg, mSilver));
  box(0.23, 0.06, 0.42, mBlack, 0, 0, 0, w);
  box(0.23, 0.42, 0.06, mBlack, 0, 0, 0, w);
  pitchG.add(w); return w;
}
const rW = makeWheel(0), fW = makeWheel(-1.45);

// chasis y carenado
box(0.12, 0.12, 0.7, mBlack, 0, 0.05, -0.3, pitchG);
box(0.32, 0.38, 0.6, mGloss, 0, 0.15, -0.75, pitchG);
box(0.42, 0.42, 0.9, mBlack, 0, 0.45, -0.85, pitchG);
const nose = box(0.36, 0.3, 0.5, mBlack, 0, 0.6, -1.28, pitchG); nose.rotation.x = 0.12;
box(0.36, 0.2, 0.55, mGloss, 0, 0.78, -0.7, pitchG);
box(0.3, 0.1, 0.55, mGloss, 0, 0.72, -0.12, pitchG);
const tail = box(0.26, 0.18, 0.6, mBlack, 0, 0.78, 0.3, pitchG); tail.rotation.x = -0.2;
box(0.2, 0.14, 0.2, mGreen, 0, 0.58, -1.02, pitchG);
box(0.02, 0.06, 0.6, mGreen, 0.22, 0.5, -0.85, pitchG);
box(0.02, 0.06, 0.6, mGreen, -0.22, 0.5, -0.85, pitchG);
box(0.8, 0.02, 0.16, mSilver, 0, 0.66, -1.38, pitchG);
const ws = box(0.28, 0.24, 0.02, mVisor, 0, 0.96, -1.1, pitchG); ws.rotation.x = 0.7;
ball(0.08, mLamp, 0, 0.62, -1.54, pitchG);
box(0.18, 0.05, 0.04, mTail, 0, 0.82, 0.62, pitchG);
limb([0.2, 0.08, -0.4], [0.24, 0.3, 0.55], 0.07, mSilver, pitchG);
for (const sd of [-1, 1]) {
  limb([sd * 0.1, 0, -1.45], [sd * 0.1, 0.85, -1.2], 0.035, mSilver, pitchG);
}
limb([-0.32, 0.95, -1.1], [0.32, 0.95, -1.1], 0.025, mBlack, pitchG);

// conductora: mono deportivo negro, casco, coleta
limb([0, 0.82, -0.05], [0, 0.82, -0.12], 0.17, mSuit, pitchG);
limb([0, 0.86, -0.1], [0, 1.28, -0.78], 0.15, mSuit, pitchG);
box(0.3, 0.1, 0.3, mSuit2, 0, 1.16, -0.52, pitchG).rotation.x = 0.9;
for (const sd of [-1, 1]) {
  limb([sd * 0.14, 0.8, -0.05], [sd * 0.27, 0.7, -0.62], 0.1, mSuit, pitchG);
  limb([sd * 0.27, 0.7, -0.62], [sd * 0.25, 0.2, -0.2], 0.075, mSuit, pitchG);
  box(0.1, 0.09, 0.26, mGloss, sd * 0.25, 0.17, -0.28, pitchG);
  limb([sd * 0.2, 1.27, -0.76], [sd * 0.33, 1.12, -0.96], 0.065, mSuit, pitchG);
  limb([sd * 0.33, 1.12, -0.96], [sd * 0.3, 0.97, -1.1], 0.055, mSuit, pitchG);
  ball(0.065, mGloss, sd * 0.3, 0.97, -1.1, pitchG);
}
ball(0.175, mGloss, 0, 1.45, -0.9, pitchG);
ball(0.125, mVisor, 0, 1.44, -1.02, pitchG);
limb([0, 1.42, -0.74], [0, 1.28, -0.4], 0.04, mBlack, pitchG);

/* ---------- Tráfico ---------- */
const LANES = [-5.25, -1.75, 1.75, 5.25];
const carColors = [0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x27ae60, 0x8e44ad, 0xe67e22, 0x7f8c8d];
const mGlass = new THREE.MeshLambertMaterial({ color: 0x18222c });
const mWheelC = new THREE.MeshLambertMaterial({ color: 0x111111 });
const mRed = new THREE.MeshBasicMaterial({ color: 0xcc1111 });
function makeCar() {
  const g = new THREE.Group();
  const truck = Math.random() < 0.2;
  const col = truck ? 0xdddddd : carColors[(Math.random() * carColors.length) | 0];
  const mb = new THREE.MeshLambertMaterial({ color: col });
  let len, wid;
  if (truck) {
    len = 7.5; wid = 2.4;
    box(2.4, 2.8, 5.2, mb, 0, 2.0, 1.1, g);
    box(2.3, 2.0, 2.0, new THREE.MeshLambertMaterial({ color: carColors[(Math.random() * carColors.length) | 0] }), 0, 1.5, -2.7, g);
    box(2.0, 0.7, 0.05, mGlass, 0, 2.0, -3.72, g);
    box(2.0, 0.2, 0.05, mRed, 0, 0.8, 3.73, g);
  } else {
    len = 4.4; wid = 1.9;
    box(1.9, 0.7, 4.3, mb, 0, 0.65, 0, g);
    box(1.6, 0.6, 2.1, mGlass, 0, 1.25, 0.2, g);
    box(0.5, 0.14, 0.05, mRed, 0.6, 0.8, 2.16, g);
    box(0.5, 0.14, 0.05, mRed, -0.6, 0.8, 2.16, g);
  }
  const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.25, 10); wg.rotateZ(Math.PI / 2);
  const zs = truck ? [-2.7, 2.6, 3.4] : [-1.4, 1.4];
  for (const z of zs) for (const sd of [-1, 1]) {
    const w = new THREE.Mesh(wg, mWheelC); w.position.set(sd * (wid / 2 - 0.1), 0.38, z); g.add(w);
  }
  scene.add(g);
  return { g, s: 0, l: 0, v: 20, base: 20, len, wid, nm: false };
}
const cars = [];
for (let i = 0; i < 18; i++) cars.push(makeCar());
function spawn(c, ps, minAhead) {
  for (let t = 0; t < 10; t++) {
    c.l = LANES[(Math.random() * 4) | 0];
    c.s = ps + minAhead + Math.random() * 450;
    if (!cars.some(o => o !== c && o.l === c.l && Math.abs(o.s - c.s) < 30)) break;
  }
  c.base = rnd(14, 34); c.v = c.base; c.nm = false;
}

/* ---------- Estado e input ---------- */
const input = { left: false, right: false, gas: false, wheelie: false };
const st = { s: 0, l: 1.75, v: 0, p: 0, w: 0, drift: 0, steer: 0, leanZ: 0, state: 'ready', score: 0, crashT: 0, flip: false, side: 1, combo: 0, msgT: 0 };
let best = 0;
try { best = +localStorage.getItem('h2rBest') || 0; } catch (e) {}

function bindBtn(id, key) {
  const el = $(id);
  const on = e => { e.preventDefault(); input[key] = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch (_) {} };
  const off = e => { e.preventDefault(); input[key] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, off));
}
bindBtn('bL', 'left'); bindBtn('bR', 'right'); bindBtn('bG', 'gas'); bindBtn('bW', 'wheelie');
const keyMap = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'gas', w: 'gas', ' ': 'wheelie', x: 'wheelie' };
addEventListener('keydown', e => { const k = keyMap[e.key]; if (k) input[k] = true; });
addEventListener('keyup', e => { const k = keyMap[e.key]; if (k) input[k] = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

function showMsg(t, secs) { $('msg').textContent = t; $('msg').classList.add('show'); st.msgT = secs; }

function reset() {
  st.s = 0; st.l = 1.75; st.v = 0; st.p = 0; st.w = 0; st.drift = 0; st.steer = 0; st.leanZ = 0;
  st.score = 0; st.crashT = 0; st.flip = false; st.combo = 0; st.state = 'ready';
  cars.forEach(c => spawn(c, 0, 70));
  $('ovt').textContent = 'Toca para arrancar';
  $('ov').style.display = 'flex';
}
function start() { st.state = 'run'; st.v = 14; $('ov').style.display = 'none'; }
function crash(flip, text) {
  st.state = 'crash'; st.flip = flip; st.crashT = 0; st.side = Math.random() < 0.5 ? -1 : 1;
  if (st.score > best) { best = Math.floor(st.score); try { localStorage.setItem('h2rBest', best); } catch (e) {} }
  st.crashMsg = text;
}
$('ov').addEventListener('pointerdown', () => {
  if (st.state === 'ready') start();
  else if (st.state === 'crash' && st.crashT > 1.0) reset();
});
reset();

/* ---------- Bucle ---------- */
const camPos = new THREE.Vector3(0, 3, 6);
const look = new THREE.Vector3();
let hudT = 0;

function update(dt) {
  const run = st.state === 'run';
  const live = st.state !== 'ready';

  if (run) {
    const vmax = 85;
    if (input.gas) st.v += 26 * (1 - st.v / vmax) * dt; else st.v = Math.max(0, st.v - 5 * dt);

    const target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    st.steer += (target - st.steer) * (1 - Math.exp(-10 * dt));
    st.l += st.steer * 6.5 * clamp(st.v / 15, 0.2, 1.3) * dt;
    if (Math.abs(st.l) > 6.6) { st.l = clamp(st.l, -6.6, 6.6); st.v *= (1 - 1.5 * dt); }

    // caballito
    const want = input.wheelie && st.v > 8;
    if (want) st.drift = Math.min(st.drift + (input.gas ? 0.15 : 0.1) * dt, 0.6);
    else st.drift = Math.max(0, st.drift - 1.5 * dt);
    const tgt = want ? 0.5 + (input.gas ? 0.25 : 0) + st.drift : 0;
    st.w += (14 * (tgt - st.p) - 3.5 * st.w) * dt;
    st.p += st.w * dt;
    if (st.p < 0) { st.p = 0; st.w = Math.max(0, st.w); }
    if (st.p > 1.25) crash(true, '¡TE VOLTEASTE!');

    st.s += st.v * dt;
    const mult = st.p > 0.35 ? 3 : 1;
    st.score += st.v * dt * 0.1 * mult;
    st.combo = mult;
  } else if (st.state === 'crash') {
    st.crashT += dt;
    st.v = Math.max(0, st.v - 40 * dt);
    st.s += st.v * dt;
    if (st.flip) st.p = Math.min(st.p + 5 * dt, 2.8); else st.p = Math.max(0, st.p - 2 * dt);
    st.combo = 0;
  }

  // tráfico
  if (live) {
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
  if (run) {
    for (const c of cars) {
      const dl = Math.abs(c.l - st.l);
      const overlapS = (st.s + 1.7 > c.s - c.len / 2) && (st.s < c.s + c.len / 2);
      const hitW = 0.3 + c.wid / 2;
      if (overlapS && dl < hitW) { crash(false, '¡CHOCASTE!'); break; }
      if (!c.nm && overlapS && dl < hitW + 0.9 && st.v > 20) { c.nm = true; st.score += 25; showMsg('¡CERCA! +25', 0.8); }
    }
  }

  // visual: moto
  const d = cdx(st.s);
  const yawExtra = -st.steer * 0.15 * clamp(st.v / 30, 0, 1);
  const yr = st.v * (-cddx(st.s) / (1 + d * d));
  const leanTarget = st.state === 'crash' ? st.side * 1.45 : 0.4 * Math.atan(st.v * yr / 9.8) - st.steer * 0.45;
  st.leanZ += (leanTarget - st.leanZ) * (1 - Math.exp(-(st.state === 'crash' ? 6 : 8) * dt));
  const ry = -Math.atan(d);
  roadPos(st.s, st.l, tmp);
  bikeRoot.position.set(tmp.x, 0, tmp.z);
  bikeRoot.rotation.y = ry + yawExtra;
  leanG.rotation.z = st.leanZ;
  pitchG.rotation.x = st.p;
  rW.rotation.x -= st.v * dt / 0.33;
  fW.rotation.x -= st.v * dt / 0.33;

  // cámara
  const sy = Math.sin(ry), cy = Math.cos(ry);
  const back = 6.2 + st.p * 1.2, h = 2.4 + st.p * 0.9;
  const desired = new THREE.Vector3(tmp.x + sy * back, h, tmp.z + cy * back);
  camPos.lerp(desired, 1 - Math.exp(-8 * dt));
  camera.position.copy(camPos);
  look.set(tmp.x - sy * 6, 1.0 + st.p * 0.6, tmp.z - cy * 6);
  camera.lookAt(look);
  const fov = 62 + (st.v / 85) * 18;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = fov; camera.updateProjectionMatrix(); }

  // mundo
  for (const c of cars) {
    roadPos(c.s, c.l, tmp);
    c.g.position.set(tmp.x, 0, tmp.z);
    c.g.rotation.y = -Math.atan(cdx(c.s));
  }
  updateRoad(st.s);
  updateTrees(st.s);
  roadPos(st.s, 0, tmp);
  ground.position.x = tmp.x; ground.position.z = tmp.z;

  // HUD
  hudT += dt;
  if (st.msgT > 0) { st.msgT -= dt; if (st.msgT <= 0) $('msg').classList.remove('show'); }
  if (hudT > 0.05) {
    hudT = 0;
    $('kmh').textContent = Math.round(st.v * 3.6);
    $('score').textContent = Math.floor(st.score);
    $('best').textContent = best ? 'Récord ' + best : '';
    $('combo').textContent = st.combo > 1 ? 'CABALLITO x' + st.combo : '';
    const b = $('bal').firstElementChild;
    b.style.width = Math.min(100, st.p / 1.25 * 100) + '%';
    b.style.background = st.p > 1.0 ? '#ff3b30' : st.p > 0.8 ? '#ffb300' : '#3ddc5a';
    if (st.state === 'crash' && st.crashT > 0.8 && $('ov').style.display === 'none') {
      $('ovt').textContent = st.crashMsg + '  ·  ' + Math.floor(st.score) + ' pts  ·  toca para reintentar';
      $('ov').style.display = 'flex';
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

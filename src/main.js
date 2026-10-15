import * as THREE from 'three';
import { createWorld, clamp, rnd, cdx, cddx, roadPos } from './world.js';
import * as M from './models.js';
import { BIKES, MAPS, FLAMES, PAL, loadSave, persist, stats } from './data.js';
import { GameAudio, rpmOf } from './audio.js';
import { createGarage } from './ui.js';

const $ = id => document.getElementById(id);

/* ---------- errores visibles en pantalla (para depurar) ---------- */
function showErr(m) { const e = $('err'); if (!e) return; e.style.display = 'block'; e.textContent = String(m).slice(0, 300); }
addEventListener('error', e => showErr((e.message || 'error') + ' ' + ((e.filename || '').split('/').pop()) + ':' + e.lineno));
addEventListener('unhandledrejection', e => showErr((e.reason && e.reason.message) || e.reason));

const save = loadSave();
const world = createWorld(save, showErr);
const { renderer, camera, bikeRoot, LANES } = world;
const tmp = { x: 0, z: 0 };
const audio = new GameAudio();
audio.mode = save.amode || 0;
audio.prefs(save.sfx, save.mv);
const sfx = fn => { try { fn(); } catch (e) {} };

/* ---------- moto personalizada ---------- */
let bike = null, S = stats(save);
function rebuildBike() {
  if (bike) { bikeRoot.remove(bike.leanG); M.disposeObj(bike.leanG); }
  bike = M.buildBike(save.bike, save.look);
  bikeRoot.add(bike.leanG);
  world.setNeon(save.look.neon ? PAL.neon[save.look.neon] : 0);
  $('mBike').textContent = BIKES[save.bike].name;
  S = stats(save);
}

/* ---------- tráfico ---------- */
const carCols = [0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x27ae60, 0x8e44ad, 0xe67e22, 0x7f8c8d];
const pick = () => carCols[(Math.random() * carCols.length) | 0];
const CAR_TYPES = ['sedan', 'sedan', 'suv', 'suv', 'van', 'truck', 'police'];
function makeCar() {
  const type = CAR_TYPES[(Math.random() * CAR_TYPES.length) | 0];
  const m = M.buildCar(type, pick(), pick());
  world.scene.add(m.g);
  return { g: m.g, len: m.len, wid: m.wid, type, blink: m.blink, s: 0, l: 0, v: 20, base: 20, nm: false };
}
const cars = [];
for (let i = 0; i < 20; i++) cars.push(makeCar());
function spawn(c, ps, minAhead) {
  for (let t = 0; t < 10; t++) {
    c.l = LANES[(Math.random() * 4) | 0];
    c.s = ps + minAhead + Math.random() * 450;
    if (!cars.some(o => o !== c && o.l === c.l && Math.abs(o.s - c.s) < 30)) break;
  }
  c.base = rnd(14, 34) * (c.type === 'truck' ? 0.75 : 1); c.v = c.base; c.nm = false;
}

/* ---------- estado e interfaz ---------- */
const input = { left: false, right: false, gas: false, wheelie: false, nitro: false };
const st = { s: 0, l: 1.75, v: 0, p: 0, pPrev: 0, w: 0, drift: 0, steer: 0, leanZ: 0, state: 'menu', paused: false, score: 0, crashT: 0, flip: false, side: 1, combo: 1, nitro: 0.5, nitroOn: false, ry: 0, gear: 0, t: 0, wasWant: false, flash: 0, crashMsg: '', overShown: false, runCoins: 0, banked: false, chain: 0, chainT: 0, wT: 0, wMs: 0, slow: 0, earned: 0, heartT: 0 };
const cam = { yaw: 0, pitch: 0, idle: 0, drag: null, orbit: 0, shake: 0, l: new THREE.Vector3(0, 3, 6) };
const VIEWS = ['PERSECUCIÓN', 'CERCA', 'CASCO', 'FRONTAL'];
const MV = ['NO', 'BAJA', 'MEDIA', 'ALTA'];
const leds = [];
for (let i = 0; i < 12; i++) { const e = document.createElement('i'); $('leds').appendChild(e); leds.push(e); }
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
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); world.applyQuality(); });

// desbloquear el audio con cualquier toque
let audioOn = false;
const unlock = () => { try { audio.init(); if (!audioOn) { audioOn = true; audio.prefs(save.sfx, save.mv); } } catch (e) {} };
['pointerup', 'touchend', 'click', 'keydown'].forEach(t => addEventListener(t, unlock));
document.addEventListener('visibilitychange', () => { if (!document.hidden) sfx(() => audio.init()); });

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

function showMsg(t, color) {
  const m = $('msg'); m.textContent = t; m.style.color = color || '#fff';
  m.classList.remove('show'); void m.offsetWidth; m.classList.add('show');
}
function cycleView() { save.view = (save.view + 1) % 4; persist(save); showMsg(VIEWS[save.view]); refreshMenu(); sfx(() => audio.click()); }
const setRow = (id, v) => { try { $(id).querySelector('b').textContent = v; } catch (e) {} };
const MAPN = MAPS.length; // save.map === MAPN  ->  mapa aleatorio
const mapName = () => (save.map === MAPN ? 'ALEATORIO' : MAPS[save.map].name);
let lastRand = -1;
function applyMapSel() {
  let i = save.map;
  if (i === MAPN) { do { i = (Math.random() * MAPN) | 0; } while (i === lastRand && MAPN > 1); lastRand = i; }
  world.applyMap(i);
}
function refreshMenu() {
  setRow('mMap', mapName());
  setRow('mQ', ['BAJA', 'MEDIA', 'ALTA'][save.q]);
  setRow('mS', save.sfx ? 'SÍ' : 'NO');
  setRow('mM', MV[save.mv]);
  setRow('mCam', VIEWS[save.view]);
  setRow('mTest', audio.be ? audio.be.name : 'AUTO');
  $('mPlay').textContent = st.paused ? 'CONTINUAR' : 'JUGAR';
  $('mNew').style.display = st.paused ? 'block' : 'none';
  $('mGarage').style.display = st.paused ? 'none' : 'block';
  $('mMapName').textContent = mapName();
  $('mBank').textContent = save.money;
  $('mRec').textContent = save.best;
}
function bank() {
  if (st.banked) return;
  st.banked = true;
  st.earned = st.runCoins * 10 + Math.floor(st.score / 25);
  save.money += st.earned;
  if (st.score > save.best) save.best = Math.floor(st.score);
  persist(save);
}
function resetWorld() {
  if (st.paused) bank();
  Object.assign(st, { s: 0, l: 1.75, v: 0, p: 0, pPrev: 0, w: 0, drift: 0, steer: 0, leanZ: 0, score: 0, crashT: 0, flip: false, combo: 1, nitro: 0.5, nitroOn: false, state: 'menu', paused: false, wasWant: false, overShown: false, runCoins: 0, banked: false, chain: 0, chainT: 0, wT: 0, wMs: 0, slow: 0, earned: 0 });
  cars.forEach(c => spawn(c, 0, 80));
  world.coinsReset();
  $('over').style.display = 'none'; $('garage').style.display = 'none'; $('menu').style.display = 'flex';
  refreshMenu();
}
function startRun() {
  unlock();
  if (save.map === MAPN) applyMapSel();
  S = stats(save);
  st.state = 'run'; st.paused = false; st.v = 14; st.overShown = false;
  $('menu').style.display = 'none'; $('over').style.display = 'none';
  cam.yaw = 0; cam.pitch = 0;
}
function pauseGame() {
  if (st.state !== 'run') return;
  st.state = 'menu'; st.paused = true; refreshMenu(); $('menu').style.display = 'flex';
  input.left = input.right = input.gas = input.wheelie = input.nitro = false;
}
const click = fn => e => { unlock(); sfx(() => audio.click()); fn(e); };
const garage = createGarage({ save, rebuild: () => { rebuildBike(); }, applyMap: () => { applyMapSel(); refreshMenu(); }, sfx, audio });
$('mPlay').addEventListener('click', click(() => { if (st.paused) { st.state = 'run'; st.paused = false; $('menu').style.display = 'none'; } else { resetWorld(); startRun(); } }));
$('mNew').addEventListener('click', click(() => { resetWorld(); startRun(); }));
$('mGarage').addEventListener('click', click(() => { st.state = 'garage'; $('menu').style.display = 'none'; $('garage').style.display = 'flex'; garage.open(); }));
$('gDone').addEventListener('click', click(() => { st.state = 'menu'; $('garage').style.display = 'none'; $('menu').style.display = 'flex'; S = stats(save); refreshMenu(); }));
$('mMap').addEventListener('click', click(() => { save.map = (save.map + 1) % (MAPN + 1); persist(save); applyMapSel(); refreshMenu(); }));
$('mQ').addEventListener('click', click(() => { save.q = (save.q + 1) % 3; persist(save); world.applyQuality(); refreshMenu(); }));
$('mS').addEventListener('click', click(() => { save.sfx = !save.sfx; persist(save); audio.prefs(save.sfx, save.mv); refreshMenu(); }));
$('mM').addEventListener('click', click(() => { save.mv = (save.mv + 1) % 4; persist(save); audio.prefs(save.sfx, save.mv); refreshMenu(); }));
$('mCam').addEventListener('click', click(() => { save.view = (save.view + 1) % 4; persist(save); refreshMenu(); }));
$('mTest').addEventListener('click', click(() => { audio.toggleBackend(); save.amode = audio.mode; persist(save); refreshMenu(); }));
$('mRetry').addEventListener('click', click(() => { resetWorld(); startRun(); }));
$('mHome').addEventListener('click', click(() => { resetWorld(); }));
$('bP').addEventListener('click', pauseGame);
$('bC').addEventListener('click', cycleView);

function crash(flip, text) {
  st.state = 'crash'; st.flip = flip; st.crashT = 0; st.side = Math.random() < 0.5 ? -1 : 1; st.crashMsg = text;
  bank();
  const bp = bikeRoot.position;
  world.burst(bp.x, 0.6, bp.z, 70, 9, 3, 1.4, 0.3, 1.1);
  world.burst(bp.x, 0.8, bp.z, 25, 6, 1.2, 1.2, 1.4, 0.9);
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
  const showroom = st.state === 'menu' || st.state === 'garage';
  const ry = st.ry, sy = Math.sin(ry), cy = Math.cos(ry), bp = bikeRoot.position;
  if (cam.drag === null) {
    cam.idle += dt;
    if (cam.idle > 1.6) { const k = 1 - Math.exp(-2.2 * dt); cam.yaw -= cam.yaw * k; cam.pitch -= cam.pitch * k; }
  }
  const spd = clamp(st.v / 85, 0, 1.4);
  const view = save.view;
  const fov = (view === 2 && !showroom ? 78 : 62) + spd * 16 + (st.nitroOn ? 12 : 0);

  if (!showroom && view === 2) { // primera persona (casco)
    bikeRoot.updateMatrixWorld(true);
    _a.set(0, 1.52, -0.98); bike.pitchG.localToWorld(_a);
    const yw = clamp(cam.yaw, -2.0, 2.0);
    _b.set(-Math.sin(yw) * 30, 1.5 + cam.pitch * 18, -Math.cos(yw) * 30); bike.pitchG.localToWorld(_b);
    camera.position.copy(_a); camera.up.set(0, 1, 0); camera.lookAt(_b);
  } else {
    let lx, ly, lz, ahead = 6, sx = 0, sz = 0;
    if (showroom) {
      cam.orbit += dt * 0.4;
      const R = st.state === 'garage' ? 4.4 : 5.3;
      lx = Math.sin(cam.orbit) * R; lz = Math.cos(cam.orbit) * R; ly = 1.5 + Math.sin(cam.orbit * 0.7) * 0.3; ahead = 0;
      if (st.state === 'garage') { sx = Math.cos(cam.orbit) * 1.9; sz = -Math.sin(cam.orbit) * 1.9; } // la moto queda a la izquierda
    } else {
      const back = view === 0 ? 6.2 + st.p : view === 1 ? 3.4 + st.p * 0.6 : -5.4;
      const h = view === 0 ? 2.4 + st.p * 0.8 : view === 1 ? 1.45 + st.p * 0.4 : 1.7;
      lx = back * Math.sin(cam.yaw); lz = back * Math.cos(cam.yaw); ly = h + cam.pitch * Math.abs(back) * 0.8;
      ahead = view === 1 ? 5 : view === 3 ? 0 : 6;
    }
    const k = 1 - Math.exp(-(showroom ? 20 : 7) * dt);
    cam.l.x += (lx - cam.l.x) * k; cam.l.y += (ly - cam.l.y) * k; cam.l.z += (lz - cam.l.z) * k;
    camera.position.set(bp.x + cam.l.x * cy + cam.l.z * sy, cam.l.y, bp.z - cam.l.x * sy + cam.l.z * cy);
    const roll = -st.leanZ * 0.18;
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(bp.x - sy * ahead + sx * cy + sz * sy, (showroom || ahead === 0 ? 0.9 : 1.0) + st.p * 0.5, bp.z - cy * ahead - sx * sy + sz * cy);
  }
  const sh = spd * spd * 0.022 + (st.nitroOn ? 0.05 : 0) + Math.max(0, st.p - 0.9) * 0.1 + cam.shake;
  if (sh > 0.001) camera.position.add(_a.set(rnd(-1, 1) * sh, rnd(-1, 1) * sh, rnd(-1, 1) * sh));
  cam.shake = Math.max(0, cam.shake - dt * 1.5);
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-6 * dt));
  camera.updateProjectionMatrix();
}

/* ---------- bucle de juego ---------- */
const W_MILES = [[3, 100, '¡CABALLITO LARGO! +100'], [6, 300, '¡CABALLITO ÉPICO! +300'], [10, 800, '¡LEYENDA DEL CABALLITO! +800']];
let hudT = 0, helpT = 0;
function update(rdt) {
  st.t += rdt;
  let dt = rdt;
  if (st.state === 'crash' && st.crashT < 1.0) dt *= 0.35; // cámara lenta al chocar
  if (st.slow > 0) { st.slow -= rdt; dt *= 0.5; }          // "tiempo bala" en casi-choques
  const idle = st.state === 'menu' || st.state === 'garage';
  const run = st.state === 'run';
  let nitroOn = false, gas = false;
  const flameC = FLAMES[save.look.flame] || FLAMES[0];

  if (run) {
    nitroOn = input.nitro && st.nitro > 0.02 && st.v > 5;
    gas = input.gas || nitroOn;
    const vmax = S.vmax * (nitroOn ? 1.39 : 1), acc = S.acc * (nitroOn ? 1.77 : 1);
    if (gas) st.v += acc * (1 - st.v / vmax) * dt; else st.v = Math.max(0, st.v - 5 * dt);
    st.nitro = clamp(st.nitro + (nitroOn ? -0.3 / S.nit : 0.02 * S.nit) * dt, 0, 1);
    if (nitroOn && !st.nitroOn) { sfx(() => audio.nitro()); showMsg('¡NITRO!', '#7df9ff'); cam.shake = Math.max(cam.shake, 0.15); camera.fov += 14; }
    st.nitroOn = nitroOn;

    const target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    st.steer += (target - st.steer) * (1 - Math.exp(-10 * dt));
    st.l += st.steer * 6.5 * S.hand * clamp(st.v / 15, 0.2, 1.3) * dt;
    if (Math.abs(st.l) > 6.6) {
      st.l = clamp(st.l, -6.6, 6.6); st.v *= (1 - 1.5 * dt);
      if (st.v > 15) {
        const bp = bikeRoot.position;
        for (let i = 0; i < 3; i++) world.emit(bp.x, 0.2, bp.z, rnd(-3, 3), rnd(1, 5), rnd(-3, 3), 0.45, 3, 1.5, 0.3);
        if (st.s - (st.scrapeAt || 0) > 4) { st.scrapeAt = st.s; sfx(() => audio.scrape()); }
      }
    }

    // caballito
    const want = input.wheelie && st.v > 8;
    if (want && !st.wasWant) { sfx(() => audio.wheelie()); const bp = bikeRoot.position; world.burst(bp.x, 0.1, bp.z, 12, 3, 0.5, 0.5, 0.55, 0.9); }
    st.wasWant = want;
    if (want) st.drift = Math.min(st.drift + (gas ? 0.15 : 0.1) / S.bal * dt, 0.6); else st.drift = Math.max(0, st.drift - 1.5 * dt);
    const tgt = want ? 0.5 + (gas ? 0.25 : 0) + st.drift : 0;
    st.w += (14 * (tgt - st.p) - 3.5 * st.w) * dt;
    st.p += st.w * dt;
    if (st.p < 0) { st.p = 0; st.w = Math.max(0, st.w); }
    if (st.p > 1.25) crash(true, '¡TE VOLTEASTE!');
    if (st.p > 0.35) {
      st.nitro = clamp(st.nitro + 0.06 * dt, 0, 1);
      st.wT += dt;
      for (const m of W_MILES) if (st.wT > m[0] && st.wMs < m[0]) { st.wMs = m[0]; st.score += m[1]; showMsg(m[2], '#ffd400'); }
    } else { st.wT = 0; st.wMs = 0; }
    if (st.pPrev > 0.4 && st.p < 0.06 && st.state === 'run') { // aterrizaje del caballito
      cam.shake = Math.max(cam.shake, 0.18);
      bike.pitchG.localToWorld(_ex.copy(bike.frontWheel));
      world.burst(_ex.x, 0.1, _ex.z, 14, 4, 2.5, 1.4, 0.4, 0.5);
    }
    if (st.p > 0.95 && st.t - st.heartT > 0.45) { st.heartT = st.t; st.flash = Math.max(st.flash, 0.25); $('flash').style.background = '#ff2a00'; sfx(() => audio.heart()); }

    st.s += st.v * dt;
    st.chainT = Math.max(0, st.chainT - rdt);
    st.combo = 1 + (st.p > 0.35 ? 2 : 0) + (nitroOn ? 1 : 0);
    st.score += st.v * dt * 0.1 * st.combo;

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
  if (!idle) {
    const slow = st.state === 'crash' ? Math.max(0, 1 - 2 * dt) : 1;
    for (const c of cars) {
      c.v = c.base;
      for (const o of cars) if (o !== c && o.l === c.l && o.s > c.s && o.s - c.s < (c.len + o.len) / 2 + 8) c.v = Math.min(c.v, o.v);
      if (slow < 1) c.base *= slow;
      c.s += c.v * dt;
      if (c.s < st.s - 40 || c.s > st.s + 650) spawn(c, st.s, 150);
    }
    world.spawnCoins(st.s);
  }

  // colisiones, casi-choques y monedas
  if (run && st.state === 'run') {
    for (const c of cars) {
      const dl = Math.abs(c.l - st.l);
      const overlapS = (st.s + 1.7 > c.s - c.len / 2) && (st.s < c.s + c.len / 2);
      const hitW = 0.3 + c.wid / 2;
      if (overlapS && dl < hitW) { crash(false, '¡CHOCASTE!'); break; }
      if (!c.nm && overlapS && dl < hitW + 0.9 && st.v > 20) {
        c.nm = true;
        st.chain = st.chainT > 0 ? st.chain + 1 : 1; st.chainT = 3;
        const bonus = 25 * st.chain;
        st.score += bonus; st.nitro = clamp(st.nitro + 0.12, 0, 1); st.slow = 0.15;
        showMsg('¡CERCA! x' + st.chain + '  +' + bonus, '#ffd400');
        st.flash = 0.35; $('flash').style.background = '#ffffff'; cam.shake = Math.max(cam.shake, 0.12);
        sfx(() => { audio.nearMiss(); if (Math.random() < 0.4) audio.honk(); });
      }
    }
    for (const c of world.coins) {
      if (c.on && c.s > st.s - 0.6 && c.s < st.s + 2.3 && Math.abs(c.l - st.l) < 1.2) {
        c.on = false; st.runCoins++;
        const bp = bikeRoot.position; world.burst(bp.x, 1, bp.z, 6, 3, 3, 2.4, 0.4, 0.4);
        sfx(() => audio.coin());
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
  bike.leanG.rotation.z = st.leanZ;
  bike.pitchG.rotation.x = st.p;
  bike.rW.rotation.x -= st.v * dt / bike.rW.userData.R; bike.fW.rotation.x -= st.v * dt / bike.fW.userData.R;
  const sv = clamp(st.v / 85, 0, 1.3);
  bike.riderG.position.x = st.steer * 0.1; bike.riderG.rotation.z = -st.steer * 0.12;
  bike.headG.rotation.y = -st.steer * 0.35 + Math.sin(st.t * 0.7) * 0.03; bike.headG.rotation.x = -st.p * 0.45;
  bike.joints.forEach((j, i) => { j.rotation.x = -(0.1 + 0.4 * sv) + Math.sin(st.t * 14 + i * 1.3) * 0.1 * (0.3 + sv); j.rotation.z = Math.sin(st.t * 9 + i) * 0.08 * sv; });
  world.glow.material.opacity = 0.55 + 0.25 * Math.sin(st.t * 6) + (st.nitroOn ? 0.3 : 0);
  bikeRoot.updateMatrixWorld(true);

  // efectos de partículas
  if (st.state === 'run' || st.popNow) {
    const fx = -Math.sin(st.ry), fz = -Math.cos(st.ry);
    bike.pitchG.localToWorld(_ex.copy(bike.exhaust));
    if (nitroOn) for (let i = 0; i < 3; i++) world.emit(_ex.x, _ex.y, _ex.z, fx * st.v * 0.2 - fx * 12 + rnd(-1, 1), rnd(-0.5, 1), fz * st.v * 0.2 - fz * 12 + rnd(-1, 1), 0.35, flameC[0], flameC[1], flameC[2], 0);
    if (st.popNow) {
      st.popNow = false;
      for (let i = 0; i < 7; i++) world.emit(_ex.x, _ex.y, _ex.z, fx * st.v * 0.2 - fx * 9 + rnd(-1.5, 1.5), rnd(0, 2), fz * st.v * 0.2 - fz * 9 + rnd(-1.5, 1.5), 0.3, flameC[0], flameC[1], flameC[2], 0);
      sfx(() => audio.pop(0.4));
    }
    if (run && st.v > 55) for (const tp of bike.trails) { // estelas en las manetas
      bike.pitchG.localToWorld(_ex.copy(tp));
      world.emit(_ex.x, _ex.y, _ex.z, 0, 0, 0, 0.35, 0.3, 0.8, 1.4, 0);
    }
    if (run && Math.abs(st.leanZ) > 0.32 && st.v > 35) { // chispas de las rodilleras
      bike.pitchG.localToWorld(_ex.copy(bike.knees[st.leanZ > 0 ? 0 : 1]));
      for (let i = 0; i < 2; i++) world.emit(_ex.x, 0.05, _ex.z, rnd(-2, 2), rnd(1, 4), rnd(-2, 2), 0.4, 3, 1.5, 0.3);
    }
    if (run && st.p > 0.35) { // humo de la rueda trasera
      const bp = bikeRoot.position;
      world.emit(bp.x, 0.1, bp.z, fx * st.v * 0.1 + rnd(-1, 1), rnd(0.5, 2), fz * st.v * 0.1 + rnd(-1, 1), 0.6, 0.5, 0.5, 0.55, 0);
    }
  }
  world.updateParticles(dt);
  updateCamera(rdt);

  // mundo
  for (const c of cars) {
    roadPos(c.s, c.l, tmp);
    c.g.position.set(tmp.x, 0, tmp.z);
    c.g.rotation.y = -Math.atan(cdx(c.s));
    if (c.blink && c.s - st.s < 250) { const ph = Math.floor(st.t * 6) % 2; c.blink.r.color.setRGB(ph ? 5 : 0.3, 0.2, 0.2); c.blink.b.color.setRGB(0.3, 0.8, ph ? 0.3 : 5); }
  }
  world.updateRoad(st.s); world.updateProps(st.s); world.follow(bikeRoot.position);
  if (!idle) world.updateCoins(st.s, st.t); else world.updateCoins(-9999, st.t);
  world.updateWeather(rdt, -Math.sin(st.ry) * st.v, -Math.cos(st.ry) * st.v);
  const lt = world.updateLightning(rdt, () => { st.flash = Math.max(st.flash, 0.6); $('flash').style.background = '#cfe0ff'; sfx(() => { audio.crack(); audio.thunder(rnd(0.3, 1.2)); }); });

  // efectos de pantalla (velocidad = adrenalina)
  const k = clamp((st.v - 25) / 70, 0, 1) + (st.nitroOn ? 0.35 : 0);
  const sp = world.speedPass;
  if (sp) sp.uniforms.strength.value = (st.state === 'run' || st.state === 'crash') ? clamp(k * 0.22 + (st.slow > 0 ? 0.08 : 0), 0, 0.32) : 0;
  $('vig').style.opacity = clamp(k * 0.9, 0, 1);
  if (!idle) drawFx(k, st.nitroOn); else drawFx(0, false);
  if (st.flash > 0 || lt > 0) { st.flash = Math.max(0, st.flash - rdt * 2.5); $('flash').style.opacity = Math.max(st.flash, lt * 0.5); }

  // música y motor
  audio.intensity = idle ? 0.35 : st.state === 'crash' ? 0.15 : clamp(0.3 + st.v / 80 + (st.nitroOn ? 0.3 : 0) + (st.p > 0.35 ? 0.15 : 0), 0.3, 1);
  sfx(() => audio.update({ v: st.v, thr: gas ? 1 : 0, nitro: st.nitroOn, mode: st.state }));
  st.pPrev = st.p;

  // HUD
  hudT += rdt; helpT += rdt;
  if (helpT > 0.5) { helpT = 0; if (idle) $('mHelp').textContent = 'audio: ' + audio.state + (audio.err ? ' ! ' + audio.err : '') + ' · arrastra para mover la cámara'; }
  if (hudT > 0.05) {
    hudT = 0;
    const rp = rpmOf(st.v), on = st.state === 'menu' || st.state === 'garage' ? 0 : Math.round(rp.rpm * 12);
    $('spd').textContent = Math.round(st.v * 3.6);
    $('gear').textContent = st.v < 1 ? 'N' : rp.gear + 1;
    leds.forEach((e, i) => { e.className = i < on ? (i < 7 ? 'g' : i < 10 ? 'y' : 'r') : ''; });
    $('score').textContent = Math.floor(st.score);
    $('coins').textContent = st.runCoins ? '🪙 ' + st.runCoins : '';
    $('best').textContent = save.best ? 'REC ' + save.best : '';
    $('dist').textContent = (st.s / 1000).toFixed(2) + ' KM';
    $('combo').textContent = st.combo > 1 ? 'x' + st.combo + (st.p > 0.35 ? ' CABALLITO' : '') : '';
    const bal = $('bal');
    bal.style.width = Math.min(100, st.p / 1.25 * 100) + '%';
    bal.style.background = st.p > 1.0 ? '#ff3b30' : st.p > 0.8 ? '#ffb300' : '#3ddc5a';
    $('nit').style.width = Math.floor(st.nitro * 100) + '%';
    if (st.state === 'crash' && st.crashT > 0.9 && !st.overShown) {
      st.overShown = true;
      $('ovt').textContent = st.crashMsg;
      $('ovs').textContent = Math.floor(st.score) + ' pts' + (save.best ? '  ·  récord ' + save.best : '');
      $('ovc').textContent = '+' + st.earned + ' 🪙  (' + st.runCoins + ' monedas)';
      $('over').style.display = 'flex';
    }
  }
}

world.applyQuality();
applyMapSel();
rebuildBike();
resetWorld();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  update(dt);
  world.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

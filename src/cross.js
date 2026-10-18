import * as THREE from 'three';
import * as M from './models.js';
import { roadPos, cdx, ixAt } from './road.js';

// Cruces con semáforo: la calle transversal, el paso de peatones y carros que cruzan cuando tu semáforo está en rojo.
const COLS = [0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x27ae60, 0xe67e22, 0x7f8c8d, 0x8e44ad];
const TYPES = ['sedan', 'suv', 'sedan', 'van'];
const CYCLE = 16;
export function createCross(scene) {
  const tmp = { x: 0, z: 0 }, _v = new THREE.Vector3();
  const roadMat = new THREE.MeshLambertMaterial({ map: M.crossRoadTex() });
  const zebraMat = new THREE.MeshBasicMaterial({ map: M.zebraTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2b2d31 });
  const LIT = { r: [4, 0.25, 0.2], y: [4, 3, 0.2], g: [0.3, 4, 0.5] }, DIM = [0.1, 0.1, 0.1];

  function makeLight(g, x, z) {
    const mats = {};
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), postMat); pole.position.set(x, 2.6, z); g.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.3), postMat); head.position.set(x, 5.1, z); g.add(head);
    [['r', 5.45], ['y', 5.1], ['g', 4.75]].forEach(([k, y]) => {
      if (!mats[k]) mats[k] = new THREE.MeshBasicMaterial({ toneMapped: false });
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mats[k]); l.position.set(x, y, z + 0.17); g.add(l);
    });
    return mats;
  }
  function makeX() {
    const g = new THREE.Group();
    const road = new THREE.Mesh(new THREE.PlaneGeometry(150, 12), roadMat); road.rotation.x = -Math.PI / 2; road.position.y = 0.012; g.add(road);
    for (const sd of [-1, 1]) { const z = new THREE.Mesh(new THREE.PlaneGeometry(14, 3), zebraMat); z.rotation.x = -Math.PI / 2; z.position.set(0, 0.03, sd * 8.6); g.add(z); }
    const lights = [makeLight(g, 8.3, 11), makeLight(g, -8.3, 11)];
    const cars = [];
    for (let i = 0; i < 4; i++) {
      const m = M.buildCar(TYPES[i], COLS[(Math.random() * COLS.length) | 0], COLS[(Math.random() * COLS.length) | 0]);
      m.g.visible = false; g.add(m.g);
      cars.push({ g: m.g, len: m.len, wid: m.wid, dir: i % 2 ? 1 : -1, u: 0, v: (i % 2 ? 1 : -1) * 2.3 + (i > 1 ? 0.0 : 0), speed: 15, active: false, delay: Math.random() * 1.5, nm: false });
    }
    scene.add(g);
    return { g, lights, cars, k: -9999, sI: 0, off: 0 };
  }
  const xs = [makeX(), makeX()];
  const setLamp = (mat, on, c) => { const v = on ? c : DIM; mat.color.setRGB(v[0], v[1], v[2]); };
  function setup(x, k) {
    x.k = k; x.sI = ixAt(k); x.off = ((Math.abs(Math.sin(k * 7.7) * 1000) % 1) * CYCLE);
    roadPos(x.sI, 0, tmp); x.g.position.set(tmp.x, 0, tmp.z); x.g.rotation.y = -Math.atan(cdx(x.sI));
    x.cars.forEach(c => { c.active = false; c.g.visible = false; c.delay = Math.random() * 1.5; c.nm = false; });
  }
  function update(s, t, dt) {
    const k0 = Math.floor((s - 700) / 1700);
    for (const k of [k0, k0 + 1]) {
      const x = xs[((k % 2) + 2) % 2];
      if (x.k !== k) setup(x, k);
      const ph = (t + x.off) % CYCLE, red = ph >= 11, yel = ph >= 9 && ph < 11;
      for (const L of x.lights) { setLamp(L.r, red, LIT.r); setLamp(L.y, yel, LIT.y); setLamp(L.g, !red && !yel, LIT.g); }
      const spawnWin = ph >= 11 && ph < 14.4;
      for (const c of x.cars) {
        if (!c.active) {
          c.delay -= dt;
          if (spawnWin && c.delay <= 0) { c.active = true; c.u = -c.dir * 78; c.speed = 14 + Math.random() * 8; c.g.visible = true; c.nm = false; c.g.rotation.y = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
        } else {
          c.u += c.dir * c.speed * dt;
          if (Math.abs(c.u) > 80) { c.active = false; c.g.visible = false; c.delay = 0.5 + Math.random() * 1.5; }
        }
        c.g.position.set(c.u, 0, c.v);
      }
      x.g.updateMatrixWorld(true);
    }
  }
  // 0 = nada, 1 = casi, 2 = choque
  function check(bp) {
    let res = { hit: false, near: false };
    for (const x of xs) {
      if (Math.abs(x.sI) > 1e6) continue;
      _v.set(bp.x, 0, bp.z); x.g.worldToLocal(_v);
      if (Math.abs(_v.z) > 14 || Math.abs(_v.x) > 20) continue;
      for (const c of x.cars) {
        if (!c.active) continue;
        const dx = Math.abs(_v.x - c.u), dz = Math.abs(_v.z - c.v);
        if (dx < c.len / 2 + 0.4 && dz < c.wid / 2 + 0.35) res.hit = true;
        else if (!c.nm && dx < c.len / 2 + 1.6 && dz < c.wid / 2 + 1.2) { c.nm = true; res.near = true; }
      }
    }
    return res;
  }
  function reset() { xs.forEach(x => { x.k = -9999; x.cars.forEach(c => { c.active = false; c.g.visible = false; }); }); }
  return { update, check, reset };
}

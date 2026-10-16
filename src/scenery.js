import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as G from './geo.js';
import { roadPos, cdx } from './road.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const hash = g => Math.abs(Math.sin(g * 12.9898) * 43758.5453) % 1;
const LAT = [8.8, 13, 18, 25, 35, 50, 70, 95, 130, 170], TS = 8, TSEG = 64, Y0 = -0.08;

export function createScenery(scene, camera, gt) {
  let map = null;
  const tmp = { x: 0, z: 0 };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  const setM = (mesh, k, x, y, z, yaw, sx, sy, sz) => { _p.set(x, y, z); _q.setFromAxisAngle(Y, yaw); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); mesh.setMatrixAt(k, _m); };
  const hideI = (mesh, k) => { _m.makeScale(0, 0, 0); mesh.setMatrixAt(k, _m); };
  function terrainH(s, l) {
    if (!map) return 0;
    const a = Math.abs(l), A = map.hills || 0;
    let h = 0;
    if (A > 0) {
      const w = sm(16, 52, a) * (1 - sm(115, 172, a));
      h = A * w * (0.5 + 0.25 * Math.sin(s * 0.013 + l * 0.021) + 0.15 * Math.sin(s * 0.031 - l * 0.017 + 2) + 0.1 * Math.sin(s * 0.007 + l * 0.05 + 4)) * 1.4;
    }
    if (map.shore && l < 0) h -= 3.4 * sm(24, 42, a);
    if (map.lava) h -= 1.4 * Math.exp(-Math.pow((a - 16.5) / 3, 2));
    return h;
  }
  const terrainY = (s, l) => Y0 + terrainH(s, l);

  /* ---------- terreno con colinas a ambos lados ---------- */
  const NJ = LAT.length, NI = TSEG + 1;
  function makeSide() {
    const pos = new Float32Array(NI * NJ * 3), col = new Float32Array(NI * NJ * 3), uv = new Float32Array(NI * NJ * 2), nor = new Float32Array(NI * NJ * 3), idx = [];
    for (let i = 0; i < TSEG; i++) for (let j = 0; j < NJ - 1; j++) { const a = i * NJ + j, b = a + 1, c = a + NJ, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; scene.add(mesh);
    return { pos, col, uv, nor, g, mat, mesh };
  }
  const sides = [makeSide(), makeSide()];
  let lastTB = -1e9, tc0 = [0.4, 0.5, 0.25], tc1 = [0.5, 0.5, 0.4];
  function updateTerrain(s, force) {
    if (!map) return;
    const base = Math.floor(s / TS) - 6;
    if (base === lastTB && !force) return;
    lastTB = base;
    const A = Math.max(1, map.hills || 1);
    sides.forEach((sd, si) => {
      const sg = si ? 1 : -1, { pos, col, uv, nor } = sd;
      for (let i = 0; i < NI; i++) {
        const sv = (base + i) * TS;
        for (let j = 0; j < NJ; j++) {
          const l = LAT[j] * sg, k = i * NJ + j;
          roadPos(sv, l, tmp);
          const h = terrainH(sv, l), t = clamp(h / (A * 0.9), 0, 1), n = 0.88 + 0.24 * hash(sv * 0.37 + l * 0.11);
          pos[k * 3] = tmp.x; pos[k * 3 + 1] = Y0 + h; pos[k * 3 + 2] = tmp.z;
          uv[k * 2] = tmp.x * 0.1; uv[k * 2 + 1] = tmp.z * 0.1;
          col[k * 3] = (tc0[0] + (tc1[0] - tc0[0]) * t) * n; col[k * 3 + 1] = (tc0[1] + (tc1[1] - tc0[1]) * t) * n; col[k * 3 + 2] = (tc0[2] + (tc1[2] - tc0[2]) * t) * n;
        }
      }
      for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(NI - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NJ - 1, j + 1);
        const ia = (i0 * NJ + j) * 3, ib = (i1 * NJ + j) * 3, ja = (i * NJ + j0) * 3, jb = (i * NJ + j1) * 3;
        const ax = pos[ib] - pos[ia], ay = pos[ib + 1] - pos[ia + 1], az = pos[ib + 2] - pos[ia + 2], bx = pos[jb] - pos[ja], by = pos[jb + 1] - pos[ja + 1], bz = pos[jb + 2] - pos[ja + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const L = Math.hypot(nx, ny, nz) || 1; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const k = (i * NJ + j) * 3; nor[k] = nx / L; nor[k + 1] = ny / L; nor[k + 2] = nz / L;
      }
      sd.g.attributes.position.needsUpdate = sd.g.attributes.color.needsUpdate = sd.g.attributes.uv.needsUpdate = sd.g.attributes.normal.needsUpdate = true;
    });
    updateLava(base);
  }
  // lava en los surcos del volcán
  const lavaMat = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }); lavaMat.color.setRGB(3.2, 0.9, 0.15);
  const lava = [-1, 1].map(() => { const pos = new Float32Array(NI * 2 * 3), idx = []; for (let i = 0; i < TSEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); const m = new THREE.Mesh(g, lavaMat); m.frustumCulled = false; m.visible = false; scene.add(m); return { pos, g, m }; });
  function updateLava(base) {
    lava.forEach((lv, si) => {
      lv.m.visible = !!(map && map.lava);
      if (!lv.m.visible) return;
      const sg = si ? 1 : -1;
      for (let i = 0; i < NI; i++) { const sv = (base + i) * TS; for (let e = 0; e < 2; e++) { roadPos(sv, sg * (e ? 19 : 14), tmp); const k = (i * 2 + e) * 3; lv.pos[k] = tmp.x; lv.pos[k + 1] = -1.15; lv.pos[k + 2] = tmp.z; } }
      lv.g.attributes.position.needsUpdate = true;
    });
  }

  /* ---------- recicladores de objetos instanciados ---------- */
  function makePool(meshes, count, step, behind, apply) {
    const ids = new Int32Array(count).fill(-99999);
    return {
      reset() { ids.fill(-99999); },
      update(s) {
        const g0 = Math.floor((s - behind) / step); let dirty = false;
        for (let g = g0; g < g0 + count; g++) { const k = ((g % count) + count) % count; if (ids[k] !== g) { ids[k] = g; apply(k, g); dirty = true; } }
        if (dirty) for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      }
    };
  }
  function inst(geo, mat, count) {
    const m = new THREE.InstancedMesh(geo, mat, count); m.frustumCulled = false; scene.add(m);
    for (let i = 0; i < count; i++) hideI(m, i);
    return m;
  }

  // hierba (matas cruzadas con transparencia) y arbustos
  const tuftGeo = (() => { const a = new THREE.PlaneGeometry(1.3, 0.9); a.translate(0, 0.45, 0); const b = a.clone(); b.rotateY(Math.PI / 2); return mergeGeometries([a, b]); })();
  const tuftMat = new THREE.MeshLambertMaterial({ map: G.tuftTex(), alphaTest: 0.45, side: THREE.DoubleSide });
  const tufts = inst(tuftGeo, tuftMat, 420);
  const tuftPool = makePool([tufts], 420, 1.5, 40, (k, g) => {
    if (!map || !map.grass) { hideI(tufts, k); return; }
    const h1 = hash(g), h2 = hash(g + 5), l = ((g & 1) ? 1 : -1) * (9.6 + h1 * h1 * 16), s = g * 1.5 + h2, sc = 0.7 + h2;
    roadPos(s, l, tmp); setM(tufts, k, tmp.x, terrainY(s, l), tmp.z, h1 * 6.28, sc, sc * (0.7 + h1 * 0.7), sc);
  });
  const bushGeo = new THREE.IcosahedronGeometry(0.9, 0); bushGeo.translate(0, 0.45, 0);
  const bushMat = new THREE.MeshLambertMaterial({ color: 0x3c6a2c });
  const bushes = inst(bushGeo, bushMat, 80);
  const bushPool = makePool([bushes], 80, 10, 30, (k, g) => {
    if (!map || !map.grass) { hideI(bushes, k); return; }
    const h1 = hash(g * 1.7), h2 = hash(g + 11), l = ((g & 1) ? -1 : 1) * (10.5 + h1 * 22), s = g * 10 + h2 * 8, sc = 0.8 + h2 * 1.2;
    roadPos(s, l, tmp); setM(bushes, k, tmp.x, terrainY(s, l) - 0.1, tmp.z, h1 * 6.28, sc * 1.3, sc * 0.8, sc * 1.2);
  });

  // casas de pueblo
  const wallGeo = new THREE.BoxGeometry(1, 1, 1); wallGeo.translate(0, 0.5, 0);
  const roofGeo = new THREE.ConeGeometry(1, 1, 4); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 0.5, 0);
  const houseMat = new THREE.MeshLambertMaterial({ map: G.houseTex(), emissive: 0xffffff, emissiveMap: G.houseWinTex(), emissiveIntensity: 0 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xb5532f });
  const walls = inst(wallGeo, houseMat, 64), roofs = inst(roofGeo, roofMat, 64);
  const WCOL = [0xffffff, 0xf4e6c8, 0xe9d3a8, 0xe7b8a0, 0xcfd8e0, 0xf0d9d0];
  const housePool = makePool([walls, roofs], 64, 20, 30, (k, g) => {
    const h1 = hash(g * 2.3), h2 = hash(g + 3), h3 = hash(g + 7);
    if (!map || h1 > (map.village || 0)) { hideI(walls, k); hideI(roofs, k); return; }
    const l = ((g & 1) ? 1 : -1) * (28 + h2 * 85), s = g * 20 + h3 * 10, yaw = -Math.atan(cdx(s)) + (h3 - 0.5) * 0.6;
    const w = 6 + h2 * 5, d = 7 + h3 * 6, hh = 3.4 + h1 * 3, rh = 2.2 + h2 * 1.5;
    roadPos(s, l, tmp); const y = terrainY(s, l);
    setM(walls, k, tmp.x, y, tmp.z, yaw, w, hh, d); setM(roofs, k, tmp.x, y + hh, tmp.z, yaw, w * 0.78, rh, d * 0.78);
    walls.setColorAt(k, _c.setHex(WCOL[(g * 7 & 7) % 6]));
  });

  // palmeras y rocas de volcán (conjuntos de props intercambiables)
  const palmTrunkGeo = (() => { const g = new THREE.CylinderGeometry(0.12, 0.22, 7, 7); g.translate(0, 3.5, 0); g.rotateZ(0.1); return g; })();
  const palmLeafGeo = (() => { const parts = []; for (let k = 0; k < 8; k++) { const b = new THREE.BoxGeometry(0.5, 0.03, 3.4); b.translate(0, 0, 1.7); b.rotateX(0.55); b.rotateY(k * Math.PI / 4); b.translate(0.35, 6.9, 0); parts.push(b); } return mergeGeometries(parts); })();
  const palmT = inst(palmTrunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a46 }), 70), palmL = inst(palmLeafGeo, new THREE.MeshLambertMaterial({ color: 0x2f7a2a, side: THREE.DoubleSide }), 70);
  const palmPool = makePool([palmT, palmL], 70, 14, 40, (k, g) => {
    const h1 = hash(g), l = ((g & 1) ? 1 : -1) * (11 + h1 * 16), s = g * 14, sc = 0.9 + h1 * 0.6;
    roadPos(s, l, tmp); const y = terrainY(s, l); setM(palmT, k, tmp.x, y, tmp.z, h1 * 6.28, sc, sc, sc); setM(palmL, k, tmp.x, y, tmp.z, h1 * 6.28, sc, sc, sc);
  });
  const spikeGeo = new THREE.ConeGeometry(0.9, 5, 5); spikeGeo.translate(0, 2.5, 0);
  const boulderGeo = new THREE.DodecahedronGeometry(1, 0); boulderGeo.translate(0, 0.5, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x1c1411, emissive: 0x2a0d02 });
  const spikes = inst(spikeGeo, rockMat, 90), boulders = inst(boulderGeo, rockMat, 90);
  const volPool = makePool([spikes, boulders], 90, 12, 40, (k, g) => {
    const h1 = hash(g), h2 = hash(g + 4), side = (g & 1) ? 1 : -1, s = g * 12, l1 = side * (22 + h1 * 50), l2 = -side * (10 + h2 * 22), sc = 0.8 + h1 * 1.6;
    roadPos(s, l1, tmp); setM(spikes, k, tmp.x, terrainY(s, l1) - 0.3, tmp.z, h1 * 6.28, sc, sc * (0.8 + h2), sc);
    roadPos(s + 5, l2, tmp); setM(boulders, k, tmp.x, terrainY(s + 5, l2) - 0.2, tmp.z, h2 * 6.28, 0.8 + h2 * 1.8, 0.6 + h1, 0.8 + h1 * 1.6);
  });
  const sets = { palm: { pool: palmPool, meshes: [palmT, palmL] }, volcano: { pool: volPool, meshes: [spikes, boulders] } };
  const pools = [tuftPool, bushPool, housePool, palmPool, volPool];

  /* ---------- ciudad lejana (siluetas) ---------- */
  const skyline = new THREE.Group(); scene.add(skyline);
  const skyMats = [G.skylineTex(false), G.skylineTex(true)].map(t => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  [0.4, 1.3, 2.2, 3.4, 4.5, 5.5].forEach(a => { const p = new THREE.Mesh(new THREE.PlaneGeometry(320, 70), skyMats[0]); p.position.set(Math.cos(a) * 300, 33, Math.sin(a) * 300); p.lookAt(0, 33, 0); skyline.add(p); });
  skyline.visible = false;

  /* ---------- carteles y pórticos ---------- */
  const adMats = [0, 1, 2, 3].map(i => new THREE.MeshBasicMaterial({ map: G.adTex(i) }));
  const postMat = new THREE.MeshLambertMaterial({ color: 0x33353a });
  const boards = [];
  for (let i = 0; i < 8; i++) {
    const gp = new THREE.Group();
    for (const sx of [-2.2, 2.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.2, 6), postMat); p.position.set(sx, 2.6, -0.1); gp.add(p); }
    const b = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), adMats[0]); b.position.set(0, 5.2, 0); gp.add(b); gp.userData.board = b; gp.userData.g = -99999;
    scene.add(gp); boards.push(gp);
  }
  const gantries = [];
  for (let i = 0; i < 2; i++) {
    const gp = new THREE.Group(), gb = G.gantryBoard();
    for (const sx of [-9.4, 9.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.2, 0.5), postMat); p.position.set(sx, 3.6, 0); gp.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(19.4, 0.5, 0.5), postMat); beam.position.set(0, 7.1, 0); gp.add(beam);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: gb.tex })); sg.position.set(0, 6.0, 0.3); gp.add(sg);
    gp.userData = { g: -99999, set: gb.set }; scene.add(gp); gantries.push(gp);
  }
  function updateSigns(s) {
    const g0 = Math.floor((s - 60) / 160);
    for (let g = g0; g < g0 + 8; g++) {
      const gp = boards[((g % 8) + 8) % 8];
      if (gp.userData.g === g) continue;
      gp.userData.g = g;
      const side = (g & 1) ? 1 : -1, sv = g * 160 + 40, l = side * (11 + hash(g) * 3);
      roadPos(sv, l, tmp); gp.position.set(tmp.x, terrainY(sv, l), tmp.z); gp.rotation.y = -Math.atan(cdx(sv)) - side * 0.25;
      gp.userData.board.material = adMats[((g % 4) + 4) % 4];
    }
    const q0 = Math.floor((s - 40) / 420);
    for (let g = q0; g < q0 + 2; g++) {
      const gp = gantries[((g % 2) + 2) % 2];
      if (gp.userData.g === g) continue;
      gp.userData.g = g;
      const sv = g * 420 + 200; roadPos(sv, 0, tmp); gp.position.set(tmp.x, 0, tmp.z); gp.rotation.y = -Math.atan(cdx(sv));
      gp.userData.set((sv / 1000).toFixed(1));
    }
  }

  /* ---------- garaje (cuarto con luces, herramientas y plataforma) ---------- */
  let garage = null, glights = [];
  function buildGarage() {
    const g = new THREE.Group();
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const ct = G.concreteTex(); ct.repeat.set(4, 4);
    const wt = G.garageWallTex(); wt.repeat.set(5, 1);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 16), std({ map: ct, roughness: 0.32, metalness: 0.1, envMapIntensity: 0.9 })); floor.position.y = -0.01; g.add(floor);
    const wallM = std({ map: wt, roughness: 0.6, metalness: 0.4 });
    for (const [w, h, d, x, z] of [[14, 4.2, 0.2, 0, -8], [14, 4.2, 0.2, 0, 8], [0.2, 4.2, 16, -7, 0], [0.2, 4.2, 16, 7, 0]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM); m.position.set(x, 2.1, z); g.add(m); }
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 16), std({ color: 0x1a1b1f, roughness: 0.9 })); ceil.position.y = 4.2; g.add(ceil);
    const lampM = new THREE.MeshBasicMaterial({ toneMapped: false }); lampM.color.setRGB(4.5, 4.2, 3.6);
    for (const z of [-4, 0, 4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.3), lampM); l.position.set(0, 4.06, z); g.add(l); }
    // plataforma giratoria
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.05, 40), std({ color: 0x15161a, roughness: 0.4, metalness: 0.6 })); plat.position.y = 0.03; g.add(plat);
    const ringM = new THREE.MeshBasicMaterial({ toneMapped: false }); ringM.color.setRGB(3.2, 2.4, 0.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.03, 8, 56), ringM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    // props
    const box = (w, h, d, c, x, y, z, r = 0.6, m = 0.2) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std({ color: c, roughness: r, metalness: m })); b.position.set(x, y, z); g.add(b); return b; };
    box(1.3, 1.1, 0.6, 0xc0281c, -6.3, 0.55, -3.2); for (let i = 0; i < 4; i++) box(1.1, 0.02, 0.02, 0x222222, -6.3, 0.2 + i * 0.25, -2.9);
    box(2.6, 0.08, 0.9, 0x6a5a48, 5.6, 0.95, 3); for (const sx of [-1.2, 1.2]) box(0.08, 0.95, 0.8, 0x333333, 5.6 + sx, 0.47, 3);
    box(0.5, 0.35, 0.4, 0xd9a22a, 5.4, 1.15, 3); box(0.4, 0.4, 0.3, 0x2a6ac0, 6.0, 1.18, 3);
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 18), std({ color: 0x0c0c0c, roughness: 0.9 })); t.position.set(-5.8, 0.12 + i * 0.25, 4.5); g.add(t); }
    for (const [x, c] of [[5.8, 0xc83020], [6.4, 0x2060c0]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 14), std({ color: c, roughness: 0.5, metalness: 0.5 })); b.position.set(x, 0.47, -5); g.add(b); }
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), adMats[i]); p.position.set(-4 + i * 4, 2.3, -7.88); g.add(p); }
    const neon = new THREE.MeshBasicMaterial({ map: G.decalTex('GARAJE BRICEÑO', '#ffd400', 1024, 160, 'italic 900 110px Impact,"Arial Black",sans-serif'), transparent: true, toneMapped: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), neon); sign.position.set(0, 3.4, -7.87); g.add(sign);
    glights = [[0, 3.7, -1, 0xfff0d8, 55], [-3.5, 3.3, 2.5, 0xbcd4ff, 26], [3.5, 3.3, 2.5, 0xffe0b0, 26]].map(([x, y, z, c, i]) => { const l = new THREE.PointLight(c, i, 16, 2); l.position.set(x, y, z); g.add(l); return l; });
    g.visible = false; scene.add(g); return g;
  }
  function setGarage(on, pos, yaw) {
    if (on && !garage) garage = buildGarage();
    if (!garage) return;
    garage.visible = on;
    if (on) { garage.position.set(pos.x, 0, pos.z); garage.rotation.y = yaw; }
  }

  const tcache = {};
  const terrTex = k => tcache[k] || (tcache[k] = (() => { const t = gt[k].clone(); t.repeat.set(1, 1); t.needsUpdate = true; return t; })());
  /* ---------- aplicar un mapa ---------- */
  function apply(m) {
    map = m;
    const col = h => { _c.setHex(h); return [_c.r, _c.g, _c.b]; };
    tc0 = col(m.tcol ? m.tcol[0] : 0x6f8a3a); tc1 = col(m.tcol ? m.tcol[1] : 0x8a8a6a);
    for (const sd of sides) { sd.mat.map = terrTex(m.ground.tex); sd.mat.needsUpdate = true; }
    tuftMat.color.setHex(m.grassCol || 0xffffff); bushMat.color.setHex(m.bushCol || 0x3c6a2c);
    houseMat.emissiveIntensity = m.stars ? 1.3 : 0; roofMat.color.setHex(m.roof || 0xb5532f);
    skyline.visible = !!m.skyline;
    skyline.children.forEach(p => { p.material = skyMats[m.stars ? 1 : 0]; });
    skyMats[0].color.setHex(m.skylineTint || 0xffffff); skyMats[1].color.setHex(0xffffff);
    pools.forEach(p => p.reset());
    lastTB = -1e9;
  }
  function update(s, t) {
    updateTerrain(s);
    tuftPool.update(s); bushPool.update(s); housePool.update(s); updateSigns(s);
    skyline.position.set(camera.position.x, 0, camera.position.z);
    if (map && map.lava) lavaMat.color.setRGB(3.2 + Math.sin(t * 2) * 0.5, 0.9 + Math.sin(t * 3.1) * 0.2, 0.15);
  }
  return { apply, update, terrainY, sets, setGarage, get garage() { return garage; }, setGarageLights(on) { glights.forEach(l => { l.visible = on; }); } };
}

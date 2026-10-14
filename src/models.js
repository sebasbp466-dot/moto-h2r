import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- helpers ---------- */
export function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
export function ball(r, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
export function limb(a, b, r, mat, parent) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 10), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  parent.add(m); return m;
}

// Une todas las mallas de un grupo por material (muchos menos "draw calls")
export function merge(src) {
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const buckets = new Map();
  src.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of buckets) {
    let g = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (g) out.add(new THREE.Mesh(g, mat));
    else geos.forEach(x => out.add(new THREE.Mesh(x, mat)));
  }
  return out;
}

/* ---------- texturas procedurales ---------- */
function tex(w, h, fn, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
export const asphaltTex = () => tex(256, 256, (x, w, h) => {
  x.fillStyle = '#303036'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 7000; i++) {
    const g = (40 + Math.random() * 55) | 0;
    x.fillStyle = `rgba(${g},${g},${g + 4},${0.3 + Math.random() * 0.4})`;
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  x.strokeStyle = 'rgba(15,15,18,.5)'; x.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    x.beginPath(); let px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 40; py += (Math.random() - 0.5) * 40; x.lineTo(px, py); }
    x.stroke();
  }
}, true);
export const grassTex = () => tex(128, 128, (x, w, h) => {
  x.fillStyle = '#4b5a2c'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const l = 30 + Math.random() * 30;
    x.fillStyle = `hsla(${70 + Math.random() * 30},45%,${l}%,.55)`;
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 2 + Math.random() * 3);
  }
}, true);
export const glowTex = () => tex(64, 64, (x, w, h) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});
export const beamTex = () => tex(64, 256, (x, w, h) => {
  const v = x.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, 'rgba(255,240,190,0)'); v.addColorStop(1, 'rgba(255,240,190,.9)');
  x.fillStyle = v; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'destination-in';
  const hz = x.createLinearGradient(0, 0, w, 0);
  hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.5, 'rgba(0,0,0,1)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = hz; x.fillRect(0, 0, w, h);
});
export const bannerTex = text => tex(1024, 176, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#1b0b2e'); g.addColorStop(1, '#3a0f33');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#7df9ff'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
  x.font = 'italic 900 98px "Arial Black",Impact,sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = '#ff3d71'; x.shadowBlur = 24; x.fillStyle = '#ffd9a0';
  x.fillText(text, w / 2, h / 2 + 4);
  x.shadowColor = '#7df9ff'; x.shadowBlur = 8; x.fillStyle = '#fff';
  x.fillText(text, w / 2, h / 2 + 4);
});
export const backTex = text => tex(256, 96, (x, w, h) => {
  x.fillStyle = '#0c0c0f'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#2bd14a'; x.fillRect(0, 0, w, 7); x.fillRect(0, h - 7, w, 7);
  x.font = '900 58px "Arial Black",Impact,sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  x.fillText(text, w / 2, h / 2 + 2);
});

/* ---------- Kawasaki Ninja H2R negra + conductora ---------- */
export function buildBike() {
  const st = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  const mBlack = st(0x0b0b0d, 0.55, 0.3);
  const mGloss = st(0x101014, 0.9, 0.15);
  const mGreen = st(0x2bd14a, 0.3, 0.4, { emissive: 0x0a3a14 });
  const mSilver = st(0xc8ccd4, 1.0, 0.2);
  const mSuit = st(0x0c0c0e, 0.1, 0.45);
  const mSuit2 = st(0x24242c, 0.15, 0.5);
  const mVisor = st(0x0b141c, 1.0, 0.05);
  const mTire = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
  const mLamp = new THREE.MeshBasicMaterial({ toneMapped: false }); mLamp.color.setRGB(4, 3.5, 2.2);
  const mTail = new THREE.MeshBasicMaterial({ toneMapped: false }); mTail.color.setRGB(3, 0.08, 0.08);

  const root = new THREE.Group(), leanG = new THREE.Group(), pitchG = new THREE.Group();
  root.add(leanG); leanG.add(pitchG); pitchG.position.y = 0.33;

  const t = new THREE.Group();
  // chasis y carenado
  box(0.12, 0.12, 0.7, mBlack, 0, 0.05, -0.3, t);
  box(0.32, 0.38, 0.6, mGloss, 0, 0.15, -0.75, t);
  box(0.42, 0.42, 0.9, mBlack, 0, 0.45, -0.85, t);
  box(0.36, 0.3, 0.5, mBlack, 0, 0.6, -1.28, t).rotation.x = 0.12;
  box(0.36, 0.2, 0.55, mGloss, 0, 0.78, -0.7, t);
  box(0.3, 0.1, 0.55, mGloss, 0, 0.72, -0.12, t);
  box(0.26, 0.18, 0.6, mBlack, 0, 0.78, 0.3, t).rotation.x = -0.2;
  box(0.2, 0.14, 0.2, mGreen, 0, 0.58, -1.02, t);
  box(0.02, 0.06, 0.6, mGreen, 0.22, 0.5, -0.85, t);
  box(0.02, 0.06, 0.6, mGreen, -0.22, 0.5, -0.85, t);
  box(0.8, 0.02, 0.16, mSilver, 0, 0.66, -1.38, t);
  box(0.28, 0.24, 0.02, mVisor, 0, 0.96, -1.1, t).rotation.x = 0.7;
  box(0.14, 0.04, 0.5, mBlack, 0, 0.4, -1.45, t);
  ball(0.08, mLamp, 0, 0.62, -1.54, t);
  box(0.18, 0.05, 0.04, mTail, 0, 0.82, 0.62, t);
  limb([0.2, 0.08, -0.4], [0.24, 0.3, 0.55], 0.07, mSilver, t);
  for (const sd of [-1, 1]) {
    limb([sd * 0.1, 0, -1.45], [sd * 0.1, 0.85, -1.2], 0.035, mSilver, t);
    limb([sd * 0.3, 1.0, -1.08], [sd * 0.38, 1.04, -1.05], 0.012, mBlack, t);
    box(0.13, 0.05, 0.03, mBlack, sd * 0.4, 1.05, -1.05, t);
  }
  limb([-0.32, 0.95, -1.1], [0.32, 0.95, -1.1], 0.025, mBlack, t);

  // conductora: mono deportivo negro, casco con visera espejo y coleta
  limb([0, 0.82, -0.05], [0, 0.82, -0.12], 0.17, mSuit, t);
  limb([0, 0.86, -0.1], [0, 1.28, -0.78], 0.15, mSuit, t);
  box(0.3, 0.1, 0.3, mSuit2, 0, 1.16, -0.52, t).rotation.x = 0.9;
  for (const sd of [-1, 1]) {
    limb([sd * 0.14, 0.8, -0.05], [sd * 0.27, 0.7, -0.62], 0.1, mSuit, t);
    limb([sd * 0.27, 0.7, -0.62], [sd * 0.25, 0.2, -0.2], 0.075, mSuit, t);
    box(0.1, 0.09, 0.26, mGloss, sd * 0.25, 0.17, -0.28, t);
    limb([sd * 0.2, 1.27, -0.76], [sd * 0.33, 1.12, -0.96], 0.065, mSuit, t);
    limb([sd * 0.33, 1.12, -0.96], [sd * 0.3, 0.97, -1.1], 0.055, mSuit, t);
    ball(0.065, mGloss, sd * 0.3, 0.97, -1.1, t);
  }
  ball(0.175, mGloss, 0, 1.45, -0.9, t);
  ball(0.125, mVisor, 0, 1.44, -1.02, t);
  limb([0, 1.42, -0.74], [0, 1.28, -0.4], 0.04, mSuit, t);

  const body = merge(t);
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  pitchG.add(body);

  // letrero en la espalda: BRICEÑO
  const backMat = new THREE.MeshBasicMaterial({ map: backTex('BRICEÑO') });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), backMat);
  back.position.set(0, 1.207, -0.356); back.rotation.x = -1.02;
  pitchG.add(back);

  function makeWheel(z) {
    const w = new THREE.Group(); w.position.set(0, 0, z);
    const g = new THREE.Group();
    const tg = new THREE.CylinderGeometry(0.33, 0.33, 0.2, 24); tg.rotateZ(Math.PI / 2);
    g.add(new THREE.Mesh(tg, mTire));
    const rg = new THREE.CylinderGeometry(0.21, 0.21, 0.22, 16); rg.rotateZ(Math.PI / 2);
    g.add(new THREE.Mesh(rg, mSilver));
    box(0.23, 0.06, 0.42, mBlack, 0, 0, 0, g);
    box(0.23, 0.42, 0.06, mBlack, 0, 0, 0, g);
    box(0.23, 0.05, 0.4, mBlack, 0, 0, 0, g).rotation.x = Math.PI / 4;
    box(0.23, 0.05, 0.4, mBlack, 0, 0, 0, g).rotation.x = -Math.PI / 4;
    const m = merge(g);
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    w.add(m); pitchG.add(w); return w;
  }
  const rW = makeWheel(0), fW = makeWheel(-1.45);

  return { root, leanG, pitchG, rW, fW, exhaust: new THREE.Vector3(0.24, 0.3, 0.62) };
}

/* ---------- coches y camiones ---------- */
const mGlass = new THREE.MeshStandardMaterial({ color: 0x10161d, metalness: 0.9, roughness: 0.1 });
const mWheelC = new THREE.MeshLambertMaterial({ color: 0x111111 });
const mRed = new THREE.MeshBasicMaterial({ toneMapped: false }); mRed.color.setRGB(3, 0.1, 0.1);
const matCache = {};
const bodyMat = c => matCache[c] || (matCache[c] = new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.35 }));

export function buildCar(truck, col, col2) {
  const t = new THREE.Group();
  let len, wid;
  if (truck) {
    len = 7.5; wid = 2.4;
    box(2.4, 2.8, 5.2, bodyMat(0xdcdcdc), 0, 2.0, 1.1, t);
    box(2.3, 2.0, 2.0, bodyMat(col2), 0, 1.5, -2.7, t);
    box(2.0, 0.7, 0.05, mGlass, 0, 2.0, -3.72, t);
    box(0.7, 0.2, 0.05, mRed, 0.7, 0.8, 3.73, t);
    box(0.7, 0.2, 0.05, mRed, -0.7, 0.8, 3.73, t);
  } else {
    len = 4.4; wid = 1.9;
    box(1.9, 0.7, 4.3, bodyMat(col), 0, 0.65, 0, t);
    box(1.6, 0.6, 2.1, mGlass, 0, 1.25, 0.2, t);
    box(0.5, 0.14, 0.05, mRed, 0.6, 0.8, 2.16, t);
    box(0.5, 0.14, 0.05, mRed, -0.6, 0.8, 2.16, t);
  }
  const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.25, 10); wg.rotateZ(Math.PI / 2);
  const zs = truck ? [-2.7, 2.6, 3.4] : [-1.4, 1.4];
  for (const z of zs) for (const sd of [-1, 1]) {
    const w = new THREE.Mesh(wg, mWheelC); w.position.set(sd * (wid / 2 - 0.1), 0.38, z); t.add(w);
  }
  const g = merge(t);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, len, wid };
}

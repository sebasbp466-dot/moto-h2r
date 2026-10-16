import * as THREE from 'three';
import { box, limb, merge } from './geo.js';
export * from './geo.js';
export { buildBike } from './bikes.js';

const S = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const hdr = (r, g, b) => { const m = new THREE.MeshBasicMaterial({ toneMapped: false }); m.color.setRGB(r, g, b); return m; };

/* ---------- coches, furgonetas, camiones y patrullas ---------- */
const mGlass = S(0x0d1319, 0.95, 0.06);
const mWheelC = new THREE.MeshLambertMaterial({ color: 0x111111 });
const mRimC = S(0xc8ccd4, 1, 0.25);
const mPlastic = new THREE.MeshLambertMaterial({ color: 0x18181a });
const mRed = hdr(3, 0.1, 0.1), mPlate = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }), mBlackBody = S(0x101012, 0.5, 0.4);
const matCache = {};
const bodyMat = c => matCache[c] || (matCache[c] = S(c, 0.55, 0.3, { envMapIntensity: 1.2 }));

function carWheels(t, wid, zs, R = 0.38) {
  const tg = new THREE.CylinderGeometry(R, R, 0.26, 14); tg.rotateZ(Math.PI / 2);
  const rg = new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.275, 10); rg.rotateZ(Math.PI / 2);
  for (const z of zs) for (const sd of [-1, 1]) {
    const x = sd * (wid / 2 - 0.1);
    const a = new THREE.Mesh(tg, mWheelC); a.position.set(x, R, z); t.add(a);
    const b = new THREE.Mesh(rg, mRimC); b.position.set(x + sd * 0.005, R, z); t.add(b);
  }
}
function carBody(t, col, o) { // sedán / SUV / patrulla
  const B = bodyMat(col), suv = o.suv, y0 = suv ? 0.72 : 0.55, len = o.len;
  box(1.9, suv ? 0.75 : 0.5, len - 0.1, B, 0, y0, 0, t);
  box(1.86, 0.12, len * 0.32, B, 0, y0 + (suv ? 0.42 : 0.3), -len * 0.3, t);
  box(1.86, 0.14, len * 0.22, B, 0, y0 + (suv ? 0.42 : 0.31), len * 0.38, t);
  const cy = y0 + (suv ? 0.78 : 0.58), cl = suv ? len * 0.62 : len * 0.46;
  box(1.62, suv ? 0.62 : 0.5, cl, mGlass, 0, cy, len * 0.04, t);
  box(1.5, 0.06, cl - 0.5, B, 0, cy + (suv ? 0.34 : 0.28), len * 0.06, t);
  box(1.55, 0.04, 0.75, mGlass, 0, cy + 0.02, -cl / 2 - 0.1, t).rotation.x = 0.6;
  box(1.55, 0.04, 0.75, mGlass, 0, cy + 0.02, cl / 2 + 0.2, t).rotation.x = -0.6;
  box(1.92, 0.2, 0.12, mPlastic, 0, y0 - 0.12, len / 2 - 0.05, t); box(1.92, 0.2, 0.12, mPlastic, 0, y0 - 0.12, -len / 2 + 0.05, t);
  box(1.5, 0.08, 0.03, mRed, 0, y0 + 0.28, len / 2 - 0.02, t);
  box(0.34, 0.1, 0.03, mRed, 0.78, y0 + 0.2, len / 2 - 0.02, t); box(0.34, 0.1, 0.03, mRed, -0.78, y0 + 0.2, len / 2 - 0.02, t);
  box(0.5, 0.12, 0.01, mPlate, 0, y0 - 0.02, len / 2 + 0.01, t);
  for (const sd of [-1, 1]) { box(0.1, 0.08, 0.2, B, sd * 1.0, cy - 0.12, -cl / 2 + 0.05, t); const e = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), mPlastic); e.rotation.x = Math.PI / 2; e.position.set(sd * 0.6, y0 - 0.2, len / 2 + 0.05); t.add(e); }
  if (suv) { for (const sd of [-1, 1]) limb([sd * 0.7, cy + 0.38, -cl / 2 + 0.3], [sd * 0.7, cy + 0.38, cl / 2 - 0.1], 0.025, mPlastic, t); const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 12), mWheelC); sp.rotation.x = Math.PI / 2; sp.position.set(0, y0 + 0.2, len / 2 + 0.1); t.add(sp); }
  carWheels(t, 1.9, [-len * 0.31, len * 0.3], suv ? 0.42 : 0.38);
}
export function buildCar(type, col, col2) {
  const t = new THREE.Group();
  let len = 4.4, wid = 1.9, blink = null;
  if (type === 'truck') {
    len = 9.6; wid = 2.5;
    box(2.4, 2.1, 2.0, bodyMat(col2), 0, 1.65, -3.9, t); box(2.0, 0.7, 0.05, mGlass, 0, 2.0, -4.92, t);
    box(2.2, 0.35, 9.2, mBlackBody, 0, 0.55, 0.0, t);
    box(2.5, 2.9, 6.2, bodyMat(0xdcdcdc), 0, 2.2, 1.1, t);
    for (let i = 0; i < 5; i++) box(2.54, 2.7, 0.06, mPlastic, 0, 2.2, -1.5 + i * 1.4, t);
    box(2.3, 0.15, 0.03, mRed, 0, 0.95, 4.23, t); box(0.5, 0.3, 0.03, mRed, 1.0, 1.2, 4.22, t); box(0.5, 0.3, 0.03, mRed, -1.0, 1.2, 4.22, t);
    box(2.2, 0.12, 0.05, mPlate, 0, 0.7, 4.3, t);
    carWheels(t, 2.5, [-3.9, 2.2, 3.4], 0.5);
  } else if (type === 'van') {
    len = 5.0; wid = 2.1;
    box(2.0, 1.55, 4.9, bodyMat(col), 0, 1.25, 0, t); box(1.9, 0.5, 0.9, bodyMat(col), 0, 0.85, -2.5, t);
    box(1.8, 0.6, 0.06, mGlass, 0, 1.6, -2.45, t).rotation.x = 0.35;
    box(1.9, 0.35, 0.05, mGlass, 0, 1.75, 1.0, t); box(1.9, 0.18, 0.06, mPlastic, 0, 0.5, 2.5, t);
    box(1.9, 0.1, 0.03, mRed, 0, 1.0, 2.46, t); box(0.5, 0.12, 0.01, mPlate, 0, 0.7, 2.5, t);
    carWheels(t, 2.0, [-1.6, 1.6], 0.4);
  } else {
    const police = type === 'police', suv = type === 'suv';
    len = suv ? 4.6 : 4.5; wid = suv ? 2.0 : 1.9;
    carBody(t, police ? 0xf2f2f2 : col, { suv, len });
    if (police) {
      box(1.93, 0.22, 1.7, mBlackBody, 0, 0.62, 0.3, t);
      const R = hdr(5, 0.2, 0.2), Bm = hdr(0.3, 0.8, 5);
      box(1.1, 0.08, 0.3, mPlastic, 0, 1.52, 0.1, t);
      box(0.5, 0.1, 0.26, R, -0.28, 1.6, 0.1, t); box(0.5, 0.1, 0.26, Bm, 0.28, 1.6, 0.1, t);
      blink = { r: R, b: Bm };
    }
  }
  const g = merge(t);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, len, wid, blink };
}

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
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.001, A.distanceTo(B)), 10), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  parent.add(m); return m;
}
// cápsula alineada con Z (formas redondeadas: depósito, cola, carenado...)
export function caps(r, len, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 14); g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
}
// tronco de cono entre dos puntos (r1 en a, r2 en b)
export function taper(a, b, r1, r2, mat, parent) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, Math.max(0.001, A.distanceTo(B)), 12), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  parent.add(m); return m;
}
export function ell(r, mat, x, y, z, parent, sx, sy, sz) { const m = ball(r, mat, x, y, z, parent); m.scale.set(sx, sy, sz); return m; }

// Une las mallas de un grupo por material (muchos menos "draw calls")
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
    const g = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (g) out.add(new THREE.Mesh(g, mat));
    else geos.forEach(x => out.add(new THREE.Mesh(x, mat)));
  }
  return out;
}
export function disposeObj(o) {
  o.traverse(c => {
    if (!c.isMesh) return;
    c.geometry.dispose();
    (Array.isArray(c.material) ? c.material : [c.material]).forEach(mm => { if (mm.map) mm.map.dispose(); mm.dispose(); });
  });
}

/* ---------- texturas procedurales ---------- */
export function tex(w, h, fn, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
export const hex = c => '#' + c.toString(16).padStart(6, '0');
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
export const windowTex = () => tex(128, 256, (x, w, h) => {
  x.fillStyle = '#06060c'; x.fillRect(0, 0, w, h);
  const cols = ['#ffd27a', '#7df9ff', '#ff7ad9', '#fff2c0'];
  for (let r = 0; r < 20; r++) for (let c = 0; c < 8; c++) {
    if (Math.random() < 0.5) { x.fillStyle = cols[(Math.random() * 4) | 0]; x.fillRect(c * 16 + 3, r * 12.5 + 3, 10, 7); }
  }
}, true);
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
export const backTex = (text, color) => tex(256, 96, (x, w, h) => {
  x.fillStyle = '#0c0c0f'; x.fillRect(0, 0, w, h);
  x.fillStyle = hex(color); x.fillRect(0, 0, w, 7); x.fillRect(0, h - 7, w, 7);
  x.font = '900 56px "Arial Black",Impact,sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  x.fillText(text, w / 2, h / 2 + 2);
});


const rn = (a, b) => a + Math.random() * (b - a);
const TAU = 6.2831853;

// Superficie lisa a partir de secciones (superelipses) a lo largo de Z: carenados, depósito, cola...
export function loft(st, seg = 18, vscale = 1) {
  const N = st.length, pos = [], uv = [], idx = [];
  for (let i = 0; i < N; i++) {
    const s = st[i], n = s.n || 2.4;
    for (let j = 0; j <= seg; j++) {
      const t = j / seg * TAU, c = Math.cos(t), sn = Math.sin(t);
      pos.push((s.x || 0) + Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * s.a, s.y + Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * s.b, s.z);
      uv.push(j / seg, i / (N - 1) * vscale);
    }
  }
  const inc = st[N - 1].z > st[0].z;
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
    if (inc) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  for (const k of [0, N - 1]) { // tapas
    const base = pos.length / 3;
    pos.push(st[k].x || 0, st[k].y, st[k].z); uv.push(0.5, k ? vscale : 0);
    for (let j = 0; j < seg; j++) idx.push(base, k * (seg + 1) + j, k * (seg + 1) + j + 1);
  }
  return finish(pos, uv, idx, N, seg);
}
function finish(pos, uv, idx, N, seg) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const nr = g.attributes.normal; // une la costura
  for (let i = 0; i < N; i++) {
    const a = i * (seg + 1), b = a + seg;
    const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}
// Tubo orgánico por una curva suave, con radio (o [ancho, fondo]) variable: brazos, piernas, torso...
export function tube(pts, radii, seg = 12, vscale = 1, M = 22) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.5);
  const P = curve.getPoints(M - 1), pos = [], uv = [], idx = [];
  const T = new THREE.Vector3(), B = new THREE.Vector3(), Nv = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  const nodes = radii.length, rr = (r, k) => (Array.isArray(r) ? r[k] : r);
  for (let i = 0; i < M; i++) {
    const u = i / (M - 1);
    T.copy(curve.getTangentAt(u));
    B.copy(X).addScaledVector(T, -X.dot(T));
    if (B.lengthSq() < 1e-4) B.set(0, 1, 0).addScaledVector(T, -T.y);
    B.normalize(); Nv.crossVectors(T, B).normalize();
    const f = u * (nodes - 1), k = Math.min(nodes - 2, Math.floor(f)), q = f - k;
    const a = rr(radii[k], 0) * (1 - q) + rr(radii[k + 1], 0) * q, b = rr(radii[k], 1) * (1 - q) + rr(radii[k + 1], 1) * q;
    for (let j = 0; j <= seg; j++) {
      const t = j / seg * TAU, c = Math.cos(t), s = Math.sin(t);
      pos.push(P[i].x + B.x * c * a + Nv.x * s * b, P[i].y + B.y * c * a + Nv.y * s * b, P[i].z + B.z * c * a + Nv.z * s * b);
      uv.push(j / seg, u * vscale);
    }
  }
  for (let i = 0; i < M - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  for (const k of [0, M - 1]) {
    const base = pos.length / 3;
    pos.push(P[k].x, P[k].y, P[k].z); uv.push(0.5, k ? vscale : 0);
    for (let j = 0; j < seg; j++) idx.push(base, k * (seg + 1) + j, k * (seg + 1) + j + 1);
  }
  return finish(pos, uv, idx, M, seg);
}

/* ---------- texturas detalladas ---------- */
export const asphaltTex = () => tex(512, 512, (x, w, h) => {
  x.fillStyle = '#2b2b30'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 26000; i++) { const g = (30 + Math.random() * 70) | 0, s = 1 + Math.random() * 2.5; x.fillStyle = `rgba(${g},${g},${g + 5},${0.25 + Math.random() * 0.5})`; x.fillRect(Math.random() * w, Math.random() * h, s, s); }
  for (let i = 0; i < 4; i++) { const g = (50 + Math.random() * 30) | 0; x.fillStyle = `rgba(${g},${g},${g + 4},.2)`; x.fillRect(rn(0, w - 100), rn(0, h - 100), rn(40, 140), rn(40, 140)); }
  for (let i = 0; i < 9; i++) { const px = rn(0, w), py = rn(0, h), r = rn(18, 60), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(6,6,8,.6)'); g.addColorStop(1, 'rgba(6,6,8,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
  for (const u of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) { // rodadas de las ruedas en cada carril
    for (const d of [-0.054, 0.054]) { const cx0 = (u + d) * w, g = x.createLinearGradient(cx0 - 14, 0, cx0 + 14, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx0 - 14, 0, 28, h); }
  }
  x.strokeStyle = 'rgba(8,8,10,.75)'; x.lineWidth = 1.3;
  for (let i = 0; i < 10; i++) { x.beginPath(); let px = rn(0, w), py = rn(0, h); x.moveTo(px, py); for (let k = 0; k < 7; k++) { px += rn(-30, 30); py += rn(-30, 30); x.lineTo(px, py); } x.stroke(); }
}, true);
export const asphaltBump = () => tex(256, 256, (x, w, h) => {
  x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const g = (60 + Math.random() * 140) | 0; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
}, true);
function groundTile(bg, speck, extra) {
  return tex(256, 256, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { const px = rn(0, w), py = rn(0, h), r = rn(25, 80), g = x.createRadialGradient(px, py, 0, px, py, r); const a = Math.random() < 0.5 ? '0,0,0' : '255,255,255'; g.addColorStop(0, `rgba(${a},.12)`); g.addColorStop(1, `rgba(${a},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
    for (let i = 0; i < 7000; i++) { x.fillStyle = speck(); x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 4); }
    if (extra) extra(x, w, h);
  }, true);
}
export const groundTextures = () => ({
  grass: groundTile('#4b5a2c', () => `hsla(${65 + Math.random() * 35},50%,${22 + Math.random() * 34}%,.6)`, (x, w, h) => { for (let i = 0; i < 160; i++) { x.fillStyle = ['#e8d34a', '#f4f4f0', '#d9547a'][i % 3]; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }),
  sand: groundTile('#d9b46a', () => `hsla(${33 + Math.random() * 14},55%,${45 + Math.random() * 30}%,.5)`, (x, w, h) => { x.strokeStyle = 'rgba(120,80,30,.12)'; x.lineWidth = 2; for (let i = 0; i < 20; i++) { x.beginPath(); const y = rn(0, h); x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + rn(-10, 10), w * 0.6, y + rn(-10, 10), w, y + rn(-8, 8)); x.stroke(); } }),
  snow: groundTile('#eef3fa', () => `hsla(215,35%,${80 + Math.random() * 20}%,.6)`, (x, w, h) => { for (let i = 0; i < 260; i++) { x.fillStyle = '#fff'; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } }),
  dark: groundTile('#23262b', () => `hsla(220,10%,${6 + Math.random() * 24}%,.65)`, (x, w, h) => { x.strokeStyle = 'rgba(0,0,0,.5)'; for (let i = 0; i < 8; i++) { x.beginPath(); let px = rn(0, w), py = rn(0, h); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += rn(-25, 25); py += rn(-25, 25); x.lineTo(px, py); } x.stroke(); } }),
});
export const leatherTex = (base, stripe, style) => tex(256, 256, (x, w, h) => {
  x.fillStyle = hex(base); x.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { const c = Math.random() < 0.5 ? '0,0,0' : '255,255,255'; x.fillStyle = `rgba(${c},.07)`; x.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6); }
  if (style === 1) { x.fillStyle = hex(stripe); x.fillRect(0, 0, w * 0.05, h); x.fillRect(w * 0.95, 0, w * 0.05, h); x.fillRect(w * 0.46, 0, w * 0.08, h); x.fillStyle = 'rgba(255,255,255,.8)'; x.fillRect(w * 0.45, 0, 2, h); x.fillRect(w * 0.55, 0, 2, h); }
  if (style === 2) { x.fillStyle = hex(stripe); x.fillRect(0, h * 0.7, w, h * 0.3); x.fillRect(0, 0, w, h * 0.08); }
  x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 2;
  for (const px of [w * 0.25, w * 0.75]) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); }
  for (const py of [h * 0.34, h * 0.68]) { x.beginPath(); x.moveTo(0, py); x.lineTo(w, py); x.stroke(); }
  x.setLineDash([6, 5]); x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 1.2;
  for (const px of [w * 0.25 + 4, w * 0.75 + 4]) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); }
  for (const py of [h * 0.34 + 4, h * 0.68 + 4]) { x.beginPath(); x.moveTo(0, py); x.lineTo(w, py); x.stroke(); }
  x.setLineDash([]); x.fillStyle = 'rgba(0,0,0,.5)';
  for (let r = 0; r < 7; r++) for (let c = 0; c < 16; c++) { x.beginPath(); x.arc(w * 0.06 + c * 5.5, h * 0.4 + r * 5.5, 1.1, 0, TAU); x.fill(); }
}, true);
export const helmetTex = (base, stripe, style) => tex(512, 256, (x, w, h) => {
  x.fillStyle = hex(base); x.fillRect(0, 0, w, h);
  for (const u of [0.25, 0.75]) { x.fillStyle = hex(stripe); x.fillRect(w * (u - 0.04), 0, w * 0.08, h); x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(w * (u - 0.055), 0, 3, h); x.fillRect(w * (u + 0.052), 0, 3, h); }
  x.fillStyle = 'rgba(255,255,255,.8)'; x.fillRect(0, h * 0.64, w, 3); x.fillStyle = hex(stripe); x.fillRect(0, h * 0.66, w, h * 0.04);
  if (style === 2) { x.fillStyle = hex(stripe); for (const u of [0, 0.5, 1]) for (let k = 0; k < 6; k++) { x.beginPath(); const px = w * u + k * 14 - 40, py = h * 0.62; x.moveTo(px, py); x.quadraticCurveTo(px + 10, py - 40 - k * 6, px + 34, py - 70 - k * 4); x.quadraticCurveTo(px + 22, py - 30, px + 30, py); x.fill(); } }
  for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});
export const tireTex = () => tex(64, 128, (x, w, h) => {
  x.fillStyle = '#121212'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#050505'; x.fillRect(w * 0.0, h * 0.28, w, h * 0.44);
  x.strokeStyle = '#1e1e1e'; x.lineWidth = 3;
  for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 8, h * 0.28); x.lineTo(i * 8 + 10, h * 0.5); x.lineTo(i * 8, h * 0.72); x.stroke(); }
  x.fillStyle = '#3a3a3a'; x.fillRect(0, h * 0.5 - 1, w, 2);
  x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, h * 0.13, w, 2); x.fillRect(0, h * 0.87, w, 2);
}, true);
export const carbonTex = () => tex(64, 64, (x, w, h) => {
  x.fillStyle = '#0c0c0e'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#1d1d22' : '#141417'; x.fillRect(i * 8, j * 8, 8, 8); x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(i * 8, j * 8 + ((i + j) % 2 ? 0 : 4), 8, 2); }
}, true);
export const liveryTex = (paint, accent, trueno) => tex(256, 512, (x, w, h) => {
  x.fillStyle = hex(paint); x.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.1})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  const band = (u, wd, col) => { x.fillStyle = col; x.fillRect(w * (u - wd / 2), 0, w * wd, h); };
  for (const u of [0, 1]) band(u, 0.05, hex(accent)); band(0.5, 0.05, hex(accent));
  band(0.25, trueno ? 0.08 : 0.025, hex(accent)); band(0.22, 0.008, 'rgba(255,255,255,.7)'); band(0.28, 0.008, 'rgba(255,255,255,.7)');
  const g = x.createLinearGradient(w * 0.6, 0, w * 0.9, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); x.fillStyle = g; x.fillRect(w * 0.6, 0, w * 0.3, h);
});
export const decalTex = (text, color, w = 512, h = 128, font = 'italic 900 84px Impact,"Arial Black",sans-serif') => tex(w, h, (x, W, H) => {
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,.65)'; x.strokeText(text, W / 2, H / 2 + 4);
  x.fillStyle = color; x.fillText(text, W / 2, H / 2 + 4);
});
export const railTex = () => tex(64, 16, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#6a7078'); g.addColorStop(0.2, '#d6dce4'); g.addColorStop(0.4, '#7a8088'); g.addColorStop(0.6, '#d0d6de'); g.addColorStop(0.8, '#6a7078'); g.addColorStop(1, '#c8ced6');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, true);
const AD = [['BRICEÑO RACING', '#ffd400', '#0a0a0b'], ['NITRO', '#0a0a0b', '#36e0ff'], ['PIRUETA TEAM', '#ffffff', '#e10600'], ['GAS A FONDO', '#0a0a0b', '#ffd400']];
export const adTex = i => tex(512, 256, (x, w, h) => {
  const [t, fg, bg] = AD[i % AD.length];
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg;
  for (let k = 0; k < 6; k++) x.fillRect(-20 + k * 40, h - 30, 22, 14);
  x.font = 'italic 900 70px Impact,"Arial Black",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(t, w / 2, h / 2 - 14);
  x.strokeStyle = fg; x.lineWidth = 8; x.strokeRect(10, 10, w - 20, h - 20);
});
export function gantryBoard() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const set = km => {
    const x = c.getContext('2d');
    x.fillStyle = '#0b5a2e'; x.fillRect(0, 0, 512, 128); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(8, 8, 496, 112);
    x.fillStyle = '#fff'; x.font = '900 60px Impact,"Arial Black",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('BRICEÑO  ' + km + ' KM', 256, 66); t.needsUpdate = true;
  };
  set(1); return { tex: t, set };
}

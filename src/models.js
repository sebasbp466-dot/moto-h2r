import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, VISORS, NAMES } from './data.js';

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
const hex = c => '#' + c.toString(16).padStart(6, '0');
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
function groundTile(bg, speck) {
  return tex(128, 128, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = speck();
      x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 3);
    }
  }, true);
}
export const groundTextures = () => ({
  grass: groundTile('#4b5a2c', () => `hsla(${70 + Math.random() * 30},45%,${30 + Math.random() * 30}%,.55)`),
  sand: groundTile('#d9b46a', () => `hsla(${35 + Math.random() * 12},55%,${50 + Math.random() * 25}%,.5)`),
  snow: groundTile('#eef3fa', () => `hsla(215,30%,${82 + Math.random() * 18}%,.6)`),
  dark: groundTile('#23262b', () => `hsla(220,10%,${8 + Math.random() * 22}%,.6)`),
});
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
const backTex = (text, color) => tex(256, 96, (x, w, h) => {
  x.fillStyle = '#0c0c0f'; x.fillRect(0, 0, w, h);
  x.fillStyle = hex(color); x.fillRect(0, 0, w, 7); x.fillRect(0, h - 7, w, 7);
  x.font = '900 56px "Arial Black",Impact,sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  x.fillText(text, w / 2, h / 2 + 2);
});

/* ---------- materiales según el aspecto elegido ---------- */
const S = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
function makeMats(look) {
  const pc = PAL.paint[look.paint], ac = PAL.accent[look.accent], sc = PAL.suit[look.suit], st = PAL.stripe[look.stripe];
  const suit2 = new THREE.Color(sc); suit2.offsetHSL(0, 0, 0.1);
  const lamp = new THREE.MeshBasicMaterial({ toneMapped: false }); lamp.color.setRGB(4, 3.5, 2.2);
  const tail = new THREE.MeshBasicMaterial({ toneMapped: false }); tail.color.setRGB(3, 0.08, 0.08);
  const vz = VISORS[look.visor] || VISORS[0];
  return {
    paint: S(pc, 0.55, 0.28), paint2: S(pc, 0.9, 0.15),
    accent: S(ac, 0.3, 0.4, { emissive: ac, emissiveIntensity: 0.25 }),
    rim: S(PAL.rim[look.rim], 1, 0.2), dark: S(0x101014, 0.7, 0.3), silver: S(0xc8ccd4, 1, 0.2), white: S(0xf2f2f2, 0.3, 0.4),
    tire: new THREE.MeshLambertMaterial({ color: 0x0a0a0a }), lamp, tail, wscreen: S(0x0b141c, 1, 0.05),
    suit: S(sc, 0.1, 0.45), suit2: S(suit2.getHex(), 0.15, 0.5),
    stripe: S(st, 0.2, 0.4, { emissive: st, emissiveIntensity: 0.15 }),
    helm: S(PAL.helmet[look.helmet], 0.5, 0.25), visor: S(vz.c, vz.metal, vz.rough),
    hair: S(PAL.hair[look.hair], 0.1, 0.7), glove: S(0x111114, 0.2, 0.5),
  };
}

/* ---------- 5 estilos de moto (coordenadas relativas al eje trasero) ---------- */
function forks(t, m, wb, top, r = 0.035, mat) {
  for (const sd of [-1, 1]) limb([sd * 0.1, 0, -wb], [sd * 0.1, top[0], top[1]], r, mat || m.silver, t);
}
function sport(t, m, trueno) {
  const wb = 1.45;
  box(0.12, 0.12, 0.7, m.dark, 0, 0.05, -0.3, t);
  box(0.32, 0.38, 0.6, m.paint2, 0, 0.15, -0.75, t);
  box(0.42, 0.42, 0.9, m.paint, 0, 0.45, -0.85, t);
  box(0.36, 0.3, 0.5, m.paint, 0, 0.6, -1.28, t).rotation.x = 0.12;
  box(0.36, 0.2, 0.55, m.paint2, 0, 0.78, -0.7, t);
  box(0.3, 0.1, 0.55, m.paint2, 0, 0.72, -0.12, t);
  box(0.26, trueno ? 0.26 : 0.18, 0.6, m.paint, 0, trueno ? 0.83 : 0.78, 0.3, t).rotation.x = -0.2;
  box(0.02, 0.06, 0.6, m.accent, 0.22, 0.5, -0.85, t);
  box(0.02, 0.06, 0.6, m.accent, -0.22, 0.5, -0.85, t);
  box(0.28, 0.24, 0.02, m.wscreen, 0, 0.96, -1.1, t).rotation.x = 0.7;
  box(0.14, 0.04, 0.5, m.dark, 0, 0.4, -1.45, t);
  ball(0.08, m.lamp, 0, 0.62, -1.54, t);
  box(0.18, 0.05, 0.04, m.tail, 0, 0.84, 0.62, t);
  limb([0.2, 0.08, -0.4], [0.24, 0.3, 0.55], 0.07, m.silver, t);
  if (trueno) {
    box(0.36, 0.14, 0.8, m.paint, 0, 0.1, -0.9, t);
    box(0.24, 0.24, 0.02, m.white, 0, 0.6, -1.5, t);
    box(0.05, 0.02, 0.9, m.accent, 0, 0.9, -0.6, t);
  } else {
    box(0.2, 0.14, 0.2, m.accent, 0, 0.58, -1.02, t);
    box(0.8, 0.02, 0.16, m.silver, 0, 0.66, -1.38, t);
  }
  forks(t, m, wb, [0.85, -1.2]);
  limb([-0.32, 0.95, -1.1], [0.32, 0.95, -1.1], 0.025, m.dark, t);
  for (const sd of [-1, 1]) box(0.13, 0.05, 0.03, m.dark, sd * 0.4, 1.0, -1.08, t);
  return { wb, R: 0.33, Rf: 0.33, rw: 0.2, fw: 0.2, P: { hip: [0.82, -0.05], chest: [1.28, -0.78], head: [1.45, -0.9], hand: [0.3, 0.97, -1.1], knee: [0.7, -0.62], foot: [0.2, -0.2] } };
}
function naked(t, m) {
  const wb = 1.4;
  box(0.34, 0.36, 0.55, m.dark, 0, 0.2, -0.7, t);
  box(0.3, 0.25, 0.1, m.dark, 0, 0.32, -1.05, t);
  limb([0, 0.58, -1.15], [0, 0.12, -0.55], 0.025, m.accent, t);
  limb([0, 0.58, -1.15], [0, 0.76, -0.35], 0.025, m.accent, t);
  limb([0, 0.12, -0.55], [0, 0.3, 0.05], 0.025, m.accent, t);
  box(0.34, 0.22, 0.55, m.paint2, 0, 0.82, -0.78, t);
  box(0.3, 0.1, 0.6, m.dark, 0, 0.76, -0.12, t);
  box(0.2, 0.14, 0.45, m.paint, 0, 0.84, 0.4, t).rotation.x = -0.25;
  ball(0.13, m.dark, 0, 0.92, -1.28, t); ball(0.09, m.lamp, 0, 0.92, -1.38, t);
  box(0.22, 0.18, 0.02, m.wscreen, 0, 1.06, -1.2, t).rotation.x = 0.6;
  box(0.18, 0.05, 0.04, m.tail, 0, 0.9, 0.66, t);
  limb([0.18, 0.1, -0.55], [0.22, 0.35, 0.6], 0.065, m.silver, t);
  box(0.12, 0.04, 0.45, m.paint, 0, 0.4, -1.4, t);
  forks(t, m, wb, [0.95, -1.15], 0.04, m.accent);
  limb([-0.42, 1.08, -1.0], [0.42, 1.08, -1.0], 0.025, m.dark, t);
  return { wb, R: 0.33, Rf: 0.33, rw: 0.2, fw: 0.2, P: { hip: [0.84, -0.05], chest: [1.42, -0.5], head: [1.6, -0.55], hand: [0.4, 1.08, -1.0], knee: [0.72, -0.6], foot: [0.2, -0.2] } };
}
function motard(t, m) {
  const wb = 1.5;
  box(0.3, 0.35, 0.5, m.dark, 0, 0.3, -0.7, t);
  box(0.3, 0.2, 0.5, m.paint2, 0, 1.02, -0.7, t);
  box(0.28, 0.1, 0.85, m.dark, 0, 0.96, -0.05, t);
  box(0.2, 0.06, 0.6, m.paint, 0, 0.98, 0.55, t).rotation.x = -0.3;
  box(0.3, 0.32, 0.04, m.paint, 0, 1.0, -1.42, t).rotation.x = 0.25;
  box(0.16, 0.14, 0.05, m.accent, 0, 1.0, -1.45, t).rotation.x = 0.25;
  ball(0.08, m.lamp, 0, 0.8, -1.5, t);
  box(0.14, 0.04, 0.5, m.paint, 0, 0.62, -1.5, t);
  box(0.18, 0.05, 0.04, m.tail, 0, 0.98, 0.84, t);
  forks(t, m, wb, [1.15, -1.25], 0.045, m.accent);
  limb([-0.42, 1.32, -1.05], [0.42, 1.32, -1.05], 0.025, m.dark, t);
  limb([0.18, 0.4, -0.5], [0.28, 1.0, 0.6], 0.06, m.silver, t);
  limb([0, 1.0, -1.2], [0, 0.3, -0.6], 0.03, m.accent, t);
  limb([0, 1.0, -1.2], [0, 1.0, -0.3], 0.03, m.accent, t);
  limb([0, 0.3, -0.6], [0, 0.3, 0], 0.03, m.accent, t);
  return { wb, R: 0.37, Rf: 0.37, rw: 0.17, fw: 0.14, P: { hip: [1.06, -0.05], chest: [1.58, -0.42], head: [1.78, -0.47], hand: [0.42, 1.32, -1.05], knee: [1.0, -0.45], foot: [0.1, -0.1] } };
}
function chopper(t, m) {
  const wb = 1.95;
  box(0.34, 0.04, 0.7, m.paint, 0, 0.5, 0.15, t).rotation.x = -0.1;
  box(0.4, 0.4, 0.5, m.silver, 0, 0.2, -0.7, t);
  limb([-0.16, 0.35, -0.72], [-0.32, 0.62, -0.72], 0.09, m.silver, t);
  limb([0.16, 0.35, -0.72], [0.32, 0.62, -0.72], 0.09, m.silver, t);
  ball(0.2, m.paint2, 0, 0.92, -0.85, t).scale.set(1, 0.75, 1.5);
  box(0.02, 0.1, 0.5, m.accent, 0.2, 0.92, -0.85, t);
  box(0.02, 0.1, 0.5, m.accent, -0.2, 0.92, -0.85, t);
  box(0.3, 0.08, 0.55, m.dark, 0, 0.64, 0.1, t);
  limb([0, 0.66, 0.35], [0, 1.28, 0.6], 0.02, m.silver, t);
  box(0.3, 0.2, 0.04, m.dark, 0, 1.15, 0.58, t);
  forks(t, m, wb, [1.1, -1.2], 0.03, m.silver);
  ball(0.1, m.lamp, 0, 1.02, -1.3, t);
  limb([-0.12, 1.18, -1.2], [-0.4, 1.58, -1.3], 0.02, m.silver, t);
  limb([0.12, 1.18, -1.2], [0.4, 1.58, -1.3], 0.02, m.silver, t);
  limb([0.2, 0.18, -0.5], [0.26, 0.2, 0.9], 0.06, m.silver, t);
  limb([0.24, 0.3, -0.5], [0.3, 0.3, 0.85], 0.05, m.silver, t);
  box(0.12, 0.04, 0.35, m.paint, 0, 0.44, -wb, t);
  box(0.18, 0.05, 0.04, m.tail, 0, 0.6, 0.62, t);
  return { wb, R: 0.36, Rf: 0.33, rw: 0.32, fw: 0.1, P: { hip: [0.72, 0.1], chest: [1.2, 0.32], head: [1.45, 0.38], hand: [0.4, 1.58, -1.3], knee: [0.66, -0.55], foot: [0.18, -0.95] } };
}
const BUILDERS = [(t, m) => sport(t, m, false), (t, m) => sport(t, m, true), naked, motard, chopper];

function makeWheel(parent, m, z, R, w, dy) {
  const wr = new THREE.Group(); wr.position.set(0, dy, z);
  const g = new THREE.Group();
  const tg = new THREE.CylinderGeometry(R, R, w, 24); tg.rotateZ(Math.PI / 2);
  g.add(new THREE.Mesh(tg, m.tire));
  const rg = new THREE.CylinderGeometry(R * 0.64, R * 0.64, w * 1.1, 16); rg.rotateZ(Math.PI / 2);
  g.add(new THREE.Mesh(rg, m.rim));
  for (const a of [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4]) box(w * 1.15, 0.05, R * 1.25, m.dark, 0, 0, 0, g).rotation.x = a;
  const mm = merge(g);
  mm.traverse(o => { if (o.isMesh) o.castShadow = true; });
  wr.add(mm); wr.userData.R = R; parent.add(wr); return wr;
}

/* ---------- piloto / pilota ---------- */
function buildRider(look, m, P) {
  const g = new THREE.Group(), t = new THREE.Group();
  const w = look.sex ? 1.1 : 0.92;
  const [hy, hz] = P.hip, [cy, cz] = P.chest, [hdy, hdz] = P.head, [hx, hhy, hhz] = P.hand, [ky, kz] = P.knee, [fy, fz] = P.foot;
  limb([0, hy, hz], [0, hy, hz - 0.07], 0.17 * w, m.suit, t);
  limb([0, hy + 0.02, hz - 0.05], [0, cy, cz], 0.15 * w, m.suit, t);
  ball(0.13, m.suit2, 0, cy + 0.04, cz + 0.16, t).scale.set(1, 0.7, 1.5);
  const pad = look.suitStyle === 2 ? m.stripe : m.suit2;
  const knees = [];
  for (const sd of [-1, 1]) {
    const sx = sd * 0.21 * w;
    ball(0.085 * w, pad, sx, cy - 0.01, cz + 0.02, t);
    const el = [sd * 0.33 * w, (cy + hhy) / 2 - 0.04, (cz + hhz) / 2];
    limb([sx, cy - 0.01, cz + 0.02], el, 0.065 * w, m.suit, t); ball(0.06 * w, pad, el[0], el[1], el[2], t);
    limb(el, [sd * hx, hhy, hhz], 0.055 * w, m.suit, t);
    ball(0.065, m.glove, sd * hx, hhy, hhz, t);
    const hipj = [sd * 0.14 * w, hy - 0.02, hz], knee = [sd * 0.27 * w, ky, kz], foot = [sd * 0.25 * w, fy, fz];
    limb(hipj, knee, 0.1 * w, m.suit, t); ball(0.085 * w, pad, knee[0], knee[1], knee[2], t);
    limb(knee, foot, 0.075 * w, m.suit, t);
    box(0.1, 0.09, 0.26, m.glove, foot[0], foot[1] - 0.03, foot[2] - 0.07, t);
    const ks = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 10), m.stripe);
    ks.rotation.z = Math.PI / 2; ks.position.set(sd * (0.27 * w + 0.09), ky, kz); t.add(ks);
    knees.push(new THREE.Vector3(sd * (0.27 * w + 0.1), ky, kz));
    if (look.suitStyle === 1) {
      limb([sd * 0.155 * w, hy + 0.02, hz - 0.05], [sd * 0.155 * w, cy, cz], 0.018, m.stripe, t);
      limb([sd * 0.28 * w, hy - 0.02, hz], [sd * 0.36 * w, ky, kz], 0.016, m.stripe, t);
    }
  }
  limb([0, cy, cz], [0, hdy - 0.1, hdz + 0.03], 0.06, m.suit2, t);
  ball(0.17, m.helm, 0, hdy, hdz, t).scale.set(1, 0.95, 1.18);
  box(0.17, 0.09, 0.12, m.helm, 0, hdy - 0.13, hdz - 0.12, t);
  ball(0.125, m.visor, 0, hdy - 0.005, hdz - 0.1, t).scale.set(1.05, 0.72, 1.0);
  if (look.helmStyle === 1) box(0.05, 0.01, 0.34, m.stripe, 0, hdy + 0.163, hdz, t);
  if (look.helmStyle === 2) for (let i = 0; i < 5; i++) box(0.018, 0.075 - i * 0.01, 0.055, m.stripe, 0, hdy + 0.15 - Math.abs(i - 2) * 0.012, hdz + 0.13 - i * 0.065, t);
  const body = merge(t);
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(body);

  // letrero con el nombre en la espalda
  const dy = cy - hy, dz = cz - hz, len = Math.hypot(dy, dz) || 1;
  const ny = -dz / len, nz = dy / len, r = 0.15 * w + 0.012;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshBasicMaterial({ map: backTex(NAMES[look.name] || NAMES[0], PAL.stripe[look.stripe]) }));
  plate.position.set(0, (hy + cy) / 2 + ny * r, (hz + cz) / 2 + nz * r);
  plate.rotation.x = Math.atan2(-ny, nz);
  g.add(plate);

  // coleta animada (ella)
  const joints = [];
  if (!look.sex) {
    const tail = new THREE.Group(); tail.position.set(0, hdy - 0.03, hdz + 0.17);
    let parent = tail;
    for (let i = 0; i < 3; i++) {
      const j = new THREE.Group(); if (i > 0) j.position.y = -0.1;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04 - 0.008 * i, 0.03 - 0.008 * i, 0.11, 8), m.hair);
      seg.position.y = -0.055; j.add(seg); parent.add(j); joints.push(j); parent = j;
    }
    g.add(tail);
  }
  return { group: g, joints, knees };
}

export function buildBike(style, look) {
  const m = makeMats(look);
  const leanG = new THREE.Group(), pitchG = new THREE.Group();
  leanG.add(pitchG);
  const t = new THREE.Group();
  const def = (BUILDERS[style] || BUILDERS[0])(t, m);
  pitchG.position.y = def.R;
  const body = merge(t);
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  pitchG.add(body);
  const rW = makeWheel(pitchG, m, 0, def.R, def.rw, 0);
  const fW = makeWheel(pitchG, m, -def.wb, def.Rf, def.fw, def.Rf - def.R);
  const rider = buildRider(look, m, def.P);
  pitchG.add(rider.group);
  const [hx, hy, hz] = def.P.hand;
  return {
    leanG, pitchG, rW, fW, riderG: rider.group, joints: rider.joints, knees: rider.knees,
    exhaust: new THREE.Vector3(0.24, 0.3, 0.62),
    trails: [new THREE.Vector3(-hx - 0.05, hy, hz), new THREE.Vector3(hx + 0.05, hy, hz)],
    frontWheel: new THREE.Vector3(0, -def.R + 0.1, -def.wb),
  };
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

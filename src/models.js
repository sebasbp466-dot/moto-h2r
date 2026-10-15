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
const PH = (color, metalness, roughness, cc) => new THREE.MeshPhysicalMaterial({ color, metalness, roughness, clearcoat: 1, clearcoatRoughness: cc, envMapIntensity: 1.3 });
const hdr = (r, g, b) => { const m = new THREE.MeshBasicMaterial({ toneMapped: false }); m.color.setRGB(r, g, b); return m; };
function makeMats(look) {
  const pc = PAL.paint[look.paint], ac = PAL.accent[look.accent], sc = PAL.suit[look.suit], st = PAL.stripe[look.stripe];
  const suit2 = new THREE.Color(sc); suit2.offsetHSL(0, 0, 0.1);
  const vz = VISORS[look.visor] || VISORS[0];
  return {
    paint: PH(pc, 0.55, 0.32, 0.05), paint2: PH(pc, 0.85, 0.2, 0.03),
    accent: S(ac, 0.3, 0.4, { emissive: ac, emissiveIntensity: 0.25 }),
    rim: S(PAL.rim[look.rim], 1, 0.2, { side: THREE.DoubleSide }), dark: S(0x101014, 0.7, 0.3), silver: S(0xc8ccd4, 1, 0.2),
    chrome: S(0xeef2f8, 1, 0.06), carbon: S(0x17181c, 0.6, 0.4), white: S(0xf2f2f2, 0.3, 0.4),
    tire: new THREE.MeshLambertMaterial({ color: 0x0a0a0a, side: THREE.DoubleSide }),
    lamp: hdr(4, 3.5, 2.2), tail: hdr(3, 0.08, 0.08), amber: hdr(3.2, 1.3, 0), wscreen: S(0x0b141c, 1, 0.05),
    suit: S(sc, 0.1, 0.45), suit2: S(suit2.getHex(), 0.15, 0.5),
    stripe: S(st, 0.2, 0.4, { emissive: st, emissiveIntensity: 0.15 }),
    helm: PH(PAL.helmet[look.helmet], 0.4, 0.3, 0.04), visor: S(vz.c, vz.metal, vz.rough),
    hair: S(PAL.hair[look.hair], 0.1, 0.7), glove: S(0x111114, 0.2, 0.5), rubber: S(0x08080a, 0.1, 0.8),
  };
}

/* ---------- ruedas con neumático redondeado, llanta, radios y discos ---------- */
function makeWheel(parent, m, z, R, w, dy, front) {
  const wr = new THREE.Group(); wr.position.set(0, dy, z);
  const g = new THREE.Group();
  const V = (x, y) => new THREE.Vector2(x, y);
  const tire = new THREE.LatheGeometry([V(R * 0.62, -w * 0.5), V(R * 0.9, -w * 0.5), V(R * 0.985, -w * 0.34), V(R, -w * 0.14), V(R, w * 0.14), V(R * 0.985, w * 0.34), V(R * 0.9, w * 0.5), V(R * 0.62, w * 0.5)], 30);
  tire.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(tire, m.tire));
  const rim = new THREE.LatheGeometry([V(R * 0.5, -w * 0.4), V(R * 0.64, -w * 0.4), V(R * 0.64, w * 0.4), V(R * 0.5, w * 0.4)], 28);
  rim.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(rim, m.rim));
  const back = new THREE.CylinderGeometry(R * 0.52, R * 0.52, w * 0.4, 20); back.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(back, m.dark));
  for (let k = 0; k < 3; k++) box(w * 0.5, 0.05, R * 1.04, m.rim, 0, 0, 0, g).rotation.x = k * Math.PI / 3;
  const hub = new THREE.CylinderGeometry(R * 0.14, R * 0.14, w * 0.9, 12); hub.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(hub, m.silver));
  for (const sx of (front ? [-1, 1] : [1])) {
    const d = new THREE.CylinderGeometry(R * 0.52, R * 0.52, 0.012, 24); d.rotateZ(Math.PI / 2); d.translate(sx * (w * 0.5 + 0.015), 0, 0);
    g.add(new THREE.Mesh(d, m.silver));
  }
  const mm = merge(g);
  mm.traverse(o => { if (o.isMesh) o.castShadow = true; });
  wr.add(mm); wr.userData.R = R; parent.add(wr); return wr;
}

/* ---------- detalles comunes a todas las motos ---------- */
function forks(t, m, wb, top, r = 0.034, lowMat) {
  for (const sd of [-1, 1]) {
    limb([sd * 0.1, 0.3, -wb + 0.09], [sd * 0.1, top[0], top[1]], r, m.silver, t);
    limb([sd * 0.1, 0, -wb], [sd * 0.1, 0.32, -wb + 0.09], r * 1.25, lowMat || m.accent, t);
  }
  box(0.3, 0.03, 0.06, m.dark, 0, top[0], top[1], t);
}
function details(t, m, o) {
  const sides = [-1, 1], cxp = -(o.rw / 2 + 0.07);
  for (const sd of sides) limb([sd * (o.rw / 2 + 0.05), 0, 0], [sd * 0.1, o.sa, -0.72], 0.026, m.silver, t); // basculante
  limb([0, 0.52, -0.2], [0, o.sa + 0.05, -0.62], 0.032, m.accent, t);                                   // amortiguador
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 16), m.silver); sp.rotation.z = Math.PI / 2; sp.position.set(cxp, 0, 0); t.add(sp);
  limb([cxp, 0.1, 0], [cxp, o.sa + 0.04, -0.62], 0.01, m.dark, t); limb([cxp, -0.1, 0], [cxp, o.sa - 0.04, -0.62], 0.01, m.dark, t); // cadena
  for (const sd of sides) {                                                                              // estriberas
    limb([sd * 0.2, o.peg[0], o.peg[1]], [sd * 0.3, o.peg[0], o.peg[1]], 0.012, m.silver, t);
    box(0.12, 0.02, 0.035, m.dark, sd * 0.3, o.peg[0], o.peg[1], t);
  }
  box(0.2, 0.11, 0.008, m.white, 0, o.tail[0] - 0.1, o.tail[1] + 0.4, t).rotation.x = -0.6;               // matrícula
  for (const sd of sides) ball(0.022, m.amber, sd * 0.12, o.tail[0] - 0.04, o.tail[1] + 0.36, t);         // intermitentes
  const [bx, by, bz] = o.bar;
  for (const sd of sides) {                                                                              // espejos y manetas
    limb([sd * (bx - 0.05), by + 0.02, bz - 0.02], [sd * bx, by + 0.15, bz - 0.05], 0.008, m.dark, t);
    box(0.12, 0.065, 0.015, m.dark, sd * (bx + 0.02), by + 0.17, bz - 0.06, t).rotation.y = sd * 0.2;
    limb([sd * bx, by, bz], [sd * (bx + 0.04), by - 0.02, bz - 0.13], 0.007, m.silver, t);
    box(0.035, 0.1, 0.12, m.accent, sd * (o.fw / 2 + 0.035), o.Rf - o.R + o.Rf * 0.5, -o.wb + 0.05, t);    // pinza delantera
  }
  box(0.03, 0.07, 0.09, m.accent, o.rw / 2 + 0.035, 0.14, -0.1, t);                                      // pinza trasera
}

/* ---------- 5 estilos de moto (coordenadas relativas al eje trasero) ---------- */
function sport(t, m, trueno) {
  const wb = 1.45;
  caps(0.2, 0.75, m.paint, 0, 0.46, -0.85, t, 1, 1.08, 1);
  caps(0.15, 0.4, m.paint, 0, 0.6, -1.27, t, 0.95, 0.85, 1);
  caps(0.17, 0.35, m.paint2, 0, 0.8, -0.7, t, 1, 0.7, 1);
  box(0.28, 0.07, 0.5, m.dark, 0, 0.72, -0.1, t);
  caps(0.12, 0.4, m.paint, 0, trueno ? 0.84 : 0.8, 0.3, t, 1, 0.75, 1).rotation.x = -0.15;
  caps(0.17, 0.5, m.paint, 0, 0.12, -0.9, t, 1, 0.5, 1);
  box(0.02, 0.06, 0.6, m.accent, 0.205, 0.5, -0.85, t); box(0.02, 0.06, 0.6, m.accent, -0.205, 0.5, -0.85, t);
  box(0.26, 0.22, 0.015, m.wscreen, 0, 0.97, -1.1, t).rotation.x = 0.72;
  ell(0.1, m.dark, 0, 0.62, -1.5, t, 1.5, 0.8, 0.6);
  for (const sd of [-1, 1]) ball(0.055, m.lamp, sd * 0.075, 0.62, -1.57, t);
  box(0.18, 0.05, 0.04, m.tail, 0, 0.86, 0.66, t);
  caps(0.055, 0.5, m.chrome, 0.2, 0.27, 0.32, t).rotation.x = -0.18;
  box(0.3, 0.3, 0.45, m.dark, 0, 0.2, -0.7, t);
  for (let i = 0; i < 3; i++) box(0.34, 0.012, 0.4, m.silver, 0, 0.32 + i * 0.03, -0.7, t);
  for (let i = 0; i < 3; i++) box(0.2, 0.012, 0.01, m.dark, 0, 0.4 + i * 0.035, -1.34, t);
  if (trueno) { box(0.05, 0.012, 0.95, m.accent, 0, 0.945, -0.55, t); box(0.22, 0.012, 0.3, m.accent, 0, 0.97, 0.2, t).rotation.x = -0.15; }
  else {
    box(0.2, 0.14, 0.2, m.accent, 0, 0.58, -1.0, t); limb([0, 0.6, -1.0], [0, 0.72, -0.78], 0.04, m.silver, t);
    for (const sd of [-1, 1]) { box(0.28, 0.012, 0.12, m.carbon, sd * 0.3, 0.62, -1.38, t).rotation.z = sd * 0.12; box(0.012, 0.1, 0.1, m.carbon, sd * 0.44, 0.66, -1.38, t); }
  }
  forks(t, m, wb, [0.88, -1.2]);
  limb([-0.32, 0.95, -1.1], [0.32, 0.95, -1.1], 0.025, m.dark, t);
  const spec = { wb, R: 0.33, Rf: 0.33, rw: 0.2, fw: 0.2, sa: 0.12, peg: [0.2, -0.2], bar: [0.3, 0.97, -1.1], tail: [0.8, 0.3] };
  details(t, m, spec);
  spec.P = { hip: [0.82, -0.05], chest: [1.28, -0.78], head: [1.45, -0.9], hand: [0.3, 0.97, -1.1], knee: [0.7, -0.62], foot: [0.2, -0.2] };
  return spec;
}
function naked(t, m) {
  const wb = 1.4;
  box(0.34, 0.34, 0.55, m.dark, 0, 0.2, -0.7, t);
  for (let i = 0; i < 4; i++) box(0.38, 0.012, 0.5, m.silver, 0, 0.1 + i * 0.07, -0.7, t);
  box(0.3, 0.25, 0.08, m.dark, 0, 0.34, -1.08, t);
  for (let i = 0; i < 4; i++) box(0.28, 0.01, 0.01, m.silver, 0, 0.26 + i * 0.05, -1.13, t);
  limb([0, 0.58, -1.15], [0, 0.12, -0.55], 0.025, m.accent, t);
  limb([0, 0.58, -1.15], [0, 0.76, -0.35], 0.025, m.accent, t);
  limb([0, 0.12, -0.55], [0, 0.3, 0.05], 0.025, m.accent, t);
  caps(0.18, 0.3, m.paint2, 0, 0.84, -0.78, t, 1, 0.75, 1);
  box(0.3, 0.09, 0.6, m.dark, 0, 0.76, -0.1, t);
  caps(0.1, 0.3, m.paint, 0, 0.86, 0.42, t, 1, 0.7, 1).rotation.x = -0.25;
  ell(0.14, m.dark, 0, 0.93, -1.27, t, 1, 1, 0.8); ball(0.1, m.lamp, 0, 0.93, -1.37, t);
  box(0.22, 0.18, 0.015, m.wscreen, 0, 1.07, -1.2, t).rotation.x = 0.6;
  box(0.18, 0.05, 0.04, m.tail, 0, 0.9, 0.7, t);
  caps(0.05, 0.45, m.chrome, 0.2, 0.34, 0.2, t).rotation.x = -0.35;
  box(0.12, 0.04, 0.45, m.paint, 0, 0.42, -1.4, t);
  forks(t, m, wb, [0.95, -1.15], 0.04);
  limb([-0.42, 1.08, -1.0], [0.42, 1.08, -1.0], 0.025, m.dark, t);
  for (const sd of [-1, 1]) box(0.012, 0.015, 0.4, m.lamp, sd * 0.18, 0.86, -0.78, t);
  const spec = { wb, R: 0.33, Rf: 0.33, rw: 0.2, fw: 0.2, sa: 0.12, peg: [0.2, -0.2], bar: [0.4, 1.08, -1.0], tail: [0.86, 0.4] };
  details(t, m, spec);
  spec.P = { hip: [0.84, -0.05], chest: [1.42, -0.5], head: [1.6, -0.55], hand: [0.4, 1.08, -1.0], knee: [0.72, -0.6], foot: [0.2, -0.2] };
  return spec;
}
function motard(t, m) {
  const wb = 1.5;
  box(0.3, 0.35, 0.5, m.dark, 0, 0.3, -0.7, t);
  for (let i = 0; i < 4; i++) box(0.34, 0.012, 0.45, m.silver, 0, 0.18 + i * 0.07, -0.7, t);
  caps(0.14, 0.3, m.paint2, 0, 1.02, -0.7, t, 1, 0.7, 1);
  box(0.28, 0.1, 0.85, m.dark, 0, 0.96, -0.05, t);
  box(0.2, 0.06, 0.6, m.paint, 0, 0.98, 0.55, t).rotation.x = -0.3;
  box(0.3, 0.32, 0.04, m.paint, 0, 1.0, -1.42, t).rotation.x = 0.25;
  box(0.16, 0.14, 0.05, m.accent, 0, 1.0, -1.45, t).rotation.x = 0.25;
  ball(0.08, m.lamp, 0, 0.8, -1.5, t);
  box(0.14, 0.04, 0.5, m.paint, 0, 0.62, -1.5, t);
  box(0.18, 0.05, 0.04, m.tail, 0, 0.98, 0.86, t);
  forks(t, m, wb, [1.15, -1.25], 0.045);
  limb([-0.42, 1.32, -1.05], [0.42, 1.32, -1.05], 0.025, m.dark, t);
  caps(0.055, 0.5, m.chrome, 0.2, 0.9, 0.2, t).rotation.x = -0.45;
  limb([0, 1.0, -1.2], [0, 0.3, -0.6], 0.03, m.accent, t);
  limb([0, 1.0, -1.2], [0, 1.0, -0.3], 0.03, m.accent, t);
  limb([0, 0.3, -0.6], [0, 0.3, 0], 0.03, m.accent, t);
  const spec = { wb, R: 0.37, Rf: 0.37, rw: 0.17, fw: 0.14, sa: 0.16, peg: [0.1, -0.1], bar: [0.42, 1.32, -1.05], tail: [0.98, 0.5] };
  details(t, m, spec);
  spec.P = { hip: [1.06, -0.05], chest: [1.58, -0.42], head: [1.78, -0.47], hand: [0.42, 1.32, -1.05], knee: [1.0, -0.45], foot: [0.1, -0.1] };
  return spec;
}
function chopper(t, m) {
  const wb = 1.95;
  box(0.34, 0.04, 0.7, m.paint, 0, 0.5, 0.15, t).rotation.x = -0.1;
  box(0.4, 0.4, 0.5, m.chrome, 0, 0.2, -0.7, t);
  limb([-0.16, 0.35, -0.72], [-0.32, 0.62, -0.72], 0.09, m.chrome, t);
  limb([0.16, 0.35, -0.72], [0.32, 0.62, -0.72], 0.09, m.chrome, t);
  ell(0.2, m.paint2, 0, 0.92, -0.85, t, 1, 0.75, 1.5);
  box(0.02, 0.1, 0.5, m.accent, 0.2, 0.92, -0.85, t); box(0.02, 0.1, 0.5, m.accent, -0.2, 0.92, -0.85, t);
  box(0.3, 0.08, 0.55, m.dark, 0, 0.64, 0.1, t);
  limb([0, 0.66, 0.35], [0, 1.28, 0.6], 0.02, m.chrome, t);
  box(0.3, 0.2, 0.04, m.dark, 0, 1.15, 0.58, t);
  for (const sd of [-1, 1]) limb([sd * 0.06, 0, -wb], [sd * 0.06, 1.1, -1.2], 0.03, m.chrome, t);
  ell(0.11, m.chrome, 0, 1.02, -1.3, t, 1, 1, 0.8); ball(0.075, m.lamp, 0, 1.02, -1.38, t);
  limb([-0.12, 1.18, -1.2], [-0.4, 1.58, -1.3], 0.02, m.chrome, t);
  limb([0.12, 1.18, -1.2], [0.4, 1.58, -1.3], 0.02, m.chrome, t);
  limb([0.2, 0.18, -0.5], [0.26, 0.2, 0.9], 0.06, m.chrome, t);
  limb([0.24, 0.3, -0.5], [0.3, 0.3, 0.85], 0.05, m.chrome, t);
  box(0.12, 0.04, 0.35, m.paint, 0, 0.44, -wb, t);
  box(0.18, 0.05, 0.04, m.tail, 0, 0.6, 0.64, t);
  const spec = { wb, R: 0.36, Rf: 0.33, rw: 0.32, fw: 0.1, sa: 0.12, peg: [0.18, -0.95], bar: [0.4, 1.58, -1.3], tail: [0.6, 0.2] };
  details(t, m, spec);
  spec.P = { hip: [0.72, 0.1], chest: [1.2, 0.32], head: [1.45, 0.38], hand: [0.4, 1.58, -1.3], knee: [0.66, -0.55], foot: [0.18, -0.95] };
  return spec;
}
const BUILDERS = [(t, m) => sport(t, m, false), (t, m) => sport(t, m, true), naked, motard, chopper];

/* ---------- piloto / pilota ---------- */
function buildRider(look, m, P) {
  const g = new THREE.Group(), t = new THREE.Group();
  const fem = !look.sex, w = fem ? 0.92 : 1.1;
  const [hy, hz] = P.hip, [cy, cz] = P.chest, [hdy, hdz] = P.head, [hx, hhy, hhz] = P.hand, [ky, kz] = P.knee, [fy, fz] = P.foot;
  const pad = look.suitStyle === 2 ? m.stripe : m.suit2;
  // pelvis, cintura y torso
  ell(0.17 * w, m.suit, 0, hy, hz - 0.03, t, 1.05, 0.8, 1);
  box(0.3 * w, 0.035, 0.22, m.stripe, 0, hy + 0.07, hz - 0.08, t).rotation.x = Math.atan2(cy - hy, hz - cz) - 1.57;
  taper([0, hy + 0.04, hz - 0.06], [0, cy - 0.05, cz + 0.04], fem ? 0.11 : 0.13, fem ? 0.145 : 0.165, m.suit, t);
  ell(0.15 * w, m.suit, 0, cy - 0.02, cz + 0.02, t, 1.1, 0.85, 1);
  for (let i = 0; i < 3; i++) { // protector de espalda en segmentos
    const f = 0.25 + i * 0.28;
    ell(0.12, m.suit2, 0, hy + (cy - hy) * f + 0.1, hz + (cz - hz) * f + 0.1 + i * 0.01, t, 1.05 - i * 0.08, 0.5, 1.15);
  }
  ell(0.085, m.suit2, 0, cy + 0.03, cz + 0.02, t, 1.2, 1, 0.9); // cuello del traje
  const knees = [];
  for (const sd of [-1, 1]) {
    const sx = sd * 0.205 * w, sy = cy - 0.015, sz = cz + 0.02;
    ball(0.092 * w, pad, sx, sy, sz, t);
    const el = [sd * 0.34 * w, (cy + hhy) / 2 - 0.05, (cz + hhz) / 2];
    taper([sx, sy, sz], el, 0.07 * w, 0.058 * w, m.suit, t); ell(0.06 * w, pad, el[0], el[1], el[2], t, 1, 1, 0.8);
    taper(el, [sd * hx, hhy + 0.01, hhz + 0.02], 0.056 * w, 0.044 * w, m.suit, t);
    box(0.07, 0.035, 0.05, m.glove, sd * (hx - 0.01), hhy + 0.012, hhz + 0.05, t);                     // puño
    box(0.1, 0.045, 0.09, m.glove, sd * hx, hhy, hhz, t);                                              // palma
    for (let i = 0; i < 4; i++) box(0.018, 0.026, 0.075, m.glove, sd * (hx - 0.035 + i * 0.024), hhy - 0.03, hhz - 0.045, t); // dedos
    const hipj = [sd * 0.13 * w, hy - 0.01, hz - 0.01], knee = [sd * 0.27 * w, ky, kz], foot = [sd * 0.25 * w, fy, fz];
    taper(hipj, knee, 0.12 * w, 0.086 * w, m.suit, t);
    ell(0.088 * w, pad, knee[0] + sd * 0.01, knee[1] + 0.02, knee[2] - 0.03, t, 1, 1, 1.1);
    taper(knee, foot, 0.078 * w, 0.056 * w, m.suit, t);
    ell(0.062, m.suit2, foot[0], foot[1] + 0.02, foot[2] - 0.01, t, 1, 1.2, 1);                         // tobillera
    box(0.105, 0.1, 0.27, m.glove, foot[0], foot[1] - 0.04, foot[2] - 0.08, t);                          // bota
    box(0.11, 0.025, 0.29, m.rubber, foot[0], foot[1] - 0.1, foot[2] - 0.08, t);                         // suela
    box(0.05, 0.03, 0.05, m.stripe, foot[0], foot[1] - 0.05, foot[2] - 0.22, t);                         // punta
    const ks = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 12), m.stripe);            // deslizador de rodilla
    ks.rotation.z = Math.PI / 2; ks.position.set(sd * (0.27 * w + 0.095), ky, kz); t.add(ks);
    knees.push(new THREE.Vector3(sd * (0.27 * w + 0.11), ky, kz));
    if (look.suitStyle === 1) {
      limb([sd * 0.17 * w, hy + 0.04, hz - 0.06], [sd * 0.19 * w, cy - 0.04, cz + 0.03], 0.017, m.stripe, t);
      limb([sd * 0.28 * w, hy - 0.01, hz], [sd * 0.37 * w, ky, kz], 0.016, m.stripe, t);
      limb([sx + sd * 0.05, sy - 0.02, sz], [el[0] + sd * 0.04, el[1], el[2]], 0.014, m.stripe, t);
    }
  }
  const body = merge(t);
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(body);

  // cabeza (casco) separada para poder girarla
  const headG = new THREE.Group(); headG.position.set(0, hdy, hdz);
  const h = new THREE.Group();
  ell(0.17, m.helm, 0, 0, 0, h, 1, 0.96, 1.2);
  caps(0.1, 0.1, m.helm, 0, -0.1, -0.13, h, 1.05, 0.8, 0.9);                                              // mentonera
  box(0.07, 0.025, 0.02, m.dark, 0, -0.12, -0.23, h);                                                      // rejilla
  ell(0.128, m.visor, 0, 0.0, -0.1, h, 1.06, 0.7, 1);                                                      // visera
  box(0.27, 0.02, 0.025, m.dark, 0, 0.065, -0.17, h);                                                      // marco superior
  ell(0.02, m.silver, 0.155, 0.0, -0.12, h, 1, 1, 1); ell(0.02, m.silver, -0.155, 0.0, -0.12, h, 1, 1, 1); // tornillos
  box(0.1, 0.012, 0.07, m.dark, 0, 0.158, -0.02, h); box(0.1, 0.012, 0.05, m.dark, 0, 0.15, 0.1, h);     // ventilaciones
  box(0.2, 0.03, 0.12, m.helm, 0, 0.0, 0.2, h).rotation.x = -0.45;                                        // alerón trasero
  ell(0.1, m.suit2, 0, -0.14, 0.03, h, 1.2, 0.5, 1.1);                                                     // cuello
  if (look.helmStyle === 1) box(0.05, 0.01, 0.4, m.stripe, 0, 0.163, 0.02, h);
  if (look.helmStyle === 2) for (let i = 0; i < 5; i++) box(0.018, 0.075 - Math.abs(i - 2) * 0.012, 0.05, m.stripe, 0, 0.15 + (2 - Math.abs(i - 2)) * 0.012, 0.13 - i * 0.065, h);
  const hm = merge(h);
  hm.traverse(o => { if (o.isMesh) o.castShadow = true; });
  headG.add(hm);
  const joints = [];
  if (fem) { // coleta animada
    const tail = new THREE.Group(); tail.position.set(0, -0.04, 0.17);
    let parent = tail;
    for (let i = 0; i < 3; i++) {
      const j = new THREE.Group(); if (i > 0) j.position.y = -0.1;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04 - 0.008 * i, 0.03 - 0.008 * i, 0.11, 8), m.hair);
      seg.position.y = -0.055; j.add(seg); parent.add(j); joints.push(j); parent = j;
    }
    headG.add(tail);
  }
  g.add(headG);

  // letrero con el nombre en la espalda
  const dy = cy - hy, dz = cz - hz, len = Math.hypot(dy, dz) || 1;
  const ny = -dz / len, nz = dy / len, r = 0.16 * w + 0.02;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshBasicMaterial({ map: backTex(NAMES[look.name] || NAMES[0], PAL.stripe[look.stripe]) }));
  plate.position.set(0, (hy + cy) / 2 + ny * r + 0.04, (hz + cz) / 2 + nz * r + 0.06);
  plate.rotation.x = Math.atan2(-ny, nz);
  g.add(plate);
  return { group: g, headG, joints, knees };
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
  const rW = makeWheel(pitchG, m, 0, def.R, def.rw, 0, false);
  const fW = makeWheel(pitchG, m, -def.wb, def.Rf, def.fw, def.Rf - def.R, true);
  const rider = buildRider(look, m, def.P);
  pitchG.add(rider.group);
  const [hx, hy, hz] = def.P.hand;
  return {
    leanG, pitchG, rW, fW, riderG: rider.group, headG: rider.headG, joints: rider.joints, knees: rider.knees,
    exhaust: new THREE.Vector3(0.22, 0.3, 0.6),
    trails: [new THREE.Vector3(-hx - 0.05, hy, hz), new THREE.Vector3(hx + 0.05, hy, hz)],
    frontWheel: new THREE.Vector3(0, -def.R + 0.1, -def.wb),
  };
}

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

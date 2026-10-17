import * as THREE from 'three';
import { box, ball, limb, caps, ell, merge, loft, tube, liveryTex, carbonTex, tireTex, decalTex } from './geo.js';
import { PAL } from './data.js';
import { buildRider } from './rider.js';

const S = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide, ...extra });
const hdr = (r, g, b) => { const m = new THREE.MeshBasicMaterial({ toneMapped: false }); m.color.setRGB(r, g, b); return m; };
const PHm = (o) => new THREE.MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide, ...o });

let UPS_CUR = [0, 0, 0, 0];

function makeMats(look, variant) {
  const pc = PAL.paint[look.paint], ac = PAL.accent[look.accent];
  const tire = tireTex(); tire.repeat.set(30, 1);
  return {
    paint: PHm({ map: liveryTex(pc, ac, variant === 1), color: 0xffffff, metalness: 0.7, roughness: 0.22, envMapIntensity: 1.4 }),
    paint2: PHm({ color: pc, metalness: 0.85, roughness: 0.16, envMapIntensity: 1.3 }),
    seatM: S(0x15151a, 0.1, 0.7), accent: S(ac, 0.35, 0.35, { emissive: ac, emissiveIntensity: 0.2 }),
    rim: S(PAL.rim[look.rim], 1, 0.2), dark: S(0x101014, 0.7, 0.3), silver: S(0xc8ccd4, 1, 0.2), chrome: S(0xeef2f8, 1, 0.06),
    carbon: S(0xffffff, 0.5, 0.35, { map: carbonTex() }), white: S(0xf2f2f2, 0.3, 0.4),
    tire: S(0xffffff, 0, 0.9, { map: tire }),
    blue: S(0x2a7bff, 0.8, 0.25, { emissive: 0x0a3a99, emissiveIntensity: 0.4 }), blueLed: hdr(0.3, 1.4, 4), gold: S(0xd4a017, 1, 0.25),
    caliper: S(0xe02020, 0.4, 0.4, { emissive: 0x400000, emissiveIntensity: 0.3 }),
    lamp: hdr(4, 3.5, 2.2), tail: hdr(3, 0.08, 0.08), amber: hdr(3.2, 1.3, 0),
    wscreen: S(0x0b141c, 1, 0.05, { transparent: true, opacity: 0.55 }),
  };
}

/* ---------- ruedas: neumático con dibujo, llanta, radios y discos ---------- */
function makeWheel(parent, m, z, R, w, dy, front, ag = 0) {
  const wr = new THREE.Group(); wr.position.set(0, dy, z);
  const g = new THREE.Group(), V = (x, y) => new THREE.Vector2(x, y);
  const tire = new THREE.LatheGeometry([V(R * 0.64, -w * 0.5), V(R * 0.86, -w * 0.52), V(R * 0.96, -w * 0.42), V(R * 0.995, -w * 0.25), V(R, 0), V(R * 0.995, w * 0.25), V(R * 0.96, w * 0.42), V(R * 0.86, w * 0.52), V(R * 0.64, w * 0.5)], 36);
  tire.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(tire, m.tire));
  const rim = new THREE.LatheGeometry([V(R * 0.48, -w * 0.36), V(R * 0.64, -w * 0.4), V(R * 0.66, -w * 0.3), V(R * 0.62, w * 0.3), V(R * 0.64, w * 0.4), V(R * 0.48, w * 0.36)], 30);
  rim.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(rim, m.rim));
  const back = new THREE.CylinderGeometry(R * 0.5, R * 0.5, w * 0.4, 24); back.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(back, m.dark));
  for (let k = 0; k < 5; k++) { // 5 radios
    const a = k * Math.PI * 2 / 5, sp = box(w * 0.42, 0.04, R * 0.5, m.rim, 0, Math.sin(a) * R * 0.3, Math.cos(a) * R * 0.3, g);
    sp.rotation.x = -a;
  }
  const hub = new THREE.CylinderGeometry(R * 0.13, R * 0.13, w * 0.95, 14); hub.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(hub, m.silver));
  for (const sx of (front ? [-1, 1] : [1])) {
    const d = new THREE.CylinderGeometry(R * (0.54 + 0.02 * ag), R * (0.54 + 0.02 * ag), 0.012, 28); d.rotateZ(Math.PI / 2); d.translate(sx * (w * 0.5 + 0.02), 0, 0);
    g.add(new THREE.Mesh(d, m.silver));
    const d2 = new THREE.CylinderGeometry(R * 0.3, R * 0.3, 0.016, 16); d2.rotateZ(Math.PI / 2); d2.translate(sx * (w * 0.5 + 0.02), 0, 0);
    g.add(new THREE.Mesh(d2, m.dark));
  }
  const mm = merge(g);
  mm.traverse(o => { if (o.isMesh) o.castShadow = true; });
  wr.add(mm); wr.userData.R = R; parent.add(wr); return wr;
}

/* ---------- construcción común ---------- */
const rows = a => a.map(([z, y, w, h, n]) => ({ z, y, a: w, b: h, n: n || 2.5 }));
const L = (t, a, mat, seg = 18) => { const me = new THREE.Mesh(loft(rows(a), seg), mat); t.add(me); return me; };
const decal = (t, text, color, w, h, x, y, z) => {
  const mat = new THREE.MeshBasicMaterial({ map: decalTex(text, color), transparent: true, polygonOffset: true, polygonOffsetFactor: -4 });
  for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.position.set(sd * x, y, z); p.rotation.y = sd * Math.PI / 2; t.add(p); }
};
/* ---------- mejoras visibles: cada nivel añade piezas a la moto ---------- */
function upgrades(t, m, o) {
  const [mo, ni, ag, eq] = UPS_CUR, ye = o.engZ;
  if (mo >= 1) box(0.05, 0.03, 0.4, m.carbon, 0.205, 0.27, 0.2, t).rotation.x = -0.2;                       // protector térmico de carbono
  if (mo >= 2) {                                                                                           // segundo silenciador
    caps(0.055, 0.4, m.chrome, -0.2, 0.19, 0.4, t).rotation.x = -0.2;
    t.add(new THREE.Mesh(tube([[-0.1, -0.02, ye - 0.3], [-0.16, -0.04, ye + 0.2], [-0.18, 0.03, ye + 0.55], [-0.2, 0.12, 0.15]], [0.026, 0.028, 0.032, 0.04], 10, 1, 14), m.chrome));
  }
  if (mo >= 3) {                                                                                           // admisión de carbono sobre el depósito
    const st = o.up.reduce((a, b) => Math.abs(b[0] + 0.8) < Math.abs(a[0] + 0.8) ? b : a);
    box(0.2, 0.02, 0.26, m.carbon, 0, st[1] + st[3] + 0.008, st[0], t);
  }
  if (mo >= 4) for (const sd of [-1, 1]) ell(0.09, m.accent, sd * 0.17, 0.1, ye + 0.05, t, 0.35, 1.1, 1.1);   // tapas de motor de color
  if (mo >= 5) t.add(new THREE.Mesh(tube([[0.1, -0.02, ye - 0.3], [0.16, -0.04, ye + 0.2]], [0.034, 0.034], 8, 1, 8), m.amber)); // colector incandescente
  for (let i = 0; i < ni; i++) {                                                                           // botellas de nitro en la cola
    const sd = i % 2 ? 1 : -1, row = Math.floor(i / 2);
    caps(0.04, 0.22, m.blue, sd * 0.15, o.tail[0] - 0.02, o.tail[1] - 0.25 + row * 0.15, t);
    box(0.09, 0.01, 0.03, m.accent, sd * 0.15, o.tail[0] + 0.02, o.tail[1] - 0.25 + row * 0.15, t);
  }
  if (ni >= 3) for (const sd of [-1, 1]) box(0.01, 0.012, 0.7, m.blueLed, sd * 0.215, 0.12, ye - 0.1, t);   // luz azul
  if (ag >= 2) limb([0, 0.5, -0.32], [0, 0.14, -0.53], 0.042, m.gold, t);                                  // muelle dorado
  if (ag >= 3) for (const sd of [-1, 1]) limb([sd * 0.1, 0.3, -o.wb + 0.13], [sd * 0.1, 0, -o.wb], 0.027, m.gold, t); // horquilla dorada
  if (eq >= 1) {                                                                                           // barra anti-caballito
    for (const sd of [-1, 1]) t.add(new THREE.Mesh(tube([[sd * 0.1, 0.06, 0.02], [sd * 0.1, -0.02, 0.4], [sd * 0.1, -0.12, 0.72]], [0.014, 0.014, 0.014], 6, 1, 10), m.carbon));
    const w = new THREE.CylinderGeometry(0.07, 0.07, 0.07 + eq * 0.01, 12); w.rotateZ(Math.PI / 2); w.translate(0, -0.26, 0.74); t.add(new THREE.Mesh(w, m.dark));
  }
  if (eq >= 2) limb([-0.1, -0.12, 0.72], [0.1, -0.12, 0.72], 0.013, m.carbon, t);
  if (eq >= 3) for (const sd of [-1, 1]) ell(0.04, m.accent, sd * 0.1, -0.2, 0.72, t, 1, 1, 1);
  if (eq >= 4) box(0.1, 0.035, 0.035, m.accent, 0.07, o.ft[0] + 0.01, o.ft[1] + 0.08, t);                    // amortiguador de dirección
  if (eq >= 5) box(0.01, 0.18, 0.3, m.carbon, 0, o.tail[0] + 0.18, o.tail[1] + 0.1, t);                      // aleta aerodinámica
}
function core(t, m, o) {
  L(t, o.up, m.paint); if (o.low) L(t, o.low, m.paint2); L(t, o.seat, m.seatM, 12);
  box(0.26, 0.26, 0.4, m.dark, 0, 0.12, o.engZ, t);
  for (let i = 0; i < 4; i++) box(0.3, 0.012, 0.36, m.silver, 0, 0.17 + i * 0.035, o.engZ, t);
  for (const sd of [-1, 1]) {
    ell(0.07, m.silver, sd * 0.15, 0.1, o.engZ + 0.05, t, 0.3, 1, 1);
    tube([[sd * 0.1, o.ft[0] - 0.02, o.ft[1] + 0.05], [sd * 0.12, 0.3, o.engZ - 0.1], [sd * 0.1, 0.08, o.engZ + 0.2]], [0.014, 0.014, 0.014], 6, 1, 10).type;
  }
  for (const sd of [-1, 1]) {
    t.add(new THREE.Mesh(tube([[sd * 0.1, o.ft[0] - 0.02, o.ft[1] + 0.05], [sd * 0.12, 0.3, o.engZ - 0.1], [sd * 0.1, 0.08, o.engZ + 0.2]], [0.014, 0.014, 0.014], 6, 1, 10), m.accent));
    t.add(new THREE.Mesh(tube([[sd * 0.09, 0.08, -0.5], [sd * 0.1, 0.05, -0.25], [sd * (o.rw / 2 + 0.04), 0, 0]], [0.03, 0.026, 0.02], 8, 1, 10), m.silver));
    limb([sd * 0.1, o.ft[0], o.ft[1]], [sd * 0.1, 0.28, -o.wb + 0.12], 0.026, m.accent, t);
    limb([sd * 0.1, 0.3, -o.wb + 0.13], [sd * 0.1, 0, -o.wb], 0.02, m.silver, t);
    t.add(new THREE.Mesh(tube([[sd * 0.1, o.ft[0] - 0.02, o.ft[1]], [sd * 0.2, o.bar[1] + 0.01, o.bar[2] + 0.05], [sd * o.bar[0], o.bar[1], o.bar[2]]], [0.012, 0.012, 0.012], 8, 1, 10), m.dark));
    limb([sd * (o.bar[0] - 0.03), o.bar[1], o.bar[2]], [sd * (o.bar[0] + 0.05), o.bar[1], o.bar[2]], 0.018, m.dark, t);
  }
  t.add(new THREE.Mesh(tube([[0, 0.55, -0.3], [0, 0.1, -0.55]], [0.02, 0.02], 8, 1, 6), m.accent));
  t.add(new THREE.Mesh(tube([[0.1, -0.02, o.engZ - 0.3], [0.16, -0.04, o.engZ + 0.2], [0.18, 0.03, o.engZ + 0.55], [0.2, 0.12, 0.15]], [0.028, 0.03, 0.035, 0.045], 10, 1, 14), m.chrome));
  caps(0.06, 0.42, m.chrome, 0.2, 0.19, 0.4, t).rotation.x = -0.2;
  box(0.1, 0.1, 0.01, m.dark, 0.2, 0.2, 0.74, t);
  box(0.3, 0.03, 0.06, m.dark, 0, o.ft[0], o.ft[1], t);
  ell(0.16, m.paint2, 0, o.Rf - o.R + o.Rf + 0.045, -o.wb, t, 0.9, 0.35, 2.0);
  box(0.18, 0.05, 0.04, m.tail, 0, o.tail[0] + 0.03, o.tail[1] + 0.34, t);
  // detalles: estriberas, matrícula, intermitentes, espejos, pinzas, cadena
  const sides = [-1, 1], cxp = -(o.rw / 2 + 0.07);
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 16), m.silver); sp.rotation.z = Math.PI / 2; sp.position.set(cxp, 0, 0); t.add(sp);
  limb([cxp, 0.1, 0], [cxp, 0.09, -0.6], 0.01, m.dark, t); limb([cxp, -0.1, 0], [cxp, 0.0, -0.6], 0.01, m.dark, t);
  for (const sd of sides) {
    limb([sd * 0.2, o.peg[0], o.peg[1]], [sd * 0.3, o.peg[0], o.peg[1]], 0.012, m.silver, t); box(0.12, 0.02, 0.035, m.dark, sd * 0.3, o.peg[0], o.peg[1], t);
    ball(0.022, m.amber, sd * 0.12, o.tail[0] + 0.02, o.tail[1] + 0.3, t);
    limb([sd * (o.bar[0] - 0.05), o.bar[1] + 0.02, o.bar[2] - 0.02], [sd * (o.bar[0] + 0.02), o.bar[1] + 0.16, o.bar[2] - 0.04], 0.008, m.dark, t);
    box(0.12, 0.065, 0.015, m.dark, sd * (o.bar[0] + 0.04), o.bar[1] + 0.18, o.bar[2] - 0.05, t).rotation.y = sd * 0.2;
    box(0.035, 0.1, 0.12, UPS_CUR[2] >= 1 ? m.caliper : m.accent, sd * (o.fw / 2 + 0.035), o.Rf - o.R + o.Rf * 0.5, -o.wb + 0.05, t);
  }
  box(0.2, 0.11, 0.008, m.white, 0, o.tail[0] - 0.06, o.tail[1] + 0.36, t).rotation.x = -0.6;
  box(0.03, 0.07, 0.09, UPS_CUR[2] >= 1 ? m.caliper : m.accent, o.rw / 2 + 0.035, 0.14, -0.1, t);
  if (o.decal) decal(t, o.decal[0], o.decal[1], o.decal[2], o.decal[3], o.decal[4], o.decal[5], o.decal[6]);
  upgrades(t, m, o);
}

/* ---------- 5 estilos (metros reales; eje trasero = origen; z negativo = adelante) ---------- */
function superbike(t, m, v) {
  const up = [[-1.62, .36, .06, .05, 2.8], [-1.5, .40, .15, .11], [-1.3, .46, .21, .17], [-1.1, .50, .24, .21], [-0.9, .54, .22, .20], [-0.7, .52, .19, .13], [-0.45, .50, .18, .09], [-0.2, .45, .14, .06], [0.1, .46, .12, .08], [0.4, .50, .10, .08], [0.62, .53, .05, .05, 2.8]];
  if (v) { up[8][1] += 0.03; up[9][1] += 0.03; up[9][3] += 0.015; }
  const o = {
    up, low: [[-1.35, .28, .15, .08], [-1.0, .18, .22, .13], [-0.6, .10, .20, .12], [-0.2, .10, .14, .08]], seat: [[-0.55, .5, .15, .032], [-0.2, .49, .14, .035], [0.15, .5, .1, .03]],
    wb: 1.45, R: 0.33, Rf: 0.33, rw: 0.19, fw: 0.12, ft: [0.58, -1.2], bar: [0.3, 0.6, -1.12], peg: [0.02, -0.55], tail: [0.5, 0.3], engZ: -0.75,
    decal: v ? ['TRUENO GP', '#ffffff', 0.5, 0.12, 0.25, 0.5, -0.95] : ['NINJA H2R', '#2bff6a', 0.5, 0.12, 0.25, 0.5, -0.95],
  };
  core(t, m, o);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), m.wscreen); ws.position.set(0, 0.78, -1.22); ws.rotation.x = 1.0; t.add(ws);
  ell(0.07, m.dark, 0, 0.4, -1.6, t, 1.6, 0.8, 0.35);                              // toma de aire frontal
  for (const sd of [-1, 1]) {
    ell(0.045, m.lamp, sd * 0.11, 0.47, -1.52, t, 2.0, 0.55, 0.7);                 // faros
    ball(0.02, m.amber, sd * 0.2, 0.43, -1.42, t);
    if (!v) for (let i = 0; i < 2; i++) { box(0.3, 0.012, 0.11, m.carbon, sd * 0.3, 0.5 + i * 0.07, -1.2, t).rotation.z = sd * (0.12 + i * 0.05); box(0.012, 0.09, 0.1, m.carbon, sd * 0.44, 0.52 + i * 0.07, -1.2, t); }
    for (let i = 0; i < 4; i++) box(0.006, 0.014, 0.1, m.dark, sd * 0.2, 0.24 + i * 0.025, -0.9, t);  // salidas de aire
  }
  if (v) box(0.22, 0.012, 0.3, m.accent, 0, 0.55, 0.15, t);
  return { wb: o.wb, R: o.R, Rf: o.Rf, rw: o.rw, fw: o.fw, P: { hip: [-0.45, 0.58], sh: [-0.82, 0.93], head: [-0.95, 1.1], hand: [0.3, 0.6, -1.12], knee: [-0.82, 0.46], ank: [-0.55, 0.08] } };
}
function naked(t, m) {
  const o = {
    up: [[-1.0, .5, .15, .08], [-0.85, .55, .17, .12], [-0.65, .54, .18, .12], [-0.4, .5, .16, .08], [-0.15, .46, .13, .05], [0.1, .47, .11, .07], [0.4, .52, .08, .07], [0.6, .55, .04, .04, 2.8]],
    seat: [[-0.5, .5, .15, .03], [-0.2, .49, .14, .035], [0.12, .5, .1, .03]], wb: 1.4, R: 0.33, Rf: 0.33, rw: 0.19, fw: 0.12,
    ft: [0.6, -1.12], bar: [0.38, 0.7, -0.98], peg: [0.02, -0.52], tail: [0.52, 0.3], engZ: -0.7, decal: ['FURIA', '#ffffff', 0.4, 0.1, 0.19, 0.55, -0.7],
  };
  core(t, m, o);
  ell(0.14, m.dark, 0, 0.6, -1.25, t, 1, 1, 0.8); ball(0.1, m.lamp, 0, 0.6, -1.33, t);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.2), m.wscreen); ws.position.set(0, 0.76, -1.2); ws.rotation.x = 0.7; t.add(ws);
  box(0.28, 0.24, 0.08, m.dark, 0, 0.3, -1.1, t); for (let i = 0; i < 4; i++) box(0.3, 0.01, 0.01, m.silver, 0, 0.22 + i * 0.05, -1.15, t);
  return { wb: o.wb, R: o.R, Rf: o.Rf, rw: o.rw, fw: o.fw, P: { hip: [-0.4, 0.58], sh: [-0.62, 1.02], head: [-0.68, 1.2], hand: [0.38, 0.7, -0.98], knee: [-0.78, 0.45], ank: [-0.55, 0.08] } };
}
function motard(t, m) {
  const o = {
    up: [[-1.05, .72, .14, .08], [-0.9, .75, .16, .11], [-0.65, .73, .16, .1], [-0.4, .68, .13, .07], [-0.1, .62, .12, .05], [0.3, .66, .09, .05], [0.62, .7, .05, .04, 2.8]],
    seat: [[-0.4, .6, .14, .03], [-0.05, .6, .13, .035], [0.35, .64, .1, .03]], wb: 1.5, R: 0.35, Rf: 0.35, rw: 0.17, fw: 0.14,
    ft: [0.78, -1.15], bar: [0.42, 0.76, -1.0], peg: [0.04, -0.5], tail: [0.66, 0.4], engZ: -0.7, decal: ['SALVAJE', '#ffffff', 0.4, 0.1, 0.17, 0.78, -0.65],
  };
  core(t, m, o);
  box(0.3, 0.3, 0.04, m.paint, 0, 0.78, -1.3, t).rotation.x = 0.25; box(0.16, 0.14, 0.05, m.accent, 0, 0.78, -1.33, t).rotation.x = 0.25;
  ball(0.07, m.lamp, 0, 0.55, -1.36, t);
  return { wb: o.wb, R: o.R, Rf: o.Rf, rw: o.rw, fw: o.fw, P: { hip: [-0.38, 0.68], sh: [-0.6, 1.12], head: [-0.66, 1.3], hand: [0.42, 0.76, -1.0], knee: [-0.75, 0.55], ank: [-0.5, 0.12] } };
}
function chopper(t, m) {
  const o = {
    up: [[-0.85, .5, .12, .08], [-0.65, .53, .15, .1], [-0.4, .5, .14, .08], [-0.2, .44, .1, .05, 2.8]],
    seat: [[-0.35, .3, .14, .03], [-0.05, .29, .14, .035], [0.25, .32, .1, .03]], wb: 1.85, R: 0.36, Rf: 0.33, rw: 0.3, fw: 0.1,
    ft: [0.9, -1.4], bar: [0.38, 1.0, -0.78], peg: [0.05, -0.85], tail: [0.34, 0.2], engZ: -0.7, decal: ['DIABLO', '#ff8a2a', 0.4, 0.1, 0.16, 0.52, -0.62],
  };
  core(t, m, o);
  box(0.34, 0.04, 0.5, m.paint, 0, 0.5, 0.2, t).rotation.x = -0.1;
  limb([0, 0.34, 0.35], [0, 0.9, 0.55], 0.02, m.chrome, t); box(0.3, 0.2, 0.04, m.seatM, 0, 0.82, 0.54, t);
  ell(0.1, m.chrome, 0, 0.95, -1.42, t, 1, 1, 0.8); ball(0.075, m.lamp, 0, 0.95, -1.5, t);
  return { wb: o.wb, R: o.R, Rf: o.Rf, rw: o.rw, fw: o.fw, P: { hip: [-0.1, 0.34], sh: [0.02, 0.86], head: [0.08, 1.04], hand: [0.35, 1.0, -0.78], knee: [-0.55, 0.38], ank: [-0.9, 0.1] } };
}
const BUILDERS = [(t, m) => superbike(t, m, 0), (t, m) => superbike(t, m, 1), naked, motard, chopper];

export function buildBike(style, look, ups) {
  UPS_CUR = ups || [0, 0, 0, 0];
  const ag = UPS_CUR[2];
  const m = makeMats(look, style === 1 ? 1 : 0);
  const leanG = new THREE.Group(), pitchG = new THREE.Group();
  leanG.add(pitchG);
  const t = new THREE.Group();
  const def = (BUILDERS[style] || BUILDERS[0])(t, m);
  pitchG.position.y = def.R;
  const body = merge(t);
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  pitchG.add(body);
  const rW = makeWheel(pitchG, m, 0, def.R, def.rw * (1 + 0.07 * ag), 0, false, ag);
  const fW = makeWheel(pitchG, m, -def.wb, def.Rf, def.fw * (1 + 0.05 * ag), def.Rf - def.R, true, ag);
  const rider = buildRider(look, def.P);
  pitchG.add(rider.group);
  const [hx, hy, hz] = def.P.hand;
  return {
    tailMat: m.tail, leanG, pitchG, rW, fW, riderG: rider.group, headG: rider.headG, joints: rider.joints, knees: rider.knees,
    exhaust: new THREE.Vector3(0.2, 0.2, 0.62),
    trails: [new THREE.Vector3(-hx - 0.05, hy, hz), new THREE.Vector3(hx + 0.05, hy, hz)],
    frontWheel: new THREE.Vector3(0, -def.R + 0.1, -def.wb),
  };
}

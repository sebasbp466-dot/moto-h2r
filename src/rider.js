import * as THREE from 'three';
import { box, ell, merge, tube, leatherTex, helmetTex, backTex, PHYS } from './geo.js';
import { PAL, VISORS, NAMES } from './data.js';

const S = (color, metal, rough, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// P: { hip:[z,y], sh:[z,y], head:[z,y], hand:[x,y,z], knee:[z,y], ank:[z,y] }  (metros reales, eje trasero = origen)
export function buildRider(look, P) {
  const fem = !look.sex, k = fem ? 0.93 : 1.05;
  const sc = PAL.suit[look.suit], st = PAL.stripe[look.stripe];
  const suit = S(0xffffff, 0.05, 0.5, { map: leatherTex(sc, st, look.suitStyle), side: THREE.DoubleSide });
  const dark = S(0x121214, 0.1, 0.55), rubber = S(0x08080a, 0.1, 0.85);
  const pads = S(look.suitStyle === 2 ? st : 0x1c1c20, 0.25, 0.45);
  const stripe = S(st, 0.2, 0.4, { emissive: st, emissiveIntensity: 0.12 });
  const hair = S(PAL.hair[look.hair], 0.1, 0.65);
  const helm = PHYS({ map: helmetTex(PAL.helmet[look.helmet], st, look.helmStyle), metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 });
  const vz = VISORS[look.visor] || VISORS[0];
  const visor = S(vz.c, vz.metal, vz.rough, { side: THREE.DoubleSide });
  const g = new THREE.Group(), t = new THREE.Group();
  const [hz, hy] = P.hip, [sz, sy] = P.sh, [hdz, hdy] = P.head, [hx, hhy, hhz] = P.hand, [kz, ky] = P.knee, [az, ay] = P.ank;
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };

  // torso con cintura y pecho
  const m1 = lerp2(P.hip, P.sh, 0.38), m2 = lerp2(P.hip, P.sh, 0.75);
  mesh(tube([[0, hy + 0.01, hz], [0, m1[1], m1[0]], [0, m2[1], m2[0]], [0, sy + 0.02, sz]], [[0.17 * k, 0.125], [0.142 * k, 0.11], [0.19 * k, 0.13], [0.165 * k, 0.105]], 14, 1.2), suit, t);
  ell(0.16 * k, suit, 0, hy - 0.01, hz, t, 1.1, 0.8, 1.05);
  ell(0.13 * k, suit, 0, sy + 0.03, sz + 0.1, t, 1.1, 0.65, 1.3);                      // joroba / protector de espalda
  ell(0.07 * k, pads, 0, sy + 0.06, sz + 0.12, t, 1.3, 0.4, 1.5);
  const knees = [];
  for (const sd of [-1, 1]) {
    const S0 = [sd * 0.2 * k, sy, sz], H = [sd * hx, hhy, hhz];
    const E = [sd * (0.27 * k + 0.07), (S0[1] + H[1]) / 2 - 0.07, (S0[2] + H[2]) / 2 + 0.02];
    ell(0.08 * k, suit, S0[0], S0[1], S0[2], t, 1, 1, 1);
    ell(0.072, pads, S0[0] + sd * 0.01, S0[1] + 0.045, S0[2], t, 1.25, 0.45, 1.15);   // hombrera
    mesh(tube([S0, E, [H[0], H[1] + 0.02, H[2] + 0.04]], [0.062 * k, 0.052 * k, 0.04 * k], 12, 1), suit, t);
    ell(0.056, pads, E[0] + sd * 0.01, E[1] + 0.01, E[2], t, 0.9, 1, 1);                // codera
    ell(0.05, dark, H[0], H[1], H[2], t, 1.05, 0.6, 1.25);                              // palma
    for (let i = 0; i < 4; i++) { // dedos agarrando el manillar
      const fx = H[0] + (i - 1.5) * 0.022;
      mesh(tube([[fx, H[1] + 0.03, H[2] + 0.05], [fx, H[1] + 0.02, H[2] - 0.03], [fx, H[1] - 0.03, H[2] - 0.03]], [0.013, 0.012, 0.011], 6, 1, 8), dark, t);
    }
    mesh(tube([[H[0] - sd * 0.045, H[1] + 0.01, H[2] + 0.02], [H[0] - sd * 0.05, H[1] - 0.02, H[2] - 0.035]], [0.014, 0.012], 6, 1, 6), dark, t);
    // pierna: cadera - rodilla - tobillo en un solo tubo (curva suave)
    const hipS = [sd * 0.115 * k, hy, hz], kn = [sd * 0.21, ky, kz], an = [sd * 0.17, ay, az];
    mesh(tube([hipS, kn, an], [0.105 * k, 0.082 * k, 0.052 * k], 12, 1.4, 26), suit, t);
    ell(0.075, pads, kn[0] + sd * 0.025, kn[1] + 0.005, kn[2] - 0.035, t, 0.75, 1, 1.05);   // rodillera
    const ks = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.022, 14), stripe, t);        // deslizador
    ks.rotation.z = Math.PI / 2; ks.position.set(sd * (0.21 + 0.085), ky, kz - 0.03);
    knees.push(new THREE.Vector3(sd * 0.3, ky, kz));
    ell(0.06, dark, an[0], an[1] - 0.01, an[2], t, 1, 1.5, 1.2);                            // bota
    box(0.085, 0.07, 0.25, dark, an[0], an[1] - 0.07, an[2] - 0.07, t);
    box(0.095, 0.02, 0.27, rubber, an[0], an[1] - 0.115, an[2] - 0.07, t);
    ell(0.03, stripe, an[0], an[1] - 0.075, an[2] - 0.2, t, 1, 0.7, 1);
  }
  mesh(tube([[0, sy + 0.02, sz - 0.01], [0, (sy + hdy) / 2, (sz + hdz) / 2], [0, hdy - 0.08, hdz + 0.02]], [0.06, 0.054, 0.05], 10, 1, 6), suit, t);
  const body = merge(t);
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(body);

  // cabeza: casco con visera curva (grupo aparte para poder girarlo)
  const headG = new THREE.Group(); headG.position.set(0, hdy, hdz);
  const h = new THREE.Group();
  const shell = mesh(new THREE.SphereGeometry(0.13, 26, 18), helm, h); shell.scale.set(1, 0.98, 1.22);
  ell(0.085, helm, 0, -0.07, -0.09, h, 1.15, 0.75, 1.1);
  const vis = mesh(new THREE.SphereGeometry(0.1345, 22, 8, Math.PI * 1.5 - 0.95, 1.9, Math.PI * 0.34, Math.PI * 0.3), visor, h); vis.scale.set(1, 0.98, 1.22);
  const trim = mesh(new THREE.SphereGeometry(0.1355, 22, 3, Math.PI * 1.5 - 1.0, 2.0, Math.PI * 0.3, Math.PI * 0.04), dark, h); trim.scale.set(1, 0.98, 1.22);
  const trim2 = mesh(new THREE.SphereGeometry(0.1355, 22, 3, Math.PI * 1.5 - 1.0, 2.0, Math.PI * 0.64, Math.PI * 0.03), dark, h); trim2.scale.set(1, 0.98, 1.22);
  box(0.07, 0.012, 0.05, dark, 0, 0.128, -0.02, h); box(0.07, 0.012, 0.04, dark, 0, 0.12, 0.08, h);
  box(0.16, 0.025, 0.1, helm, 0, -0.01, 0.17, h).rotation.x = -0.5;
  ell(0.075, dark, 0, -0.115, 0.03, h, 1.2, 0.4, 1.1);
  box(0.05, 0.02, 0.012, dark, 0, -0.1, -0.165, h);
  const hm = merge(h);
  hm.traverse(o => { if (o.isMesh) o.castShadow = true; });
  headG.add(hm);
  const joints = [];
  if (fem) { // coleta animada
    const tail = new THREE.Group(); tail.position.set(0, -0.03, 0.14);
    let parent = tail;
    for (let i = 0; i < 3; i++) {
      const j = new THREE.Group(); if (i > 0) j.position.y = -0.1;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04 - 0.008 * i, 0.03 - 0.008 * i, 0.11, 8), hair);
      seg.position.y = -0.055; j.add(seg); parent.add(j); joints.push(j); parent = j;
    }
    headG.add(tail);
  }
  g.add(headG);

  // nombre en la espalda
  const dy = sy - hy, dz = sz - hz, len = Math.hypot(dy, dz) || 1, ny = -dz / len, nz = dy / len, c = lerp2(P.hip, P.sh, 0.6), r = 0.15 * k + 0.035;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshBasicMaterial({ map: backTex(NAMES[look.name] || NAMES[0], st) }));
  plate.position.set(0, c[1] + ny * r + 0.03, c[0] + nz * r + 0.09);
  plate.rotation.x = Math.atan2(-ny, nz);
  g.add(plate);
  return { group: g, headG, joints, knees };
}

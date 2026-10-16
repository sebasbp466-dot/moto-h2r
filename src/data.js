// Datos: motos, mapas, paletas, mejoras y guardado.
export const BIKES = [
  { id: 'h2r', name: 'NINJA H2R', price: 0, vmax: 85, acc: 26, hand: 1.0, bal: 1.0, nit: 1.0, desc: 'Sobrealimentada' },
  { id: 'trueno', name: 'TRUENO GP', price: 1200, vmax: 82, acc: 30, hand: 1.15, bal: 1.0, nit: 1.0, desc: 'Superdeportiva' },
  { id: 'furia', name: 'FURIA NAKED', price: 2000, vmax: 76, acc: 29, hand: 1.25, bal: 1.15, nit: 1.0, desc: 'Naked agresiva' },
  { id: 'salvaje', name: 'SALVAJE SM', price: 3200, vmax: 70, acc: 28, hand: 1.35, bal: 1.35, nit: 1.1, desc: 'Supermotard' },
  { id: 'diablo', name: 'DIABLO CHOPPER', price: 4800, vmax: 80, acc: 23, hand: 0.85, bal: 1.25, nit: 1.35, desc: 'Chopper' },
];
export const UPS = [
  { n: 'MOTOR', d: 'más velocidad y aceleración' },
  { n: 'NITRO', d: 'más carga y recarga' },
  { n: 'AGARRE', d: 'cambios de carril más ágiles' },
  { n: 'EQUILIBRIO', d: 'caballito más estable' },
];
export const upCost = lv => 200 * (lv + 1);

export const PAL = {
  paint: [0x0b0b0d, 0xd7191f, 0x1e6fff, 0xf5f5f5, 0xffc400, 0x2bd14a, 0xff6a00, 0xb026ff, 0xff3d9a, 0x9aa3ad],
  accent: [0x2bd14a, 0xffffff, 0xff2a2a, 0x00e5ff, 0xffc400, 0xff3d9a, 0xb026ff, 0xff6a00, 0x1e6fff, 0x111111],
  rim: [0x111111, 0xc8ccd4, 0xffc400, 0xff2a2a, 0x00e5ff, 0x2bd14a, 0xff3d9a, 0xf5f5f5],
  neon: [0, 0x00e5ff, 0xff2a9a, 0x7dff3a, 0xb026ff, 0xffc400, 0xff3b30, 0x1e6fff],
  suit: [0x0c0c0e, 0xd7191f, 0x1e6fff, 0xf5f5f5, 0xffc400, 0x2bd14a, 0xff6a00, 0xb026ff, 0xff3d9a, 0x5a5f66],
  stripe: [0x2bd14a, 0xffffff, 0xff2a2a, 0x00e5ff, 0xffc400, 0xff3d9a, 0xb026ff, 0xff6a00, 0x1e6fff, 0x111111],
  helmet: [0x0c0c0e, 0xf5f5f5, 0xd7191f, 0x1e6fff, 0xffc400, 0x2bd14a, 0xff6a00, 0xb026ff, 0xff3d9a, 0x9aa3ad],
  hair: [0x1a1008, 0x4a2a14, 0xc9a24a, 0xd7191f, 0xff3d9a, 0x1e6fff, 0xf5f5f5, 0x7dff3a],
};
export const VISORS = [
  { c: 0x0b141c, metal: 1, rough: 0.05 }, { c: 0x103a8a, metal: 1, rough: 0.05 },
  { c: 0xc79a2b, metal: 1, rough: 0.08 }, { c: 0x151515, metal: 0.6, rough: 0.1 },
];
export const NAMES = ['BRICEÑO', 'PIRUETA', 'LOCO', 'FUEGO', 'REY', 'NITRO'];
export const FLAMES = [[3.2, 1.3, 0.2], [0.6, 1.6, 3.2], [0.6, 3, 0.6], [2.5, 0.6, 3], [3, 0.2, 0.3]];
export const FLAME_HEX = [0xff9a2a, 0x3a9aff, 0x3aff3a, 0xc03aff, 0xff3a4a];

// Mapas. Colores en sRGB (hex); lamp.col es HDR (para el bloom).
export const MAPS = [
  { id: 'atardecer', name: 'ATARDECER', horizon: 0xff9445, mid: 0xf26179, top: 0x1a2764, sunDir: [-0.3, 0.2, -1], sunCol: 0xffa868, sunInt: 1.5,
    hemi: [0xffd2a8, 0x2b2230, 0.9], fog: [0xc77a5a, 40, 380], exposure: 0.9, bloom: 0.8, stars: 0, glare: 0.45, flare: 0.5,
    ground: { tex: 'grass', tint: 0xd8c8a0 }, road: { color: 0xffffff, rough: 0.92 }, props: 'forest', leaf: 0x2a6b32, trunk: 0x5a3b21,
    lamp: { on: true, col: [4, 2.9, 1.6], pool: false }, mount: [0x3a2650, 0x5a3358], weather: 0, beam: 0.4 },
  { id: 'noche', name: 'NOCHE NEÓN', horizon: 0x4a2a80, mid: 0x261a5a, top: 0x05061a, sunDir: [0.4, 0.35, -1], sunCol: 0xaac4ff, sunInt: 0.8,
    hemi: [0x8a98e0, 0x3a3060, 1.4], fog: [0x2a2054, 45, 360], exposure: 1.4, bloom: 1.0, stars: 1, glare: 0.2, flare: 0.25,
    ground: { tex: 'dark', tint: 0xa0a0c0 }, road: { color: 0xdcdcee, rough: 0.45 }, props: 'city', leaf: 0x2a6b32, trunk: 0x5a3b21,
    lamp: { on: true, col: [2.2, 4.6, 7], pool: true }, mount: [0x201a52, 0x30286a], weather: 0, beam: 1.0,
    envLights: [[-250, 60, -150, 220, 3, 0.5, 2], [250, 80, 100, 220, 0.5, 2.2, 3.2], [0, 300, 0, 240, 0.7, 0.7, 1], [0, 40, 300, 200, 2.5, 1, 0.3]] },
  { id: 'desierto', name: 'DESIERTO', horizon: 0xffd9a0, mid: 0xffb46a, top: 0x4a8fe0, sunDir: [-0.2, 0.45, -1], sunCol: 0xfff0c8, sunInt: 1.6,
    hemi: [0xffe8c8, 0x8a6a40, 0.8], fog: [0xf0c890, 60, 420], exposure: 0.8, bloom: 0.55, stars: 0, glare: 0.4, flare: 0.4,
    ground: { tex: 'sand', tint: 0xe8e0d0 }, road: { color: 0xd0c8c0, rough: 0.95 }, props: 'desert', leaf: 0x2a6b32, trunk: 0x5a3b21,
    lamp: { on: false, col: [4, 2.9, 1.6], pool: false }, mount: [0xb06a3a, 0xc98a52], weather: 0, beam: 0.2 },
  { id: 'nieve', name: 'NIEVE', horizon: 0xdfe9f5, mid: 0xb8cbe6, top: 0x6f93c9, sunDir: [-0.4, 0.3, -1], sunCol: 0xfff4e0, sunInt: 1.0,
    hemi: [0xe6f0ff, 0x9fb0c8, 0.75], fog: [0xd5e2f0, 25, 260], exposure: 0.78, bloom: 0.5, stars: 0, glare: 0.35, flare: 0.3,
    ground: { tex: 'snow', tint: 0xdde4ee }, road: { color: 0xb8bcc4, rough: 0.6 }, props: 'forest', leaf: 0xe8f0fa, trunk: 0x4a3a30,
    lamp: { on: true, col: [4, 3.2, 2], pool: false }, mount: [0xd0dcea, 0xb5c8de], weather: 2, beam: 0.3 },
  { id: 'tormenta', name: 'TORMENTA', horizon: 0x56657a, mid: 0x364252, top: 0x141a22, sunDir: [-0.2, 0.15, -1], sunCol: 0xaabbcc, sunInt: 0.7,
    hemi: [0x9ab0c8, 0x202830, 0.95], fog: [0x3e4a5a, 25, 260], exposure: 1.1, bloom: 0.9, stars: 0, glare: 0.1, flare: 0.05,
    ground: { tex: 'dark', tint: 0x5a6a54 }, road: { color: 0xb0b0b0, rough: 0.35 }, props: 'forest', leaf: 0x1c3a34, trunk: 0x2a2018,
    lamp: { on: true, col: [3.6, 3.6, 2.6], pool: true }, mount: [0x2a3440, 0x36424f], weather: 1, lightning: true, beam: 0.6,
    envLights: [[0, 300, 0, 320, 1.0, 1.2, 1.6], [-250, 40, -200, 200, 0.7, 0.9, 1.2]] },
];

export const SAVE_KEY = 'mpbSave3';
export function defaultSave() {
  return {
    money: 0, owned: [0], bike: 0, ups: {}, map: 0, best: 0,
    q: 1, sfx: true, mv: 3, view: 0,
    look: { paint: 0, accent: 0, rim: 1, neon: 0, flame: 0, suit: 0, stripe: 0, helmet: 0, visor: 0, hair: 0, sex: 0, name: 0, suitStyle: 1, helmStyle: 1 },
  };
}
export function loadSave() {
  const s = defaultSave();
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    Object.assign(s, raw);
    s.look = Object.assign(defaultSave().look, raw.look || {});
    if (!Array.isArray(s.owned) || !s.owned.length) s.owned = [0];
    if (typeof s.ups !== 'object' || !s.ups) s.ups = {};
  } catch (e) {}
  return s;
}
export function persist(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {} }
export function stats(s) {
  const b = BIKES[s.bike] || BIKES[0];
  const u = s.ups[s.bike] || [0, 0, 0, 0];
  return { vmax: b.vmax * (1 + 0.04 * u[0]), acc: b.acc * (1 + 0.05 * u[0]), nit: b.nit * (1 + 0.15 * u[1]), hand: b.hand * (1 + 0.06 * u[2]), bal: b.bal * (1 + 0.1 * u[3]) };
}

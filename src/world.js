import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './models.js';
import { createScenery } from './scenery.js';
import { MAPS } from './data.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const rnd = (a, b) => a + Math.random() * (b - a);

import { cx, cdx, cddx, roadPos } from './road.js';
export { cx, cdx, cddx, roadPos };

const SpeedShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
  void main(){
    vec2 dir=(vUv-vec2(0.5))*strength; vec3 col=vec3(0.0);
    for(int i=0;i<5;i++){ float f=float(i)/4.0; vec2 o=dir*f;
      col.r+=texture2D(tDiffuse,vUv-o*1.07).r; col.g+=texture2D(tDiffuse,vUv-o).g; col.b+=texture2D(tDiffuse,vUv-o*0.93).b; }
    gl_FragColor=vec4(col/5.0,1.0);
  }`
};

export function createWorld(save, showErr) {
  const tmp = { x: 0, z: 0 };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  const hash = g => Math.abs(Math.sin(g * 12.9898) * 43758.5453) % 1;
  let curMap = MAPS[0];

  /* ---------- renderer / escena ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc77a5a, 40, 380);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 650);

  // cielo (shader) con estrellas, sol/luna y relámpagos
  const sunDir = new THREE.Vector3(-0.3, 0.2, -1).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: sunDir }, horizon: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, top: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, stars: { value: 0 }, flash: { value: 0 }, glare: { value: 0.5 }, cloud: { value: 0.4 }, time: { value: 0 }, aurora: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 sunDir,horizon,mid,top,sunCol; uniform float stars,flash,glare,cloud,time,aurora; varying vec3 vDir;
    float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1.0,0.0)),f.x),mix(h2(i+vec2(0.0,1.0)),h2(i+vec2(1.0,1.0)),f.x),f.y); }
    float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<3;i++){ v+=a*vn(p); p*=2.03; a*=0.5; } return v; }
    float hash(vec3 p){ p=fract(p*0.3183099+vec3(.1,.2,.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    void main(){
      vec3 d=normalize(vDir); float h=clamp(d.y,0.0,1.0);
      vec3 col=mix(horizon,mid,smoothstep(0.0,0.2,h)); col=mix(col,top,smoothstep(0.1,0.75,h));
      float s=max(dot(d,sunDir),0.0);
      col+=sunCol*pow(s,14.0)*0.45*glare; col+=sunCol*pow(s,1500.0)*2.0*glare;
      col+=vec3(step(0.997,hash(floor(d*230.0)))*stars*smoothstep(0.1,0.4,d.y));
      float az=atan(d.x,d.z);
      if(cloud>0.0){ vec2 cuv=d.xz/(d.y+0.3)*1.1+vec2(time*0.012,0.0); float cm=smoothstep(0.5,0.78,fbm(cuv))*cloud*smoothstep(0.02,0.18,d.y); vec3 cc=mix(horizon,vec3(1.0),0.55)*(1.0-0.65*stars); col=mix(col,cc*0.9,cm*0.8); }
      if(aurora>0.0){ float band=smoothstep(0.18,0.4,d.y)*(1.0-smoothstep(0.55,0.85,d.y)); float wv=0.5+0.5*sin(az*5.0+time*0.4+d.y*9.0); vec3 ac=mix(vec3(0.1,1.0,0.55),vec3(0.5,0.3,1.0),0.5+0.5*sin(az*2.0+time*0.2)); col+=ac*band*wv*aurora*0.7; }
      if(d.y<0.0) col=horizon*0.8;
      col+=vec3(flash*0.7,flash*0.7,flash*0.9);
      gl_FragColor=vec4(col,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTex(), color: 0xffd9a0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.5 }));
  flare.scale.set(160, 160, 1); flare.renderOrder = -5; scene.add(flare);
  const _dir = new THREE.Vector3();
  let envRT = null, garageOn = false;
  const GARAGE_ENV = [[0, 300, 0, 300, 1.6, 1.5, 1.3], [-260, 60, 0, 200, 1.0, 1.1, 1.5], [260, 60, 0, 200, 1.5, 1.2, 0.9], [0, 60, -260, 200, 1.2, 1.2, 1.2]];
  function rebuildEnv() {
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      const es = new THREE.Scene(); if (!garageOn) es.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat));
      // paneles de luz (estudio / neón) para que la pintura y el casco tengan reflejos vivos
      for (const l of (garageOn ? GARAGE_ENV : (curMap.envLights || [[0, 300, 0, 280, 1.1, 1.1, 1.1], [-200, 40, -260, 160, 1.0, 0.8, 0.6]]))) {
        const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); mat.color.setRGB(l[4], l[5], l[6]);
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(l[3], l[3] * 0.35), mat);
        pl.position.set(l[0], l[1], l[2]); pl.lookAt(0, 0, 0); es.add(pl);
      }
      const rt = pm.fromScene(es, 0, 1, 1000);
      if (envRT) envRT.dispose();
      envRT = rt; scene.environment = rt.texture; pm.dispose();
    } catch (e) { showErr('env: ' + e.message); }
  }
  const hemi = new THREE.HemisphereLight(0xffd2a8, 0x2b2230, 0.7);
  const sun = new THREE.DirectionalLight(0xffa868, 2.2);
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 200 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.08;
  scene.add(hemi, sun, sun.target);

  /* ---------- postprocesado ---------- */
  let composer = null, bloom = null, speedPass = null, bloomBase = 0.6;
  function buildComposer() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.5, 1.0);
    composer.addPass(bloom);
    speedPass = new ShaderPass(SpeedShader);
    composer.addPass(speedPass);
    composer.addPass(new OutputPass());
  }
  function setBloom() { if (bloom) bloom.strength = bloomBase * curMap.bloom; }
  function applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    const pr = [Math.min(dpr, 0.8), Math.min(dpr, 1.0), Math.min(dpr, 1.5)][save.q];
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    if (save.q >= 1) {
      try {
        if (!composer) buildComposer();
        composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
        bloomBase = save.q === 2 ? 0.65 : 0.5; setBloom();
      } catch (e) { composer = null; showErr('post: ' + e.message); }
    }
    sun.castShadow = save.q === 2;
  }
  function render() {
    try {
      if (save.q >= 1 && composer) composer.render(); else renderer.render(scene, camera);
    } catch (e) { composer = null; showErr('render: ' + e.message); renderer.render(scene, camera); }
  }

  /* ---------- suelo ---------- */
  const gt = M.groundTextures();
  Object.values(gt).forEach(t => t.repeat.set(175, 175));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ map: gt.grass }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.45; scene.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x1b8fd0, roughness: 0.08, metalness: 0.25, envMapIntensity: 0.8 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -1.3; water.visible = false; scene.add(water);
  const scn = createScenery(scene, camera, gt);

  /* ---------- cintas de carretera ---------- */
  const SEG = 110, STEP = 4;
  const ribbons = [];
  const asphalt = M.asphaltTex();
  let roadMat = null;
  function makeRibbon(a, b, y, color, dash, o = {}) {
    const n = SEG * 6;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { nor[i * 3] = o.nx || 0; nor[i * 3 + 1] = o.wall ? 0 : 1; }
    const attrP = new THREE.BufferAttribute(pos, 3), attrU = new THREE.BufferAttribute(uv, 2);
    g.setAttribute('position', attrP); g.setAttribute('uv', attrU); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const layer = o.layer || 0;
    const opts = { color, map: o.map || null, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -(1 + layer * 2), polygonOffsetUnits: -layer };
    const mat = o.std ? new THREE.MeshStandardMaterial({ ...opts, roughness: 0.85, metalness: 0.1 }) : new THREE.MeshLambertMaterial(opts);
    if (o.std) roadMat = mat;
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; m.receiveShadow = !!o.shadow;
    scene.add(m);
    if (o.std) { mat.bumpMap = M.asphaltBump(); mat.bumpMap.repeat.set(4, 2); mat.bumpScale = 0.7; }
    ribbons.push({ a, b, y, dash, wall: o.wall, road: !!o.std, pos, uv, attrP, attrU });
  }
  makeRibbon(-9.2, 9.2, 0.0, 0x8a8472, false, { layer: 0 });
  makeRibbon(-7.0, 7.0, 0.01, 0xffffff, false, { layer: 1, map: asphalt, shadow: true, std: true });
  makeRibbon(-7.25, -6.9, 0.02, 0xffffff, false, { layer: 2 });
  makeRibbon(6.9, 7.25, 0.02, 0xffffff, false, { layer: 2 });
  makeRibbon(-3.6, -3.4, 0.02, 0xdddddd, true, { layer: 2 });
  makeRibbon(-0.1, 0.1, 0.02, 0xffd400, true, { layer: 2 });
  makeRibbon(3.4, 3.6, 0.02, 0xdddddd, true, { layer: 2 });
  for (const sd of [-1, 1]) {
    makeRibbon(sd * 7.7, sd * 7.7, 0, 0x707078, false, { wall: [0, 0.5], nx: -sd, layer: 3 });
    makeRibbon(sd * 7.7, sd * 7.7, 0, 0xffffff, false, { wall: [0.5, 0.95], nx: -sd, layer: 3, map: M.railTex() });
  }
  const RP = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
  const ORDER = [0, 1, 2, 1, 3, 2];
  let lastBase = -99999;
  function updateRoad(s) {
    const base = Math.floor(s / STEP) - 8;
    if (base === lastBase) return;
    lastBase = base;
    for (const r of ribbons) {
      const p = r.pos, uv = r.uv;
      let k = 0, u = 0;
      const y0 = r.wall ? r.wall[0] : r.y, y1 = r.wall ? r.wall[1] : r.y;
      for (let i = 0; i < SEG; i++) {
        const gi = base + i, s0 = gi * STEP, s1 = s0 + STEP;
        const hide = r.dash && (gi & 1);
        roadPos(s0, r.a, RP[0]); roadPos(s0, r.b, RP[1]); roadPos(s1, r.a, RP[2]); roadPos(s1, r.b, RP[3]);
        for (let j = 0; j < 6; j++) {
          const c = ORDER[j];
          p[k++] = RP[c].x; p[k++] = hide ? -50 : ((c & 1) ? y1 : y0); p[k++] = RP[c].z;
          if (r.road) { uv[u++] = (((c & 1) ? r.b : r.a) + 7) / 14; uv[u++] = ((c >> 1) ? s1 : s0) / 8; }
          else if (r.wall) { uv[u++] = (c & 1) ? y1 : y0; uv[u++] = ((c >> 1) ? s1 : s0) * 0.25; }
          else { uv[u++] = ((c & 1) ? r.b : r.a) * 0.25; uv[u++] = ((c >> 1) ? s1 : s0) * 0.25; }
        }
      }
      r.attrP.needsUpdate = true; r.attrU.needsUpdate = true;
    }
  }

  /* ---------- objetos instanciados que se reciclan ---------- */
  function makePool(meshes, count, step, behind, apply) {
    const ids = new Int32Array(count).fill(-99999);
    return {
      update(s) {
        const g0 = Math.floor((s - behind) / step);
        let dirty = false;
        for (let g = g0; g < g0 + count; g++) {
          const k = ((g % count) + count) % count;
          if (ids[k] !== g) { ids[k] = g; apply(k, g); dirty = true; }
        }
        if (dirty) for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      }
    };
  }
  function inst(geo, mat, count) {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.frustumCulled = false; scene.add(m);
    for (let i = 0; i < count; i++) { _m.makeScale(0, 0, 0); m.setMatrixAt(i, _m); }
    return m;
  }
  const setM = (mesh, k, x, y, z, yaw, sx, sy, sz) => {
    _p.set(x, y, z); _q.setFromAxisAngle(Y, yaw); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); mesh.setMatrixAt(k, _m);
  };

  // bosque (también para nieve y tormenta)
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6); trunkGeo.translate(0, 1.2, 0);
  const leafGeo = mergeGeometries([[1.9, 3.0, 2.5], [1.5, 2.6, 3.8], [1.1, 2.3, 5.0]].map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 8); g.translate(0, y, 0); return g; }));
  { const pa = leafGeo.attributes.position, lc = []; for (let i = 0; i < pa.count; i++) { const b = 0.45 + 0.55 * clamp((pa.getY(i) - 1.2) / 5.2, 0, 1); lc.push(b, b, b); } leafGeo.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3)); }
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3b21 }), leafMat = new THREE.MeshLambertMaterial({ color: 0x2a6b32, vertexColors: true });
  const trunk = inst(trunkGeo, trunkMat, 100), leaf = inst(leafGeo, leafMat, 100);
  const forestPool = makePool([trunk, leaf], 100, 8, 60, (k, g) => {
    const h = hash(g), sc = 0.8 + h;
    const lat = ((g & 1) ? 1 : -1) * (12 + h * 18);
    roadPos(g * 8, lat, tmp); const ty = scn.terrainY(g * 8, lat);
    setM(trunk, k, tmp.x, ty, tmp.z, h * 6.28, sc, sc * (0.9 + h * 0.4), sc);
    setM(leaf, k, tmp.x, ty, tmp.z, h * 6.28, sc, sc * (0.9 + h * 0.4), sc);
  });
  // ciudad neón
  const winTex = M.windowTex();
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const bMat = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.5 });
  const sMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const builds = inst(bGeo, bMat, 60), signs = inst(new THREE.BoxGeometry(1, 1, 1), sMat, 60);
  const NEON = [[5, 0.5, 2.5], [0.5, 3.5, 5], [4, 4, 0.6], [2.5, 0.6, 5], [0.6, 5, 1.5]];
  const cityPool = makePool([builds, signs], 60, 14, 40, (k, g) => {
    const h = hash(g), h2 = hash(g + 3), side = (g & 1) ? 1 : -1;
    const w = 10 + h * 8, d = 12 + h2 * 8, hgt = 18 + h * 55, lat = side * (26 + h2 * 12);
    const s = g * 14, yaw = -Math.atan(cdx(s));
    roadPos(s, lat, tmp); setM(builds, k, tmp.x, scn.terrainY(s, lat), tmp.z, yaw, w, hgt, d);
    roadPos(s, lat - side * (w / 2 + 0.1), tmp);
    setM(signs, k, tmp.x, scn.terrainY(s, lat) + 6 + h2 * (hgt - 10), tmp.z, yaw, 0.25, 0.8, d * 0.8);
    const n = NEON[(g * 7 + 55) % 5 | 0] || NEON[0];
    signs.setColorAt(k, _c.setRGB(n[0], n[1], n[2]));
  });
  // desierto
  const cGeos = [new THREE.CylinderGeometry(0.28, 0.34, 3.2, 7), new THREE.CylinderGeometry(0.18, 0.18, 1.1, 6), new THREE.CylinderGeometry(0.18, 0.18, 0.9, 6)];
  cGeos[0].translate(0, 1.6, 0);
  cGeos[1].rotateZ(Math.PI / 2); cGeos[1].translate(0.7, 1.7, 0);
  cGeos[2].rotateZ(Math.PI / 2); cGeos[2].translate(-0.65, 2.2, 0);
  const cactusGeo = mergeGeometries(cGeos.map(x => x.toNonIndexed ? x : x)) || cGeos[0];
  const rockGeo = new THREE.DodecahedronGeometry(1, 0); rockGeo.translate(0, 0.4, 0);
  const cactus = inst(cactusGeo, new THREE.MeshLambertMaterial({ color: 0x3f7a3a }), 80), rocks = inst(rockGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a4a }), 80);
  const desertPool = makePool([cactus, rocks], 80, 10, 40, (k, g) => {
    const h = hash(g), h2 = hash(g + 9), side = (g & 1) ? 1 : -1;
    roadPos(g * 10, side * (11 + h * 22), tmp); setM(cactus, k, tmp.x, scn.terrainY(g * 10, side * (11 + h * 22)), tmp.z, h * 6.28, 0.8 + h * 0.8, 0.8 + h * 0.9, 0.8 + h * 0.8);
    roadPos(g * 10 + 5, -side * (10 + h2 * 24), tmp); setM(rocks, k, tmp.x, scn.terrainY(g * 10 + 5, -side * (10 + h2 * 24)), tmp.z, h2 * 6.28, 0.8 + h2 * 2.2, 0.6 + h2 * 1.4, 0.8 + h * 2);
  });
  const sets = { forest: { pool: forestPool, meshes: [trunk, leaf] }, city: { pool: cityPool, meshes: [builds, signs] }, desert: { pool: desertPool, meshes: [cactus, rocks] } };
  Object.assign(sets, scn.sets);

  // postes de la barrera y farolas
  const postGeo = new THREE.BoxGeometry(0.12, 0.95, 0.12); postGeo.translate(0, 0.475, 0);
  const posts = inst(postGeo, new THREE.MeshLambertMaterial({ color: 0x555a60 }), 120);
  const postPool = makePool([posts], 120, 8, 20, (k, g) => {
    roadPos(g * 8, ((g & 1) ? 1 : -1) * 7.8, tmp); setM(posts, k, tmp.x, 0, tmp.z, -Math.atan(cdx(g * 8)), 1, 1, 1);
  });
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 7.5, 6); poleGeo.translate(0, 3.75, 0);
  const headGeo = new THREE.BoxGeometry(1.7, 0.16, 0.45); headGeo.translate(0.8, 7.4, 0);
  const lampMat = new THREE.MeshBasicMaterial({ toneMapped: false }); lampMat.color.setRGB(5, 3.6, 2);
  const glowGeo = new THREE.PlaneGeometry(14, 14); glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ map: M.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4, toneMapped: false });
  const poles = inst(poleGeo, new THREE.MeshLambertMaterial({ color: 0x33353a }), 24), heads = inst(headGeo, lampMat, 24), pools = inst(glowGeo, glowMat, 24);
  const lampPool = makePool([poles, heads, pools], 24, 40, 40, (k, g) => {
    const side = (g & 1) ? 1 : -1, s = g * 40, yaw = -Math.atan(cdx(s)) + (side > 0 ? Math.PI : 0);
    roadPos(s, side * 8.9, tmp); setM(poles, k, tmp.x, 0, tmp.z, yaw, 1, 1, 1); setM(heads, k, tmp.x, 0, tmp.z, yaw, 1, 1, 1);
    roadPos(s, side * 4.8, tmp); setM(pools, k, tmp.x, 0.06, tmp.z, yaw, 1, 1, 1);
  });

  // montañas
  const mount = new THREE.Group();
  const mMat = [new THREE.MeshBasicMaterial({ color: 0x3a2650, fog: false }), new THREE.MeshBasicMaterial({ color: 0x5a3358, fog: false })];
  for (let i = 0; i < 30; i++) {
    const a = i / 30 * Math.PI * 2 + rnd(-0.05, 0.05), R = rnd(330, 400), h = rnd(40, 110), w = rnd(70, 140);
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4 + ((Math.random() * 3) | 0)), mMat[i % 2]);
    m.position.set(Math.cos(a) * R, h / 2 - 2, Math.sin(a) * R); m.rotation.y = Math.random() * 3;
    mount.add(m);
  }
  scene.add(mount);

  // arco de salida
  const ARCH_S = 36;
  {
    const g = new THREE.Group();
    const pm = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7.4, 8), pm); p.position.set(sd * 8.9, 3.7, 0); g.add(p); }
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(17.8, 3.1), new THREE.MeshBasicMaterial({ map: M.bannerTex('MOTO PIRUETA BRICEÑO'), side: THREE.DoubleSide, toneMapped: false }));
    ban.position.set(0, 6.0, 0); g.add(ban);
    roadPos(ARCH_S, 0, tmp);
    g.position.set(tmp.x, 0, tmp.z); g.rotation.y = -Math.atan(cdx(ARCH_S));
    scene.add(g);
  }

  /* ---------- grupo de la moto, haz de luz y neón ---------- */
  const bikeRoot = new THREE.Group(); scene.add(bikeRoot);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(6, 26), new THREE.MeshBasicMaterial({ map: M.beamTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, toneMapped: false, side: THREE.DoubleSide }));
  beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.06, -14); beam.renderOrder = 2; bikeRoot.add(beam);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.8), new THREE.MeshBasicMaterial({ map: M.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.07, -0.7); glow.renderOrder = 3; glow.visible = false; bikeRoot.add(glow);
  const setNeon = hexc => { glow.visible = !!hexc; if (hexc) { glow.material.color.set(hexc); glow.material.color.multiplyScalar(2.2); } };

  /* ---------- partículas ---------- */
  const NP = 420;
  const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pBase = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3);
  const pLife = new Float32Array(NP), pMax = new Float32Array(NP).fill(1), pGrav = new Float32Array(NP);
  for (let i = 0; i < NP; i++) pPos[i * 3 + 1] = -999;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.5, map: M.glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  pts.frustumCulled = false; scene.add(pts);
  let pHead = 0;
  function emit(x, y, z, vx, vy, vz, life, r, g, b, grav = 9) {
    const i = pHead; pHead = (pHead + 1) % NP;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pLife[i] = pMax[i] = life; pGrav[i] = grav;
    pBase[i * 3] = r; pBase[i * 3 + 1] = g; pBase[i * 3 + 2] = b;
  }
  function updateParticles(dt) {
    for (let i = 0; i < NP; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
      pVel[i * 3 + 1] -= pGrav[i] * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < 0.03 && pGrav[i] > 0) { pPos[i * 3 + 1] = 0.03; pVel[i * 3 + 1] *= -0.3; }
      const f = pLife[i] / pMax[i];
      pCol[i * 3] = pBase[i * 3] * f; pCol[i * 3 + 1] = pBase[i * 3 + 1] * f; pCol[i * 3 + 2] = pBase[i * 3 + 2] * f;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }
  function burst(x, y, z, n, spd, r, g, b, life = 0.8) {
    for (let i = 0; i < n; i++) emit(x, y, z, rnd(-1, 1) * spd, rnd(0.2, 1) * spd, rnd(-1, 1) * spd, life * rnd(0.5, 1), r, g, b);
  }

  /* ---------- clima: lluvia, nieve, relámpagos ---------- */
  const WN = 420;
  const wPos = new Float32Array(WN * 3);
  for (let i = 0; i < WN; i++) { wPos[i * 3] = rnd(-34, 34); wPos[i * 3 + 1] = rnd(-4, 20); wPos[i * 3 + 2] = rnd(-40, 40); }
  const rainPos = new Float32Array(WN * 6);
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaec8e8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  const snowPos = new Float32Array(WN * 3);
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.28, map: M.glowTex(), color: 0xffffff, transparent: true, depthWrite: false, sizeAttenuation: true }));
  snow.frustumCulled = false; snow.visible = false; scene.add(snow);
  let wTime = 0;
  function updateWeather(dt, vx, vz) {
    const mode = curMap.weather || 0, lines = mode === 1 || mode === 3, pts = mode === 2 || mode === 4 || mode === 5;
    rain.visible = lines; snow.visible = pts;
    if (!mode) return;
    wTime += dt;
    const cp = camera.position, m4 = mode === 4, m5 = mode === 5;
    snow.material.color.set(m4 ? 0xff7a2a : 0xffffff); snow.material.size = m4 ? 0.38 : m5 ? 0.18 : 0.28;
    snow.material.opacity = m5 ? 0.45 : 0.95; snow.material.blending = m4 ? THREE.AdditiveBlending : THREE.NormalBlending;
    rain.material.color.set(mode === 3 ? 0xd8b070 : 0xaec8e8); rain.material.opacity = mode === 3 ? 0.35 : 0.5;
    for (let i = 0; i < WN; i++) {
      let x = wPos[i * 3], y = wPos[i * 3 + 1], z = wPos[i * 3 + 2];
      if (mode === 1) y -= 26 * dt;
      else if (mode === 3) { x += 26 * dt; y += Math.sin(wTime + i) * 0.5 * dt; }
      else if (m4) { y += 2.2 * dt; x += Math.sin(wTime * 0.9 + i) * 0.6 * dt; }
      else { y -= (m5 ? 0.25 : 2.4) * dt; x += Math.sin(wTime * 0.8 + i) * (m5 ? 0.4 : 0.7) * dt; }
      let rx = x - cp.x, ry = y - cp.y, rz = z - cp.z;
      if (rx > 34) rx -= 68; else if (rx < -34) rx += 68;
      if (ry < -5) ry += 26; else if (ry > 21) ry -= 26;
      if (rz > 40) rz -= 80; else if (rz < -40) rz += 80;
      x = cp.x + rx; y = cp.y + ry; z = cp.z + rz;
      wPos[i * 3] = x; wPos[i * 3 + 1] = y; wPos[i * 3 + 2] = z;
      if (lines) {
        rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
        if (mode === 1) { rainPos[i * 6 + 3] = x + vx * 0.028; rainPos[i * 6 + 4] = y + 26 * 0.028; rainPos[i * 6 + 5] = z + vz * 0.028; }
        else { rainPos[i * 6 + 3] = x + vx * 0.03 + 1.6; rainPos[i * 6 + 4] = y; rainPos[i * 6 + 5] = z + vz * 0.03; }
      } else { snowPos[i * 3] = x; snowPos[i * 3 + 1] = y; snowPos[i * 3 + 2] = z; }
    }
    if (mode === 1) for (let i = 0; i < 3; i++) emit(cp.x + rnd(-8, 8), 0.06, cp.z + rnd(-18, 4), rnd(-0.6, 0.6), rnd(1, 2.6), rnd(-0.6, 0.6), 0.25, 0.7, 0.8, 1.0, 9);
    if (lines) rainGeo.attributes.position.needsUpdate = true; else snowGeo.attributes.position.needsUpdate = true;
  }
  let ltTimer = 4, lt = 0;
  function updateLightning(dt, onStrike) {
    if (curMap.lightning) {
      ltTimer -= dt;
      if (ltTimer <= 0) { ltTimer = rnd(4, 9); lt = 1; onStrike && onStrike(); }
    }
    if (lt > 0) lt = Math.max(0, lt - dt * 3.2);
    skyMat.uniforms.flash.value = lt;
    hemi.intensity = garageOn ? 0.35 : curMap.hemi[2] + lt * 3;
    return lt;
  }

  /* ---------- monedas ---------- */
  const CN = 36;
  const coinMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(0.42, 0.12, 8, 18), new THREE.MeshStandardMaterial({ color: 0xffc800, metalness: 1, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.9 }), CN);
  coinMesh.frustumCulled = false; scene.add(coinMesh);
  const coins = [];
  for (let i = 0; i < CN; i++) coins.push({ s: -9999, l: 0, on: false });
  let nextCoinS = 120;
  const LANES = [-5.25, -1.75, 1.75, 5.25];
  function coinsReset() { coins.forEach(c => { c.on = false; }); nextCoinS = 120; }
  function spawnCoins(s) {
    if (nextCoinS > s + 420) return;
    const lane = LANES[(Math.random() * 4) | 0], n = 5 + ((Math.random() * 4) | 0);
    for (let j = 0; j < n; j++) {
      const c = coins.find(x => !x.on);
      if (!c) break;
      c.on = true; c.s = nextCoinS + j * 5; c.l = lane;
    }
    nextCoinS += rnd(160, 280);
  }
  function updateCoins(s, t) {
    coins.forEach((c, i) => {
      if (c.on && c.s < s - 25) c.on = false;
      if (!c.on) { _m.makeScale(0, 0, 0); coinMesh.setMatrixAt(i, _m); return; }
      roadPos(c.s, c.l, tmp);
      setM(coinMesh, i, tmp.x, 0.95 + Math.sin(t * 3 + i) * 0.1, tmp.z, t * 4 + i, 1, 1, 1);
    });
    coinMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- aplicar mapa ---------- */
  function applyMap(i) {
    const m = curMap = MAPS[i] || MAPS[0];
    const u = skyMat.uniforms;
    u.horizon.value.set(m.horizon); u.mid.value.set(m.mid); u.top.value.set(m.top); u.sunCol.value.set(m.sunCol); u.stars.value = m.stars; u.cloud.value = m.cloud == null ? 0.4 : m.cloud; u.aurora.value = m.aurora || 0; u.glare.value = m.glare == null ? 0.5 : m.glare;
    sunDir.set(...m.sunDir).normalize();
    scene.fog.color.set(m.fog[0]); scene.fog.near = m.fog[1]; scene.fog.far = m.fog[2];
    hemi.color.set(m.hemi[0]); hemi.groundColor.set(m.hemi[1]); hemi.intensity = m.hemi[2];
    sun.color.set(m.sunCol); sun.intensity = m.sunInt;
    renderer.toneMappingExposure = m.exposure;
    ground.material.map = gt[m.ground.tex]; ground.material.color.set(m.ground.tint); ground.material.needsUpdate = true;
    if (roadMat) { roadMat.roughness = m.road.rough; roadMat.color.set(m.road.color); roadMat.metalness = 0; roadMat.envMapIntensity = m.road.rough < 0.5 ? 0.7 : 0.3; }
    flare.material.color.set(m.sunCol);
    ground.visible = !m.shore; water.visible = !!m.shore; scn.apply(m);
    for (const k in sets) sets[k].meshes.forEach(x => { x.visible = k === m.props; });
    leafMat.color.set(m.leaf); trunkMat.color.set(m.trunk);
    mMat[0].color.set(m.mount[0]); mMat[1].color.set(m.mount[1]);
    lampMat.color.setRGB(...m.lamp.col);
    poles.visible = heads.visible = m.lamp.on; pools.visible = m.lamp.on && m.lamp.pool;
    glowMat.color.setRGB(m.lamp.col[0] * 0.25, m.lamp.col[1] * 0.25, m.lamp.col[2] * 0.25);
    beam.material.opacity = m.beam;
    setBloom();
    rebuildEnv();
  }

  function follow(bp) {
    sky.position.copy(camera.position);
    mount.position.set(camera.position.x, 0, camera.position.z);
    roadPos(0, 0, tmp);
    ground.position.set(Math.round(bp.x / 8) * 8, -0.45, Math.round(bp.z / 8) * 8);
    water.position.set(bp.x, -1.3, bp.z); skyMat.uniforms.time.value = (performance.now() / 1000) % 10000;
    sun.target.position.set(bp.x, 0, bp.z);
    sun.position.set(bp.x + sunDir.x * 70, sunDir.y * 70, bp.z + sunDir.z * 70);
    sun.target.updateMatrixWorld();
    camera.getWorldDirection(_dir);
    const dp = Math.max(0, _dir.dot(sunDir));
    flare.position.copy(camera.position).addScaledVector(sunDir, 400);
    flare.material.opacity = clamp(Math.pow(dp, 6) * 0.35, 0, 0.35) * (curMap.flare == null ? 1 : curMap.flare);
  }
  function updateProps(s) {
    sets[curMap.props].pool.update(s); postPool.update(s); scn.update(s, performance.now() / 1000);
    if (curMap.lamp.on) lampPool.update(s);
  }

  function setGarage(on, pos, yaw) {
    scn.setGarage(on, pos, yaw);
    if (garageOn === on) return;
    garageOn = on; scn.setGarageLights(on);
    sun.visible = !on; sky.visible = !on;
    scene.fog.near = on ? 30 : curMap.fog[1]; scene.fog.far = on ? 90 : curMap.fog[2];
    rebuildEnv();
  }
  return {
    setGarage, renderer, scene, camera, bikeRoot, beam, glow, setNeon, LANES, ARCH_S,
    applyMap, getMap: () => curMap, applyQuality, render, updateRoad, updateProps, follow,
    emit, burst, updateParticles, updateWeather, updateLightning,
    coins, coinsReset, spawnCoins, updateCoins,
    get speedPass() { return speedPass; },
  };
}

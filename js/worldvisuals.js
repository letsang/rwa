/* ============================================================
   worldvisuals.js — Terrain Material & Roads (V0.4.6a/b + V0.4.6.1 quality)

   COUCHE VISUELLE, LECTURE SEULE (TerrainGenerator, BiomeSystem, TERRAIN_GEO).
   Ne recalcule ni ne modifie JAMAIS la géographie.

   V0.4.6.1 — passe de QUALITÉ à hauteur de personnage :
   - Densité de texel : tuile de détail fine (crisp au sol) + tuile macro (anti-tiling).
   - Normal map procédurale : le relief micro est révélé par la lumière (subtil).
   - Blending riche : pente/altitude/humidité/biome + macro-noise (poches de dirt
     naturelles dans le grass, rock progressif sur les pentes).
   - Routes cassées : gravier, plaques d'herbe, ornières, bords bruités (plus de bande).
   - Spéculaire léger sur wet ; variation de couleur micro.
   - UV MONDE (seam 0). Lumière + fog calés sur RWA_ENV.
   ============================================================ */

const WV_CONFIG = {
  altLow: -12, altHigh: 150,
  moistFreq: 0.00013,
  tileDetail: 105,             // 1 répétition détail = 105 u sim (~8.4 rendu) -> net au sol
  tileMacro: 1150,             // modulation macro (anti-tiling)
  rockSlopeA: 10, rockSlopeB: 20, rockSlopeC: 36, rockAltA: 0.62, rockAltB: 0.88,
  wetRiverR: 2100,
  roadVisW0: 140, roadVisW1: 860,
  texSize: 512,
};

/* --- bruit --- */
function _wvHash(ix, iy, seed) { let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); h = (h ^ (h >>> 16)) >>> 0; return h / 4294967296; }
function _wvFade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function _wvNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), xf = x - x0, yf = y - y0;
  const v00 = _wvHash(x0, y0, seed), v10 = _wvHash(x0 + 1, y0, seed), v01 = _wvHash(x0, y0 + 1, seed), v11 = _wvHash(x0 + 1, y0 + 1, seed);
  const u = _wvFade(xf), v = _wvFade(yf);
  return (1 - v) * ((1 - u) * v00 + u * v10) + v * ((1 - u) * v01 + u * v11);
}
function _wvClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function _wvSmooth(e0, e1, x) { const t = _wvClamp((x - e0) / (e1 - e0 || 1e-9), 0, 1); return t * t * (3 - 2 * t); }
function _distSegW(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9; let t = _wvClamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
function _distPolysW(x, y, polys) { let m = Infinity; for (const l of polys) for (let i = 0; i < l.length - 1; i++) { const d = _distSegW(x, y, l[i].x, l[i].y, l[i + 1].x, l[i + 1].y); if (d < m) m = d; } return m; }
// fbm périodique (pour textures tileables)
function _fbmP(x, y, P, seed, oct) {
  let v = 0, a = 0.5, f = 1; oct = oct || 4;
  for (let o = 0; o < oct; o++) {
    const per = P * f, xi = x * f, yi = y * f, x0 = Math.floor(xi), y0 = Math.floor(yi), xf = xi - x0, yf = yi - y0;
    const h = (ix, iy) => _wvHash(((ix % per) + per) % per, ((iy % per) + per) % per, seed + o * 17);
    const u = _wvFade(xf), vv = _wvFade(yf);
    v += ((1 - vv) * ((1 - u) * h(x0, y0) + u * h(x0 + 1, y0)) + vv * ((1 - u) * h(x0, y0 + 1) + u * h(x0 + 1, y0 + 1))) * a; a *= 0.5; f *= 2;
  }
  return v;
}

/* Poids de surface [grass,dirt,rock,wet] — blending riche (réutilisé par validation). */
function terrainWeights(x, z, altN, slopeDeg, seed) {
  const C = WV_CONFIG;
  const G = (typeof TERRAIN_GEO !== 'undefined') ? TERRAIN_GEO : window.TERRAIN_GEO;
  const BS = (typeof BiomeSystem !== 'undefined') ? BiomeSystem : window.BiomeSystem;
  const BC = (typeof BIOME_CONFIG !== 'undefined') ? BIOME_CONFIG : window.BIOME_CONFIG;
  const riverD = _distPolysW(x, z, G.rivers);
  const mN = _wvNoise(x * C.moistFreq, z * C.moistFreq, seed + 555);
  const riverWet = _wvClamp(1 - riverD / 2600, 0, 1);
  const lowWet = (1 - altN) * 0.35;
  const w = BS.realmWeights(x, z); let bM = 0; for (const k in w) bM += w[k] * BC.bias[k].moist;
  const moist = _wvClamp(mN * 0.5 + riverWet * 0.55 + lowWet + bM, 0, 1);
  // macro-noise -> poches de dirt naturelles dans le grass (transitions irrégulières)
  const macro = _wvNoise(x * 0.0011, z * 0.0011, seed + 33);
  const macro2 = _wvNoise(x * 0.0037 + 5, z * 0.0037 + 5, seed + 88);
  let g = _wvSmooth(0.24, 0.60, moist + (macro - 0.5) * 0.25);
  const dirtPocket = _wvSmooth(0.60, 0.82, macro2) * 0.7;   // plaques de terre
  g *= (1 - dirtPocket);
  let d = (1 - g) * 0.8 + 0.06;
  let r = 0, wt = 0;
  // rock progressif (pente + altitude), transitions douces
  const rockF = _wvClamp(
    _wvSmooth(C.rockSlopeA, C.rockSlopeB, slopeDeg) * 0.45 +
    _wvSmooth(C.rockSlopeB, C.rockSlopeC, slopeDeg) * 0.55 +
    _wvSmooth(C.rockAltA, C.rockAltB, altN) * 0.5, 0, 1);
  g *= (1 - rockF); d *= (1 - rockF); r = rockF;
  // humide près rivières / bas-fonds
  const wetF = _wvClamp(riverWet * 0.9 - _wvSmooth(C.wetRiverR, C.wetRiverR + 900, riverD), 0, 1);
  g *= (1 - wetF); d *= (1 - wetF); r *= (1 - wetF); wt = wetF;
  return [g, d, r, wt];
}

/* Masque de route organique [0..1] + facteur "break" (herbe/gravier). */
function roadPaint(x, z, seed) {
  const C = WV_CONFIG, G = (typeof TERRAIN_GEO !== 'undefined') ? TERRAIN_GEO : window.TERRAIN_GEO;
  const d = _distPolysW(x, z, G.roads);
  const edge = _wvSmooth(C.roadVisW0, C.roadVisW1, d);
  const nz = (_wvNoise(x * 0.006, z * 0.006, (seed || 0) + 71) - 0.5) * 0.5;   // bord bruité
  let rm = _wvClamp(1 - edge + nz * edge, 0, 1);
  // plaques d'herbe qui percent la route (casse la bande)
  const patch = _wvNoise(x * 0.012, z * 0.012, (seed || 0) + 12);
  if (patch > 0.72) rm *= _wvClamp(1 - (patch - 0.72) * 3, 0.15, 1);
  return rm;
}

class WorldVisualsSystem {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.S = opts.S != null ? opts.S : RENDER_SCALE;
    this.seed = opts.seed != null ? opts.seed : WORLD_SEED;
    this.debug = 0;
    this._registerShaders();
    this._buildTextures();
    this._buildMaterial();
    this._obs = scene.onBeforeRenderObservable.add(() => { if (scene.activeCamera) this.mat.setVector3('camPos', scene.activeCamera.position); });
  }
  _col(a) { return new BABYLON.Color3(a[0], a[1], a[2]); }

  _makeTex(name, base, kind) {
    const size = WV_CONFIG.texSize, P = 16;
    const t = new BABYLON.DynamicTexture(name, { width: size, height: size }, this.scene, true);
    const ctx = t.getContext(), img = ctx.createImageData(size, size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const u = i / size * P, v = j / size * P;
      const n = _fbmP(u, v, P, this.seed + kind * 131, 4);
      const fine = _fbmP(u * 3.1, v * 3.1, P * 3, this.seed + 700 + kind, 3);
      let rr = base[0], gg = base[1], bb = base[2];
      if (kind === 0) { const bl = 0.66 + 0.55 * n + 0.18 * fine; rr *= bl; gg *= (0.78 + 0.5 * n + 0.15 * fine); bb *= bl * 0.95;
        if (fine > 0.7) { gg *= 1.12; } }                                    // brins plus clairs
      else if (kind === 1) { const bl = 0.68 + 0.5 * n + 0.2 * fine; rr *= bl; gg *= bl; bb *= bl * 0.95;
        if (_fbmP(u * 4.2, v * 4.2, P * 4, this.seed + 500, 2) > 0.74) { rr *= 1.3; gg *= 1.25; bb *= 1.18; } } // cailloux
      else if (kind === 2) { const bl = 0.6 + 0.55 * n + 0.15 * fine; rr *= bl; gg *= bl; bb *= bl;
        const cr = _fbmP(u * 2.0, v * 2.0, P * 2, this.seed + 900, 3); if (cr < 0.30) { rr *= 0.55; gg *= 0.55; bb *= 0.58; } } // fissures
      else { const bl = 0.55 + 0.45 * n + 0.12 * fine; rr *= bl; gg *= (0.66 + 0.45 * n); bb *= (0.72 + 0.42 * n); }
      const o = (j * size + i) * 4;
      img.data[o] = _wvClamp(rr, 0, 1) * 255; img.data[o + 1] = _wvClamp(gg, 0, 1) * 255; img.data[o + 2] = _wvClamp(bb, 0, 1) * 255; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); t.update(); t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; return t;
  }

  _makeNormal(name) {
    const size = WV_CONFIG.texSize, P = 16, seed = this.seed + 4242;
    const H = new Float32Array(size * size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) H[j * size + i] = _fbmP(i / size * P, j / size * P, P, seed, 4) * 0.6 + _fbmP(i / size * P * 3, j / size * P * 3, P * 3, seed + 9, 3) * 0.4;
    const t = new BABYLON.DynamicTexture(name, { width: size, height: size }, this.scene, false);
    const ctx = t.getContext(), img = ctx.createImageData(size, size), str = 2.6;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const l = H[j * size + ((i - 1 + size) % size)], rgt = H[j * size + ((i + 1) % size)];
      const up = H[((j - 1 + size) % size) * size + i], dn = H[((j + 1) % size) * size + i];
      let nx = (l - rgt) * str, ny = (up - dn) * str, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
      const o = (j * size + i) * 4;
      img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * 0.5 + 0.5) * 255; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); t.update(); t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; return t;
  }

  _buildTextures() {
    const E = RWA_ENV;
    this.texGrass = this._makeTex('rwaGrass', E.colGrass, 0);
    this.texDirt = this._makeTex('rwaDirt', E.colDirt, 1);
    this.texRock = this._makeTex('rwaRock', E.colRock, 2);
    this.texWet = this._makeTex('rwaWet', E.colWet, 3);
    this.texNorm = this._makeNormal('rwaNorm');
  }

  _registerShaders() {
    BABYLON.Effect.ShadersStore['rwaTerrainVertexShader'] = `
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec2 uv; attribute vec4 color;
uniform mat4 worldViewProjection; uniform mat4 world;
varying vec2 vUV; varying vec4 vW; varying vec3 vNormalW; varying vec3 vPosW;
void main(void){ vec4 wp = world*vec4(position,1.0); vPosW=wp.xyz; vNormalW=normalize((world*vec4(normal,0.0)).xyz); vUV=uv; vW=color; gl_Position=worldViewProjection*vec4(position,1.0); }`;
    BABYLON.Effect.ShadersStore['rwaTerrainFragmentShader'] = `
precision highp float;
varying vec2 vUV; varying vec4 vW; varying vec3 vNormalW; varying vec3 vPosW;
uniform sampler2D grassTex; uniform sampler2D dirtTex; uniform sampler2D rockTex; uniform sampler2D wetTex; uniform sampler2D normTex;
uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 ambUp; uniform vec3 ambDown;
uniform vec3 fogColor; uniform vec2 fogRange; uniform vec3 camPos; uniform float uDebug; uniform float macroScale;
// double-échelle : détail (uv) modulé par macro (uv*macroScale)
vec3 sampAlb(sampler2D s, vec2 uv){
  vec3 det = texture2D(s, uv).rgb;
  float m = texture2D(s, uv*macroScale).r;         // grande variation
  return det * mix(0.82, 1.20, m);
}
void main(void){
  vec4 w = vW; float s = max(w.r+w.g+w.b+w.a, 0.0001); w /= s;
  vec2 uv = vUV;
  vec3 albedo = sampAlb(grassTex,uv)*w.r + sampAlb(dirtTex,uv)*w.g + sampAlb(rockTex,uv)*w.b + sampAlb(wetTex,uv)*w.a;
  // variation couleur micro
  float cv = 0.90 + 0.18 * texture2D(dirtTex, vPosW.xz*0.02).g;
  albedo *= cv;
  // NORMAL detail : perturbe la normale géométrique (tangent X, bitangent Z)
  vec3 nT = texture2D(normTex, uv).rgb*2.0-1.0;
  vec3 nT2 = texture2D(normTex, uv*0.31).rgb*2.0-1.0;
  vec3 nrm = normalize(nT + nT2*0.6);
  float nStrength = 0.35 + 0.55*w.b;               // rock plus marqué
  vec3 Ng = normalize(vNormalW);
  vec3 N = normalize(Ng + vec3(1.0,0.0,0.0)*nrm.x*nStrength + vec3(0.0,0.0,1.0)*nrm.y*nStrength);
  // éclairage
  vec3 Ld = -normalize(sunDir);
  float ndl = max(dot(N, Ld), 0.0);
  float hemi = 0.5 + 0.5*N.y;
  vec3 amb = mix(ambDown, ambUp, hemi);
  vec3 lit = albedo * (amb + sunColor*ndl);
  // spéculaire léger : surtout wet, un peu rock
  vec3 V = normalize(camPos - vPosW);
  vec3 Hh = normalize(Ld + V);
  float spec = pow(max(dot(N,Hh),0.0), 32.0) * (w.a*0.5 + w.b*0.10);
  lit += sunColor * spec;
  // fog
  float dist = distance(vPosW, camPos);
  float fog = clamp((dist - fogRange.x)/(fogRange.y - fogRange.x), 0.0, 1.0);
  vec3 col = mix(lit, fogColor, fog);
  if (uDebug > 1.5) col = N*0.5+0.5;               // debug normals
  else if (uDebug > 0.5) col = vec3(w.r, w.g, w.b);// debug masques
  gl_FragColor = vec4(col, 1.0);
}`;
  }

  _buildMaterial() {
    const E = RWA_ENV, scene = this.scene;
    const m = new BABYLON.ShaderMaterial('rwaTerrain', scene, { vertex: 'rwaTerrain', fragment: 'rwaTerrain' }, {
      attributes: ['position', 'normal', 'uv', 'color'],
      uniforms: ['worldViewProjection', 'world', 'sunDir', 'sunColor', 'ambUp', 'ambDown', 'fogColor', 'fogRange', 'camPos', 'uDebug', 'macroScale'],
      samplers: ['grassTex', 'dirtTex', 'rockTex', 'wetTex', 'normTex'],
    });
    m.setTexture('grassTex', this.texGrass); m.setTexture('dirtTex', this.texDirt); m.setTexture('rockTex', this.texRock); m.setTexture('wetTex', this.texWet); m.setTexture('normTex', this.texNorm);
    m.setVector3('sunDir', new BABYLON.Vector3(E.sunDir[0], E.sunDir[1], E.sunDir[2]));
    m.setColor3('sunColor', this._col(E.sunColor)); m.setColor3('ambUp', this._col(E.ambUp)); m.setColor3('ambDown', this._col(E.ambDown));
    m.setColor3('fogColor', this._col(E.fogColor)); m.setVector2('fogRange', new BABYLON.Vector2(E.fogStart, E.fogEnd));
    m.setVector3('camPos', new BABYLON.Vector3(0, 0, 0)); m.setFloat('uDebug', 0);
    m.setFloat('macroScale', WV_CONFIG.tileDetail / WV_CONFIG.tileMacro);
    m.backFaceCulling = false; this.mat = m;
  }

  setDebug(v) { this.debug = v | 0; this.mat.setFloat('uDebug', this.debug); }
  setWireframe(on) { this.mat.wireframe = on; }

  paintChunk(mesh, cx, cy) {
    const pos = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const nor = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    if (!pos) return;
    const S = this.S, seed = this.seed, C = WV_CONFIG, n = pos.length / 3;
    const col = new Float32Array(n * 4), uvs = new Float32Array(n * 2), invTile = 1 / C.tileDetail;
    for (let i = 0; i < n; i++) {
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      const x = px / S, z = pz / S;
      uvs[i * 2] = x * invTile; uvs[i * 2 + 1] = z * invTile;
      const altN = _wvClamp((py - C.altLow) / (C.altHigh - C.altLow), 0, 1);
      const ny = nor ? nor[i * 3 + 1] : 1;
      const slopeDeg = Math.acos(_wvClamp(ny, -1, 1)) * 180 / Math.PI;
      let [g, d, r, w] = terrainWeights(x, z, altN, slopeDeg, seed);
      const rm = roadPaint(x, z, seed);
      if (rm > 0) { g *= (1 - rm); r *= (1 - rm); w *= (1 - rm); d = d * (1 - rm) + rm; }
      col[i * 4] = g; col[i * 4 + 1] = d; col[i * 4 + 2] = r; col[i * 4 + 3] = w;
    }
    mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs, true);
    mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, col, false);
    mesh.useVertexColors = true; mesh.material = this.mat; mesh.applyFog = false;
  }
}

if (typeof window !== 'undefined') {
  window.WorldVisuals = WorldVisualsSystem;
  window.WorldVisualsSystem = WorldVisualsSystem;
  window.WV_CONFIG = WV_CONFIG;
  window.terrainWeights = terrainWeights;
  window.roadPaint = roadPaint;
}

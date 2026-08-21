/* ============================================================
   worldvisuals.js — Terrain Material & Roads (V0.4.6a/b + V0.4.6.1 quality)

   COUCHE VISUELLE, LECTURE SEULE (TerrainGenerator, BiomeSystem, TERRAIN_GEO).
   Ne recalcule ni ne modifie JAMAIS la géographie.

   V0.4.7 — matériaux PBR CC0 à hauteur de personnage :
   - 4 surfaces Poly Haven (grass/dirt/rock/mud), chacune albedo+normal+roughness.
   - Densité de texel fine + anti-tiling stochastique par seconde projection
     tournée/décalée (sans réutiliser l'albedo comme bruit macro).
   - Blending riche : pente/altitude/humidité/biome + macro-noise (poches de dirt
     naturelles dans le grass, rock progressif sur les pentes).
   - Routes cassées : gravier, plaques d'herbe, ornières, bords bruités (plus de bande).
   - Spéculaire léger sur wet ; variation de couleur micro.
   - UV MONDE (seam 0). Lumière + fog calés sur RWA_ENV.
   ============================================================ */

const WV_CONFIG = {
  altLow: -12, altHigh: 150,
  moistFreq: 0.00013,
  tileDetail: 88,              // compromis lisibilité / moiré ; l'anti-tiling casse la répétition
  antiTileScale: 0.035,        // fréquence du fondu stochastique en coordonnées rendu
  rockSlopeA: 10, rockSlopeB: 20, rockSlopeC: 36, rockAltA: 0.62, rockAltB: 0.88,
  wetRiverR: 2100,
  roadVisW0: 140, roadVisW1: 860,
  textureRoot: './assets/terrain/',
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

  _texture(name, file, linear) {
    const t = new BABYLON.Texture(WV_CONFIG.textureRoot + file, this.scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    t.name = name; t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 8;
    if (linear) t.gammaSpace = false;
    return t;
  }

  _buildTextures() {
    this.texGrass = this._texture('rwaGrassAlbedo', 'grass_albedo.jpg', false);
    this.texDirt = this._texture('rwaDirtAlbedo', 'dirt_albedo.jpg', false);
    this.texRock = this._texture('rwaRockAlbedo', 'rock_albedo.jpg', false);
    this.texWet = this._texture('rwaMudAlbedo', 'mud_albedo.jpg', false);
    this.normGrass = this._texture('rwaGrassNormal', 'grass_normal.jpg', true);
    this.normDirt = this._texture('rwaDirtNormal', 'dirt_normal.jpg', true);
    this.normRock = this._texture('rwaRockNormal', 'rock_normal.jpg', true);
    this.normWet = this._texture('rwaMudNormal', 'mud_normal.jpg', true);
    this.roughGrass = this._texture('rwaGrassRoughness', 'grass_rough.jpg', true);
    this.roughDirt = this._texture('rwaDirtRoughness', 'dirt_rough.jpg', true);
    this.roughRock = this._texture('rwaRockRoughness', 'rock_rough.jpg', true);
    this.roughWet = this._texture('rwaMudRoughness', 'mud_rough.jpg', true);
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
uniform sampler2D grassTex; uniform sampler2D dirtTex; uniform sampler2D rockTex; uniform sampler2D wetTex;
uniform sampler2D grassNormTex; uniform sampler2D dirtNormTex; uniform sampler2D rockNormTex; uniform sampler2D wetNormTex;
uniform sampler2D grassRoughTex; uniform sampler2D dirtRoughTex; uniform sampler2D rockRoughTex; uniform sampler2D wetRoughTex;
uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 ambUp; uniform vec3 ambDown;
uniform float sunIntensity; uniform float ambIntensity;
uniform vec3 fogColor; uniform vec2 fogRange; uniform vec3 camPos; uniform float uDebug; uniform float antiTileScale;
float antiHash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float antiNoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(antiHash(i),antiHash(i+vec2(1.0,0.0)),f.x),mix(antiHash(i+vec2(0.0,1.0)),antiHash(i+vec2(1.0,1.0)),f.x),f.y);
}
vec2 antiUV(vec2 uv, vec2 offset){
  // Rotation de 37°, échelle non harmonique et décalage : les détails ne se superposent plus.
  return vec2(0.7986*uv.x-0.6018*uv.y,0.6018*uv.x+0.7986*uv.y)*0.83+offset;
}
vec3 sampAlb(sampler2D s, vec2 uv, vec2 uvB, float blend){
  vec3 a=texture2D(s,uv).rgb, b=texture2D(s,uvB).rgb;
  return mix(a,b,blend);
}
vec3 unpackNormal(sampler2D s, vec2 uv){ return texture2D(s, uv).rgb*2.0-1.0; }
vec3 sampNormal(sampler2D s, vec2 uv, vec2 uvB, float blend){
  vec3 a=unpackNormal(s,uv), b=unpackNormal(s,uvB);
  // La seconde projection est tournée : ramener ses axes tangentiels dans ceux du monde.
  b.xy=vec2(0.7986*b.x+0.6018*b.y,-0.6018*b.x+0.7986*b.y);
  return normalize(mix(a,b,blend));
}
float sampRough(sampler2D s, vec2 uv, vec2 uvB, float blend){
  return mix(texture2D(s,uv).r,texture2D(s,uvB).r,blend);
}
void main(void){
  vec4 w = vW; float s = max(w.r+w.g+w.b+w.a, 0.0001); w /= s;
  vec2 uv=vUV;
  vec2 grassUVB=antiUV(uv,vec2(17.17,9.23));
  vec2 dirtUVB =antiUV(uv,vec2(31.41,4.73));
  vec2 rockUVB =antiUV(uv,vec2(7.61,26.89));
  vec2 wetUVB  =antiUV(uv,vec2(23.53,19.37));
  float antiBlend = smoothstep(0.22,0.78,antiNoise(vPosW.xz*antiTileScale));
  vec3 albedo = sampAlb(grassTex,uv,grassUVB,antiBlend)*w.r + sampAlb(dirtTex,uv,dirtUVB,antiBlend)*w.g + sampAlb(rockTex,uv,rockUVB,antiBlend)*w.b + sampAlb(wetTex,uv,wetUVB,antiBlend)*w.a;
  // Variation de couleur indépendante des textures : aucune grande copie de dirt visible.
  float cv = 0.88 + 0.12 * antiNoise(vPosW.xz*0.018+vec2(13.7,4.1));
  albedo *= cv;
  // Normales PBR mélangées avec les mêmes poids que l'albedo.
  vec3 nrm = normalize(sampNormal(grassNormTex,uv,grassUVB,antiBlend)*w.r + sampNormal(dirtNormTex,uv,dirtUVB,antiBlend)*w.g + sampNormal(rockNormTex,uv,rockUVB,antiBlend)*w.b + sampNormal(wetNormTex,uv,wetUVB,antiBlend)*w.a);
  float normalFade = mix(1.0,0.42,smoothstep(28.0,95.0,distance(vPosW,camPos)));
  float nStrength = (0.20 + 0.26*w.b)*normalFade;  // détail proche, sans moiré au loin
  vec3 Ng = normalize(vNormalW);
  vec3 N = normalize(Ng + vec3(1.0,0.0,0.0)*nrm.x*nStrength + vec3(0.0,0.0,1.0)*nrm.y*nStrength);
  // éclairage
  vec3 Ld = -normalize(sunDir);
  float ndl = max(dot(N, Ld), 0.0);
  float hemi = 0.5 + 0.5*N.y;
  vec3 amb = mix(ambDown, ambUp, hemi);
  // Budget lumineux borné : empêche ambiance + soleil de clipper les albedos clairs.
  vec3 lit = albedo * (amb*0.68*ambIntensity + sunColor*ndl*0.58*sunIntensity);
  // Roughness PBR : contrôle conjoint de la largeur et de l'intensité spéculaire.
  float roughness = sampRough(grassRoughTex,uv,grassUVB,antiBlend)*w.r + sampRough(dirtRoughTex,uv,dirtUVB,antiBlend)*w.g + sampRough(rockRoughTex,uv,rockUVB,antiBlend)*w.b + sampRough(wetRoughTex,uv,wetUVB,antiBlend)*w.a;
  vec3 V = normalize(camPos - vPosW);
  vec3 Hh = normalize(Ld + V);
  float specPower = mix(72.0, 9.0, roughness);
  float specAmount = mix(0.34, 0.025, roughness) * (0.55 + w.a*0.45);
  float spec = pow(max(dot(N,Hh),0.0), specPower) * specAmount;
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
      uniforms: ['worldViewProjection', 'world', 'sunDir', 'sunColor', 'ambUp', 'ambDown', 'sunIntensity', 'ambIntensity', 'fogColor', 'fogRange', 'camPos', 'uDebug', 'antiTileScale'],
      samplers: ['grassTex', 'dirtTex', 'rockTex', 'wetTex', 'grassNormTex', 'dirtNormTex', 'rockNormTex', 'wetNormTex', 'grassRoughTex', 'dirtRoughTex', 'rockRoughTex', 'wetRoughTex'],
    });
    m.setTexture('grassTex', this.texGrass); m.setTexture('dirtTex', this.texDirt); m.setTexture('rockTex', this.texRock); m.setTexture('wetTex', this.texWet);
    m.setTexture('grassNormTex', this.normGrass); m.setTexture('dirtNormTex', this.normDirt); m.setTexture('rockNormTex', this.normRock); m.setTexture('wetNormTex', this.normWet);
    m.setTexture('grassRoughTex', this.roughGrass); m.setTexture('dirtRoughTex', this.roughDirt); m.setTexture('rockRoughTex', this.roughRock); m.setTexture('wetRoughTex', this.roughWet);
    m.setVector3('sunDir', new BABYLON.Vector3(E.sunDir[0], E.sunDir[1], E.sunDir[2]));
    m.setColor3('sunColor', this._col(E.sunColor)); m.setColor3('ambUp', this._col(E.ambUp)); m.setColor3('ambDown', this._col(E.ambDown));
    m.setFloat('sunIntensity', E.terrainSunIntensity); m.setFloat('ambIntensity', E.terrainAmbientIntensity);
    m.setColor3('fogColor', this._col(E.fogColor)); m.setVector2('fogRange', new BABYLON.Vector2(E.fogStart, E.fogEnd));
    m.setVector3('camPos', new BABYLON.Vector3(0, 0, 0)); m.setFloat('uDebug', 0);
    m.setFloat('antiTileScale', WV_CONFIG.antiTileScale);
    this._tuningBaseline = {
      sunColor: E.sunColor.slice(), ambUp: E.ambUp.slice(), ambDown: E.ambDown.slice(),
      sunIntensity: E.terrainSunIntensity, ambIntensity: E.terrainAmbientIntensity,
    };
    m.backFaceCulling = false; this.mat = m;
  }

  /* Synchronise uniquement les uniforms d'apparence avec Environment.
     Aucun poids de biome, vertex, chunk ou donnée canonique n'est recalculé. */
  applyVisualTuning(settings, baseline) {
    if (!settings || !baseline || !this.mat) return;
    const fog = settings.fog, light = settings.lighting;
    const baseLight = baseline.lighting, B = this._tuningBaseline;
    const sunColor = BABYLON.Color3.FromHexString(light.directionalColor);
    const ambientColor = BABYLON.Color3.FromHexString(light.ambientColor);
    const baseAmbient = BABYLON.Color3.FromHexString(baseLight.ambientColor);
    const scale = [
      ambientColor.r / Math.max(baseAmbient.r, 0.001),
      ambientColor.g / Math.max(baseAmbient.g, 0.001),
      ambientColor.b / Math.max(baseAmbient.b, 0.001),
    ];
    this.mat.setColor3('fogColor', BABYLON.Color3.FromHexString(fog.color));
    this.mat.setVector2('fogRange', new BABYLON.Vector2(fog.start, fog.end));
    this.mat.setColor3('sunColor', sunColor);
    this.mat.setFloat('sunIntensity', B.sunIntensity * light.directionalIntensity / Math.max(baseLight.directionalIntensity, 0.001));
    this.mat.setColor3('ambUp', this._col(B.ambUp.map((v, i) => v * scale[i])));
    this.mat.setColor3('ambDown', this._col(B.ambDown.map((v, i) => v * scale[i])));
    this.mat.setFloat('ambIntensity', B.ambIntensity * light.ambientIntensity / Math.max(baseLight.ambientIntensity, 0.001));
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

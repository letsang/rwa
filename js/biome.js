/* ============================================================
   biome.js — Biome Classification (V0.4.5a)

   INDÉPENDANT de Babylon. getBiome(x,z,seed) DÉRIVE le biome de la
   topographie V0.4.4 (altitude, pente, proximité rivière/route/warzone),
   PAS d'un bruit peint par-dessus. terrain.js reste GELÉ : on ne lit que
   TerrainGenerator.height / .slopeDeg / .geo (TERRAIN_GEO).

   Signature de royaume par BIAIS légers (pas de frontière nette), fondus
   progressivement via des poids angulaires depuis le centre :
     - Nord  (CENTER) : tempéré, plutôt forêts / hauts plateaux (humide, frais)
     - Est   (EAST)   : aride / rocailleux (sec, chaud)
     - Ouest (WEST)   : plus sombre / humide (très humide, frais)

   Sortie : getBiome(x,z,seed) -> {
     type: FOREST|GRASSLAND|HIGHLAND|WETLAND|BARREN,
     moisture 0..1, temperature 0..1, altitude (unités rendu), slope (deg),
     density 0..1 (potentiel de végétation AVANT exclusion),
     realm: 'CENTER'|'EAST'|'WEST' (dominant), weights,
     exclude: bool (routes/forts/spawns/rivières/cœur warzone -> pas de végé)
   }
   ============================================================ */

/* petit bruit local (indépendant de terrain.js) */
function _bHash(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h = (h ^ (h >>> 16)) >>> 0; return h / 4294967296;
}
function _bFade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function _bNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), xf = x - x0, yf = y - y0;
  const v00 = _bHash(x0, y0, seed), v10 = _bHash(x0 + 1, y0, seed);
  const v01 = _bHash(x0, y0 + 1, seed), v11 = _bHash(x0 + 1, y0 + 1, seed);
  const u = _bFade(xf), v = _bFade(yf);
  return (1 - v) * ((1 - u) * v00 + u * v10) + v * ((1 - u) * v01 + u * v11); // 0..1
}
function _clampB(v, a, b) { return v < a ? a : (v > b ? b : v); }
function _distSegB(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
  let t = _clampB(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function _distPolys(x, y, polys) { let m = Infinity; for (const l of polys) for (let i = 0; i < l.length - 1; i++) { const d = _distSegB(x, y, l[i].x, l[i].y, l[i + 1].x, l[i + 1].y); if (d < m) m = d; } return m; }
function _distPts(x, y, pts) { let m = Infinity; for (const p of pts) { const d = Math.hypot(x - p.x, y - p.y); if (d < m) m = d; } return m; }

const BIOME_CONFIG = {
  // normalisation altitude (unités rendu) : plage utile ~ -33..+203
  altLow: -12, altHigh: 150,
  moistFreq: 0.00013, tempFreq: 0.00010,      // bruit basse fréquence (variation douce)
  // seuils de classification
  slopeHighlandDeg: 26, altHighland: 0.72,
  wetlandRiverR: 1500, wetlandMoist: 0.55,
  forestMoist: 0.52, barrenMoist: 0.32,
  // ouverture / exclusion (garde corridors & warzone lisibles)
  openRoadR: 1300, openFortR: 2700, openSpawnR: 3300, openWarzoneR: 9000,
  exclRoadR: 1550, exclFortR: 2900, exclSpawnR: 3500, exclRiverR: 950, exclWarzoneR: 6500,
  blendRad: 1.05,                              // radians : douceur des transitions royaume
  // biais par royaume (léger)
  bias: {
    CENTER: { moist: +0.10, temp: -0.08 },     // Nord tempéré humide/frais
    EAST:   { moist: -0.20, temp: +0.16 },     // Est aride/chaud
    WEST:   { moist: +0.16, temp: -0.05 },     // Ouest humide/sombre
  },
};

const BIOME_TYPES = ['FOREST', 'GRASSLAND', 'HIGHLAND', 'WETLAND', 'BARREN'];
// couleurs de debug (carte top-down) — non utilisées par le gameplay
const BIOME_COLORS = {
  FOREST: [42, 92, 52], GRASSLAND: [120, 158, 82], HIGHLAND: [138, 130, 120],
  WETLAND: [58, 110, 104], BARREN: [156, 138, 96],
};

const BiomeSystem = {
  config: BIOME_CONFIG, types: BIOME_TYPES, colors: BIOME_COLORS,

  _geo() { return (typeof TERRAIN_GEO !== 'undefined') ? TERRAIN_GEO : window.TERRAIN_GEO; },

  /* Poids de royaume (somme=1) par proximité ANGULAIRE au spawn depuis le centre.
     Transitions progressives -> pas de frontière nette. */
  realmWeights(x, y) {
    const G = this._geo(), c = G.center;
    const ang = Math.atan2(y - c.y, x - c.x);
    const w = {}; let sum = 0;
    for (const k in G.realms) {
      const s = G.realms[k].spawn;
      const sa = Math.atan2(s.y - c.y, s.x - c.x);
      let d = Math.abs(ang - sa); if (d > Math.PI) d = 2 * Math.PI - d;   // écart angulaire 0..π
      const ww = Math.exp(-(d / BIOME_CONFIG.blendRad) * (d / BIOME_CONFIG.blendRad));
      w[k] = ww; sum += ww;
    }
    for (const k in w) w[k] /= (sum || 1);
    return w;
  },

  getBiome(x, z, seed) {
    seed = (seed == null) ? WORLD_SEED : seed;
    const TG = (typeof TerrainGenerator !== 'undefined') ? TerrainGenerator : window.TerrainGenerator;
    const G = this._geo(), C = BIOME_CONFIG;

    const h = TG.height(x, z, seed);
    const slope = TG.slopeDeg(x, z, seed);
    const altN = _clampB((h - C.altLow) / (C.altHigh - C.altLow), 0, 1);
    const slopeN = _clampB(slope / 45, 0, 1);

    const cx = G.center.x, cy = G.center.y;
    const dCenter = Math.hypot(x - cx, z - cy);
    const roadD = _distPolys(x, z, G.roads);
    const riverD = _distPolys(x, z, G.rivers);
    const fortD = _distPts(x, z, G.forts);
    const spawnD = _distPts(x, z, G.spawns);

    // biais royaume (fondu)
    const w = this.realmWeights(x, z);
    let bM = 0, bT = 0; for (const k in w) { bM += w[k] * C.bias[k].moist; bT += w[k] * C.bias[k].temp; }

    // --- humidité : bruit doux + proximité rivière + creux (basse altitude) + biais ---
    const mN = _bNoise(x * C.moistFreq, z * C.moistFreq, seed + 555);        // 0..1
    const riverWet = _clampB(1 - riverD / 2600, 0, 1);                       // près rivière = humide
    const lowWet = (1 - altN) * 0.35;                                        // bassins plus humides
    const moisture = _clampB(mN * 0.5 + riverWet * 0.55 + lowWet + bM, 0, 1);

    // --- température : décroît avec l'altitude, + biais + léger bruit ---
    const tN = _bNoise(x * C.tempFreq + 91, z * C.tempFreq + 91, seed + 777);
    const temperature = _clampB(0.58 - (altN - 0.3) * 0.55 + bT + (tN - 0.5) * 0.18, 0, 1);

    // --- exclusion végétation (corridors, forts, spawns, rivières, cœur warzone) ---
    const exclude = roadD < C.exclRoadR || fortD < C.exclFortR || spawnD < C.exclSpawnR
                 || riverD < C.exclRiverR || dCenter < C.exclWarzoneR;
    const open = roadD < C.openRoadR || fortD < C.openFortR || spawnD < C.openSpawnR
              || dCenter < C.openWarzoneR;

    // --- densité de végétation potentielle (avant exclusion) ---
    let density = _clampB(moisture * (1 - slopeN) * (1 - altN * 0.35) * (0.5 + temperature * 0.5), 0, 1);
    if (exclude) density = 0;

    // --- type de biome (priorité topographie -> humidité) ---
    let type;
    if (slope > C.slopeHighlandDeg || altN > C.altHighland) type = 'HIGHLAND';
    else if (riverD < C.wetlandRiverR && moisture > C.wetlandMoist) type = 'WETLAND';
    else if (open) type = 'GRASSLAND';                                        // zones de combat lisibles
    else if (moisture > C.forestMoist) type = 'FOREST';
    else if (moisture < C.barrenMoist) type = 'BARREN';
    else type = 'GRASSLAND';

    let realm = 'CENTER', best = -1; for (const k in w) if (w[k] > best) { best = w[k]; realm = k; }
    return { type, moisture, temperature, altitude: h, slope, density, realm, weights: w, exclude };
  },
};

if (typeof window !== 'undefined') {
  window.BiomeSystem = BiomeSystem;
  window.BIOME_CONFIG = BIOME_CONFIG;
  window.BIOME_TYPES = BIOME_TYPES;
}

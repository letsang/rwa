/* ============================================================
   terrain.js — TerrainGenerator (V0.4.4 : RvR Terrain Shaping)

   INDÉPENDANT DE BABYLON. terrainHeight(x,y,seed) est LA source de vérité
   (personnages, forts, routes, caméra, future végétation/nav demandent tous
   la même hauteur). Évalué en COORDONNÉES MONDE (sim) -> continuité parfaite
   entre chunks (seam = 0). Le système de chunks n'est PAS modifié.

   V0.4.4 transforme le bruit V0.4.1 en macro-topographie RvR CONTRÔLÉE,
   déterministe, sans aucun décor ni gameplay. 5 briques, toutes dans height() :
     1) Macro-relief royaume  : bassin central + hautes terres périphériques (bowl)
                                + 3 arêtes inter-royaumes (barrières) + plateaux de spawn.
     2) Plateformes de forts   : aplatissement progressif autour de chaque fort/spawn.
     3) Routes structurelles   : corridors spawn→forts→centre légèrement aplatis.
     4) Rivières / vallées      : dépressions topographiques réelles (sans eau).
     5) Zone centrale de guerre : ouverte mais tactique (bosses/creux/knolls).

   Astuce clé : les ROUTES suppriment localement les arêtes et les rivières
   -> les COLS (passes) et les GUÉS (fords) apparaissent automatiquement là où
   les corridors croisent une barrière. Pas de falaise en travers d'une route.

   Sorties en unités de RENDU (Babylon Y). Distances de géo en unités SIM.
   ============================================================ */

/* ---------- Bruit de surface (détail), value-noise seedé + fade ---------- */
function _hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 362437);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function _lerp(a, b, t) { return a + (b - a) * t; }
function valueNoise2D(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const xf = x - x0, yf = y - y0;
  const v00 = _hash2(x0, y0, seed), v10 = _hash2(x0 + 1, y0, seed);
  const v01 = _hash2(x0, y0 + 1, seed), v11 = _hash2(x0 + 1, y0 + 1, seed);
  const u = _fade(xf), v = _fade(yf);
  return _lerp(_lerp(v00, v10, u), _lerp(v01, v11, u), v) * 2 - 1;
}

/* ---------- petites maths ---------- */
function _clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function _smooth(e0, e1, x) { const t = _clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1); return t * t * (3 - 2 * t); }
function _distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = _clamp(t, 0, 1);
  const cx = ax + t * dx, cy = ay + t * dy;
  return { d: Math.hypot(px - cx, py - cy), cx, cy };
}

/* ============================================================
   GÉOGRAPHIE RvR (coords MONDE / sim). Calée sur world.js OBJECTIVES.
   NORD→CENTER, EST→EAST, OUEST→WEST. Ne définit QUE des points géographiques ;
   aucune règle de capture ici (gameplay = V0.5.0).
   ============================================================ */
const _WS = (typeof WORLD_SIZE !== 'undefined') ? WORLD_SIZE : 50000;
const _P = (fx, fy) => ({ x: fx * _WS, y: fy * _WS });
const TERRAIN_GEO = {
  center: _P(0.52, 0.50),                    // WARZONE — champ de bataille central
  realms: {
    CENTER: { spawn: _P(0.52, 0.10), forts: [_P(0.37, 0.26), _P(0.66, 0.24)] },
    WEST:   { spawn: _P(0.28, 0.90), forts: [_P(0.33, 0.55), _P(0.45, 0.74)] },
    EAST:   { spawn: _P(0.80, 0.64), forts: [_P(0.75, 0.46), _P(0.64, 0.76)] },
  },
};
// listes dérivées
TERRAIN_GEO.spawns = Object.values(TERRAIN_GEO.realms).map(r => r.spawn);
TERRAIN_GEO.forts = Object.values(TERRAIN_GEO.realms).reduce((a, r) => a.concat(r.forts), []);
// Réseau de ROUTES : par royaume, deux corridors spawn→fort→centre.
TERRAIN_GEO.roads = [];
for (const r of Object.values(TERRAIN_GEO.realms))
  for (const f of r.forts) TERRAIN_GEO.roads.push([r.spawn, f, TERRAIN_GEO.center]);
// RIVIÈRES : une par secteur, d'un bord vers le bassin central (convergence).
// Décalées des routes -> elles se croisent (gués auto aux croisements).
TERRAIN_GEO.rivers = [
  [_P(0.50, 0.02), _P(0.44, 0.22), _P(0.47, 0.40), TERRAIN_GEO.center],   // secteur Nord
  [_P(0.06, 0.78), _P(0.24, 0.66), _P(0.40, 0.55), TERRAIN_GEO.center],   // secteur Ouest
  [_P(0.96, 0.50), _P(0.78, 0.56), _P(0.62, 0.53), TERRAIN_GEO.center],   // secteur Est
];
// KNOLLS tactiques dans la warzone (bosses coupe-lignes-de-vue).
TERRAIN_GEO.warKnolls = [
  { p: _P(0.46, 0.44), r: 2600, h: 12 },
  { p: _P(0.58, 0.47), r: 2300, h: 10 },
  { p: _P(0.50, 0.58), r: 2800, h: 13 },
  { p: _P(0.55, 0.40), r: 2000, h: 9 },
];

/* Arêtes inter-royaumes : rayons partant du centre, sur les bissectrices
   angulaires entre royaumes adjacents (séparent les 3 secteurs). */
(function buildRidges() {
  const c = TERRAIN_GEO.center;
  const ang = {};
  for (const [k, r] of Object.entries(TERRAIN_GEO.realms)) ang[k] = Math.atan2(r.spawn.y - c.y, r.spawn.x - c.x);
  const bis = (a, b) => { // bissectrice robuste (moyenne vectorielle)
    const vx = Math.cos(a) + Math.cos(b), vy = Math.sin(a) + Math.sin(b);
    return Math.atan2(vy, vx);
  };
  TERRAIN_GEO.ridges = [
    bis(ang.CENTER, ang.EAST),
    bis(ang.EAST, ang.WEST),
    bis(ang.WEST, ang.CENTER),
  ].map(th => ({ cx: Math.cos(th), sy: Math.sin(th) }));
})();

/* ---------- Config macro (hauteurs en unités RENDU, distances en sim) ---------- */
const TERRAIN_CONFIG = {
  baseHeight: 0, resolution: 24, normalEpsilon: 2.0,
  // bruit de surface (détail organique)
  detailLargeA: 16, detailLargeF: 0.000055,
  detailMedA: 12, detailMedF: 0.00019,
  detailSmallA: 4, detailSmallF: 0.00075,
  // 1) macro-relief
  rimH: 82, rimInner: 8500, rimOuter: 30000,     // bowl : bord haut, centre bas
  basinH: 24, basinR: 11000,                      // bassin central (creux large)
  platH: 26, platR0: 3200, platR1: 8200,          // plateaux de spawn (accessibles)
  ridgeH: 120, ridgeW: 2600, ridgeStart: 4200, ridgeGrow: 3200, // arêtes/barrières
  // 5) micro warzone
  wzR: 12500, wzMicroA: 8, wzMicroF: 0.00034,
  // 2) plateformes de forts
  fortFlatR0: 1300, fortFlatR1: 3000,
  spawnFlatR0: 1700, spawnFlatR1: 3600,
  // 3) routes
  roadW0: 650, roadW1: 1650, roadCut: 6,
  // suppression arête/rivière près des routes (cols & gués)
  passInner: 900, passOuter: 2600,
  // 4) rivières
  riverDepth: 30, riverW: 1550,
};

/* ---------- distance aux polylignes (routes/rivières) ---------- */
function _nearestPoly(x, y, polys) {
  let best = { d: Infinity, cx: 0, cy: 0 };
  for (const line of polys) {
    for (let i = 0; i < line.length - 1; i++) {
      const s = _distSeg(x, y, line[i].x, line[i].y, line[i + 1].x, line[i + 1].y);
      if (s.d < best.d) best = s;
    }
  }
  return best;
}

const TerrainGenerator = {
  config: TERRAIN_CONFIG,
  geo: TERRAIN_GEO,
  _fortTargets: null, _fortSeed: null,

  /* Bruit de surface seul (détail), ±~15 unités. */
  _detail(x, y, seed) {
    const c = TERRAIN_CONFIG;
    return valueNoise2D(x * c.detailLargeF, y * c.detailLargeF, seed) * c.detailLargeA
         + valueNoise2D(x * c.detailMedF, y * c.detailMedF, seed + 17) * c.detailMedA
         + valueNoise2D(x * c.detailSmallF, y * c.detailSmallF, seed + 91) * c.detailSmallA;
  },

  /* Masque routes : d = distance à la route la plus proche.
     -> influence [0..1] pour créer cols/gués (arête & rivière supprimées près des routes). */
  _roadInfluence(d) {
    const c = TERRAIN_CONFIG;
    return 1 - _smooth(c.passInner, c.passOuter, d);
  },

  /* Terrain ADDITIF (macro + détail + arêtes + rivières), SANS aplatissement
     forts/routes -> sert de cible de grade pour les plateformes/corridors.
     PUR & déterministe. */
  additive(x, y, seed) {
    const c = TERRAIN_CONFIG, G = TERRAIN_GEO;
    const cx = G.center.x, cy = G.center.y;
    const dC = Math.hypot(x - cx, y - cy);
    let h = c.baseHeight + this._detail(x, y, seed);

    // --- 1a) bowl : bord haut, centre bas ---
    h += c.rimH * _smooth(c.rimInner, c.rimOuter, dC);
    // --- 1b) bassin central (creux large sous le rim) ---
    h -= c.basinH * (1 - _smooth(0, c.basinR, dC));

    // --- 1c) plateaux de spawn (zones d'origine accessibles) ---
    for (const s of G.spawns) {
      const d = Math.hypot(x - s.x, y - s.y);
      h += c.platH * (1 - _smooth(c.platR0, c.platR1, d));
    }

    // masque routes (une seule fois : partagé arêtes/rivières)
    const road = _nearestPoly(x, y, G.roads);
    const roadInf = this._roadInfluence(road.d);

    // --- 1d) arêtes inter-royaumes (barrières), cols auto près des routes ---
    const dEdge = Math.min(x, _WS - x, y, _WS - y);
    const edgeFade = _smooth(0, 2600, dEdge);           // pas d'arête qui déborde du monde
    let ridge = 0;
    const rx = x - cx, ry = y - cy;
    for (const R of G.ridges) {
      const proj = rx * R.cx + ry * R.sy;               // distance le long du rayon
      if (proj <= c.ridgeStart) continue;
      const perp = Math.abs(-rx * R.sy + ry * R.cx);    // distance perpendiculaire
      const along = _smooth(c.ridgeStart, c.ridgeStart + c.ridgeGrow, proj);
      const prof = Math.max(0, 1 - (perp / c.ridgeW) * (perp / c.ridgeW));
      ridge = Math.max(ridge, c.ridgeH * prof * along);
    }
    h += ridge * edgeFade * (1 - roadInf);              // cols où les routes croisent

    // --- 4) rivières : dépressions, gués auto près des routes ---
    const riv = _nearestPoly(x, y, G.rivers);
    const rivProf = (1 - _smooth(0, c.riverW, riv.d));  // 1 au centre du lit -> 0
    h -= c.riverDepth * rivProf * (1 - roadInf);

    // --- 5) warzone : micro-relief tactique (ouvert mais pas plat) ---
    if (dC < c.wzR) {
      const wzMask = 1 - _smooth(c.wzR - 3200, c.wzR, dC);
      h += valueNoise2D(x * c.wzMicroF, y * c.wzMicroF, seed + 301) * c.wzMicroA * wzMask;
      for (const k of G.warKnolls) {
        const d = Math.hypot(x - k.p.x, y - k.p.y);
        h += k.h * Math.exp(-(d * d) / (k.r * k.r)) * wzMask;
      }
    }
    return h;
  },

  /* Cibles de grade des forts/spawns (grade additif au centre), mémoïsées. */
  _ensureFortTargets(seed) {
    if (this._fortTargets && this._fortSeed === seed) return this._fortTargets;
    const G = TERRAIN_GEO, c = TERRAIN_CONFIG, list = [];
    for (const f of G.forts) list.push({ x: f.x, y: f.y, t: this.additive(f.x, f.y, seed), r0: c.fortFlatR0, r1: c.fortFlatR1 });
    for (const s of G.spawns) list.push({ x: s.x, y: s.y, t: this.additive(s.x, s.y, seed), r0: c.spawnFlatR0, r1: c.spawnFlatR1 });
    this._fortTargets = list; this._fortSeed = seed;
    return list;
  },

  /* HAUTEUR CANONIQUE — additif + aplatissements (forts, routes). PURE/DÉTERMINISTE. */
  height(worldX, worldY, seed) {
    seed = (seed == null) ? WORLD_SEED : seed;
    const c = TERRAIN_CONFIG, G = TERRAIN_GEO;
    let h = this.additive(worldX, worldY, seed);

    // --- 2) plateformes de forts/spawns : aplatir vers le grade local ---
    const targets = this._ensureFortTargets(seed);
    for (const p of targets) {
      const d = Math.hypot(worldX - p.x, worldY - p.y);
      const m = 1 - _smooth(p.r0, p.r1, d);
      if (m > 0) h = _lerp(h, p.t, m);
    }

    // --- 3) routes : corridor aplati vers le grade de l'axe (jamais de falaise en travers) ---
    const road = _nearestPoly(worldX, worldY, G.roads);
    const rm = 1 - _smooth(c.roadW0, c.roadW1, road.d);
    if (rm > 0) {
      const target = this.additive(road.cx, road.cy, seed) - c.roadCut;
      h = _lerp(h, target, rm);
    }
    return h;
  },

  /* Normale cohérente inter-chunks : dérivée analytique de height() en coords monde. */
  normal(worldX, worldY, seed) {
    const e = TERRAIN_CONFIG.normalEpsilon, S = RENDER_SCALE;
    const hxm = this.height(worldX - e, worldY, seed), hxp = this.height(worldX + e, worldY, seed);
    const hym = this.height(worldX, worldY - e, seed), hyp = this.height(worldX, worldY + e, seed);
    const dydx = (hxp - hxm) / (2 * e * S), dydz = (hyp - hym) / (2 * e * S);
    let nx = -dydx, ny = 1, nz = -dydz;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  },

  slopeDeg(worldX, worldY, seed) {
    const n = this.normal(worldX, worldY, seed);
    return Math.acos(Math.min(1, Math.max(-1, n.y))) * 180 / Math.PI;
  },

  slopeStats(seed, samples) {
    samples = samples || 400;
    let max = 0, sum = 0, n = 0;
    for (let i = 0; i < samples; i++) {
      const x = _hash2(i, 7, seed | 0) * WORLD_SIZE;
      const y = _hash2(i, 91, seed | 0) * WORLD_SIZE;
      const s = this.slopeDeg(x, y, seed);
      max = Math.max(max, s); sum += s; n++;
    }
    return { maxDeg: max, avgDeg: sum / n };
  },
};

if (typeof window !== 'undefined') {
  window.TerrainGenerator = TerrainGenerator;
  window.TERRAIN_CONFIG = TERRAIN_CONFIG;
  window.TERRAIN_GEO = TERRAIN_GEO;
}

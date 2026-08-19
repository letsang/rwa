/* ============================================================
   world.js — WorldDefinition (V0.4.0 World Scale Prototype)

   DÉCRIT le monde (données), indépendamment du rendu/streaming.
   Règle : WorldDefinition décrit le monde ; WorldChunkManager décide
   seulement quelle portion est rendue.

   Séparation des espaces :
     SIMULATION / WORLD LOGIC  (unités sim, grand espace)  <-- ici
             |
             v  (RENDER_SCALE)
     RENDER / BABYLON           (unités monde 3D)
   ============================================================ */

// Seed déterministe (quasi inutile en V0.4.0 ; requis pour le procédural futur).
const WORLD_SEED = 1337;

// Facteur sim -> rendu (inchangé depuis les versions précédentes : S = 0.08).
const RENDER_SCALE = 0.08;

// Vitesse de référence pour les estimations de trajet (unités sim/s).
// (~vitesse de base des personnages ; NE sert PAS à piloter la locomotion.)
const NORMAL_SPEED_REF = 110;

/* ÉCHELLE DU MONDE — FIGÉE en V0.4.0.1.
   Dimensionnée autour du gameplay existant (on NE ralentit PAS le perso).
   À WORLD_SIZE=50000 et vitesse de base ~105 u/s :
     spawn -> centre       ≈ 3,2 min
     traversée complète    ≈ 6,6 min
   Les 10 objectifs sont en fractions du monde -> repositionnés proportionnellement. */
const WORLD_SIZE = 50000;                       // unités sim (carré) — figé
const WORLD_BOUNDS = { minX: 0, minY: 0, maxX: WORLD_SIZE, maxY: WORLD_SIZE };

// Les 3 royaumes de la macro-map (N/W/E) mappés sur les factions du jeu.
const REALM_TO_FACTION = { NORTH: 'CENTER', WEST: 'WEST', EAST: 'EAST' };

// Positions en FRACTION du monde (0..1), converties en coords sim.
const F = (fx, fy) => ({ x: Math.round(fx * WORLD_SIZE), y: Math.round(fy * WORLD_SIZE) });

/* Les 10 objectifs stratégiques (macro-map canonique).
   worldPos en coords SIM globales. type: 'spawn' | 'fort' | 'neutral'. */
const OBJECTIVES = [
  { id: 'NORTH_SPAWN', type: 'spawn',   realm: 'NORTH', label: 'N',  worldPos: F(0.52, 0.10) },
  { id: 'WEST_SPAWN',  type: 'spawn',   realm: 'WEST',  label: 'W',  worldPos: F(0.28, 0.90) },
  { id: 'EAST_SPAWN',  type: 'spawn',   realm: 'EAST',  label: 'E',  worldPos: F(0.80, 0.64) },

  { id: 'NORTH_FORT_1', type: 'fort', realm: 'NORTH', label: 'N1', worldPos: F(0.37, 0.26) },
  { id: 'NORTH_FORT_2', type: 'fort', realm: 'NORTH', label: 'N2', worldPos: F(0.66, 0.24) },
  { id: 'WEST_FORT_1',  type: 'fort', realm: 'WEST',  label: 'W1', worldPos: F(0.33, 0.55) },
  { id: 'WEST_FORT_2',  type: 'fort', realm: 'WEST',  label: 'W2', worldPos: F(0.45, 0.74) },
  { id: 'EAST_FORT_1',  type: 'fort', realm: 'EAST',  label: 'E1', worldPos: F(0.75, 0.46) },
  { id: 'EAST_FORT_2',  type: 'fort', realm: 'EAST',  label: 'E2', worldPos: F(0.64, 0.76) },

  { id: 'NEUTRAL_FORTRESS', type: 'neutral', realm: null, label: 'X', worldPos: F(0.52, 0.50) },
];

// Relations LOGIQUES (spawn -> ses 2 forts). Ne sont PAS des murs/chemins.
const OBJECTIVE_LINKS = [
  ['NORTH_SPAWN', 'NORTH_FORT_1'], ['NORTH_SPAWN', 'NORTH_FORT_2'],
  ['WEST_SPAWN', 'WEST_FORT_1'],   ['WEST_SPAWN', 'WEST_FORT_2'],
  ['EAST_SPAWN', 'EAST_FORT_1'],   ['EAST_SPAWN', 'EAST_FORT_2'],
];

// Couleurs par TYPE (convention macro-map / légende), indépendantes des factions.
const OBJECTIVE_COLORS = { spawn: '#f2b21e', fort: '#a9d3ef', neutral: '#1f5b78' };

const WorldDefinition = {
  seed: WORLD_SEED,
  size: WORLD_SIZE,
  bounds: WORLD_BOUNDS,
  renderScale: RENDER_SCALE,
  normalSpeed: NORMAL_SPEED_REF,
  objectives: OBJECTIVES,
  links: OBJECTIVE_LINKS,
  colors: OBJECTIVE_COLORS,
  realmToFaction: REALM_TO_FACTION,

  byId(id) { return OBJECTIVES.find(o => o.id === id); },
  ofType(t) { return OBJECTIVES.filter(o => o.type === t); },

  dist(aId, bId) {
    const a = this.byId(aId), b = this.byId(bId);
    return Math.hypot(a.worldPos.x - b.worldPos.x, a.worldPos.y - b.worldPos.y);
  },
  // minutes de trajet pour une distance sim donnée, à une vitesse donnée
  travelMinutes(distSim, speed) { return distSim / (speed || NORMAL_SPEED_REF) / 60; },

  // estimations clés (TEST D)
  estimates(speed) {
    speed = speed || NORMAL_SPEED_REF;
    const spawnToCenter = this.dist('NORTH_SPAWN', 'NEUTRAL_FORTRESS');
    // traversée représentative : spawn le plus haut -> spawn le plus bas
    const fullTraversal = this.dist('NORTH_SPAWN', 'WEST_SPAWN');
    return {
      spawnToCenterMin: this.travelMinutes(spawnToCenter, speed),
      fullTraversalMin: this.travelMinutes(fullTraversal, speed),
      spawnToCenterDist: Math.round(spawnToCenter),
      fullTraversalDist: Math.round(fullTraversal),
    };
  },
};

window.WorldDefinition = WorldDefinition;
window.WORLD_SEED = WORLD_SEED;
window.WORLD_SIZE = WORLD_SIZE;
window.WORLD_BOUNDS = WORLD_BOUNDS;
window.RENDER_SCALE = RENDER_SCALE;
window.NORMAL_SPEED_REF = NORMAL_SPEED_REF;

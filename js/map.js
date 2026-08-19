/* ============================================================
   map.js — Carte persistante, graphe territorial, capture
   ============================================================ */

// ÉCHELLE MONDE : dérivée de WorldDefinition (V0.4.0, grand espace logique).
const WORLD = { w: WorldDefinition.size, h: WorldDefinition.size };

/* Territoires générés depuis la macro-map (WorldDefinition) :
   - 3 spawns = bases (non capturables), owner = faction du royaume
   - 6 forts  = capturables, owner initial = faction du royaume
   - 1 neutral fortress = objectif central (owner null, value 2)
   Le graphe d'adjacence : base <-> ses 2 forts ; chaque fort <-> neutral. */
function buildTerritoriesFromWorld() {
  const W = WorldDefinition;
  const forts = W.ofType('fort');
  const list = [];
  for (const o of W.objectives) {
    const fac = o.realm ? W.realmToFaction[o.realm] : null;
    if (o.type === 'spawn') {
      const myForts = forts.filter(f => f.realm === o.realm).map(f => f.id);
      list.push({ id: o.id, name: o.id, x: o.worldPos.x, y: o.worldPos.y, base: true, owner: fac, value: 1, neighbors: myForts });
    } else if (o.type === 'fort') {
      const spawn = W.ofType('spawn').find(s => s.realm === o.realm);
      list.push({ id: o.id, name: o.id, x: o.worldPos.x, y: o.worldPos.y, owner: fac, value: 1, neighbors: [spawn.id, 'NEUTRAL_FORTRESS'] });
    } else { // neutral
      list.push({ id: o.id, name: o.id, x: o.worldPos.x, y: o.worldPos.y, owner: null, value: 2, neighbors: forts.map(f => f.id) });
    }
  }
  return list;
}
const TERRITORIES = buildTerritoriesFromWorld();

/* V0.4.0 : open field, pas de murs/obstacles (le monde reste dégagé). */
const OBSTACLES = [];

// Zone de capture agrandie pour la nouvelle échelle (capture reste secondaire en V0.4.0).
const CAPTURE_RADIUS = 900;
const CAPTURE_TIME = 6;        // secondes pour capturer (1 attaquant net)
const CAPTURE_CAP = 4;         // plafond d'attaquants effectifs (anti-zerg)

class GameMap {
  constructor() {
    this.territories = TERRITORIES.map(t => ({
      ...t,
      capture: 0,               // progression 0..1
      captureBy: null,          // faction en cours de capture
      presence: { EAST: 0, WEST: 0, CENTER: 0 },
    }));
    this.byId = {};
    this.territories.forEach(t => this.byId[t.id] = t);
    this.obstacles = OBSTACLES;
  }

  getTerritory(id) { return this.byId[id]; }

  /* Une faction contrôle-t-elle un voisin de ce territoire ? (adjacence requise pour capturer) */
  factionOwnsAdjacent(t, faction) {
    return t.neighbors.some(nid => this.byId[nid] && this.byId[nid].owner === faction);
  }

  /* Points de respawn valides d'une faction (bases + forts possédés). */
  respawnPoints(faction) {
    return this.territories.filter(t => t.owner === faction);
  }

  nearestRespawn(faction, x, y) {
    const pts = this.respawnPoints(faction);
    if (!pts.length) return null;
    let best = pts[0], bd = Infinity;
    for (const p of pts) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /* Contrôle territorial en % par faction (pondéré par value). */
  controlPercentages() {
    const tot = { EAST: 0, WEST: 0, CENTER: 0 };
    let sum = 0;
    for (const t of this.territories) {
      sum += t.value;
      if (t.owner) tot[t.owner] += t.value;
    }
    return {
      EAST:   Math.round(100 * tot.EAST   / sum),
      WEST:   Math.round(100 * tot.WEST   / sum),
      CENTER: Math.round(100 * tot.CENTER / sum),
    };
  }

  /* Mise à jour de la capture. entities = toutes les entités vivantes. */
  update(dt, entities, onCapture) {
    for (const t of this.territories) {
      if (t.base) continue; // bases non capturables

      // Compter la présence par faction
      const pres = { EAST: 0, WEST: 0, CENTER: 0 };
      for (const e of entities) {
        if (e.dead) continue;
        const dx = e.x - t.x, dy = e.y - t.y;
        if (dx * dx + dy * dy <= CAPTURE_RADIUS * CAPTURE_RADIUS) pres[e.faction]++;
      }
      t.presence = pres;

      // Challengers = factions présentes, != owner, possédant un voisin
      let lead = null, leadCount = 0, secondCount = 0;
      for (const fac of FACTION_IDS) {
        if (fac === t.owner) continue;
        if (pres[fac] <= 0) continue;
        if (!this.factionOwnsAdjacent(t, fac)) continue; // pas d'adjacence => pas de capture
        if (pres[fac] > leadCount) { secondCount = leadCount; lead = fac; leadCount = pres[fac]; }
        else if (pres[fac] > secondCount) { secondCount = pres[fac]; }
      }

      const defenders = t.owner ? pres[t.owner] : 0;

      if (lead) {
        // attaquants nets (plafonnés) contre défenseurs + moitié du second challenger
        // (un léger avantage numérique suffit à progresser sur un point contesté)
        const net = Math.min(leadCount, CAPTURE_CAP) - defenders - Math.floor(secondCount / 2);
        if (net > 0) {
          // reset si un autre challenger prenait le dessus
          if (t.captureBy && t.captureBy !== lead) t.capture = 0;
          t.captureBy = lead;
          t.capture += (net / CAPTURE_TIME) * dt;
          if (t.capture >= 1) {
            const prev = t.owner;
            t.owner = lead;
            t.capture = 0;
            t.captureBy = null;
            if (onCapture) onCapture(t, prev, lead);
          }
        } else {
          // contesté à l'équilibre : léger recul
          t.capture = Math.max(0, t.capture - 0.5 * dt);
          if (t.capture === 0) t.captureBy = null;
        }
      } else {
        // personne ne capture : la progression retombe
        t.capture = Math.max(0, t.capture - 0.7 * dt);
        if (t.capture === 0) t.captureBy = null;
      }
    }
  }

  /* Collision cercle/obstacle : renvoie une position corrigée. */
  resolveCollision(x, y, r) {
    for (const o of this.obstacles) {
      const nx = Math.max(o.x, Math.min(x, o.x + o.w));
      const ny = Math.max(o.y, Math.min(y, o.y + o.h));
      const dx = x - nx, dy = y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.01;
        const push = (r - d);
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    // bornes du monde
    x = Math.max(r, Math.min(WORLD.w - r, x));
    y = Math.max(r, Math.min(WORLD.h - r, y));
    return { x, y };
  }

  /* Ligne de vue bloquée par un mur ? (pour dash sans traversée) */
  lineBlocked(x1, y1, x2, y2) {
    const steps = 24;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      for (const o of this.obstacles) {
        if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) return true;
      }
    }
    return false;
  }
}

window.WORLD = WORLD;
window.GameMap = GameMap;
window.CAPTURE_RADIUS = CAPTURE_RADIUS;

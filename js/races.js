/* ============================================================
   races.js — Races 100 % COSMÉTIQUES + MATRICE Royaume/Race/Classe
   Aucune stat modifiée (HP, mana, vitesse, portée, dégâts, CD).
   La hitbox gameplay (entity.radius) reste identique pour toutes
   les races : seule la représentation visuelle change.

   NOUVEAU (matrice fournie) : la race est liée au ROYAUME (faction),
   et la classe est liée à la RACE. Le menu et les bots respectent
   strictement la matrice ci-dessous.

   Matrice (x = autorisé) — 3 races par royaume :
     Royaume   Race        Classes autorisées
     ───────   ─────────   ───────────────────────────────────────────
     OUEST →   Human       Guardian Berserker Sorcerer Mage Cleric Skald Ranger Assassin (8)
     (WEST)    Elf         Sorcerer Mage Cleric Ranger Assassin (5)
               Goblin      Sorcerer Mage Cleric Ranger Assassin (5)
     NORD →    Troll       Guardian Berserker Mage Cleric Skald (5)
     (CENTER)  Dwarf       Guardian Berserker Skald Ranger Assassin (5)
               Drake       Guardian Berserker Sorcerer Mage Cleric Skald Ranger Assassin (8)
     EST →     Ogre        Guardian Berserker Sorcerer Cleric Skald (5)
     (EAST)    Dark Elf    Sorcerer Mage Cleric Ranger Assassin (5)
               Orc         Guardian Berserker Sorcerer Mage Cleric Skald Ranger Assassin (8)

   Correspondance de nommage interne :
     Mage = MAGE · Assassin = ROGUE · Drake = DRAKE (fichier Drake.glb).
   Correspondance royaume (matrice) → faction moteur (world.js REALM_TO_FACTION) :
     NORD → CENTER · EST → EAST · OUEST → WEST.
   ============================================================ */

// h = hauteur relative (indication de gabarit visuel), w = largeur, head = tête.
// features primitives optionnelles (utilisées seulement par le placeholder).
const RACES = {
  HUMAN:    { id: 'HUMAN',    name: 'Humain',    h: 1.00, w: 1.00, head: 1.00 },
  DWARF:    { id: 'DWARF',    name: 'Nain',      h: 0.80, w: 1.22, head: 1.15, beard: true },
  ELF:      { id: 'ELF',      name: 'Elfe',      h: 1.10, w: 0.85, head: 0.95, ears: true },
  DARK_ELF: { id: 'DARK_ELF', name: 'Elfe Noir', h: 1.07, w: 0.84, head: 0.95, ears: true, skin: '#6a5a7a' },
  OGRE:     { id: 'OGRE',     name: 'Ogre',      h: 1.35, w: 1.45, head: 1.10, skin: '#8a9a6a' },
  DRAKE:    { id: 'DRAKE',    name: 'Drake',     h: 1.12, w: 1.05, head: 1.00, horns: true, skin: '#7a8a5a' },
  TROLL:    { id: 'TROLL',    name: 'Troll',     h: 1.32, w: 1.10, head: 0.95, skin: '#6a8a7a' },
  ORC:      { id: 'ORC',      name: 'Orc',       h: 1.08, w: 1.20, head: 1.00, tusks: true, skin: '#7a9a6a' },
  GOBLIN:   { id: 'GOBLIN',   name: 'Gobelin',   h: 0.70, w: 0.92, head: 1.20, ears: true, skin: '#8aaa6a' },
};

/* ---------- MATRICE : races disponibles par FACTION (royaume) ---------- */
// Clés = ids de faction moteur (data.js FACTIONS).
const FACTION_RACES = {
  WEST:   ['HUMAN', 'ELF', 'GOBLIN'],       // Royaume Ouest
  CENTER: ['TROLL', 'DWARF', 'DRAKE'],      // Royaume Nord
  EAST:   ['OGRE', 'DARK_ELF', 'ORC'],      // Royaume Est
};

/* ---------- ÉCHELLE VISUELLE RACIALE (cosmétique, runtime) ----------
   Les GLB Manny restent normalisés à leur taille canonique (pipeline AutoRig).
   La différence de gabarit entre races est appliquée UNIQUEMENT au rendu, sur
   le root visuel du personnage, de façon MULTIPLICATIVE :
       finalScale = assetBaseScale (GLB) × RACE_VISUAL_SCALE[race]
   STRICTEMENT COSMÉTIQUE : n'affecte ni sim, position, moveSpeed, seuils de
   locomotion, hitbox/radius, attackRange, combat, stats, BotAI, AnimationLibrary,
   ni le retarget Manny. Les animations sont calculées normalement sur le rig,
   puis le personnage complet est rendu à cette échelle. */
const RACE_VISUAL_SCALE = {
  HUMAN:    1.00,
  DWARF:    0.65,
  ELF:      1.05,
  DARK_ELF: 1.10,
  OGRE:     1.50,
  DRAKE:    0.90,
  TROLL:    1.40,
  ORC:      1.20,
  GOBLIN:   0.50,
};

/* ---------- MATRICE : classes disponibles par RACE ---------- */
const ALL8 = ['GUARDIAN', 'BERSERKER', 'SORCERER', 'MAGE', 'CLERIC', 'SKALD', 'RANGER', 'ROGUE'];
const RACE_CLASSES = {
  HUMAN:    ALL8.slice(),
  DWARF:    ['GUARDIAN', 'BERSERKER', 'SKALD', 'RANGER', 'ROGUE'],
  ELF:      ['SORCERER', 'MAGE', 'CLERIC', 'RANGER', 'ROGUE'],
  DARK_ELF: ['SORCERER', 'MAGE', 'CLERIC', 'RANGER', 'ROGUE'],
  OGRE:     ['GUARDIAN', 'BERSERKER', 'SORCERER', 'CLERIC', 'SKALD'],
  DRAKE:    ALL8.slice(),
  TROLL:    ['GUARDIAN', 'BERSERKER', 'MAGE', 'CLERIC', 'SKALD'],
  ORC:      ALL8.slice(),
  GOBLIN:   ['SORCERER', 'MAGE', 'CLERIC', 'RANGER', 'ROGUE'],
};

/* ---------- Cartes dérivées (calculées, jamais désynchronisées) ---------- */
// race -> faction (une race n'appartient qu'à un seul royaume)
const RACE_FACTION = {};
for (const fid in FACTION_RACES) for (const r of FACTION_RACES[fid]) RACE_FACTION[r] = fid;

// classe -> races autorisées (transposée de RACE_CLASSES) — compat descendante
const CLASS_RACES = {};
for (const rid in RACE_CLASSES) for (const cid of RACE_CLASSES[rid]) (CLASS_RACES[cid] || (CLASS_RACES[cid] = [])).push(rid);

/* ---------- Accès matrice ---------- */
function racesForFaction(factionId) { return (FACTION_RACES[factionId] || []).slice(); }
function classesForRace(raceId) { return (RACE_CLASSES[raceId] || []).slice(); }
function factionForRace(raceId) { return RACE_FACTION[raceId] || null; }
function isValidCombo(factionId, raceId, classId) {
  return RACE_FACTION[raceId] === factionId && (RACE_CLASSES[raceId] || []).includes(classId);
}

function _rand(list) { return list[Math.floor(Math.random() * list.length)]; }

/* Race valide pour une classe (compat : utilisé si on part de la classe). */
function randomRaceFor(classId) {
  const list = CLASS_RACES[classId] || ['HUMAN'];
  return _rand(list);
}

/* Choix cohérent {race, classId} pour une FACTION (utilisé pour les bots) :
   on tire d'abord une race du royaume, puis une classe autorisée pour cette race. */
function randomRaceClassFor(factionId) {
  const races = FACTION_RACES[factionId] || FACTION_RACES.CENTER;
  const race = _rand(races);
  const classId = _rand(RACE_CLASSES[race]);
  return { race, classId };
}

window.RACES = RACES;
window.RACE_VISUAL_SCALE = RACE_VISUAL_SCALE;
window.FACTION_RACES = FACTION_RACES;
window.RACE_CLASSES = RACE_CLASSES;
window.RACE_FACTION = RACE_FACTION;
window.CLASS_RACES = CLASS_RACES;
window.racesForFaction = racesForFaction;
window.classesForRace = classesForRace;
window.factionForRace = factionForRace;
window.isValidCombo = isValidCombo;
window.randomRaceFor = randomRaceFor;
window.randomRaceClassFor = randomRaceClassFor;

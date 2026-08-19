/* ============================================================
   data.js — Définitions de données du jeu
   Factions, types d'effets, et les 8 classes décrites par des
   structures génériques (aucune compétence hardcodée dans le moteur).
   ============================================================ */

/* ---------------- FACTIONS ---------------- */
const FACTIONS = {
  EAST:   { id: 'EAST',   name: 'Royaume Est',     color: '#d94f4f', short: 'EST' },
  WEST:   { id: 'WEST',   name: 'Royaume Ouest',   color: '#4f7fd9', short: 'OUEST' },
  CENTER: { id: 'CENTER', name: 'Royaume Central', color: '#5fbf5f', short: 'CENTRAL' },
};
const FACTION_IDS = ['EAST', 'WEST', 'CENTER'];

/* ---------------- CATÉGORIES DE CC (pour les immunités) ----------------
   Chaque CC déclenche une immunité temporaire de la même catégorie à sa fin. */
const CC_IMMUNITY_AFTER = {
  mez:  4.0,   // immunité mez après mez
  root: 3.0,   // immunité root après root
  stun: 4.0,   // immunité stun après stun
};

/* ---------------- TYPES D'EFFETS ----------------
   Le moteur (effects.js) sait interpréter chacun de ces types de façon générique. */
const EFFECT_TYPES = [
  'mez', 'root', 'stun', 'snare', 'disease', 'nearsight',
  'dot', 'buff_speed', 'buff_damage', 'buff_attackspeed', 'defense_down',
  'immunity_root_snare', 'immunity_mez', 'immunity_stun',
  'heal_shield', 'guard', 'charge', 'stealth', 'camouflage',
];

/* ---------------- BARÈME DE BASE PAR RÔLE ---------------- */
// Valeurs de départ ; ajustables (voir §27 BALANCING).

/* ---------------- SKILLS UNIVERSELS ---------------- */
const UNIVERSAL_SKILLS = {
  sprint: {
    id: 'sprint', name: 'Sprint', key: 'Q', icon: '💨',
    cooldown: 12, castTime: 0, range: 0, cost: { endu: 25 }, targetType: 'self',
    effects: [{ type: 'buff_speed', value: 1.5, duration: 6 }],
    desc: 'Augmente la vitesse (endurance).',
  },
  purge: {
    id: 'purge', name: 'Purge', key: 'E', icon: '🧿',
    cooldown: 180, castTime: 0, range: 0, cost: {}, targetType: 'self',
    purge: true, // supprime mez/root/stun/snare
    desc: 'Supprime Mez / Root / Stun / Snare. Cooldown très long.',
  },
};

/* ============================================================
   LES 8 CLASSES
   Chaque skill est une structure de données interprétée par combat.js.
   Champs possibles d'un skill :
     cooldown, castTime, range, cost:{mana,endu},
     targetType: 'enemy'|'ally'|'self'|'ground',
     damage, heal, effects:[...],
     interrupt:true, requiresBehind:true, dashToTarget:true,
     targetCap:N (AoE), aoeRadius:px, breaksMez:true,
     cleanse:['disease','snare',...], selfEffects:[...]
   ============================================================ */

const CLASSES = {

  /* ---------- GUARDIAN : Tank / protection ---------- */
  GUARDIAN: {
    id: 'GUARDIAN', name: 'Guardian', role: 'Protection / Frontline', icon: '🛡️',
    hp: 1400, mana: 0, endurance: 100, moveSpeed: 105, attackRange: 40,
    autoAttack: { damage: 45, interval: 2.0, interrupt: false },
    passive: 'Heavy Armor : forte résistance physique, peut bloquer de face.',
    armor: 0.35, // réduction dégâts physiques
    skills: [
      { id: 'shield_slam', name: 'Shield Slam', key: '1', icon: '🔨',
        cooldown: 14, castTime: 0, range: 45, cost: { endu: 20 }, targetType: 'enemy',
        damage: 40, effects: [{ type: 'stun', duration: 2.5 }] },
      { id: 'guard', name: 'Guard', key: '2', icon: '🤝',
        cooldown: 2, castTime: 0, range: 400, cost: {}, targetType: 'ally',
        effects: [{ type: 'guard', duration: 9999 }], toggle: true },
      { id: 'intercept', name: 'Intercept', key: '3', icon: '➡️',
        cooldown: 16, castTime: 0, range: 500, cost: { endu: 20 }, targetType: 'ally',
        dashToTarget: true, selfEffects: [{ type: 'buff_damage', value: 0.01, duration: 4 }],
        interceptGuard: true },
      { id: 'shield_bash', name: 'Shield Bash', key: '4', icon: '💥',
        cooldown: 8, castTime: 0, range: 45, cost: { endu: 15 }, targetType: 'enemy',
        damage: 12, interrupt: true },
    ],
    realm: { id: 'bodyguard', name: 'Bodyguard', key: 'R', icon: '👑',
      cooldown: 90, castTime: 0, range: 400, cost: {}, targetType: 'ally',
      effects: [{ type: 'buff_damage', value: 0.01, duration: 8, meleeResist: 0.7 }],
      desc: 'Un allié proche devient très résistant au melee.' },
  },

  /* ---------- BERSERKER : Melee DPS positionnel ---------- */
  BERSERKER: {
    id: 'BERSERKER', name: 'Berserker', role: 'Pression Melee', icon: '🪓',
    hp: 1050, mana: 0, endurance: 100, moveSpeed: 115, attackRange: 40,
    autoAttack: { damage: 70, interval: 1.6, interrupt: false, positional: true },
    passive: 'Predator : +15% dégâts sur le flanc, +30% dans le dos.',
    armor: 0.12,
    skills: [
      { id: 'hamstring', name: 'Hamstring', key: '1', icon: '🩸',
        cooldown: 10, castTime: 0, range: 45, cost: { endu: 20 }, targetType: 'enemy',
        damage: 60, effects: [{ type: 'snare', value: 0.5, duration: 5 }] },
      { id: 'backslash', name: 'Backslash', key: '2', icon: '🗡️',
        cooldown: 8, castTime: 0, range: 45, cost: { endu: 25 }, targetType: 'enemy',
        damage: 210, requiresBehind: true, frontPenalty: 0.25 },
      { id: 'charge', name: 'Charge', key: '3', icon: '🐎',
        cooldown: 25, castTime: 0, range: 0, cost: { endu: 20 }, targetType: 'self',
        selfEffects: [{ type: 'buff_speed', value: 1.6, duration: 4 },
                      { type: 'immunity_root_snare', duration: 4 }] },
      { id: 'frenzy', name: 'Frenzy', key: '4', icon: '😡',
        cooldown: 30, castTime: 0, range: 0, cost: { endu: 30 }, targetType: 'self',
        selfEffects: [{ type: 'buff_attackspeed', value: 1.5, duration: 6 },
                      { type: 'buff_damage', value: 1.3, duration: 6 },
                      { type: 'defense_down', value: 0.25, duration: 6 }] },
    ],
    realm: { id: 'berserk', name: 'Berserk', key: 'R', icon: '🔥',
      cooldown: 90, castTime: 0, range: 0, cost: {}, targetType: 'self',
      selfEffects: [{ type: 'buff_damage', value: 1.8, duration: 8, crit: true },
                    { type: 'defense_down', value: 0.2, duration: 8 }],
      desc: 'Burst très élevé, défense réduite.' },
  },

  /* ---------- SORCERER : Crowd Control ---------- */
  SORCERER: {
    id: 'SORCERER', name: 'Sorcerer', role: 'Crowd Control', icon: '🌀',
    hp: 720, mana: 100, endurance: 100, attackRange: 450,
    autoAttack: null,
    passive: 'Mind Mastery : portée de CC légèrement supérieure.',
    armor: 0.0, ccRangeBonus: 1.1,
    skills: [
      { id: 'mesmerize', name: 'Mesmerize', key: '1', icon: '😵',
        cooldown: 12, castTime: 1.8, range: 450, cost: { mana: 18 }, targetType: 'enemy',
        effects: [{ type: 'mez', duration: 8 }] },
      { id: 'mass_mez', name: 'Mass Mesmerize', key: '2', icon: '🌫️',
        cooldown: 30, castTime: 2.0, range: 400, cost: { mana: 40 }, targetType: 'ground',
        aoeRadius: 180, targetCap: 8, effects: [{ type: 'mez', duration: 6 }] },
      { id: 'root', name: 'Root', key: '3', icon: '🌿',
        cooldown: 14, castTime: 1.2, range: 450, cost: { mana: 16 }, targetType: 'enemy',
        effects: [{ type: 'root', duration: 5 }] },
      { id: 'mind_debuff', name: 'Mind Debuff', key: '4', icon: '🔮',
        cooldown: 15, castTime: 1.0, range: 450, cost: { mana: 15 }, targetType: 'enemy',
        effects: [{ type: 'defense_down', value: 0.2, duration: 15 },
                  { type: 'nearsight', value: 0.4, duration: 10 }] },
    ],
    realm: { id: 'quickcast', name: 'Quickcast', key: 'R', icon: '⚡',
      cooldown: 60, castTime: 0, range: 0, cost: {}, targetType: 'self',
      quickcast: true, desc: 'Le prochain sort est instantané et non interruptible.' },
  },

  /* ---------- RUNEMASTER : Mage DPS / artillerie ---------- */
  RUNEMASTER: {
    id: 'RUNEMASTER', name: 'Runemaster', role: 'Artillerie', icon: '🔥',
    hp: 760, mana: 100, endurance: 100, attackRange: 500,
    autoAttack: null,
    passive: 'Rune Casting : chaque sort terminé donne une Rune (max 3, +puissance). Interruption = -1 Rune.',
    armor: 0.0, runes: true,
    skills: [
      { id: 'rune_blast', name: 'Rune Blast', key: '1', icon: '✴️',
        cooldown: 3, castTime: 1.5, range: 450, cost: { mana: 12 }, targetType: 'enemy',
        damage: 150, grantsRune: true },
      { id: 'rune_bolt', name: 'Rune Bolt', key: '2', icon: '☄️',
        cooldown: 6, castTime: 2.5, range: 620, cost: { mana: 22 }, targetType: 'enemy',
        damage: 320, grantsRune: true },
      { id: 'rune_storm', name: 'Rune Storm', key: '3', icon: '🌩️',
        cooldown: 14, castTime: 2.0, range: 500, cost: { mana: 35 }, targetType: 'ground',
        aoeRadius: 150, targetCap: 8, damage: 130, wakesMez: true, grantsRune: true },
      { id: 'rm_nearsight', name: 'Nearsight', key: '4', icon: '🌑',
        cooldown: 20, castTime: 1.0, range: 500, cost: { mana: 18 }, targetType: 'enemy',
        effects: [{ type: 'nearsight', value: 0.6, duration: 12 }] },
    ],
    realm: { id: 'moc', name: 'Mastery of Concentration', key: 'R', icon: '🧠',
      cooldown: 90, castTime: 0, range: 0, cost: {}, targetType: 'self',
      uninterruptible: true, uninterruptibleDuration: 8,
      desc: 'Casts non interruptibles pendant 8s.' },
  },

  /* ---------- CLERIC : Main healer ---------- */
  CLERIC: {
    id: 'CLERIC', name: 'Cleric', role: 'Sustain / Soins', icon: '✨',
    hp: 820, mana: 100, endurance: 100, attackRange: 400,
    autoAttack: { damage: 25, interval: 2.5, interrupt: false },
    passive: 'Divine Grace : soigner des cibles variées réduit un peu le coût en mana.',
    armor: 0.1,
    skills: [
      { id: 'greater_heal', name: 'Greater Heal', key: '1', icon: '💚',
        cooldown: 0, castTime: 1.8, range: 450, cost: { mana: 18 }, targetType: 'ally',
        heal: 380 },
      { id: 'group_heal', name: 'Group Heal', key: '2', icon: '🌿',
        cooldown: 4, castTime: 2.0, range: 400, cost: { mana: 34 }, targetType: 'self',
        aoeRadius: 220, targetCap: 8, healAllies: 200 },
      { id: 'cure', name: 'Cure', key: '3', icon: '🧪',
        cooldown: 8, castTime: 0.6, range: 400, cost: { mana: 15 }, targetType: 'ally',
        cleanse: ['dot', 'disease', 'snare', 'defense_down'] },
      { id: 'instant_heal', name: 'Instant Heal', key: '4', icon: '➕',
        cooldown: 20, castTime: 0, range: 450, cost: { mana: 25 }, targetType: 'ally',
        heal: 320 },
    ],
    realm: { id: 'divine', name: 'Divine Intervention', key: 'R', icon: '🕊️',
      cooldown: 120, castTime: 0, range: 0, cost: {}, targetType: 'self',
      aoeRadius: 250, targetCap: 8, effects: [{ type: 'heal_shield', value: 300, duration: 15 }],
      appliesToAllies: true, desc: 'Bouclier de soins pour les alliés proches.' },
  },

  /* ---------- SKALD : Roamer / mobilité ---------- */
  SKALD: {
    id: 'SKALD', name: 'Skald', role: 'Mobilité / Initiation', icon: '🎵',
    hp: 1000, mana: 60, endurance: 100, attackRange: 45,
    autoAttack: { damage: 55, interval: 1.8, interrupt: false },
    passive: 'War Song : augmente la vitesse des alliés proches hors combat.',
    armor: 0.15, auraSpeed: 1.15,
    skills: [
      { id: 'battle_cry', name: 'Battle Cry', key: '1', icon: '📣',
        cooldown: 6, castTime: 0, range: 350, cost: { endu: 12 }, targetType: 'enemy',
        damage: 30, interrupt: true },
      { id: 'crippling_song', name: 'Crippling Song', key: '2', icon: '🎶',
        cooldown: 10, castTime: 0, range: 350, cost: { endu: 18 }, targetType: 'enemy',
        damage: 20, effects: [{ type: 'snare', value: 0.5, duration: 6 }] },
      { id: 'war_mez', name: 'War Mez', key: '3', icon: '💤',
        cooldown: 22, castTime: 0, range: 300, cost: { endu: 25 }, targetType: 'enemy',
        effects: [{ type: 'mez', duration: 6 }] },
      { id: 'sprint_song', name: 'Sprint Song', key: '4', icon: '🎺',
        cooldown: 25, castTime: 0, range: 0, cost: { endu: 20 }, targetType: 'self',
        aoeRadius: 250, buffAllies: [{ type: 'buff_speed', value: 1.4, duration: 8 }],
        selfEffects: [{ type: 'buff_speed', value: 1.4, duration: 8 }] },
    ],
    realm: { id: 'speed_of_sound', name: 'Speed of Sound', key: 'R', icon: '🌀',
      cooldown: 120, castTime: 0, range: 0, cost: {}, targetType: 'self',
      selfEffects: [{ type: 'buff_speed', value: 1.9, duration: 8 },
                    { type: 'immunity_root_snare', duration: 8 },
                    { type: 'immunity_mez', duration: 8 }],
      desc: 'Vitesse très élevée, immunité root/snare/mez (pas stun).' },
  },

  /* ---------- RANGER : Archer / reconnaissance ---------- */
  RANGER: {
    id: 'RANGER', name: 'Ranger', role: 'Reconnaissance / Archer', icon: '🏹',
    hp: 820, mana: 60, endurance: 100, attackRange: 550,
    autoAttack: null,
    passive: 'Eagle Eye : vision supérieure, meilleure détection des Rogues.',
    armor: 0.08, visionBonus: 1.4, detectStealth: 1.5,
    skills: [
      { id: 'long_shot', name: 'Long Shot', key: '1', icon: '🎯',
        cooldown: 2, castTime: 2.5, range: 620, cost: { endu: 15 }, targetType: 'enemy',
        damage: 260, rangeDamageBonus: true },
      { id: 'rapid_shot', name: 'Rapid Shot', key: '2', icon: '🏹',
        cooldown: 3, castTime: 0.6, range: 450, cost: { endu: 10 }, targetType: 'enemy',
        damage: 55, interrupt: true },
      { id: 'crippling_arrow', name: 'Crippling Arrow', key: '3', icon: '➶',
        cooldown: 12, castTime: 1.2, range: 500, cost: { endu: 18 }, targetType: 'enemy',
        damage: 70, effects: [{ type: 'snare', value: 0.55, duration: 6 }] },
      { id: 'camouflage', name: 'Camouflage', key: '4', icon: '🍃',
        cooldown: 20, castTime: 0, range: 0, cost: {}, targetType: 'self',
        selfEffects: [{ type: 'camouflage', duration: 30 }] },
    ],
    realm: { id: 'volley', name: 'Volley', key: 'R', icon: '☂️',
      cooldown: 90, castTime: 1.5, range: 650, cost: { endu: 20 }, targetType: 'ground',
      aoeRadius: 160, targetCap: 6, damage: 90, ticks: 4, tickInterval: 0.8,
      desc: 'Pluie de flèches sur une zone (dégâts par tick, cibles limitées).' },
  },

  /* ---------- ROGUE : Assassin / infiltration ---------- */
  ROGUE: {
    id: 'ROGUE', name: 'Rogue', role: 'Infiltration / Assassinat', icon: '🗡️',
    hp: 880, mana: 0, endurance: 100, attackRange: 40,
    autoAttack: { damage: 60, interval: 1.5, interrupt: false, positional: true },
    passive: 'Stealth : invisible hors combat (détection progressive selon distance).',
    armor: 0.1, stealthClass: true,
    skills: [
      { id: 'backstab', name: 'Backstab', key: '1', icon: '🔪',
        cooldown: 10, castTime: 0, range: 45, cost: { endu: 25 }, targetType: 'enemy',
        damage: 130, fromStealthBonus: 220, requiresBehind: true, frontPenalty: 0.3,
        effects: [{ type: 'stun', duration: 1.5 }], fromStealthOnly: false },
      { id: 'poison_weapon', name: 'Poison Weapon', key: '2', icon: '🧫',
        cooldown: 2, castTime: 0, range: 0, cost: {}, targetType: 'self',
        cyclePoison: true, poisons: ['lethal', 'crippling', 'disease'],
        desc: 'Cycle le poison appliqué : Lethal (DoT) / Crippling (snare) / Disease.' },
      { id: 'shadowstep', name: 'Shadowstep', key: '3', icon: '🌫️',
        cooldown: 15, castTime: 0, range: 350, cost: { endu: 20 }, targetType: 'enemy',
        dashToTarget: true, noWalls: true },
      { id: 'vanish', name: 'Vanish', key: '4', icon: '💨',
        cooldown: 30, castTime: 0, range: 0, cost: {}, targetType: 'self',
        vanish: true, vanishDelay: 1.0, desc: 'Retour en Stealth après 1s (annulé si dégâts).' },
    ],
    realm: { id: 'viper', name: 'Viper', key: 'R', icon: '🐍',
      cooldown: 90, castTime: 0, range: 0, cost: {}, targetType: 'self',
      selfEffects: [{ type: 'buff_damage', value: 1.0, duration: 15, poisonBoost: 2.0 }],
      desc: 'Efficacité des poisons fortement augmentée.' },
  },
};

const CLASS_IDS = ['GUARDIAN', 'BERSERKER', 'SORCERER', 'RUNEMASTER', 'CLERIC', 'SKALD', 'RANGER', 'ROGUE'];

/* Poisons (Rogue) */
const POISONS = {
  lethal:    { name: 'Lethal',    effect: { type: 'dot', value: 30, duration: 8, tick: 1.0 } },
  crippling: { name: 'Crippling', effect: { type: 'snare', value: 0.45, duration: 6 } },
  disease:   { name: 'Disease',   effect: { type: 'disease', value: 0.6, duration: 10 } },
};

// Exposition globale
window.FACTIONS = FACTIONS;
window.FACTION_IDS = FACTION_IDS;
window.CLASSES = CLASSES;
window.CLASS_IDS = CLASS_IDS;
window.UNIVERSAL_SKILLS = UNIVERSAL_SKILLS;
window.CC_IMMUNITY_AFTER = CC_IMMUNITY_AFTER;
window.POISONS = POISONS;

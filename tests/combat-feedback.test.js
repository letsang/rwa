const assert = require('node:assert/strict');

global.window = {};
global.POISONS = {};
global.EffectSystem = { apply() {} };
require('../js/combat.js');

const impacts = [];
const game = {
  onCombatImpact(impact) { impacts.push(impact); },
  spawnHitFx() { throw new Error('le fallback VFX ne doit pas doubler l’événement centralisé'); },
};
const source = { game, classId: 'GUARDIAN', combatTimer: 5 };
const target = {
  game, hp: 30, dead: false,
  takeDamage(amount) { this.hp -= amount; if (this.hp <= 0) this.dead = true; },
};

const first = window.CombatSystem.dealDamage(source, target, 12, { melee: true });
assert.equal(first.damage, 12);
assert.equal(first.melee, true);
assert.equal(first.magic, false);
assert.equal(first.killed, false);
assert.equal(impacts.length, 1);

const killing = window.CombatSystem.dealDamage(source, target, 40, { magic: true });
assert.equal(killing.damage, 18, 'les dégâts de feedback sont plafonnés aux PV réellement restants');
assert.equal(killing.magic, true);
assert.equal(killing.killed, true);
assert.equal(impacts.length, 2, 'chaque frappe résolue produit exactement un impact');

console.log('combat-feedback.test.js: OK');

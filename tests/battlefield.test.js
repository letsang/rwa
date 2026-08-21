const assert = require('node:assert/strict');

global.window = {};
require('../js/battlefield.js');

const makeBot = (faction, id) => ({ id, faction, isBot: true, radius: 16, x: 0, y: 0 });
const territories = [
  { id: 'HOME', base: true, owner: 'WEST', x: 1000, y: 1000 },
  { id: 'ENEMY_NEAR', base: true, owner: 'EAST', x: 4000, y: 1000 },
  { id: 'ENEMY_FAR', base: true, owner: 'CENTER', x: 9000, y: 9000 },
  { id: 'HOME_FORT_NEAR', base: false, owner: 'WEST', x: 5000, y: 1000 },
  { id: 'HOME_FORT_FAR', base: false, owner: 'WEST', x: 1000, y: 8000 },
];
const entities = [
  ...Array.from({ length: 5 }, (_, i) => makeBot('WEST', 'w' + i)),
  ...Array.from({ length: 5 }, (_, i) => makeBot('EAST', 'e' + i)),
  ...Array.from({ length: 5 }, (_, i) => makeBot('CENTER', 'c' + i)),
];
const game = {
  entities,
  map: {
    territories,
    resolveCollision(x, y) { return { x, y }; },
  },
};

const battlefield = new window.BattlefieldPrototype(game);
const state = battlefield.stage('WEST');
assert.equal(state.approachId, 'HOME_FORT_NEAR');
assert.equal(state.enemyFaction, 'EAST');
assert.equal(state.allies.length, 4);
assert.equal(state.enemies.length, 4);
assert.ok(Math.abs(state.center.x - 1950) < 0.001 && state.center.y === 1000,
  'le front est placé à 950 unités du spawn sur son axe d’approche');
assert.deepEqual(state.forward, { x: 1, y: 0 });
for (let i = 0; i < 4; i++) {
  assert.equal(state.allies[i].target, state.enemies[i]);
  assert.equal(state.enemies[i].target, state.allies[i]);
  assert.equal(state.allies[i].battlefieldSquad, 'home');
  assert.equal(state.enemies[i].battlefieldSquad, 'invader');
}
assert.deepEqual({ x: entities[4].x, y: entities[4].y }, { x: 0, y: 0 },
  'les bots hors escouade ne sont pas déplacés');

const returning = state.allies[0];
returning.dead = true;
battlefield.update();
returning.dead = false; returning.x = 1000; returning.y = 1000;
battlefield.update();
assert.equal(state.reinforcements, 1, 'un bot respawné revient alimenter le front');
assert.equal(returning.battlefieldSquad, 'home');
assert.equal(returning.target.faction, 'EAST');
assert.ok(Math.hypot(returning.x - state.center.x, returning.y - state.center.y) < 200);

console.log('battlefield.test.js: OK');

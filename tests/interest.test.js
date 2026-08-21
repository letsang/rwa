const assert = require('node:assert/strict');

global.window = {};
require('../js/interest.js');

const player = { id: 'player', x: 0, y: 0 };
const near = { id: 'near', x: 1400, y: 0 };
const far = { id: 'far', x: 1600, y: 0 };
const game = { player, entities: [player, near, far], scene: { fogEnd: 100 } };
const interest = new window.VisualInterestManager(game, { renderScale: 0.08, margin: 220, minRadius: 900 });

interest.refresh();
assert.equal(interest.radius, 1470, 'fogEnd rendu est converti en unités simulation avec marge');
assert.equal(interest.isRelevant(player), true);
assert.equal(interest.isRelevant(near), true);
assert.equal(interest.isRelevant(far), false);

game.scene.fogEnd = 150;
interest.refresh();
assert.equal(interest.radius, 2095, 'le tuning live du fog modifie la frontière sans reconstruction');
assert.equal(interest.isRelevant(far), true);
assert.equal(interest.count(), 3);

console.log('interest.test.js: OK');

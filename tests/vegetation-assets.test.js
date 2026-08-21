const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const vegetation = fs.readFileSync(path.join(root, 'js/vegetation.js'), 'utf8');
assert.doesNotMatch(vegetation, /tree_pack_1\.1\/glb\/(?:tree|bush)/, 'aucun modèle du nouveau pack n’est chargé');
assert.match(vegetation, /const treeDefs = \[\s*\{ file: 'tree_rt_4\.glb', scale: 2\.05 \},\s*\]/, 'tree_rt_4 est la seule variante d’arbre');
assert.match(vegetation, /if \(fam === 'bush'\) continue;/, 'les buissons sont exclus de la génération');
assert.doesNotMatch(vegetation, /famAllowed:\s*\{[^\n]*bush:/, 'les buissons sont exclus de toutes les bandes de rendu');
assert.match(vegetation, /candGrass:\s*160,/, 'le nombre de candidats herbe est réduit');
assert.match(vegetation, /grassDensity:\s*0\.85,/, 'la densité globale de l’herbe est réduite');
assert.match(vegetation, /grass:\s*\[0\.55, 1\.0\]/, 'les touffes d’herbe sont plus petites');

const treeBytes = fs.readFileSync(path.join(root, 'assets/vegetation/trees/tree_rt_4.glb'));
const treeJsonLength = treeBytes.readUInt32LE(12);
const treeDocument = JSON.parse(treeBytes.toString('utf8', 20, 20 + treeJsonLength));
const positionAccessors = treeDocument.meshes.flatMap(mesh => mesh.primitives.map(
  primitive => treeDocument.accessors[primitive.attributes.POSITION],
));
const sourceHeight = Math.max(...positionAccessors.map(accessor => accessor.max[2]))
  - Math.min(...positionAccessors.map(accessor => accessor.min[2]));
const renderedHeight = sourceHeight * 2.05;
assert.ok(renderedHeight >= 11 && renderedHeight <= 12, `tree_rt_4 conserve une grande taille (${renderedHeight.toFixed(2)})`);

console.log('vegetation-assets.test.js: OK');

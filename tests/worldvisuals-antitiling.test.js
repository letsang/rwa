const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../js/worldvisuals.js'), 'utf8');

assert.match(source, /tileDetail:\s*88\b/, 'la taille de tuile doit limiter le moiré');
assert.match(source, /antiTileScale:\s*0\.035\b/, 'la fréquence anti-tiling doit rester configurable');
assert.match(source, /vec2 antiUV\(vec2 uv, vec2 offset\)/, 'une seconde projection UV décalable doit être présente');
assert.match(source, /float antiNoise\(vec2 p\)/, 'le fondu doit utiliser un bruit procédural');
assert.match(source, /return mix\(a,b,blend\)/, 'les deux projections albedo doivent être fondues');
assert.match(source, /vec3 sampNormal\(sampler2D s, vec2 uv, vec2 uvB, float blend\)/, 'les normales doivent suivre les deux projections');
assert.match(source, /float sampRough\(sampler2D s, vec2 uv, vec2 uvB, float blend\)/, 'la roughness doit suivre les deux projections');
assert.match(source, /b\.xy=vec2\(0\.7986\*b\.x\+0\.6018\*b\.y,-0\.6018\*b\.x\+0\.7986\*b\.y\)/, 'la normale secondaire doit être réorientée');
assert.match(source, /float normalFade = mix\(1\.0,0\.42,smoothstep\(28\.0,95\.0,distance\(vPosW,camPos\)\)\)/, "les normales doivent s'atténuer à distance");
assert.doesNotMatch(source, /texture2D\(dirtTex,\s*vPosW\.xz\s*\*\s*0\.02\)/, 'la texture dirt ne doit plus servir de bruit macro global');
assert.doesNotMatch(source, /macroScale/, "l'ancien échantillonnage macro répétitif doit être supprimé");

console.log('worldvisuals anti-tiling tests passed');

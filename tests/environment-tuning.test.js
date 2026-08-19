const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const BABYLON = require('../lib/babylon.js');

global.BABYLON = BABYLON;
global.window = { addEventListener() {}, removeEventListener() {} };
global.RENDER_SCALE = 0.08;
global.WORLD_SEED = 1337;

const environmentSource = fs.readFileSync(path.join(__dirname, '../js/environment.js'), 'utf8');
vm.runInThisContext(environmentSource, { filename: 'environment.js' });
const Environment = window.Environment;
Environment.prototype._buildHDRISky = function () { this.scene.environmentIntensity = 0.2; };
Environment.prototype.buildLandmarks = function () {};

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const camera = new BABYLON.FreeCamera('testCamera', BABYLON.Vector3.Zero(), scene);
scene.activeCamera = camera;
const environment = new Environment(scene);
const baseline = environment.captureTuning();
assert.deepEqual(baseline, {
  fog: { mode: 'linear', start: 50, end: 100, color: '#969696' },
  grading: { saturation: 1, contrast: 1.2, exposure: 1 },
  lighting: {
    directionalIntensity: 1.3, ambientIntensity: 1.5,
    directionalColor: '#dedede', ambientColor: '#646464', environmentIntensity: 0.2,
  },
  postProcess: { sharpen: 0, vignette: 0, grain: 0.2, softness: 0 },
}, 'la calibration validée doit être la baseline Babylon initiale');
const settings = JSON.parse(JSON.stringify(baseline));

settings.fog.start = 75;
settings.fog.end = 475;
settings.fog.color = '#778899';
settings.grading.saturation = 0.8;
settings.grading.contrast = 1.13;
settings.grading.exposure = 0.87;
settings.lighting.directionalIntensity = 0.71;
settings.lighting.ambientIntensity = 0.64;
settings.lighting.directionalColor = '#ccddee';
settings.lighting.ambientColor = '#8899aa';
settings.lighting.environmentIntensity = 0.44;
settings.postProcess.sharpen = 0.23;
settings.postProcess.vignette = 2.75;
settings.postProcess.grain = 0.12;
settings.postProcess.softness = 0.35;
environment.applyTuning(settings);

assert.equal(scene.fogStart, 75);
assert.equal(scene.fogEnd, 475);
assert.equal(scene.fogColor.toHexString(), '#778899');
assert.equal(scene.imageProcessingConfiguration.colorCurvesEnabled, true);
assert.ok(Math.abs(scene.imageProcessingConfiguration.colorCurves.globalSaturation + 20) < 0.001);
assert.equal(scene.imageProcessingConfiguration.contrast, 1.13);
assert.equal(scene.imageProcessingConfiguration.exposure, 0.87);
assert.equal(environment.sun.intensity, 0.71);
assert.equal(environment.hemi.intensity, 0.64);
assert.equal(environment.sun.diffuse.toHexString(), '#CCDDEE');
assert.equal(environment.hemi.diffuse.toHexString(), '#8899AA');
assert.equal(scene.environmentIntensity, 0.44);
assert.equal(scene.imageProcessingConfiguration.vignetteWeight, 2.75);
assert.equal(environment.pipeline.sharpenEnabled, true);
assert.equal(environment.pipeline.sharpen.edgeAmount, 0.23);
assert.equal(environment.pipeline.grainEnabled, true);
assert.equal(environment.pipeline.grain.intensity, 6);
assert.equal(environment.softnessPasses.length, 2);
assert.ok(Math.abs(environment.softnessPasses[0].kernel - 6.25) < 0.001);
assert.ok(Math.abs(environment.softnessPasses[1].kernel - 6.25) < 0.001);

global.RWA_ENV = window.RWA_ENV;
const worldVisualsSource = fs.readFileSync(path.join(__dirname, '../js/worldvisuals.js'), 'utf8');
vm.runInThisContext(worldVisualsSource, { filename: 'worldvisuals.js' });
const WorldVisuals = window.WorldVisuals;
WorldVisuals.prototype._buildTextures = function () {
  const texture = new BABYLON.RawTexture(
    new Uint8Array([255, 255, 255, 255]), 1, 1,
    BABYLON.Engine.TEXTUREFORMAT_RGBA, this.scene, false, false);
  for (const key of [
    'texGrass', 'texDirt', 'texRock', 'texWet',
    'normGrass', 'normDirt', 'normRock', 'normWet',
    'roughGrass', 'roughDirt', 'roughRock', 'roughWet',
  ]) this[key] = texture;
};

const worldVisuals = new WorldVisuals(scene, { S: 0.08, seed: 1337 });
const uniforms = {};
for (const method of ['setFloat', 'setColor3', 'setVector2']) {
  const original = worldVisuals.mat[method].bind(worldVisuals.mat);
  worldVisuals.mat[method] = (name, value) => { uniforms[name] = value; return original(name, value); };
}
worldVisuals.applyVisualTuning(settings, baseline);
assert.ok(Math.abs(uniforms.sunIntensity - (RWA_ENV.terrainSunIntensity * 0.71 / baseline.lighting.directionalIntensity)) < 0.0001);
assert.ok(Math.abs(uniforms.ambIntensity - (RWA_ENV.terrainAmbientIntensity * 0.64 / baseline.lighting.ambientIntensity)) < 0.0001);
assert.equal(uniforms.fogRange.x, 75);
assert.equal(uniforms.fogRange.y, 475);
assert.equal(uniforms.fogColor.toHexString(), '#778899');

environment.applyTuning(baseline);
assert.equal(scene.imageProcessingConfiguration.colorCurvesEnabled, false, 'CURRENT désactive la saturation ajoutée');
assert.equal(environment.pipeline.grainEnabled, true, 'CURRENT restaure le grain calibré');
assert.equal(environment.pipeline.grain.intensity, 10, 'CURRENT restaure exactement le grain 0.2');
assert.equal(environment.softnessPasses, null, 'CURRENT supprime les passes de flou à la valeur zéro');

worldVisuals.scene.onBeforeRenderObservable.remove(worldVisuals._obs);
scene.dispose();
engine.dispose();
console.log('environment-tuning.test.js: OK');

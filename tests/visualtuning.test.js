const assert = require('node:assert/strict');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const enabled = force == null ? !this.contains(name) : Boolean(force);
    enabled ? this.add(name) : this.remove(name);
    return enabled;
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.classList = new FakeClassList();
    this.style = {};
    this.value = '';
    this.type = '';
    this.textContent = '';
  }
  set className(value) { this._className = value; value.split(/\s+/).filter(Boolean).forEach(name => this.classList.add(name)); }
  get className() { return this._className || ''; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { (this.listeners[type] || (this.listeners[type] = [])).push(listener); }
  dispatch(type) { for (const listener of this.listeners[type] || []) listener({ target: this }); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  select() {}
}

const document = {
  body: new FakeElement('body'),
  createElement: tag => new FakeElement(tag),
  execCommand: () => true,
};
const windowListeners = {};
const windowObject = {
  addEventListener(type, listener) { (windowListeners[type] || (windowListeners[type] = [])).push(listener); },
  removeEventListener(type, listener) { windowListeners[type] = (windowListeners[type] || []).filter(item => item !== listener); },
  prompt: () => 'VISUAL_TEST',
};
const stored = {};
const localStorage = {
  getItem: key => stored[key] || null,
  setItem: (key, value) => { stored[key] = value; },
};
let copiedText = '';

global.document = document;
global.window = windowObject;
global.localStorage = localStorage;
Object.defineProperty(global, 'navigator', {
  configurable: true,
  value: { clipboard: { writeText: async text => { copiedText = text; } } },
});

require('../js/visualtuning.js');

const baseline = {
  fog: { mode: 'linear', start: 140, end: 760, color: '#99a3b3' },
  grading: { saturation: 1, contrast: 1.06, exposure: 1 },
  lighting: {
    directionalIntensity: 1, ambientIntensity: 1.08,
    directionalColor: '#ebe5d6', ambientColor: '#b8bfcc', environmentIntensity: 0.62,
  },
  postProcess: { sharpen: 0, vignette: 2.2, grain: 0 },
};
let applied = null;
let terrainApplied = null;
const game = {
  scene: {},
  environment: {
    captureTuning: () => JSON.parse(JSON.stringify(baseline)),
    applyTuning: settings => { applied = JSON.parse(JSON.stringify(settings)); },
  },
  worldvisuals: {
    applyVisualTuning: settings => { terrainApplied = JSON.parse(JSON.stringify(settings)); },
  },
  _playerShadow: { material: { alpha: 1 } },
};

(async () => {
  const panel = new window.VisualTuningPanel(game);
  assert.equal(panel.controls.length, 15, 'V1 doit exposer exactement 15 contrôles utiles');
  assert.equal(panel.panel.classList.contains('vt-hidden'), true, 'panneau masqué par défaut');

  const f8 = { code: 'F8', repeat: false, preventDefault() { this.prevented = true; } };
  windowListeners.keydown[0](f8);
  assert.equal(f8.prevented, true, 'F8 doit neutraliser son comportement navigateur');
  assert.equal(panel.panel.classList.contains('vt-hidden'), false, 'F8 ouvre le panneau');
  windowListeners.keydown[0](f8);
  assert.equal(panel.panel.classList.contains('vt-hidden'), true, 'un second F8 ferme le panneau');

  const fogStart = panel.inputs.get('fog.start').input;
  fogStart.value = '75'; fogStart.dispatch('input');
  assert.equal(applied.fog.start, 75, 'un slider applique sa valeur live');
  assert.equal(terrainApplied.fog.start, 75, 'le shader terrain reçoit la même valeur');

  panel._selectPreset('FOGGY');
  assert.equal(applied.fog.end, 460, 'le preset FOGGY est appliqué');
  panel.resetCurrent();
  assert.deepEqual(applied, Object.assign({}, baseline, { shadows: { contactOpacity: 1 } }), 'RESET restaure exactement CURRENT');

  panel.savePreset();
  assert.ok(JSON.parse(stored['rwa-visual-presets-v1']).VISUAL_TEST, 'SAVE PRESET écrit dans le stockage local');
  await panel.copySettings();
  assert.deepEqual(JSON.parse(copiedText), applied, 'COPY SETTINGS exporte les valeurs actives');

  panel.dispose();
  console.log('visualtuning.test.js: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

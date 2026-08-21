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
    this.tagName = tagName.toUpperCase(); this.children = []; this.listeners = {};
    this.classList = new FakeClassList(); this.attributes = {}; this.style = {};
    this.value = ''; this.textContent = ''; this.type = '';
  }
  set className(value) { this._className = value; value.split(/\s+/).filter(Boolean).forEach(name => this.classList.add(name)); }
  get className() { return this._className || ''; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { (this.listeners[type] || (this.listeners[type] = [])).push(listener); }
  dispatch(type) { for (const listener of this.listeners[type] || []) listener({ target: this }); }
  remove() {}
  select() {}
}

const document = { body: new FakeElement('body'), createElement: tag => new FakeElement(tag), execCommand: () => true };
const windowListeners = {};
const windowObject = {
  addEventListener(type, listener) { (windowListeners[type] || (windowListeners[type] = [])).push(listener); },
  removeEventListener() {},
};
const stored = {};
const localStorage = {
  getItem: key => stored[key] || null,
  setItem: (key, value) => { stored[key] = value; },
};

global.document = document;
global.window = windowObject;
global.localStorage = localStorage;
Object.defineProperty(global, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => {} } } });

require('../js/equipmenttuning.js');

const applied = { position: null, rotation: null, scale: null };
const holder = {
  position: { set: (...values) => { applied.position = values; } },
  rotation: { set: (...values) => { applied.rotation = values; } },
  scaling: { setAll: value => { applied.scale = value; } },
};
const game = { player: { visual: { equipment: { head: { holder } } } } };
const defaults = { position: [0, -7, 0], rotation: [0, Math.PI, Math.PI / 2], scale: 7.5 };
const panel = new window.EquipmentTuningPanel(game, defaults);

assert.equal(panel.panel.classList.contains('vt-hidden'), true, 'panneau casque masqué par défaut');
const f9 = { code: 'F9', repeat: false, preventDefault() { this.prevented = true; } };
windowListeners.keydown[0](f9);
assert.equal(f9.prevented, true, 'F9 neutralise le navigateur');
assert.equal(panel.panel.classList.contains('vt-hidden'), false, 'F9 ouvre le panneau casque');

const z = panel.inputs.get('rotationZ').input;
z.value = '120'; z.dispatch('input');
assert.ok(Math.abs(applied.rotation[2] - 120 * Math.PI / 180) < 1e-9, 'rotation Z appliquée en radians');
assert.ok(stored['rwa-equipment-tuning-helmet2-v1'], 'réglage sauvegardé localement');

const scale = panel.inputs.get('scale').input;
scale.value = '9.5'; scale.dispatch('input');
assert.equal(applied.scale, 9.5, 'échelle appliquée en direct');

panel.reset();
assert.deepEqual(applied.position, [0, -7, 0], 'reset restaure la position initiale');
assert.equal(applied.scale, 7.5, 'reset restaure l’échelle initiale');
panel.dispose();

console.log('equipmenttuning.test.js: OK');

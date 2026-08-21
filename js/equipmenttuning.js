/* ============================================================
   equipmenttuning.js — réglage DEV live des équipements rigides.
   F9 ouvre le panneau du casque Troll. Les valeurs sont locales au navigateur.
   ============================================================ */

const EQUIPMENT_TUNING_STORAGE_KEY = 'rwa-equipment-tuning-helmet2-v1';

class EquipmentTuningPanel {
  constructor(game, helmetDefaults) {
    this.game = game;
    this.assetUrl = helmetDefaults && helmetDefaults.url;
    this.defaults = this._fromOptions(helmetDefaults);
    this.controls = [
      { key: 'positionX', label: 'Position X', min: -50, max: 50, step: 0.5 },
      { key: 'positionY', label: 'Position Y', min: -50, max: 50, step: 0.5 },
      { key: 'positionZ', label: 'Position Z', min: -50, max: 50, step: 0.5 },
      { key: 'rotationX', label: 'Rotation X', min: -180, max: 180, step: 1, suffix: '°' },
      { key: 'rotationY', label: 'Rotation Y', min: -180, max: 180, step: 1, suffix: '°' },
      { key: 'rotationZ', label: 'Rotation Z', min: -180, max: 180, step: 1, suffix: '°' },
      { key: 'scale', label: 'Échelle', min: 0.5, max: 25, step: 0.1 },
    ];
    this.current = this._load();
    this.inputs = new Map();
    this._buildUI();
    this._keyHandler = event => {
      if (event.code !== 'F9' || event.repeat) return;
      event.preventDefault();
      this.toggle();
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _clone(value) { return JSON.parse(JSON.stringify(value)); }
  _fromOptions(options) {
    const position = options.position || [0, 0, 0];
    const rotation = options.rotation || [0, 0, 0];
    return {
      positionX: position[0], positionY: position[1], positionZ: position[2],
      rotationX: rotation[0] * 180 / Math.PI,
      rotationY: rotation[1] * 180 / Math.PI,
      rotationZ: rotation[2] * 180 / Math.PI,
      scale: options.scale == null ? 1 : options.scale,
    };
  }

  _normalise(settings) {
    const result = this._clone(this.defaults);
    for (const control of this.controls || []) {
      const raw = Number(settings && settings[control.key]);
      const fallback = Number(this.defaults[control.key]);
      result[control.key] = Math.min(control.max, Math.max(control.min, Number.isFinite(raw) ? raw : fallback));
    }
    return result;
  }

  _load() {
    try {
      const stored = JSON.parse(localStorage.getItem(EQUIPMENT_TUNING_STORAGE_KEY) || 'null');
      if (stored && typeof stored === 'object') return this._normalise(stored);
    } catch (error) {
      console.warn('[EquipmentTuning] Réglages locaux invalides.', error);
    }
    return this._clone(this.defaults);
  }

  _save() {
    try { localStorage.setItem(EQUIPMENT_TUNING_STORAGE_KEY, JSON.stringify(this.current)); }
    catch (error) { console.warn('[EquipmentTuning] Sauvegarde locale impossible.', error); }
  }

  optionsFor(baseOptions) {
    const c = this.current;
    return Object.assign({}, baseOptions, {
      position: [c.positionX, c.positionY, c.positionZ],
      rotation: [c.rotationX, c.rotationY, c.rotationZ].map(value => value * Math.PI / 180),
      scale: c.scale,
    });
  }

  applyToVisual(visual) {
    const item = visual && visual.equipment && visual.equipment.head;
    if (!item || !item.holder) {
      this._message('Casque absent : lance un joueur Troll.', true);
      return false;
    }
    const options = this.optionsFor({});
    item.holder.position.set(...options.position);
    item.holder.rotation.set(...options.rotation);
    item.holder.scaling.setAll(options.scale);
    this._message('Réglages appliqués en direct.');
    return true;
  }

  applyLive() {
    this._save();
    this.applyToVisual(this.game.player && this.game.player.visual);
    this._syncUI();
  }

  _buildUI() {
    const panel = document.createElement('aside');
    panel.id = 'equipment-tuning-panel';
    panel.className = 'visual-tuning-panel equipment-tuning-panel vt-hidden';
    panel.setAttribute('aria-hidden', 'true');

    const header = document.createElement('header');
    const title = document.createElement('strong'); title.textContent = 'HELMET TUNING';
    const shortcut = document.createElement('span'); shortcut.textContent = 'DEV · F9';
    header.append(title, shortcut); panel.appendChild(header);

    const actions = document.createElement('div'); actions.className = 'vt-actions et-actions';
    actions.append(
      this._button('COPY VALUES', () => this.copyValues()),
      this._button('RESET HELMET', () => this.reset())
    );
    panel.appendChild(actions);

    const status = document.createElement('p'); status.className = 'vt-status';
    status.textContent = 'Ajuste le casque du joueur Troll.';
    this.status = status; panel.appendChild(status);

    const details = document.createElement('details'); details.open = true;
    const assetName = String(this.assetUrl || 'helmet')
      .split('/').pop().replace(/\.glb$/i, '');
    const summary = document.createElement('summary'); summary.textContent = 'Head · ' + assetName;
    const body = document.createElement('div'); body.className = 'vt-section-body';
    details.append(summary, body); panel.appendChild(details);
    for (const control of this.controls) body.appendChild(this._control(control));

    document.body.appendChild(panel);
    this.panel = panel;
    this._syncUI();
  }

  _button(label, handler) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.addEventListener('click', handler);
    return button;
  }

  _control(definition) {
    const row = document.createElement('label'); row.className = 'vt-control';
    const label = document.createElement('span'); label.textContent = definition.label;
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range'; input.min = definition.min; input.max = definition.max; input.step = definition.step;
    input.addEventListener('input', () => {
      this.current[definition.key] = Number(input.value);
      this.applyLive();
    });
    row.append(label, output, input);
    this.inputs.set(definition.key, { input, output, definition });
    return row;
  }

  _syncUI() {
    for (const [key, binding] of this.inputs) {
      const value = this.current[key];
      binding.input.value = value;
      const decimals = binding.definition.step < 1 ? 1 : 0;
      binding.output.textContent = Number(value).toFixed(decimals) + (binding.definition.suffix || '');
    }
  }

  async copyValues() {
    const c = this.current;
    const text = JSON.stringify({
      position: [c.positionX, c.positionY, c.positionZ],
      rotationDegrees: [c.rotationX, c.rotationY, c.rotationZ],
      scale: c.scale,
    }, null, 2);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
      }
      this._message('Valeurs copiées dans le presse-papiers.');
    } catch (error) {
      console.log(text);
      this._message('Copie impossible : valeurs écrites dans la console.', true);
    }
  }

  reset() {
    this.current = this._clone(this.defaults);
    this.applyLive();
    this._message('Réglages initiaux restaurés.');
  }

  toggle(force) {
    const show = force == null ? this.panel.classList.contains('vt-hidden') : Boolean(force);
    this.panel.classList.toggle('vt-hidden', !show);
    this.panel.setAttribute('aria-hidden', String(!show));
    if (show) {
      this._syncUI();
      this.applyToVisual(this.game.player && this.game.player.visual);
    }
  }

  _message(text, error) {
    this.status.textContent = text;
    this.status.classList.toggle('error', Boolean(error));
  }

  dispose() {
    window.removeEventListener('keydown', this._keyHandler);
    if (this.panel) this.panel.remove();
  }
}

if (typeof window !== 'undefined') window.EquipmentTuningPanel = EquipmentTuningPanel;

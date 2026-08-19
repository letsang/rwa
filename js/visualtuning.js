/* ============================================================
   visualtuning.js — Visual Tuning Panel DEV (V1)

   UI événementielle uniquement. Ne touche ni la simulation, ni la génération,
   ni les chunks. Les valeurs sont appliquées aux objets Babylon déjà créés par
   Environment et aux uniforms d'apparence de WorldVisuals.
   ============================================================ */

const VISUAL_TUNING_STORAGE_KEY = 'rwa-visual-presets-v1';

class VisualTuningPanel {
  constructor(game) {
    if (!game || !game.scene || !game.environment) throw new Error('VisualTuning requiert une scène et Environment.');
    this.game = game;
    this.environment = game.environment;
    this.worldvisuals = game.worldvisuals || null;
    this.baseline = this._capture();
    this.current = this._clone(this.baseline);
    this.controls = this._controlDefinitions();
    this.presets = this._buildPresets();
    this.savedPresets = this._loadSavedPresets();
    this.inputs = new Map();
    this.activePreset = 'CURRENT';
    this._buildUI();
    this._keyHandler = event => {
      if (event.code !== 'F8' || event.repeat) return;
      event.preventDefault();
      this.toggle();
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _clone(value) { return JSON.parse(JSON.stringify(value)); }
  _capture() {
    const settings = this.environment.captureTuning();
    const shadow = this.game._playerShadow;
    settings.shadows = {
      contactOpacity: shadow && shadow.material ? shadow.material.alpha : 1,
    };
    return settings;
  }

  _controlDefinitions() {
    return [
      { section: 'Atmosphere', path: 'fog.start', label: 'Fog Start', min: 0, max: 600, step: 5 },
      { section: 'Atmosphere', path: 'fog.end', label: 'Fog End', min: 100, max: 950, step: 5 },
      { section: 'Atmosphere', path: 'fog.color', label: 'Fog Color', type: 'color' },
      { section: 'Atmosphere', path: 'grading.saturation', label: 'Saturation', min: 0.4, max: 1.4, step: 0.01 },
      { section: 'Atmosphere', path: 'grading.contrast', label: 'Contrast', min: 0.6, max: 1.5, step: 0.01 },
      { section: 'Atmosphere', path: 'grading.exposure', label: 'Exposure', min: 0.5, max: 1.5, step: 0.01 },
      { section: 'Lighting', path: 'lighting.directionalIntensity', label: 'Directional Intensity', min: 0, max: 2, step: 0.01 },
      { section: 'Lighting', path: 'lighting.ambientIntensity', label: 'Ambient Intensity', min: 0, max: 2, step: 0.01 },
      { section: 'Lighting', path: 'lighting.environmentIntensity', label: 'Environment Intensity', min: 0, max: 1.5, step: 0.01 },
      { section: 'Lighting', path: 'lighting.directionalColor', label: 'Directional Color', type: 'color' },
      { section: 'Lighting', path: 'lighting.ambientColor', label: 'Ambient Color', type: 'color' },
      { section: 'Shadows', path: 'shadows.contactOpacity', label: 'Contact Shadow Opacity', min: 0, max: 1, step: 0.01 },
      { section: 'Post Process', path: 'postProcess.sharpen', label: 'Sharpen', min: 0, max: 1, step: 0.01 },
      { section: 'Post Process', path: 'postProcess.vignette', label: 'Vignette Intensity', min: 0, max: 5, step: 0.05 },
      { section: 'Post Process', path: 'postProcess.grain', label: 'Grain Intensity', min: 0, max: 1, step: 0.01 },
    ];
  }

  _buildPresets() {
    const preset = overrides => {
      const value = this._clone(this.baseline);
      for (const path in overrides) this._set(value, path, overrides[path]);
      return value;
    };
    return {
      CURRENT: this._clone(this.baseline),
      NEUTRAL: preset({
        'fog.start': 180, 'fog.end': 850,
        'grading.saturation': 1, 'grading.contrast': 1, 'grading.exposure': 1,
        'postProcess.sharpen': 0, 'postProcess.vignette': 0, 'postProcess.grain': 0,
      }),
      FOGGY: preset({
        'fog.start': 70, 'fog.end': 460, 'fog.color': '#87919a',
        'grading.saturation': 0.78, 'grading.contrast': 1.04, 'grading.exposure': 0.92,
        'lighting.directionalIntensity': 0.72, 'lighting.ambientIntensity': 0.82,
        'lighting.environmentIntensity': 0.5, 'postProcess.vignette': 2.5,
      }),
      OVERCAST: preset({
        'fog.start': 110, 'fog.end': 650, 'fog.color': '#788592',
        'grading.saturation': 0.82, 'grading.contrast': 1.02, 'grading.exposure': 0.88,
        'lighting.directionalIntensity': 0.68, 'lighting.ambientIntensity': 0.92,
        'lighting.environmentIntensity': 0.48, 'lighting.directionalColor': '#d7d6cf',
        'lighting.ambientColor': '#a8b6c4', 'postProcess.vignette': 2.3,
      }),
      DARK: preset({
        'fog.start': 120, 'fog.end': 600, 'fog.color': '#58616d',
        'grading.saturation': 0.7, 'grading.contrast': 1.12, 'grading.exposure': 0.68,
        'lighting.directionalIntensity': 0.55, 'lighting.ambientIntensity': 0.58,
        'lighting.environmentIntensity': 0.35, 'shadows.contactOpacity': 0.8,
        'postProcess.sharpen': 0.12, 'postProcess.vignette': 3, 'postProcess.grain': 0.08,
      }),
    };
  }

  _get(object, path) { return path.split('.').reduce((value, key) => value[key], object); }
  _set(object, path, value) {
    const keys = path.split('.');
    const leaf = keys.pop();
    const target = keys.reduce((node, key) => node[key], object);
    target[leaf] = value;
  }

  _normalise(settings) {
    for (const control of this.controls) {
      if (control.type === 'color') continue;
      const value = Number(this._get(settings, control.path));
      this._set(settings, control.path, Math.min(control.max, Math.max(control.min, value)));
    }
    if (settings.fog.end <= settings.fog.start + 10) settings.fog.end = Math.min(950, settings.fog.start + 10);
    if (settings.fog.start >= settings.fog.end - 10) settings.fog.start = Math.max(0, settings.fog.end - 10);
    return settings;
  }

  _apply(settings, activePreset) {
    this.current = this._normalise(this._clone(settings));
    this.environment.applyTuning(this.current);
    if (this.worldvisuals) this.worldvisuals.applyVisualTuning(this.current, this.baseline);
    const shadow = this.game._playerShadow;
    if (shadow && shadow.material) shadow.material.alpha = this.current.shadows.contactOpacity;
    this.activePreset = activePreset || '__custom';
    this._syncUI();
  }

  _buildUI() {
    const panel = document.createElement('aside');
    panel.id = 'visual-tuning-panel';
    panel.className = 'visual-tuning-panel vt-hidden';
    panel.setAttribute('aria-hidden', 'true');

    const header = document.createElement('header');
    const title = document.createElement('strong'); title.textContent = 'VISUAL TUNING';
    const shortcut = document.createElement('span'); shortcut.textContent = 'DEV · F8';
    header.append(title, shortcut); panel.appendChild(header);

    const presetRow = document.createElement('div'); presetRow.className = 'vt-preset-row';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Preset visuel');
    select.addEventListener('change', () => this._selectPreset(select.value));
    this.presetSelect = select; presetRow.appendChild(select); panel.appendChild(presetRow);

    const actions = document.createElement('div'); actions.className = 'vt-actions';
    actions.append(
      this._button('SAVE PRESET', () => this.savePreset()),
      this._button('COPY SETTINGS', () => this.copySettings()),
      this._button('RESET CURRENT', () => this.resetCurrent())
    );
    panel.appendChild(actions);

    const status = document.createElement('p'); status.className = 'vt-status'; status.textContent = 'Baseline CURRENT capturée.';
    this.status = status; panel.appendChild(status);

    const sections = new Map();
    for (const control of this.controls) {
      let body = sections.get(control.section);
      if (!body) {
        const details = document.createElement('details'); details.open = true;
        const summary = document.createElement('summary'); summary.textContent = control.section;
        body = document.createElement('div'); body.className = 'vt-section-body';
        details.append(summary, body); panel.appendChild(details); sections.set(control.section, body);
        if (control.section === 'Atmosphere') {
          const note = document.createElement('small'); note.textContent = 'Fog linéaire : aucune densité Babylon applicable.'; body.appendChild(note);
        }
        if (control.section === 'Shadows') {
          const note = document.createElement('small'); note.textContent = 'Ombre de contact existante (aucun ShadowGenerator actif).'; body.appendChild(note);
        }
      }
      body.appendChild(this._control(control));
    }

    document.body.appendChild(panel);
    this.panel = panel;
    this._refreshPresetOptions();
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
    const value = document.createElement('output');
    const input = document.createElement('input');
    input.type = definition.type || 'range';
    if (input.type === 'range') {
      input.min = definition.min; input.max = definition.max; input.step = definition.step;
    }
    input.addEventListener('input', () => {
      const next = this._clone(this.current);
      this._set(next, definition.path, input.type === 'color' ? input.value : Number(input.value));
      this._apply(next, '__custom');
    });
    row.append(label, value, input);
    this.inputs.set(definition.path, { input, output: value, definition });
    return row;
  }

  _format(value, step) {
    if (step >= 1) return String(Math.round(value));
    const decimals = step >= 0.1 ? 1 : 2;
    return Number(value).toFixed(decimals);
  }

  _syncUI() {
    for (const [path, binding] of this.inputs) {
      const value = this._get(this.current, path);
      binding.input.value = value;
      binding.output.textContent = binding.input.type === 'color' ? String(value).toUpperCase() : this._format(value, binding.definition.step);
    }
    if (this.presetSelect) this.presetSelect.value = this.activePreset;
  }

  _refreshPresetOptions() {
    const select = this.presetSelect;
    select.replaceChildren();
    for (const name of Object.keys(this.presets)) {
      const option = document.createElement('option'); option.value = name; option.textContent = name; select.appendChild(option);
    }
    const custom = document.createElement('option'); custom.value = '__custom'; custom.textContent = 'CUSTOM'; select.appendChild(custom);
    const savedNames = Object.keys(this.savedPresets).sort();
    if (savedNames.length) {
      const divider = document.createElement('option'); divider.disabled = true; divider.textContent = '— SAVED —'; select.appendChild(divider);
      for (const name of savedNames) {
        const option = document.createElement('option'); option.value = 'saved:' + name; option.textContent = name; select.appendChild(option);
      }
    }
    select.value = this.activePreset;
  }

  _selectPreset(key) {
    if (key === '__custom') return;
    const settings = key.startsWith('saved:') ? this.savedPresets[key.slice(6)] : this.presets[key];
    if (!settings) return;
    this._apply(settings, key);
    this._message('Preset ' + key.replace(/^saved:/, '') + ' appliqué.');
  }

  _loadSavedPresets() {
    try {
      const stored = JSON.parse(localStorage.getItem(VISUAL_TUNING_STORAGE_KEY) || '{}');
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    } catch (error) {
      console.warn('[VisualTuning] Presets locaux invalides, stockage ignoré.', error);
      return {};
    }
  }

  savePreset() {
    const raw = window.prompt('Nom du preset visuel :', 'VISUAL_FINAL_01');
    if (raw == null) return;
    const name = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').slice(0, 40);
    if (!name) return this._message('Nom de preset invalide.', true);
    if (Object.prototype.hasOwnProperty.call(this.presets, name)) return this._message('Nom réservé par un preset intégré.', true);
    this.savedPresets[name] = this._clone(this.current);
    try {
      localStorage.setItem(VISUAL_TUNING_STORAGE_KEY, JSON.stringify(this.savedPresets));
      this.activePreset = 'saved:' + name;
      this._refreshPresetOptions(); this._syncUI();
      this._message('Preset ' + name + ' sauvegardé localement.');
    } catch (error) {
      console.error('[VisualTuning] Sauvegarde impossible.', error);
      this._message('Sauvegarde locale impossible.', true);
    }
  }

  async copySettings() {
    const text = JSON.stringify(this.current, null, 2);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
      }
      this._message('Réglages copiés dans le presse-papiers.');
    } catch (error) {
      console.error('[VisualTuning] Copie impossible.', error);
      this._message('Copie impossible : voir la console.', true);
      console.log(text);
    }
  }

  resetCurrent() {
    this._apply(this.baseline, 'CURRENT');
    this._message('Baseline CURRENT restaurée exactement.');
  }

  toggle(force) {
    const show = force == null ? this.panel.classList.contains('vt-hidden') : Boolean(force);
    this.panel.classList.toggle('vt-hidden', !show);
    this.panel.setAttribute('aria-hidden', String(!show));
    if (show) this._syncUI();
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

if (typeof window !== 'undefined') window.VisualTuningPanel = VisualTuningPanel;

/* ============================================================
   keybindings.js — Raccourcis clavier configurables et persistants.
   Les codes physiques gardent les commandes cohérentes entre AZERTY et QWERTY.
   ============================================================ */

const RWA_KEYBINDING_ACTIONS = [
  { id: 'moveForward', label: 'Avancer', code: 'KeyW' },
  { id: 'moveBackward', label: 'Reculer', code: 'KeyS' },
  { id: 'moveLeft', label: 'Aller à gauche', code: 'KeyA' },
  { id: 'moveRight', label: 'Aller à droite', code: 'KeyD' },
  { id: 'targetNearest', label: 'Cibler l’ennemi le plus proche', code: 'KeyC' },
  { id: 'jump', label: 'Sauter', code: 'Space' },
  { id: 'stick', label: 'Suivre la cible (Stick)', code: 'KeyF' },
  { id: 'toggleCamera', label: 'Changer de vue', code: 'KeyV' },
  { id: 'toggleDebug', label: 'Afficher les performances', code: 'F3' },
  { id: 'ability1', label: 'Compétence 1', code: 'Digit1' },
  { id: 'ability2', label: 'Compétence 2', code: 'Digit2' },
  { id: 'ability3', label: 'Compétence 3', code: 'Digit3' },
  { id: 'ability4', label: 'Compétence 4', code: 'Digit4' },
  { id: 'realmAbility', label: 'Compétence de royaume', code: 'KeyR' },
  { id: 'sprint', label: 'Sprint', code: 'ShiftLeft' },
];

class RWAKeybindingManager {
  constructor() {
    this.storageKey = 'rwa-keybindings';
    this.actions = RWA_KEYBINDING_ACTIONS;
    this.bindings = this.load();
    this.listeningAction = null;
    this.bindOptions();
    this.updateControlsHint();
  }

  defaults() { return Object.fromEntries(this.actions.map(action => [action.id, action.code])); }

  load() {
    const defaults = this.defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      const merged = Object.fromEntries(this.actions.map(action => [
        action.id,
        typeof saved[action.id] === 'string' ? saved[action.id] : defaults[action.id],
      ]));
      const codes = Object.values(merged);
      return new Set(codes).size === codes.length ? merged : defaults;
    } catch (_) { /* Les valeurs par défaut restent actives. */ }
    return defaults;
  }

  save() {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.bindings)); }
    catch (_) { /* Le jeu reste jouable si le stockage local est indisponible. */ }
  }

  code(actionId) { return this.bindings[actionId]; }

  matches(actionId, code) {
    const binding = this.code(actionId);
    if (binding === 'ShiftLeft') return code === 'ShiftLeft' || code === 'ShiftRight';
    if (binding === 'ControlLeft') return code === 'ControlLeft' || code === 'ControlRight';
    if (binding === 'AltLeft') return code === 'AltLeft' || code === 'AltRight';
    return binding === code;
  }

  actionForCode(code) {
    const action = this.actions.find(item => this.matches(item.id, code));
    return action ? action.id : null;
  }

  label(actionId) { return this.formatCode(this.code(actionId)); }

  formatCode(code) {
    const labels = {
      KeyW: 'Z / W', KeyA: 'Q / A', Space: 'ESPACE', ShiftLeft: 'MAJ', ShiftRight: 'MAJ',
      ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Backspace: 'RETOUR', Enter: 'ENTRÉE', Escape: 'ÉCHAP', Tab: 'TAB',
    };
    if (labels[code]) return labels[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return 'NUM ' + code.slice(6);
    return code.replace(/^Bracket/, '').replace(/^Numpad/, 'NUM ');
  }

  bindOptions() {
    const list = document.getElementById('keybindings-list');
    const reset = document.getElementById('keybindings-reset-btn');
    if (!list || !reset) return;
    list.innerHTML = this.actions.map(action =>
      `<div class="keybinding-row"><span>${action.label}</span><button type="button" class="keybinding-btn" data-action="${action.id}"></button></div>`
    ).join('');
    list.addEventListener('click', event => {
      const button = event.target.closest('.keybinding-btn');
      if (!button) return;
      this.listeningAction = button.dataset.action;
      this.render();
    });
    reset.addEventListener('click', () => {
      this.bindings = this.defaults();
      this.listeningAction = null;
      this.changed();
    });
    document.addEventListener('keydown', event => this.captureBinding(event), true);
    this.render();
  }

  captureBinding(event) {
    if (!this.listeningAction) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') { this.listeningAction = null; this.render(); return; }
    // F8 reste réservé au Visual Tuning Panel DEV et ne peut pas devenir une
    // commande de gameplay configurable.
    if (event.code === 'F8') { this.listeningAction = null; this.render(); return; }
    const actionId = this.listeningAction;
    const oldCode = this.bindings[actionId];
    const conflict = this.actions.find(action => action.id !== actionId && this.matches(action.id, event.code));
    if (conflict) this.bindings[conflict.id] = oldCode;
    this.bindings[actionId] = event.code;
    this.listeningAction = null;
    this.changed();
  }

  changed() {
    this.save();
    this.render();
    this.updateControlsHint();
    window.dispatchEvent(new CustomEvent('rwa-keybindings-changed'));
  }

  render() {
    document.querySelectorAll('.keybinding-btn').forEach(button => {
      const isListening = button.dataset.action === this.listeningAction;
      button.classList.toggle('listening', isListening);
      button.textContent = isListening ? 'APPUYEZ…' : this.label(button.dataset.action);
    });
  }

  updateControlsHint() {
    const hint = document.getElementById('controls-hint');
    if (!hint) return;
    hint.textContent = `ZQSD / WASD · déplacement | ${this.label('targetNearest')} · cible ennemie proche | ${this.label('jump')} · saut | ${this.label('stick')} · stick cible | clic droit · caméra | ${this.label('toggleCamera')} · vue tactique`;
  }
}

const RWAKeybindings = new RWAKeybindingManager();

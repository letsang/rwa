/* ============================================================
   audio.js — Direction audio des menus et du monde.
   Audio HTML natif, offline, sans dépendance Babylon.
   ============================================================ */

const AUDIO_PATH = './assets/audio/';

const AUDIO_LIBRARY = {
  intro: [
    'frontiersmusic_drums1.wav', 'frontiersmusic_drums2.wav',
    'frontiersmusic_drums3.wav', 'frontiersmusic_drums4.wav',
    'frontiersmusic_drums5.wav', 'frontiersmusic_drums6.wav',
    'frontiersmusic_drums7.wav', 'frontiersmusic_drums8.wav',
  ].map(file => AUDIO_PATH + 'Intro/' + file),
  midplay: AUDIO_PATH + 'Ambient/midplay.mp3',
  fort: [
    'frontiersmusic_bigdrums1a.wav', 'frontiersmusic_bigdrums1b.wav',
    'frontiersmusic_bigdrums2a.wav', 'frontiersmusic_bigdrums2b.wav',
  ].map(file => AUDIO_PATH + 'Ambient/' + file),
};

class RWAudioManager {
  constructor() {
    this.music = new Audio();
    this.music.autoplay = true;
    this.music.playsInline = true;
    this.music.preload = 'auto';
    this.music.loop = false;
    this.musicState = 'idle';
    this.lastIntro = '';
    this.lastFort = '';
    this._nearObjective = null;
    this._lastFortAt = 0;
    this.settings = this.loadSettings();
    this.applyVolumes();
    this.bindOptions();
    document.addEventListener('pointerdown', () => this.unlock(), { once: true });
  }

  loadSettings() {
    const defaults = { master: 0.8, music: 0.65, sfx: 0.8, muted: false };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('rwa-audio') || '{}') }; }
    catch (_) { return defaults; }
  }

  saveSettings() {
    try { localStorage.setItem('rwa-audio', JSON.stringify(this.settings)); }
    catch (_) { /* Le jeu reste utilisable si le stockage est indisponible. */ }
  }

  applyVolumes() {
    this.music.volume = this.settings.muted ? 0 : this.settings.master * this.settings.music;
  }

  bindOptions() {
    const modal = document.getElementById('options-modal');
    const open = document.getElementById('options-btn');
    const close = document.getElementById('options-close-btn');
    const mute = document.getElementById('mute-btn');
    const bindings = [
      ['master-volume', 'master'], ['music-volume', 'music'], ['sfx-volume', 'sfx'],
    ];
    const render = () => {
      for (const [id, key] of bindings) {
        const input = document.getElementById(id);
        const output = document.getElementById(id + '-value');
        input.value = Math.round(this.settings[key] * 100);
        output.textContent = input.value + '%';
      }
      mute.textContent = this.settings.muted ? 'RÉACTIVER LE SON' : 'COUPER LE SON';
    };
    open.addEventListener('click', () => { render(); modal.classList.remove('hidden'); });
    close.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', event => { if (event.target === modal) modal.classList.add('hidden'); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') modal.classList.add('hidden'); });
    for (const [id, key] of bindings) {
      document.getElementById(id).addEventListener('input', event => {
        this.settings[key] = Number(event.target.value) / 100;
        document.getElementById(id + '-value').textContent = event.target.value + '%';
        this.applyVolumes();
        this.saveSettings();
      });
    }
    mute.addEventListener('click', () => {
      this.settings.muted = !this.settings.muted;
      this.applyVolumes();
      this.saveSettings();
      render();
      if (!this.settings.muted) this.unlock();
    });
  }

  async unlock() {
    if (this.settings.muted) return;
    if (this.musicState === 'idle') return this.playTitle();
    if (this.music.paused) {
      try { await this.music.play(); } catch (_) { /* Un prochain geste retentera. */ }
    }
  }

  async setMusic(src, { state = 'music', onEnded = null } = {}) {
    this.music.pause();
    this.musicState = state;
    this.music.src = src;
    this.music.loop = false;
    this.music.onended = onEnded;
    this.applyVolumes();
    try { await this.music.play(); } catch (_) { /* Autoplay bloqué jusqu'au premier geste. */ }
  }

  randomWithoutImmediateRepeat(list, previous) {
    const choices = list.length > 1 ? list.filter(src => src !== previous) : list;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  // Appelé au lancement : enchaîne les WAV d'Intro aléatoirement pendant tous
  // les menus et le chargement. enterGame() interrompt proprement cette playlist.
  playTitle() { return this.playNextIntro(); }

  playNextIntro() {
    const src = this.randomWithoutImmediateRepeat(AUDIO_LIBRARY.intro, this.lastIntro);
    this.lastIntro = src;
    return this.setMusic(src, {
      state: 'intro',
      onEnded: () => { if (this.musicState === 'intro') this.playNextIntro(); },
    });
  }

  // Midplay reste une transition jouée une fois à l'entrée dans le monde.
  enterGame() { return this.setMusic(AUDIO_LIBRARY.midplay, { state: 'midplay' }); }

  playSfx(src) {
    if (this.settings.muted) return;
    const sound = new Audio(src);
    sound.volume = this.settings.master * this.settings.sfx;
    sound.play().catch(() => {});
  }

  playRandomFortDrums() {
    const src = this.randomWithoutImmediateRepeat(AUDIO_LIBRARY.fort, this.lastFort);
    this.lastFort = src;
    this.playSfx(src);
  }

  updateWorldAudio(player) {
    if (!player || !window.WorldDefinition) return;
    const triggerRadius = 1500;
    const triggerRadius2 = triggerRadius * triggerRadius;
    let nearest = null;
    let nearestD2 = Infinity;
    for (const objective of WorldDefinition.objectives) {
      if (objective.type !== 'fort' && objective.type !== 'neutral') continue;
      const dx = player.x - objective.worldPos.x;
      const dy = player.y - objective.worldPos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < triggerRadius2 && d2 < nearestD2) { nearest = objective.id; nearestD2 = d2; }
    }
    if (nearest && nearest !== this._nearObjective && performance.now() - this._lastFortAt > 30000) {
      this._lastFortAt = performance.now();
      this.playRandomFortDrums();
    }
    this._nearObjective = nearest;
  }
}

window.AUDIO_LIBRARY = AUDIO_LIBRARY;
window.RWAudioManager = RWAudioManager;

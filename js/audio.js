/* ============================================================
   audio.js — Direction audio des menus et du monde.
   Audio HTML natif, offline, sans dépendance Babylon.
   ============================================================ */

const AUDIO_PATH = './assets/audio/';

const AUDIO_LIBRARY = {
  intro: {
    title: AUDIO_PATH + 'Intro/title.mp3',
    midplay: AUDIO_PATH + 'Intro/midplay.mp3',
  },
  ambient: {
    EAST: [
      'AC1A_01a.wav', 'AC1A_02a.wav', 'AC1A_02b.wav', 'AC1A_02c.wav',
      'AC1A_02d.wav', 'AC1A_03a.wav', 'AC1A_03b.wav', 'ac1a_04a.wav',
      'AC1A_04b.wav', 'AC1A_04c.wav', 'ac1a_04d.wav', 'AC1B_02a.wav',
      'AC1B_02b.wav', 'AC1B_02c.wav', 'AC1B_02d.wav',
    ].map(f => AUDIO_PATH + 'Ambient/East/' + f),
    CENTER: [
      'MY02_01a.wav', 'MY02_02a.wav', 'MY02_02b.wav', 'MY02_02c.wav',
      'MY02_02d.wav', 'MY02_03a.wav', 'MY02_03b.wav', 'MY02_03c.wav',
      'MY02_03d.wav', 'MY02_04a.wav', 'MY02_04b.wav', 'MY02_04c.wav',
      'MY03_01a.wav', 'MY03_01b.wav', 'MY03_01c.wav', 'MY03_01d.wav',
      'MY03_02a.wav', 'MY03_02b.wav', 'MY03_02c.wav', 'MY03_02d.wav',
      'MY03_03a.wav', 'MY04_01a.wav', 'MY04_01b.wav', 'MY04_01c.wav',
      'MY04_02a.wav', 'MY04_02b.wav', 'MY04_02c.wav', 'MY04_02d.wav',
      'MY04_03a.wav', 'MY04_03b.wav', 'MY04_03c.wav', 'MY04_03d.wav',
      'my04_04a.wav', 'MY06_01a.wav', 'MY06_01b.wav', 'MY06_01c.wav',
      'MY06_01d.wav', 'my06_02a.wav', 'MY06_02b.wav', 'MY06_02c.wav',
      'MY06_02d.wav', 'MY06_03a.wav', 'my06_03b.wav', 'MY06_03c.wav',
    ].map(f => AUDIO_PATH + 'Ambient/North/' + f),
    WEST: [
      'LT01_01a.wav', 'LT01_01b.wav', 'LT01_01c.wav', 'LT01_01d.wav',
      'LT01_02a.wav', 'LT01_02b.wav', 'LT01_02c.wav', 'LT01_02d.wav',
      'LT01_03a.wav', 'LT01_03b.wav', 'LT01_03c.wav', 'LT01_03d.wav',
      'LT02_01a.wav', 'LT02_01b.wav', 'LT02_01c.wav', 'LT02_01d.wav',
      'LT02_02a.wav', 'LT02_02b.wav', 'LT02_02c.wav', 'LT02_02d.wav',
      'LT02_03a.wav', 'LT02_03b.wav', 'LT02_03c.wav', 'LT02_03d.wav',
      'LT02_04a.wav', 'LT02_04b.wav', 'LT02_04c.wav', 'LT02_04d.wav',
      'lt03_01a.wav', 'lt03_01b.wav', 'LT03_02a.wav', 'LT03_02b.wav',
      'LT03_03a.wav', 'LT03_03b.wav', 'LT03_03c.wav', 'LT03_03d.wav',
      'LT03_04a.wav', 'LT03_04b.wav', 'LT03_04c.wav', 'LT03_04d.wav',
      'LT04_01a.wav', 'LT04_01b.wav', 'LT04_01c.wav', 'LT04_02a.wav',
      'LT04_02b.wav', 'LT04_02c.wav', 'LT04_03a.wav', 'LT04_03b.wav',
      'LT04_03c.wav', 'LT04_03d.wav', 'LT04_04a.wav', 'LT04_04b.wav',
      'LT04_04c.wav', 'LT05_01a.wav', 'LT05_01b.wav', 'LT05_02a.wav',
      'LT05_02b.wav', 'LT05_03a.wav', 'LT05_03b.wav', 'LT05_03c.wav',
      'LT05_04a.wav', 'LT05_04b.wav', 'LT05_04c.wav', 'LT06_01a.wav',
      'LT06_01b.wav', 'LT06_01c.wav', 'LT06_02a.wav', 'LT06_02b.wav',
      'LT06_02c.wav', 'LT06_03a.wav', 'LT06_03b.wav', 'LT06_03c.wav',
      'LT06_03d.wav', 'LT08_01a.wav', 'LT08_01b.wav', 'LT08_01c.wav',
      'LT08_02a.wav', 'LT08_02b.wav', 'LT08_03a.wav', 'LT08_03b.wav',
      'LT08_03c.wav', 'LT08_04a.wav', 'LT08_04b.wav', 'LT08_04c.wav',
      'LT08_04d.wav', 'LT08_05a.wav', 'LT08_05b.wav', 'LT10_01a.wav',
      'LT10_01b.wav', 'LT10_02a.wav', 'LT10_02b.wav', 'LT10_02c.wav',
      'LT10_02d.wav', 'LT10_03a.wav', 'LT10_03b.wav', 'LT10_03c.wav',
      'LT10_03d.wav', 'LT10_04a.wav', 'LT10_04b.wav', 'LT10_04c.wav',
    ].map(f => AUDIO_PATH + 'Ambient/West/' + f),
  },
  zone: [
    'frontiersmusic_bigdrums1a.wav', 'frontiersmusic_bigdrums1b.wav',
    'frontiersmusic_bigdrums2a.wav', 'frontiersmusic_bigdrums2b.wav',
    'frontiersmusic_bowedcymbal1.wav', 'frontiersmusic_bowedcymbal2.wav',
    'frontiersmusic_bowedcymbal3.wav', 'frontiersmusic_bowedcymbal4.wav',
    'frontiersmusic_drums1.wav', 'frontiersmusic_drums2.wav',
    'frontiersmusic_drums3.wav', 'frontiersmusic_drums4.wav',
    'frontiersmusic_drums5.wav', 'frontiersmusic_drums6.wav',
    'frontiersmusic_drums7.wav', 'frontiersmusic_drums8.wav',
  ].map(f => AUDIO_PATH + 'Zone/' + f),
};

class RWAudioManager {
  constructor() {
    this.music = new Audio();
    this.music.preload = 'auto';
    this.music.loop = false;
    this.musicState = 'idle';
    this.faction = null;
    this.lastAmbient = '';
    this._nearObjective = null;
    this._lastZoneAt = 0;
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
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.classList.add('hidden'); });
    for (const [id, key] of bindings) {
      document.getElementById(id).addEventListener('input', e => {
        this.settings[key] = Number(e.target.value) / 100;
        document.getElementById(id + '-value').textContent = e.target.value + '%';
        this.applyVolumes(); this.saveSettings();
      });
    }
    mute.addEventListener('click', () => {
      this.settings.muted = !this.settings.muted;
      this.applyVolumes(); this.saveSettings(); render();
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

  async setMusic(src, { loop = false, state = 'music', onEnded = null } = {}) {
    this.music.pause();
    this.musicState = state;
    this.music.src = src;
    this.music.loop = loop;
    this.music.onended = onEnded;
    this.applyVolumes();
    try { await this.music.play(); } catch (_) { /* Autoplay bloqué jusqu'au premier geste. */ }
  }

  playTitle() {
    return this.setMusic(AUDIO_LIBRARY.intro.title, { loop: true, state: 'title' });
  }

  enterGame(faction) {
    this.faction = faction;
    return this.setMusic(AUDIO_LIBRARY.intro.midplay, {
      state: 'midplay',
      onEnded: () => this.playNextAmbient(),
    });
  }

  playNextAmbient() {
    const list = AUDIO_LIBRARY.ambient[this.faction] || AUDIO_LIBRARY.ambient.CENTER;
    let choices = list.filter(src => src !== this.lastAmbient);
    if (!choices.length) choices = list;
    const src = choices[Math.floor(Math.random() * choices.length)];
    this.lastAmbient = src;
    return this.setMusic(src, { state: 'ambient', onEnded: () => this.playNextAmbient() });
  }

  playSfx(src) {
    if (this.settings.muted) return;
    const sound = new Audio(src);
    sound.volume = this.settings.master * this.settings.sfx;
    sound.play().catch(() => {});
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
    if (nearest && nearest !== this._nearObjective && performance.now() - this._lastZoneAt > 30000) {
      this._lastZoneAt = performance.now();
      const src = AUDIO_LIBRARY.zone[Math.floor(Math.random() * AUDIO_LIBRARY.zone.length)];
      this.playSfx(src);
    }
    this._nearObjective = nearest;
  }
}

window.AUDIO_LIBRARY = AUDIO_LIBRARY;
window.RWAudioManager = RWAudioManager;

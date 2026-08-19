/* ============================================================
   animlib.js — RWA Animation Library (rig Manny partagé)

   Principe : on NE met PAS les animations dans chaque Character GLB.
   Une bibliothèque commune charge les clips Manny UNE seule fois
   (mesh Manny source masqué), puis retargete par NOM DE BONE vers
   n'importe quel personnage compatible Manny.

   Contrat : tout Character GLB au rig Manny fonctionne automatiquement.

       const lib = new AnimationLibrary(scene, './Exports/Animations/Manny/');
       await lib.load();                       // (ou lib.load(['Idle','Walk_F']))
       character.animations = lib.attach(character);
       character.animations.play('Idle');
       character.animations.play('Walk_FR');
       character.animations.play('Jog_B');
       character.animations.play('Attack_01');

   Aucun GLB n'est modifié.
   ============================================================ */

/* Manifeste : clé conviviale -> sous-chemin GLB (relatif à baseUrl). */
const ANIM_MANIFEST = {
  // Locomotion (17)
  Idle:   'Locomotion/Idle.glb',
  Walk_F: 'Locomotion/Walk_F.glb',  Walk_FL:'Locomotion/Walk_FL.glb', Walk_FR:'Locomotion/Walk_FR.glb',
  Walk_B: 'Locomotion/Walk_B.glb',  Walk_BL:'Locomotion/Walk_BL.glb', Walk_BR:'Locomotion/Walk_BR.glb',
  Walk_L: 'Locomotion/Walk_L.glb',  Walk_R: 'Locomotion/Walk_R.glb',
  Jog_F:  'Locomotion/Jog_F.glb',   Jog_FL: 'Locomotion/Jog_FL.glb',  Jog_FR: 'Locomotion/Jog_FR.glb',
  Jog_B:  'Locomotion/Jog_B.glb',   Jog_BL: 'Locomotion/Jog_BL.glb',  Jog_BR: 'Locomotion/Jog_BR.glb',
  Jog_L:  'Locomotion/Jog_L.glb',   Jog_R:  'Locomotion/Jog_R.glb',
  // Combat (4)
  Attack_01:'Combat/Attack_01.glb', Attack_02:'Combat/Attack_02.glb',
  Attack_03:'Combat/Attack_03.glb', Charged_Attack:'Combat/Charged_Attack.glb',
  // Movement (3)
  Jump:'Movement/Jump.glb', Fall_Loop:'Movement/Fall_Loop.glb', Land:'Movement/Land.glb',
};

/* Clips qui bouclent (locomotion + idle + chute). Le reste = one-shot. */
function isLoopingClip(key) {
  return key === 'Idle' || key === 'Fall_Loop' || /^Walk_/.test(key) || /^Jog_/.test(key);
}

class AnimationLibrary {
  constructor(scene, baseUrl, manifest) {
    this.scene = scene;
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.manifest = manifest || ANIM_MANIFEST;
    this.sources = new Map();     // key -> { group, meshes }
    this.loading = new Map();     // key -> Promise (dédup des chargements lazy)
    this.onLog = null;            // callback(msg) optionnel
  }
  _log(m) { if (this.onLog) this.onLog(m); console.log(m); }
  keys() { return Object.keys(this.manifest); }

  /* Charge (et met en cache) les clips. keys optionnel = sous-ensemble. */
  async load(keys) {
    const list = keys || this.keys();
    let ok = 0;
    for (const key of list) { if (await this._loadOne(key)) ok++; }
    this._log('[AnimLib] ' + ok + '/' + list.length + ' clips chargés & cachés');
    return this;
  }

  async _loadOne(key) {
    if (this.sources.has(key)) return true;
    const path = this.manifest[key];
    if (!path) { console.warn('[AnimLib] clé inconnue: ' + key); return false; }
    const slash = path.lastIndexOf('/');
    const root = this.baseUrl + (slash >= 0 ? path.slice(0, slash + 1) : '');
    const file = slash >= 0 ? path.slice(slash + 1) : path;
    const res = await BABYLON.SceneLoader.ImportMeshAsync('', root, file, this.scene);
    for (const m of res.meshes) m.setEnabled(false);           // masquer le mesh Manny source
    const group = res.animationGroups && res.animationGroups[0];
    if (!group) { console.warn('[AnimLib] aucun AnimationGroup dans ' + key); return false; }
    group.stop();
    this.sources.set(key, { group, meshes: res.meshes });
    return true;
  }

  /* Garantit qu'un clip est chargé (LAZY, cache partagé + dédup). Retourne une Promise<bool>. */
  ensure(key) {
    if (this.sources.has(key)) return Promise.resolve(true);
    if (this.loading.has(key)) return this.loading.get(key);
    const pr = this._loadOne(key).then(ok => { this.loading.delete(key); return ok; })
                                 .catch(e => { this.loading.delete(key); console.warn('[AnimLib] ensure ' + key + ' : ' + e.message); return false; });
    this.loading.set(key, pr);
    return pr;
  }

  /* Crée un contrôleur d'animation lié à un personnage (rig Manny). */
  attach(character) { return new CharacterAnimator(this, character); }
}

/* Contrôleur par personnage : retarget paresseux + cache, play/stop. */
class CharacterAnimator {
  constructor(lib, character) {
    this.lib = lib;
    this.character = character;
    this.targets = new Map();
    for (const n of character.transformNodes) this.targets.set(n.name, n);
    for (const sk of (character.skeletons || [])) for (const b of sk.bones) {
      this.targets.set(b.name, b);
      if (b._linkedTransformNode) this.targets.set(b._linkedTransformNode.name, b._linkedTransformNode);
    }
    this.clones = new Map();     // key -> AnimationGroup retargeté
    this.stats = new Map();      // key -> { bones, tracks, missing }
    this.current = null; this.currentKey = null;
    this._uid = 'c' + (character.rootNodes && character.rootNodes[0] ? character.rootNodes[0].uniqueId : Math.round(performance.now ? 0 : 0));
    // Crossfade (fondu enchaîné par poids d'animation)
    this.blendDur = 0.15;        // secondes ; 0 = transition dure
    this.blend = null;           // { from, to, t, dur }
    this.scene = lib.scene;
    this._obs = this.scene.onBeforeAnimationsObservable.add(() => this._tickBlend());
  }

  /* Avance le fondu en cours (appelé chaque frame par la scène). */
  _tickBlend() {
    if (!this.blend) return;
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this.blend.t += dt;
    const w = this.blend.dur > 0 ? Math.min(1, this.blend.t / this.blend.dur) : 1;
    this.blend.to.setWeightForAllAnimatables(w);
    this.blend.from.setWeightForAllAnimatables(1 - w);
    if (w >= 1) {
      this.blend.from.stop();
      this.blend.from.setWeightForAllAnimatables(1);
      this.blend = null;
    }
  }

  has(key) { return this.lib.sources.has(key); }
  availableKeys() { return this.lib.keys().filter(k => this.has(k)); }

  /* Retarge un clip vers ce personnage (une fois, puis caché).
     RETARGET MANNY COMPLET (rotation + position + scaling), par NOM D'OS.
     Vérifié objectivement sur les 9 modèles canoniques (AutoRig, bind-pose Manny) :
     bbox animée == bbox repos (ratio 1) -> aucune déformation ; clips de locomotion
     "in-place" (pas de root-motion) -> aucun glissement. Fidélité maximale conservée. */
  retarget(key) {
    if (this.clones.has(key)) return this.clones.get(key);
    const src = this.lib.sources.get(key);
    if (!src) { console.warn('[AnimLib] clip non chargé: ' + key); return null; }
    const matched = new Set(); let tracks = 0, missing = 0;
    const clone = src.group.clone(key + '__' + this._uid, (oldTarget) => {
      const name = oldTarget && oldTarget.name;
      if (!name) { missing++; return null; }
      const t = this.targets.get(name);
      if (t) { tracks++; matched.add(name); return t; }
      missing++; return null;
    });
    if (!clone) return null;
    clone.stop();
    this.clones.set(key, clone);
    this.stats.set(key, { bones: matched.size, tracks, missing });
    return clone;
  }

  /* Pré-retarge tout (utile pour valider/diagnostiquer). */
  retargetAll() { for (const k of this.availableKeys()) this.retarget(k); return this.stats; }

  /* play LAZY : déclenche le chargement si besoin, applique quand prêt.
     Retour immédiat (non bloquant) — sûr à appeler chaque frame. */
  play(key, opts = {}) {
    if (!this.lib.manifest[key]) { console.warn('[AnimLib] play: clé inconnue ' + key); return false; }
    this.desiredKey = key; this.desiredOpts = opts;
    if (this.lib.sources.has(key)) { this._apply(key, opts); return true; }
    this.lib.ensure(key).then(ok => { if (ok && this.desiredKey === key) this._apply(key, opts); });
    return true;
  }

  _apply(key, opts = {}) {
    const clone = this.retarget(key);
    if (!clone) return;
    // déjà sur ce clip (en cours ou en train d'y fondre) -> rien à faire
    if (this.currentKey === key && this.current && (this.current.isPlaying || (this.blend && this.blend.to === this.current))) return;
    const loop = opts.loop != null ? opts.loop : isLoopingClip(key);
    const speed = opts.speed != null ? opts.speed : 1.0;
    const dur = opts.blend != null ? opts.blend : this.blendDur;

    if (this.current && this.current !== clone && dur > 0) {
      // CROSSFADE : démarre le nouveau à poids 0 et fond depuis l'ancien
      clone.start(loop, speed, clone.from, clone.to, false);
      clone.setWeightForAllAnimatables(0);
      // si un fondu est déjà en cours, on coupe net son ancien 'from'
      if (this.blend && this.blend.from !== clone) { this.blend.from.stop(); this.blend.from.setWeightForAllAnimatables(1); }
      this.blend = { from: this.current, to: clone, t: 0, dur };
    } else {
      // pas de fondu (premier clip, ou dur=0, ou même clone)
      if (this.blend) { this.blend.from.stop(); this.blend.from.setWeightForAllAnimatables(1); this.blend = null; }
      if (this.current && this.current !== clone) this.current.stop();
      if (!clone.isPlaying) clone.start(loop, speed, clone.from, clone.to, false);
      clone.setWeightForAllAnimatables(1);
    }
    this.current = clone; this.currentKey = key;

    if (!loop) {
      const fb = opts.then || 'Idle';
      clone.onAnimationGroupEndObservable.addOnce(() => {
        if (this.currentKey === key) this.play(fb);   // one-shot -> retour (lazy) à Idle
      });
    }
  }

  stop() { if (this.blend) { this.blend.from.stop(); this.blend = null; } if (this.current) this.current.stop(); this.current = null; this.currentKey = null; }
  dispose() { if (this._obs) this.scene.onBeforeAnimationsObservable.remove(this._obs); this._obs = null; }
}

if (typeof window !== 'undefined') {
  window.AnimationLibrary = AnimationLibrary;
  window.CharacterAnimator = CharacterAnimator;
  window.ANIM_MANIFEST = ANIM_MANIFEST;
  window.isLoopingClip = isLoopingClip;
}

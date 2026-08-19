/* ============================================================
   visual.js — Couche visuelle DÉCOUPLÉE (prête pour vrais assets)

   CharacterVisual encapsule TOUT le rendu d'un personnage.
   Entity / CombatSystem / BotAI n'y touchent jamais : ils ne
   connaissent que la simulation (x, y, facing, hp, effects…).
   game3d.js pilote CharacterVisual via une petite API stable :

     setTransform(x, y, z, rotY)
     setEnabled(bool)
     setVisibility(0..1)            <- stealth/camouflage sur TOUT le modèle
     setFactionRing(hex, ally)
     playAnim(name)                 <- via animationController (stub)
     dispose()

   Champs prévus DÈS MAINTENANT pour l'intégration .glb (V0.3) :
     visualRoot          TransformNode racine (déplacé/pivoté chaque frame)
     meshRoot            TransformNode contenant le mesh (remplaçable par un glb)
     skeleton            null pour l'instant (Skeleton du glb ensuite)
     weaponSockets       { mainHand, offHand, back, head } TransformNodes
     animationController AnimationController (stub -> AnimationGroups du glb)

   Pour passer aux assets DAoC : implémenter CharacterVisual.loadModel()
   qui remplit meshRoot/skeleton/animationController/weaponSockets à partir
   d'un .glb, SANS changer l'API ci-dessus.
   ============================================================ */

/* Contrôleur d'animation — stub non bloquant.
   V0.3 : groups = AnimationGroups importés du glb ; play() les démarre. */
/* Mapping sémantique (état gameplay) -> clé de la RWA Animation Library (rig Manny).
   V0.3.1 minimal : immobile=Idle, deplacement=Jog_F, attaque=Attack_01.
   (V0.3.2 : locomotion directionnelle 8 directions, Walk et Jog.) */
const MANNY_SEMANTIC = { idle: 'Idle', run: 'Jog_F', attack: 'Attack_01' };

class AnimationController {
  constructor(visual) { this.visual = visual; this.groups = {}; this.current = null; }
  register(name, group) { this.groups[name] = group; }
  play(name, loop = true) {
    if (this.current === name) return;
    this.current = name;
    const g = this.groups[name];
    if (g && g.start) { for (const k in this.groups) if (this.groups[k].stop) this.groups[k].stop(); g.start(loop); }
    // placeholder : aucune animation sur les capsules, mais l'intention est câblée.
  }
  stop() { const g = this.groups[this.current]; if (g && g.stop) g.stop(); this.current = null; }
  dispose() { this.groups = {}; this.current = null; }
}

class CharacterVisual {
  constructor(game, entity) {
    this.game = game;
    this.scene = game.scene;
    this.entity = entity;
    this.meshes = [];            // tous les meshes visibles (pour la visibilité)
    this.skeleton = null;        // rempli par un glb en V0.3
    this.weaponSockets = {};
    this.animationController = new AnimationController(this);
    this._vis = 1;
    this._ringAlly = null;
  }

  /* Construit la représentation PLACEHOLDER (capsule + tête + accessoires).
     Remplaçable par loadModel() sans changer l'API publique. */
  build() {
    const s = this.scene, e = this.entity, g = this.game;
    const R = RACES[e.race] || RACES.HUMAN;
    const F = FACTIONS[e.faction];
    const bodyH = 3.0 * R.h, bodyR = 1.0 * R.w;
    const skin = R.skin || '#d9b48a';
    this.bodyH = bodyH; this.bodyR = bodyR;

    this.visualRoot = new BABYLON.TransformNode('vroot' + e.id, s);
    this.meshRoot = new BABYLON.TransformNode('mroot' + e.id, s);
    this.meshRoot.parent = this.visualRoot;

    // Sockets (empty nodes) — points d'attache d'armes / d'accessoires.
    // En V0.3 ils seront reparentés à des os du squelette.
    this.weaponSockets = {
      mainHand: this._socket('mainHand', bodyR + 0.35, bodyH * 0.55, 0.25),
      offHand:  this._socket('offHand', -(bodyR + 0.35), bodyH * 0.55, 0.25),
      back:     this._socket('back', 0, bodyH * 0.7, -bodyR - 0.25),
      head:     this._socket('head', 0, bodyH + 0.35 * R.head, 0),
    };

    // Corps (couleur de faction)
    const body = BABYLON.MeshBuilder.CreateCapsule('body' + e.id, { radius: bodyR, height: bodyH, tessellation: 8, subdivisions: 1 }, s);
    body.position.y = bodyH / 2; body.parent = this.meshRoot;
    body.material = g.mat('fac_' + e.faction, F.color);
    body.isPickable = true; body.metadata = { entity: e };
    this._add(body);
    this.bodyMesh = body;

    // Tête
    const head = BABYLON.MeshBuilder.CreateSphere('head' + e.id, { diameter: 1.1 * R.head, segments: 8 }, s);
    head.parent = this.weaponSockets.head; head.material = g.mat('skin_' + skin, skin);
    this._add(head);

    // Nez (indicateur de face, local +Z)
    const nose = BABYLON.MeshBuilder.CreateCylinder('nose' + e.id, { height: 0.6, diameterTop: 0, diameterBottom: 0.4 }, s);
    nose.rotation.x = Math.PI / 2; nose.position.z = 0.55 * R.head; nose.parent = this.weaponSockets.head; nose.material = head.material;
    this._add(nose);

    // Features raciales (sur la tête)
    if (R.horns) for (const sgn of [-1, 1]) { const h = BABYLON.MeshBuilder.CreateCylinder('horn' + e.id + sgn, { height: 0.7, diameterTop: 0, diameterBottom: 0.22 }, s); h.position.set(sgn * 0.35 * R.head, 0.55 * R.head, 0); h.rotation.z = sgn * 0.4; h.material = g.mat('horn', '#e8e2d0'); h.parent = this.weaponSockets.head; this._add(h); }
    if (R.ears)  for (const sgn of [-1, 1]) { const ear = BABYLON.MeshBuilder.CreateCylinder('ear' + e.id + sgn, { height: 0.6, diameterTop: 0, diameterBottom: 0.2 }, s); ear.position.set(sgn * 0.5 * R.head, 0.15 * R.head, -0.1); ear.rotation.z = sgn * -1.0; ear.material = head.material; ear.parent = this.weaponSockets.head; this._add(ear); }
    if (R.tusks) for (const sgn of [-1, 1]) { const tk = BABYLON.MeshBuilder.CreateCylinder('tusk' + e.id + sgn, { height: 0.3, diameterTop: 0, diameterBottom: 0.12 }, s); tk.position.set(sgn * 0.18 * R.head, -0.28 * R.head, 0.35 * R.head); tk.material = g.mat('horn', '#e8e2d0'); tk.parent = this.weaponSockets.head; this._add(tk); }
    if (R.beard) { const bd = BABYLON.MeshBuilder.CreateSphere('beard' + e.id, { diameter: 0.7 * R.head }, s); bd.scaling.z = 0.5; bd.position.set(0, -0.35 * R.head, 0.35 * R.head); bd.material = g.mat('beard', '#8a6a44'); bd.parent = this.weaponSockets.head; this._add(bd); }

    // Accessoire de classe (attaché aux sockets)
    this._buildClassGear(R, bodyH, bodyR);

    // (V0.4.0.2 : plus d'anneau ami/ennemi au sol — l'appartenance passe par le nom)
    this.factionRing = null;

    this.bodyTopY = bodyH + 1.2 * R.head;
    return this;
  }

  _socket(name, x, y, z) { const n = new BABYLON.TransformNode('sock_' + name + this.entity.id, this.scene); n.parent = this.meshRoot; n.position.set(x, y, z); return n; }
  _add(m) { m.isPickable = m.isPickable || false; this.meshes.push(m); return m; }

  _buildClassGear(R, bodyH, bodyR) {
    const s = this.scene, g = this.game, e = this.entity;
    const metal = g.mat('metal', '#b9c0cc'), wood = g.mat('wood', '#6b4a2f'), gold = g.mat('gold', '#d9b24f', { emissive: '#4a3a10' });
    const put = (m, socket, x = 0, y = 0, z = 0) => { m.parent = this.weaponSockets[socket]; m.position.set(x, y, z); m.isPickable = false; this._add(m); return m; };
    switch (e.classId) {
      case 'GUARDIAN': { const sh = BABYLON.MeshBuilder.CreateCylinder('sh', { height: 0.2, diameter: 1.8, tessellation: 6 }, s); sh.rotation.x = Math.PI / 2; sh.material = metal; put(sh, 'offHand', -0.1, 0, 0); break; }
      case 'BERSERKER': { for (const [sock, sgn] of [['mainHand', 1], ['offHand', -1]]) { const ax = BABYLON.MeshBuilder.CreateBox('ax' + sgn, { width: 0.15, height: 1.6, depth: 0.5 }, s); ax.material = metal; put(ax, sock, 0, 0.2, 0); } break; }
      case 'SORCERER': case 'RUNEMASTER': {
        const st = BABYLON.MeshBuilder.CreateCylinder('st', { height: bodyH + 1.0, diameter: 0.16 }, s); st.material = wood; put(st, 'mainHand', 0, (bodyH + 1.0) / 2 - bodyH * 0.55, 0);
        const orb = BABYLON.MeshBuilder.CreateSphere('orb', { diameter: 0.7 }, s); orb.material = e.classId === 'RUNEMASTER' ? g.mat('fireorb', '#e0663a', { emissive: '#5a1e0a' }) : g.mat('magicorb', '#8a7fe6', { emissive: '#2a2060' }); put(orb, 'mainHand', 0, (bodyH + 1.0) - bodyH * 0.55, 0);
        break; }
      case 'CLERIC': { const v = BABYLON.MeshBuilder.CreateBox('cv', { width: 0.2, height: 1.2, depth: 0.2 }, s); v.material = gold; put(v, 'mainHand', 0, 0.6, 0.3); const hh = BABYLON.MeshBuilder.CreateBox('ch', { width: 0.8, height: 0.2, depth: 0.2 }, s); hh.material = gold; put(hh, 'mainHand', 0, 0.7, 0.3); break; }
      case 'SKALD': { const lute = BABYLON.MeshBuilder.CreateSphere('lute', { diameter: 0.9 }, s); lute.scaling.z = 0.4; lute.material = wood; put(lute, 'back', 0, 0, 0); break; }
      case 'RANGER': { const bow = BABYLON.MeshBuilder.CreateTorus('bow', { diameter: 1.8, thickness: 0.12, tessellation: 16 }, s); bow.rotation.y = Math.PI / 2; bow.material = wood; put(bow, 'offHand', 0, 0, 0); break; }
      case 'ROGUE': { for (const [sock, sgn] of [['mainHand', 1], ['offHand', -1]]) { const dg = BABYLON.MeshBuilder.CreateCylinder('dg' + sgn, { height: 0.9, diameterTop: 0, diameterBottom: 0.14 }, s); dg.material = metal; dg.rotation.x = Math.PI / 2; put(dg, sock, 0, 0, 0.2); } break; }
    }
  }

  /* -------- API stable (utilisée par game3d) -------- */
  setTransform(x, y, z, rotY) { this.visualRoot.position.set(x, y, z); this.visualRoot.rotation.y = rotY; }
  setEnabled(b) { this.visualRoot.setEnabled(b); }
  setVisibility(v) {
    if (v === this._vis) return;
    this._vis = v;
    for (const m of this.meshes) m.visibility = v;      // TOUT le modèle (corps + tête + accessoires)
    if (this.factionRing) this.factionRing.visibility = Math.max(0.35, v);
  }
  setFactionRing(hex, ally) {
    if (!this.factionRing) return;   // anneaux retirés (V0.4.0.2)
    if (this._ringAlly === ally) return;
    this._ringAlly = ally;
    this.factionRing.material = this.game.mat(ally ? 'ally' : 'enemy', hex, { emissive: ally ? '#173a20' : '#3a1010' });
  }
  /* playAnim accepte un nom SÉMANTIQUE ('idle'/'run'/'attack') résolu via
     semanticAnim (rempli à l'import), sinon un nom d'AnimationGroup direct.
     Aucune exception si l'animation est absente (no-op). */
  playAnim(name) {
    // GLB au rig Manny -> bibliothèque partagée (Idle/Jog_F/Attack_01…)
    if (this.animator) { this.animator.play(MANNY_SEMANTIC[name] || name); return; }
    // sinon anims internes du GLB (britm) / placeholder (no-op)
    const key = (this.semanticAnim && this.semanticAnim[name]) || name;
    if (!key) return;
    this.animationController.play(key);
  }
  dispose() {
    this.animationController.dispose();
    if (this.visualRoot) this.visualRoot.dispose(false, true);
    this.meshes = [];
  }

  /* -------- Chargement d'un vrai modèle (.glb/.gltf) --------
     Contrat DURCI (V0.2.2) : mêmes visualRoot / meshRoot / weaponSockets /
     animationController / API que le placeholder, donc substituable sans
     toucher Entity / CombatSystem / BotAI / game3d.

     opts = { scale=1, rotationY=0, offsetY=0, pluginExtension }
     - scale/rotationY/offsetY : normalisation d'import (taille, face +Z, pieds au sol)
     - picking FIABLE : collider invisible dédié + metadata.entity sur toutes les
       géométries (indépendant du fait que meshes[0] soit le __root__ d'import)
     - bodyTopY : calculé depuis la bounding box APRÈS scale/orientation
     - weaponSockets : les 4 clés existent toujours (rattachées à meshRoot faute d'os)
  */
  static async loadModel(game, entity, url, opts = {}) {
    const scene = game.scene;
    const { scale = 1, rotationY = 0, offsetY = 0, pluginExtension } = opts;
    const cv = new CharacterVisual(game, entity);
    cv.importOpts = { scale, rotationY, offsetY };

    cv.visualRoot = new BABYLON.TransformNode('vroot' + entity.id, scene);
    cv.meshRoot = new BABYLON.TransformNode('mroot' + entity.id, scene);
    cv.meshRoot.parent = cv.visualRoot;

    // Sockets créés IMMÉDIATEMENT (contrat) — repositionnés après bbox, remappés
    // sur des os en présence d'un squelette.
    cv.weaponSockets = {
      mainHand: cv._socket('mainHand', 0, 0, 0),
      offHand:  cv._socket('offHand', 0, 0, 0),
      back:     cv._socket('back', 0, 0, 0),
      head:     cv._socket('head', 0, 0, 0),
    };

    const res = await BABYLON.SceneLoader.ImportMeshAsync('', '', url, scene, null, pluginExtension);

    // Parenter la/les racine(s) importée(s) (typiquement "__root__") sous meshRoot
    for (const m of res.meshes) if (!m.parent) m.parent = cv.meshRoot;
    cv.skeleton = res.skeletons && res.skeletons[0] ? res.skeletons[0] : null;

    // Normalisation d'import
    cv.meshRoot.scaling.setAll(scale);
    cv.meshRoot.rotation.y = rotationY;
    cv.meshRoot.position.y = offsetY;

    // Meshes géométriques (excluent le __root__ transform sans vertices)
    const geo = res.meshes.filter(m => m.getTotalVertices && m.getTotalVertices() > 0);
    cv.meshes = geo;
    // Picking : metadata sur toutes les géométries (ceinture)
    for (const m of geo) { m.isPickable = true; m.metadata = { entity }; }

    // Bounding box APRÈS transform -> hauteur / centre / rayon
    cv.visualRoot.computeWorldMatrix(true);
    const bb = cv.visualRoot.getHierarchyBoundingVectors(true, m => m.getTotalVertices && m.getTotalVertices() > 0);
    const height = Math.max(0.5, bb.max.y - bb.min.y);
    const cy = (bb.max.y + bb.min.y) / 2;
    const radius = Math.max(0.4, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2);
    cv.bodyTopY = bb.max.y + 0.4;          // nameplate au-dessus de la tête (bretelle)
    cv.modelHeight = height; cv.modelRadius = radius;

    // Collider de picking dédié (invisible, stable, non affecté par les anims)
    const col = BABYLON.MeshBuilder.CreateCapsule('col' + entity.id, { radius, height, tessellation: 6 }, scene);
    col.parent = cv.visualRoot; col.position.y = cy;
    col.isPickable = true; col.visibility = 0; col.metadata = { entity };
    cv.collider = col;                     // hors de cv.meshes -> pas touché par le stealth

    // Sockets repositionnés depuis la bbox (approx, en attendant le mapping osseux)
    cv.weaponSockets.head.position.set(0, bb.max.y * 0.92, 0);
    cv.weaponSockets.mainHand.position.set(radius * 0.9, cy, radius * 0.5);
    cv.weaponSockets.offHand.position.set(-radius * 0.9, cy, radius * 0.5);
    cv.weaponSockets.back.position.set(0, cy, -radius * 0.8);

    // Animations -> animationController (clés en minuscules)
    for (const ag of (res.animationGroups || [])) { ag.stop(); cv.animationController.register(ag.name.toLowerCase(), ag); }
    cv.animationNames = (res.animationGroups || []).map(a => a.name);

    // Résolution SÉMANTIQUE tolérante (casse + variantes + correspondance partielle)
    const groups = cv.animationController.groups;
    const find = (cands) => {
      for (const c of cands) { const k = c.toLowerCase(); if (groups[k]) return k; }             // exact
      const keys = Object.keys(groups);
      for (const c of cands) { const k = keys.find(x => x.includes(c.toLowerCase())); if (k) return k; } // partiel
      return null;
    };
    cv.semanticAnim = {
      idle:   find(['idle', 'britm_idle', 'stand']),
      run:    find(['run', 'britm_run', 'walk', 'move']),
      attack: find(['attack', 'britm_attack', 'combat', 'melee', 'action']),
    };
    cv.isGLB = true; cv.hasSkeleton = !!cv.skeleton;

    // Rig Manny ? -> RWA Animation Library (retarget par nom de bone, lazy-load partagé).
    // Sinon : anims internes du GLB (ex. britm) via animationController.
    cv.isMannyRig = !!(cv.skeleton && cv.skeleton.bones &&
      cv.skeleton.bones.some(b => /(^|:)pelvis$/i.test(b.name) || /pelvis/i.test(b.name)) &&
      cv.skeleton.bones.some(b => /spine_01/i.test(b.name)));
    if (cv.isMannyRig && game.animLib) {
      cv._import = res;
      cv.animator = game.animLib.attach(res);   // res fournit transformNodes + skeletons
      cv.playAnim('idle');                        // -> Idle (lazy-load)
    } else if (cv.semanticAnim.idle) {
      cv.playAnim('idle');                        // anims internes (britm)
    }

    cv.factionRing = null;   // plus d'anneau (V0.4.0.2)

    return cv;
  }
}

window.AnimationController = AnimationController;
window.CharacterVisual = CharacterVisual;

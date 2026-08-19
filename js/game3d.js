/* ============================================================
   game3d.js — Couche RENDU / CAMÉRA / CONTRÔLES (Babylon.js)
   Remplace l'ancien game.js Canvas 2D. NE MODIFIE PAS la
   simulation : CombatSystem, EffectSystem, bots, map, entity,
   combat, effects, data restent identiques.

   Mapping : sim.x → world X, sim.y → world Z, hauteur → world Y.
   ============================================================ */

const S = 0.08; // échelle sim -> monde 3D

/* Deux MODES de caméra clairement distincts (V bascule l'un vers l'autre).
   La molette ne fait que zoomer À L'INTÉRIEUR des bornes du mode courant. */
const CAM_MODES = {
  THIRD_PERSON: { label: 'THIRD PERSON', pitch: 0.45, dist: 10, distMin: 6,  distMax: 16, pitchMin: 0.15, pitchMax: 0.95 },
  TACTICAL:     { label: 'TACTICAL',     pitch: 1.18, dist: 38, distMin: 26, distMax: 62, pitchMin: 0.85, pitchMax: 1.45 },
};

/* V0.3 : première combinaison réelle. Human + Guardian -> asset GLB ; le reste = placeholders.
   Valeurs déterminées par inspection de britm.glb (hauteur ~9.08, pieds à y≈0, face +Z). */
/* Secteurs de locomotion (8 dir), index = round(angleLocal/45) % 8.
   angleLocal = 0 -> mouvement vers l'avant du personnage. Sens validé par test. */
const LOCO_SUFFIX = ['F', 'FL', 'L', 'BL', 'B', 'BR', 'R', 'FR'];
// Clips réellement utilisés par le gameplay courant. Ils sont préchargés avant
// de révéler la scène afin qu'aucune animation ne démarre par un chargement lazy.
const STARTUP_ANIMATION_KEYS = [
  'Idle',
  ...LOCO_SUFFIX.flatMap(suffix => ['Walk_' + suffix, 'Jog_' + suffix]),
  'Attack_01',
];
// Seuils d'ALLURE basés sur la VITESSE RÉELLE (unités sim/s), indépendants de la cause :
//   0 ── LOCO_IDLE_SPEED ── Walk_* ── LOCO_JOG_SPEED ── Jog_*
// La COURSE (Jog) est l'allure par défaut : vitesses de base ~105-115 > seuil -> Jog.
// La MARCHE (Walk) est réservée aux ralentissements (snare -> ~40-60 < seuil).
const LOCO_IDLE_SPEED = 12;
const LOCO_JOG_SPEED = 80;
const NAMEPLATE_MAX_DISTANCE = 1600; // unités simulation : noms et textes flottants proches uniquement
const STICK_MAX_DISTANCE = 720; // rupture automatique du suivi, allié comme ennemi

/* GLB par RACE (V0.4.2) : chaque race a son propre modèle, tous au rig Manny
   (161 os, pieds à y≈0) -> RWA Animation Library (retarget par nom d'os).
   L'échelle est calculée pour rendre chaque race à une hauteur cohérente et
   proportionnée (Humain ≈ 4.0 unités de rendu), calibrée depuis la bounding box
   réelle de chaque modèle. rotationY=0 (face +Z, comme Stonehide), offsetY=0.
   PUREMENT VISUEL : n'affecte jamais entity.radius / stats / hitbox. */
// Les 9 GLB Manny sont NORMALISÉS à leur taille canonique (pipeline AutoRig,
// hauteur mesurée ≈180.54, pieds à y≈0). On utilise donc UNE seule échelle de
// base commune ; la différence de gabarit entre races est purement runtime via
// RACE_VISUAL_SCALE (races.js), appliquée de façon MULTIPLICATIVE au chargement :
//   finalScale = ASSET_BASE_SCALE × RACE_VISUAL_SCALE[race]   (voir buildUnit)
// Base 0.022 → Humain (×1.00) ≈ 3.97 u de rendu (référence taille humaine).
const ASSET_BASE_SCALE = 0.022;
const _glb = (file) => ({ url: './assets/characters/' + file, scale: ASSET_BASE_SCALE, rotationY: 0, offsetY: 0, pluginExtension: '.glb' });
const GLB_ASSETS = {
  HUMAN:    _glb('Human.glb'),
  DWARF:    _glb('Dwarf.glb'),
  ELF:      _glb('Elf.glb'),
  DARK_ELF: _glb('Dark_Elf.glb'),
  OGRE:     _glb('Ogre.glb'),
  DRAKE:    _glb('Drake.glb'),
  TROLL:    _glb('Troll.glb'),
  ORC:      _glb('Orc.glb'),
  GOBLIN:   _glb('Goblin.glb'),
};

class Game3D {
  constructor() {
    this.map = new GameMap();
    this.entities = [];
    this.groundEffects = [];
    this.factionFocus = {};
    this.focusTimer = 0;
    this.player = null;
    this.mouseWorld = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0 };
    this.keys = new Set();
    this.wasdActive = false;
    this.matCache = {};
    this.audio = new RWAudioManager();
    this.started = false;
    this.racePreview = null;
    this.racePreviewToken = 0;
    this.jumpState = null;
    this.jumpOffset = 0;
    this._debugMode = 2; // diagnostic masqué par défaut ; F3 l'affiche
    // état caméra : MODE discret + rig sphérique
    this.mode = 'THIRD_PERSON';
    const M = CAM_MODES.THIRD_PERSON;
    this.cam = { yaw: Math.PI, pitch: M.pitch, dist: M.dist, tPitch: M.pitch, tDist: M.dist };
    this.camMode = M.label;
    this.dragging = false;
    this.dragButton = -1;
    this.lastDrag = { x: 0, y: 0 };
  }

  log(t) { UI.log(t); }
  canQuickcast() { return false; }
  setLoadingStatus(text) {
    const el = document.querySelector('#loading-screen p');
    if (el) el.textContent = text;
  }

  /* ================= MENU ================= */
  setupMenu() {
    const titleScreen = document.getElementById('title-screen');
    const realmScreen = document.getElementById('realm-screen');
    const characterScreen = document.getElementById('menu');
    const loadingScreen = document.getElementById('loading-screen');
    const fsel = document.getElementById('faction-select');
    const rsel = document.getElementById('race-class-select');
    const csel = document.getElementById('class-select');
    const startBtn = document.getElementById('start-btn');
    const raceTitle = document.getElementById('selected-race-title');
    const raceDescription = document.getElementById('selected-race-description');
    const classTitle = document.getElementById('selected-class-title');
    const classDescription = document.getElementById('selected-class-description');
    const show = screen => {
      [titleScreen, realmScreen, characterScreen, loadingScreen].forEach(el => el.classList.add('hidden'));
      screen.classList.remove('hidden');
    };
    const realmPresentation = {
      CENTER: { name: 'Royaume du Nord', sigil: 'N', color: '#b4cfda', glow: 'rgba(116,170,196,.55)', lore: 'Citadelles de pierre, serments anciens et veilleurs des hautes terres.' },
      WEST:   { name: 'Royaume de l’Ouest', sigil: 'O', color: '#7fa6ed', glow: 'rgba(58,98,182,.58)', lore: 'Clans des landes, forêts noyées de brume et lames indomptées.' },
      EAST:   { name: 'Royaume de l’Est', sigil: 'E', color: '#e27a6f', glow: 'rgba(180,53,45,.58)', lore: 'Terres de braise, magie interdite et légions nées sous le soleil rouge.' },
    };
    const racePresentation = {
      HUMAN: [
        'Héritiers du royaume d’Arthur, les Humains de l’Ouest défendent encore l’idéal de Camelot malgré la mort du Haut Roi et la guerre des trois royaumes. Chevaliers, gens d’armes et érudits perpétuent une civilisation fondée sur le devoir, la loi et les forteresses d’Albion.',
        'Leur polyvalence reflète celle des peuples humains d’Albion, des robustes Britons aux savants Avaloniens. Ils excellent lorsqu’une troupe coordonnée protège ses lignes et avance avec la discipline des anciennes armées de Camelot.',
      ],
      ELF: [
        'Les Elfes sont liés à Hibernia, au Voile et aux royaumes de l’Autre Monde. Après s’être retirés loin des terres mortelles, ils revinrent soutenir les peuples d’Hibernia dans leur lutte contre Albion et Midgard.',
        'Leur ancienne magie et leur précision rappellent les voies de l’Eldritch, de l’Enchanteur et du Ranger. Ils préfèrent contrôler la distance, dissimuler leurs intentions et frapper au moment choisi plutôt que subir un combat frontal.',
      ],
      GOBLIN: [
        'Longtemps dispersés dans les collines, les cavernes et les frontières des trois royaumes, les Gobelins n’ont jamais possédé la puissance d’Albion, de Midgard ou d’Hibernia. Les clans de l’Ouest ont survécu en observant leurs guerres et en récupérant ce que les grandes armées abandonnaient.',
        'Cette adaptation jouable conserve leur image de créatures rusées des terres de Camelot. Pièges, magie opportuniste et embuscades leur permettent de vaincre par l’imprévu plutôt que par la force ouverte.',
      ],
      TROLL: [
        'Les Trolls sont l’un des peuples emblématiques de Midgard, royaume des sagas nordiques et des dieux anciens. Leur peau minérale et leur stature colossale semblent avoir été taillées dans les montagnes qui entourent leurs terres.',
        'Ils privilégient la force et l’endurance, suivant les voies martiales accordées aux défenseurs du Nord. Qu’ils tiennent une ligne ou brisent un rempart, leur présence incarne la brutalité des armées de Midgard.',
      ],
      DWARF: [
        'Les Nains de Midgard sont forgerons, bâtisseurs et gardiens de serments. Sous le regard du panthéon nordique, ils défendent leurs foyers avec la même obstination que les guerriers défendent les portes de Jordheim.',
        'Résistants et méthodiques, ils sont naturellement adaptés aux voies de soutien et aux combats d’usure. Ils avancent sans hâte, mais deviennent extrêmement difficiles à arrêter une fois engagés.',
      ],
      DRAKE: [
        'Les Drakes constituent une lignée propre à Realm Warfare Arena, inspirée des dragons et des créatures draconiques qui hantent les terres de Dark Age of Camelot. Les clans du Nord voient leurs écailles comme la marque d’un antique pacte conclu dans les montagnes de Midgard.',
        'Cette adaptation ne remplace aucune race jouable historique de DAoC. Fiers et combatifs, les Drakes combinent instinct, mobilité et résistance pour prendre l’initiative au cœur du combat.',
      ],
      OGRE: [
        'Les Ogres de l’Est sont une adaptation des Half-Ogres connus en Albion depuis les guerres souterraines. Leurs ancêtres quittèrent les armées humaines pour former leurs propres clans, emportant avec eux une culture où la loyauté se prouve par les actes.',
        'Leur puissance physique leur permet d’encaisser les chocs et d’ouvrir des passages dans les formations ennemies. Ils conservent la force légendaire des Half-Ogres tout en servant désormais leur propre royaume.',
      ],
      DARK_ELF: [
        'Les Elfes Noirs trouvent leur origine dans les récits des profondeurs d’Hibernia et de l’Autre Monde, où des lignées elfiques furent séparées de leurs anciens royaumes. Leur exil a fait du secret et de la magie des instruments de survie.',
        'Leur maîtrise des arts occultes et de l’infiltration rappelle les traditions des Shar et des Nightshades. Ils affaiblissent, isolent puis éliminent leurs ennemis avec une patience rarement laissée au hasard.',
      ],
      ORC: [
        'Les Orcs de l’Est revendiquent l’héritage de l’ancienne civilisation half-orc découverte dans les réseaux souterrains reliant Albion, Midgard et Hibernia. Les survivants ont transformé des siècles de persécution en une identité guerrière farouche.',
        'Ils placent la survie et l’honneur du clan au-dessus de toute ambition personnelle. Leur force collective se révèle pleinement lorsqu’ils avancent ensemble contre les forteresses des royaumes de la surface.',
      ],
    };
    const classPresentation = {
      GUARDIAN: [
        'Le Gardien réunit l’héritage des Armsmen d’Albion, des Heroes d’Hibernia et des Warriors de Midgard. Comme ces défenseurs lourds de DAoC, il porte l’armure, maîtrise le bouclier et tient la ligne lorsque les mages et soigneurs sont menacés.',
        'Il contrôle l’espace proche par ses interruptions et ses protections. Sa réussite dépend moins des dégâts infligés que de sa capacité à garder un allié et à empêcher l’ennemi de traverser le front.',
      ],
      BERSERKER: [
        'Le Berserker appartient à la tradition de Midgard. Armé selon l’art de la Left Axe, il recherche les flancs et le dos de sa cible avant de libérer la fureur animale associée à sa forme de Vendo.',
        'Sa frénésie augmente brutalement son potentiel offensif au prix de sa défense. Fidèle à son archétype DAoC, il doit choisir précisément son engagement sous peine de rester vulnérable au cœur des lignes ennemies.',
      ],
      SORCERER: [
        'Le Sorcier suit les traditions magiques d’Albion et les voies de l’Esprit, du Corps et de la Matière. Il domine le rythme d’un affrontement par la domination mentale, les affaiblissements et le contrôle de plusieurs ennemis.',
        'Fragile lorsqu’il est rejoint, il doit anticiper les déplacements et préserver ses distances. Comme dans DAoC, son influence vient d’un contrôle lancé au bon moment autant que de ses dégâts ou de ses créatures charmées.',
      ],
      MAGE: [
        'Le Mage conserve l’héritage des maîtres des runes de Midgard. Il grave les Runes des Ténèbres, de Suppression et de Destruction afin de projeter ses sorts sur de longues distances.',
        'Chaque incantation menée à son terme renforce ici ses runes, tandis que les interruptions dissipent cet avantage. Protégé par ses alliés, il remplit le rôle d’artillerie runique associé aux anciennes traditions de DAoC.',
      ],
      CLERIC: [
        'Le Clerc appartient à la tradition religieuse d’Albion. Ses voies de Rejuvenation, d’Enhancement et de Smiting en font à la fois le principal guérisseur du royaume, un protecteur et un porteur de colère sacrée.',
        'Sa réserve de mana impose des choix constants entre urgence et efficacité. Comme dans DAoC, un Clerc bien protégé prolonge les combats par ses soins et ses bénédictions, mais devient une cible prioritaire dès qu’il est isolé.',
      ],
      SKALD: [
        'Le Skald est le poète-guerrier de Midgard. Ses Battlesongs exaltent ses compagnons, accélèrent leur marche et portent jusque sur les frontières les récits des dieux et des héros nordiques.',
        'À courte portée, ses cris et ses armes interrompent les adversaires. Fidèle à son rôle DAoC, il décide du rythme du groupe : poursuite, engagement soudain ou retraite avant que l’ennemi ne referme son piège.',
      ],
      RANGER: [
        'Le Ranger est l’archer furtif d’Hibernia, lié aux traditions de la forêt et aux voies de Pathfinding. Il observe les frontières depuis la distance et frappe les cibles vulnérables avant qu’elles ne puissent réagir.',
        'Il alterne tir à l’arc, furtivité et combat rapproché inspiré du Celtic Dual. Sa vitesse et ses renforcements personnels lui permettent de choisir ses affrontements, mais l’isolement reste dangereux.',
      ],
      ROGUE: [
        'Le Rogue rassemble les traditions furtives des Infiltrators d’Albion, des Nightshades d’Hibernia et des Shadowblades de Midgard. Il approche sans être vu, choisit une cible isolée et exploite les styles de Critical Strike.',
        'Poisons, esquive et disparition traduisent ici les outils propres aux assassins des trois royaumes. Cette voie récompense la patience et la connaissance du terrain, mais pardonne peu une attaque révélée trop tôt.',
      ],
    };
    // Flux dicté par la matrice : ROYAUME -> RACE -> CLASSE.
    let cf = null, cr = null, cc = null;
    const check = () => startBtn.disabled = !(cf && cr && cc);
    const renderParagraphs = (element, paragraphs) => {
      element.replaceChildren(...paragraphs.map(text => {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        return paragraph;
      }));
    };
    const showRaceDetails = rid => {
      const R = RACES[rid];
      raceTitle.textContent = R ? R.name : 'Race';
      renderParagraphs(raceDescription, racePresentation[rid] || ['Peuple du royaume.', 'Choisis une race pour en apprendre davantage.']);
    };
    const clearClassDetails = () => {
      classTitle.textContent = 'Classe';
      renderParagraphs(classDescription, ['Choisis la voie de ton champion.', 'Chaque classe possède un rôle et un rythme de combat distincts.']);
    };
    const showClassDetails = cid => {
      const C = CLASSES[cid];
      classTitle.textContent = C ? C.name : 'Classe';
      renderParagraphs(classDescription, classPresentation[cid] || ['Choisis la voie de ton champion.', 'Chaque classe possède un rôle distinct.']);
    };

    // ---- Étape 3 : classes autorisées pour la race choisie ----
    const buildClasses = () => {
      csel.innerHTML = ''; cc = null; clearClassDetails();
      const availableClasses = cr ? RACE_CLASSES[cr] : [];
      let firstAvailable = null;
      for (const cid of CLASS_IDS) {
        const C = CLASSES[cid];
        const available = availableClasses.includes(cid);
        const el = document.createElement('div');
        el.className = 'choice' + (available ? '' : ' unavailable');
        el.setAttribute('aria-disabled', String(!available));
        el.innerHTML = `<span class="name">${C.name}</span>`;
        if (available) {
          if (!firstAvailable) firstAvailable = { id: cid, element: el };
          el.onclick = () => {
            [...csel.children].forEach(c => c.classList.remove('selected'));
            el.classList.add('selected');
            cc = cid;
            showClassDetails(cid);
            check();
          };
        }
        csel.appendChild(el);
      }
      if (firstAvailable) {
        cc = firstAvailable.id;
        firstAvailable.element.classList.add('selected');
        showClassDetails(cc);
      }
      check();
    };

    // ---- Étape 2 : races du royaume choisi ----
    const buildRaces = () => {
      rsel.innerHTML = ''; cr = null;
      if (!cf) { rsel.innerHTML = '<div class="race-hint">Choisis d\'abord un royaume.</div>'; buildClasses(); return; }
      const realmRaces = FACTION_RACES[cf];
      for (const rid of realmRaces) {
        const R = RACES[rid];
        const el = document.createElement('div');
        el.className = 'choice race-choice';
        el.innerHTML = `<span class="name">${R.name}</span>`;
        el.onclick = () => {
          [...rsel.children].forEach(c => c.classList.remove('selected'));
          el.classList.add('selected');
          cr = rid;
          this.menuRace = rid;
          showRaceDetails(rid);
          this.selectRacePreview(rid);
          buildClasses();
          check();
        };
        rsel.appendChild(el);
      }
      // La première race du royaume est présentée immédiatement ; buildClasses()
      // sélectionne ensuite la première classe compatible dans l'ordre canonique.
      cr = realmRaces[0];
      this.menuRace = cr;
      if (rsel.firstElementChild) rsel.firstElementChild.classList.add('selected');
      showRaceDetails(cr);
      this.selectRacePreview(cr);
      buildClasses();
    };

    // ---- Étape 1 : royaumes (écran triptyque) ----
    // Ordre visuel du triptyque : Ouest à gauche, Nord au centre, Est à droite.
    ['WEST', 'CENTER', 'EAST'].forEach(fid => {
      const R = realmPresentation[fid];
      const panel = {
        WEST: './assets/ui/realm-panel-west.png',
        CENTER: './assets/ui/realm-panel-north.png',
        EAST: './assets/ui/realm-panel-east.png',
      }[fid];
      const el = document.createElement('button');
      el.className = 'realm-card';
      el.dataset.faction = fid;
      el.style.setProperty('--realm-color', R.color);
      el.style.setProperty('--realm-glow', R.glow);
      el.innerHTML = `<img class="realm-card-panel" src="${panel}" alt="${R.name}"><p class="realm-lore">${R.lore}</p><span class="realm-enter">Prêter serment →</span>`;
      el.onclick = () => {
        cf = fid; cr = null; cc = null;
        buildRaces(); check(); show(characterScreen);
        this.loadRacePreview(fid);
      };
      fsel.appendChild(el);
    });
    buildRaces();

    document.getElementById('play-btn').onclick = () => {
      show(realmScreen);
    };
    document.getElementById('realm-back-btn').onclick = () => {
      show(titleScreen);
    };
    document.getElementById('character-back-btn').onclick = () => {
      this.disposeRacePreview();
      show(realmScreen);
    };

    startBtn.onclick = () => {
      if (!cf || !cr || !cc || this.started) return;
      this.started = true;
      show(loadingScreen);
      this.disposeRacePreview();
      // Laisse le navigateur peindre l'écran de chargement avant l'initialisation 3D.
      requestAnimationFrame(() => setTimeout(async () => {
        document.getElementById('game-root').classList.remove('hidden');
        this.setLoadingStatus('Création du champ de bataille…');
        await this.start(cf, cc, cr);
        loadingScreen.classList.add('hidden');
        this.audio.enterGame(cf);
      }, 420));
    };

    this.audio.playTitle();
  }

  /* ================= APERÇU 3D DES RACES =================
     Une seule scène Babylon rend les trois races du royaume. Elle est totalement
     séparée du monde de jeu et détruite avant start() pour ne laisser aucun moteur,
     mesh ou observateur d'animation en arrière-plan. */
  async loadRacePreview(faction) {
    this.disposeRacePreview();
    const token = ++this.racePreviewToken;
    const stage = document.getElementById('race-preview-stage');
    const canvas = document.getElementById('race-preview-canvas');
    const status = document.getElementById('race-preview-status');
    const raceSelect = document.getElementById('race-class-select');
    if (!stage || !canvas || !status || !raceSelect) return;
    stage.classList.remove('ready');
    raceSelect.classList.add('preview-loading');
    status.textContent = 'Chargement des champions…';

    const engine = new BABYLON.Engine(canvas, true, {
      adaptToDeviceRatio: true, alpha: true, premultipliedAlpha: false, stencil: false,
    });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    scene.autoClearDepthAndStencil = true;
    const camera = new BABYLON.UniversalCamera('racePreviewCamera', new BABYLON.Vector3(0, 2.5, -10), scene);
    camera.fov = 0.62;
    camera.minZ = 0.1;
    camera.maxZ = 80;
    camera.setTarget(new BABYLON.Vector3(0, 2.7, 0));
    scene.activeCamera = camera;
    const hemi = new BABYLON.HemisphericLight('racePreviewHemi', new BABYLON.Vector3(0, 1, -0.4), scene);
    hemi.diffuse = new BABYLON.Color3(0.82, 0.85, 0.92);
    hemi.groundColor = new BABYLON.Color3(0.20, 0.22, 0.25);
    hemi.intensity = 1.15;
    const key = new BABYLON.DirectionalLight('racePreviewKey', new BABYLON.Vector3(-0.45, -0.8, 0.55), scene);
    key.diffuse = new BABYLON.Color3(0.92, 0.84, 0.70);
    key.intensity = 1.25;

    const animLib = new AnimationLibrary(scene, './assets/animations/');
    const materialCache = {};
    const previewGame = {
      scene, animLib,
      mat: (name, hex) => {
        if (materialCache[name]) return materialCache[name];
        const m = new BABYLON.StandardMaterial('preview_' + name, scene);
        m.diffuseColor = BABYLON.Color3.FromHexString(hex || '#888888');
        m.specularColor = BABYLON.Color3.Black();
        materialCache[name] = m;
        return m;
      },
    };
    const preview = { token, engine, scene, camera, animLib, visuals: new Map(), selectedRace: null };
    this.racePreview = preview;
    engine.runRenderLoop(() => { if (!scene.isDisposed) scene.render(); });

    const resize = () => { if (this.racePreview === preview) engine.resize(); };
    preview.resize = resize;
    window.addEventListener('resize', resize);

    const races = FACTION_RACES[faction] || [];
    try {
      await animLib.ensure('Idle');
      if (this.racePreview !== preview || token !== this.racePreviewToken) return;
      await Promise.all(races.map(async (race, index) => {
        const asset = GLB_ASSETS[race];
        const entity = { id: 'preview_' + token + '_' + race, race, faction, classId: RACE_CLASSES[race][0] };
        let visual;
        try {
          const vs = (typeof RACE_VISUAL_SCALE !== 'undefined' && RACE_VISUAL_SCALE[race]) || 1;
          visual = await CharacterVisual.loadModel(previewGame, entity, asset.url,
            Object.assign({}, asset, { scale: asset.scale * vs }));
        } catch (err) {
          console.warn('[RWA Preview] modèle indisponible pour ' + race + ', placeholder utilisé :', err);
          visual = new CharacterVisual(previewGame, entity).build();
        }
        if (this.racePreview !== preview || token !== this.racePreviewToken) {
          if (visual.animator) visual.animator.dispose();
          visual.dispose();
          return;
        }
        visual.setTransform(0, 0, 0, Math.PI);
        visual.playAnim('idle');
        visual.setEnabled(false);
        preview.visuals.set(race, visual);
      }));

      if (this.racePreview !== preview || token !== this.racePreviewToken) return;
      preview.races = races;
      this.selectRacePreview(this.menuRace || races[0]);
      stage.classList.add('ready');
    } catch (err) {
      if (this.racePreview === preview) {
        status.textContent = 'Aperçu 3D indisponible';
        console.warn('[RWA Preview] échec de la scène de sélection :', err);
      }
    } finally {
      if (this.racePreview === preview) raceSelect.classList.remove('preview-loading');
    }
  }

  selectRacePreview(race) {
    this.menuRace = race;
    const p = this.racePreview;
    if (!p || !p.races || !p.visuals.has(race)) return;
    p.selectedRace = race;
    for (const [rid, visual] of p.visuals) visual.setEnabled(rid === race);
    const visual = p.visuals.get(race);
    const height = Math.max(2, visual.modelHeight || visual.bodyTopY || 4);
    const upperBodyY = height * 0.72;
    p.camera.position.set(0, upperBodyY, -Math.max(3, height * 1.05));
    p.camera.setTarget(new BABYLON.Vector3(0, upperBodyY, 0));
  }

  disposeRacePreview() {
    this.racePreviewToken++;
    const p = this.racePreview;
    this.racePreview = null;
    if (!p) return;
    if (p.resize) window.removeEventListener('resize', p.resize);
    for (const visual of p.visuals.values()) {
      if (visual.animator) visual.animator.dispose();
      visual.dispose();
    }
    p.visuals.clear();
    if (p.scene && !p.scene.isDisposed) p.scene.dispose();
    if (p.engine) p.engine.dispose();
    const stage = document.getElementById('race-preview-stage');
    if (stage) stage.classList.remove('ready');
    const raceSelect = document.getElementById('race-class-select');
    if (raceSelect) raceSelect.classList.remove('preview-loading');
  }

  /* ================= START ================= */
  async start(faction, classId, race) {
    // --- entités (simulation inchangée) ---
    this.player = new Entity(this, faction, classId, true);
    this.player.race = race;
    this.entities.push(this.player);
    const perFaction = 9;
    for (const f of FACTION_IDS) {
      for (let i = 0; i < perFaction; i++) {
        // Matrice respectée : race tirée dans le royaume, puis classe autorisée pour la race.
        const { race, classId } = randomRaceClassFor(f);
        const e = new Entity(this, f, classId);
        e.race = race;
        this.entities.push(e);
      }
    }

    this.initBabylon();
    this.buildWorld();
    const visualPromises = [];
    let loadedVisuals = 0;
    this.setLoadingStatus('Chargement des personnages — 0/' + this.entities.length);
    for (const e of this.entities) {
      const visualReady = Promise.resolve(this.buildUnit(e)).finally(() => {
        loadedVisuals++;
        this.setLoadingStatus('Chargement des personnages — ' + loadedVisuals + '/' + this.entities.length);
      });
      visualPromises.push(visualReady);
    }

    UI.buildSkillbar(this.player);
    this.patchSkillbar();
    this.bindInput();

    // Estimations de trajet (TEST D) à la vitesse réelle du joueur
    this._estimates = WorldDefinition.estimates(this.player.baseSpeed);
    const e0 = this._estimates;
    console.log('[RWA World] WORLD_SIZE=' + WORLD_SIZE + ' sim, seed=' + WORLD_SEED +
      ' | spawn→center ' + e0.spawnToCenterDist + ' sim ≈ ' + e0.spawnToCenterMin.toFixed(1) + ' min' +
      ' | full ' + e0.fullTraversalDist + ' sim ≈ ' + e0.fullTraversalMin.toFixed(1) + ' min' +
      ' (vitesse ' + this.player.baseSpeed + ' u/s)');
    // diagnostics terrain (une fois) : couture + pentes
    this._seamErr = this.computeSeamError();
    this._slopeStats = TerrainGenerator.slopeStats(WORLD_SEED, 600);
    console.log('[RWA Terrain] seed=' + WORLD_SEED + ' | seam max err=' + this._seamErr.toExponential(2) +
      ' | slope max=' + this._slopeStats.maxDeg.toFixed(1) + '° avg=' + this._slopeStats.avgDeg.toFixed(1) + '°' +
      ' | res=' + this.chunkManager.res);
    // stream initial autour du spawn
    this.chunkManager.update(this.player.x, this.player.y);

    // L'écran de chargement et title restent actifs jusqu'à ce que TOUT le contenu
    // visible au lancement soit prêt. Cela remplace le lazy loading perceptible des
    // personnages, de la végétation et des animations par un chargement initial net.
    await Promise.allSettled(visualPromises);
    this.setLoadingStatus('Préparation de la végétation…');
    if (this.vegetation && this.vegetation.treeAssetsReady) await this.vegetation.treeAssetsReady;
    if (this.vegetation) this.vegetation.update(this.player.x, this.player.y);
    if (this.water) this.water.update();

    this.setLoadingStatus('Mise en cache des animations…');
    if (this.animLib) await this.animLib.load(STARTUP_ANIMATION_KEYS);

    this.setLoadingStatus('Finalisation de la scène…');
    if (this.scene.whenReadyAsync) await this.scene.whenReadyAsync();

    // Rendu de chauffe encore masqué par l'écran de chargement : compilation du
    // shader terrain, positionnement des unités et premier remplissage des buffers.
    this.updateCamera(0.016);
    this.updateMeshes(0.016);
    this.scene.render();

    const eng = this.engine;
    eng.runRenderLoop(() => {
      let dt = eng.getDeltaTime() / 1000;
      if (!dt || dt > 0.1) dt = Math.min(dt || 0.016, 0.05);
      this.update(dt);
      this.scene.render();
      this.renderOverlay();
      UI.update(this);
    });
    window.addEventListener('resize', () => eng.resize());
    UI.notify('La guerre fait rage — V pour changer de caméra.', '#fff');
  }

  /* ================= BABYLON SETUP ================= */
  initBabylon() {
    const canvas = document.getElementById('render-canvas');
    this.canvas = canvas;
    this.engine = new BABYLON.Engine(canvas, true, { adaptToDeviceRatio: true, stencil: false });
    const scene = new BABYLON.Scene(this.engine);
    this.scene = scene;
    scene.clearColor = new BABYLON.Color3(0.05, 0.07, 0.11);
    scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
    scene.fogColor = new BABYLON.Color3(0.05, 0.07, 0.11);
    scene.fogStart = 150; scene.fogEnd = 520;
    scene.autoClearDepthAndStencil = true;

    const cam = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 10, -10), scene);
    cam.fov = 0.9; cam.minZ = 0.1; cam.maxZ = 950;   // fog atmosphérique (V0.4.6e) cache la coupure
    this.camera = cam; scene.activeCamera = cam;

    // Bibliothèque d'animations Manny partagée. Les clips utilisés par le gameplay
    // sont mis en cache pendant l'écran de chargement ; ensure() reste le filet de
    // sécurité pour un futur clip qui ne ferait pas partie du lot initial.
    this.animLib = new AnimationLibrary(scene, './assets/animations/');

    // Lumière/fog/ciel : gérés par Environment (V0.4.6e), créé dans buildWorld.
  }

  mat(key, hex, opts = {}) {
    const ck = key + (hex || '') + JSON.stringify(opts);
    if (this.matCache[ck]) return this.matCache[ck];
    const m = new BABYLON.StandardMaterial(ck, this.scene);
    if (hex) m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    if (opts.emissive) m.emissiveColor = BABYLON.Color3.FromHexString(opts.emissive);
    if (opts.alpha != null) m.alpha = opts.alpha;
    if (opts.backFaceCulling === false) m.backFaceCulling = false;
    this.matCache[ck] = m;
    return m;
  }

  wpos(sx, sy, y = 0) { return new BABYLON.Vector3(sx * S, y, sy * S); }

  /* Hauteur de terrain (rendu) sous une coord SIM — la sim reste 2D X/Y. */
  getTerrainHeight(simX, simY) { return TerrainGenerator.height(simX, simY, WORLD_SEED); }

  /* Ombre de contact (blob) : disque à dégradé radial, orienté vers le haut. */
  _makeBlobShadow(scene, size) {
    const tex = new BABYLON.DynamicTexture('blobShadow', { width: 128, height: 128 }, scene, true);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); tex.update();
    tex.hasAlpha = true;
    const m = new BABYLON.StandardMaterial('blobMat', scene);
    m.diffuseTexture = tex; m.diffuseTexture.hasAlpha = true; m.useAlphaFromDiffuseTexture = true;
    m.emissiveColor = new BABYLON.Color3(0, 0, 0); m.disableLighting = true; m.specularColor = new BABYLON.Color3(0, 0, 0);
    m.backFaceCulling = false; m.alpha = 1; m.zOffset = -2;
    const plane = BABYLON.MeshBuilder.CreatePlane('blobShadow', { size: size || 4 }, scene);
    plane.rotation.x = Math.PI / 2; plane.material = m; plane.isPickable = false; plane.applyFog = true;
    plane.bakeCurrentTransformIntoVertices(); plane.setEnabled(false);
    return plane;
  }

  /* ================= MONDE (V0.4.0 : chunké) ================= */
  buildWorld() {
    const scene = this.scene;

    // Atmosphère (V0.4.6e) : ciel + fog + lumière RWA. Créé en premier (palette partagée).
    this.environment = (typeof Environment !== 'undefined') ? new Environment(scene, {}) : null;

    // Couche visuelle (V0.4.6a) : matériau terrain multi-surfaces + routes (lecture seule).
    this.worldvisuals = (typeof WorldVisuals !== 'undefined')
      ? new WorldVisuals(scene, { S, seed: WORLD_SEED }) : null;

    // Végétation (V0.4.5b) : système indépendant, COSMÉTIQUE. Branché au streaming
    // via les hooks attachToChunk/releaseChunk du chunkManager (aucune collision/sim).
    this.vegetation = (typeof VegetationSystem !== 'undefined')
      ? new VegetationSystem(scene, { S, chunkSize: CHUNK_SIZE, seed: WORLD_SEED }) : null;

    // Eau (V0.4.6c) : nappes de rivière autour des chunks actifs (cosmétique).
    this.water = (typeof WaterSystem !== 'undefined')
      ? new WaterSystem(scene, { S, chunkSize: CHUNK_SIZE, seed: WORLD_SEED }) : null;

    // Streaming du terrain autour du joueur — remplace le Ground unique.
    this.chunkManager = new WorldChunkManager(scene, {
      S, radius: CHUNK_RADIUS, chunkSize: CHUNK_SIZE, seed: WORLD_SEED, bounds: WORLD_BOUNDS, showDebug: false,
      vegetation: this.vegetation, worldvisuals: this.worldvisuals, water: this.water,
    });

    // Ombre de contact (blob) sous le joueur — grounding peu coûteux (V0.4.6.1).
    this._playerShadow = this._makeBlobShadow(scene, 4.2);

    // Landmarks (objectifs) : DONNÉES du monde, en coords globales, indépendants des chunks.
    this.buildLandmarks();

  }

  /* Landmarks placeholder par TYPE (spawn=colonne jaune, fort=cube bleu clair,
     neutral=gros cube sombre). Coords globales, toujours présents (pas chunkés). */
  buildLandmarks() {
    const scene = this.scene, W = WorldDefinition;
    // relations logiques (spawn -> forts) : simples traits, PAS des murs/chemins
    for (let i = 0; i < W.links.length; i++) {
      const a = W.byId(W.links[i][0]), b = W.byId(W.links[i][1]);
      const l = BABYLON.MeshBuilder.CreateLines('rel' + i,
        { points: [this.wpos(a.worldPos.x, a.worldPos.y, 1), this.wpos(b.worldPos.x, b.worldPos.y, 1)] }, scene);
      l.color = new BABYLON.Color3(0.28, 0.36, 0.46); l.isPickable = false;
    }
    for (const o of W.objectives) {
      let mesh, half;
      const th = this.getTerrainHeight(o.worldPos.x, o.worldPos.y);   // posé sur le terrain
      if (o.type === 'spawn') { mesh = BABYLON.MeshBuilder.CreateBox('lm_' + o.id, { width: 26, depth: 26, height: 160 }, scene); half = 80; }
      else if (o.type === 'fort') { mesh = BABYLON.MeshBuilder.CreateBox('lm_' + o.id, { size: 55 }, scene); half = 27.5; }
      else { mesh = BABYLON.MeshBuilder.CreateBox('lm_' + o.id, { size: 100 }, scene); half = 50; }
      mesh.position = this.wpos(o.worldPos.x, o.worldPos.y, th + half);
      mesh.material = this.mat('lm_' + o.type, W.colors[o.type], { emissive: o.type === 'spawn' ? '#3a2c05' : '#0e1c26' });
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
    }
  }

  /* ================= UNITÉS =================
     Rendu délégué à CharacterVisual. V0.3 : Human+Guardian => GLB (async),
     toutes les autres combinaisons => placeholder capsule. */
  buildUnit(e) {
    const div = document.createElement('div'); div.className = 'nameplate';
    document.getElementById('overlay3d').appendChild(div);
    e._plate = div;

    const glb = this.glbFor(e);
    if (glb) {
      // Échelle finale = base canonique GLB × échelle visuelle raciale (cosmétique).
      // Appliquée au root du personnage skinné dans loadModel (pas aux bones).
      const vs = (typeof RACE_VISUAL_SCALE !== 'undefined' && RACE_VISUAL_SCALE[e.race]) || 1;
      const opts = Object.assign({}, glb, { scale: glb.scale * vs });
      // Chargement ASYNCHRONE : toutes les promesses sont agrégées par start(), qui
      // conserve l'écran de chargement jusqu'à ce que chaque personnage soit prêt.
      return CharacterVisual.loadModel(this, e, glb.url, opts)
        .then(cv => { e.visual = cv; e._bodyTopY = cv.bodyTopY; this.logGlbAnimsOnce(cv); })
        .catch(err => {
          console.warn('[RWA] Échec du chargement ' + glb.url + ' → fallback placeholder pour '
            + e.def.name + ' (' + (e.race || '?') + ') : ' + ((err && err.message) || err));
          e.visual = new CharacterVisual(this, e).build();
          e._bodyTopY = e.visual.bodyTopY;
        });
    } else {
      e.visual = new CharacterVisual(this, e).build();
      e._bodyTopY = e.visual.bodyTopY;
      return Promise.resolve(e.visual);
    }
  }

  glbFor(e) {
    // Purement visuel : le modèle dépend UNIQUEMENT de la race (toutes classes).
    // Ne touche jamais entity.radius / stats / hitbox.
    return GLB_ASSETS[e.race] || null;
  }

  logGlbAnimsOnce(cv) {
    if (this._glbAnimsLogged) return; this._glbAnimsLogged = true;
    console.log('[RWA] GLB chargé (' + (cv.entity && cv.entity.race) + ') anims internes :');
    (cv.animationNames || []).forEach(n => console.log('   - ' + n));
    console.log('[RWA] rig Manny:' + (cv.isMannyRig ? 'oui → AnimationLibrary' : 'non')
      + '  | skeleton:' + (cv.hasSkeleton ? 'présent' : 'absent'));
  }

  /* ================= INPUT ================= */
  bindInput() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', e => e.preventDefault());

    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left; this.pointer.y = e.clientY - r.top;
      // Orbite caméra sur clic DROIT maintenu (yaw inversé selon préférence).
      if (this.dragging && this.dragButton === 2) {
        const dx = e.clientX - this.lastDrag.x, dy = e.clientY - this.lastDrag.y;
        this.lastDrag = { x: e.clientX, y: e.clientY };
        const M = CAM_MODES[this.mode];
        this.cam.yaw += dx * 0.006;   // INVERSÉ (gauche/droite)
        this.cam.pitch = Math.max(M.pitchMin, Math.min(M.pitchMax, this.cam.pitch + dy * 0.005));
        this.cam.tPitch = this.cam.pitch;
      }
    });

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      if (e.button === 2) {           // clic DROIT = caméra
        this.dragging = true; this.dragButton = 2; this.lastDrag = { x: e.clientX, y: e.clientY };
      }
      // clic GAUCHE traité au relâchement (cibler / attaquer)
    });

    cv.addEventListener('pointerup', e => {
      if (e.button === 2) { this.dragging = false; this.dragButton = -1; }
      else if (e.button === 0) { if (!this.player.dead) this.selectAtPointer(); }  // cibler + attaquer si ennemi
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      // La molette ne fait QUE zoomer dans les bornes du mode courant (pas de changement de mode).
      const M = CAM_MODES[this.mode];
      const d = this.cam.tDist + Math.sign(e.deltaY) * (M.distMax - M.distMin) * 0.12;
      this.cam.tDist = Math.max(M.distMin, Math.min(M.distMax, d));
      this.cam.dist = this.cam.tDist;
    }, { passive: false });

    window.addEventListener('keydown', e => {
      const firstPress = !this.keys.has(e.code);
      this.keys.add(e.code);
      if (this.player.dead) return;
      const action = RWAKeybindings.actionForCode(e.code);
      if (action === 'targetNearest') { e.preventDefault(); if (firstPress) this.targetNearestEnemy(); return; }
      if (action === 'toggleCamera') { e.preventDefault(); if (firstPress) this.toggleCamera(); return; }
      if (action === 'toggleDebug') { e.preventDefault(); if (firstPress) this.toggleDebug(); return; }
      if (action === 'jump') { e.preventDefault(); if (firstPress) this.startJump(); return; }
      if (action === 'stick') { e.preventDefault(); if (firstPress) this.activateStick(); return; }
      const p = this.player;
      const skillByAction = {
        ability1: p.def.skills[0], ability2: p.def.skills[1], ability3: p.def.skills[2], ability4: p.def.skills[3],
        realmAbility: p.def.realm, sprint: UNIVERSAL_SKILLS.sprint, purge: UNIVERSAL_SKILLS.purge,
      };
      const sk = skillByAction[action];
      if (sk) { e.preventDefault(); this.castPlayerSkill(sk); }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  toggleCamera() {
    // V = véritable changement d'ÉTAT (indépendant du niveau de zoom).
    this.mode = this.mode === 'THIRD_PERSON' ? 'TACTICAL' : 'THIRD_PERSON';
    const M = CAM_MODES[this.mode];
    this.cam.tPitch = M.pitch; this.cam.tDist = M.dist;
    this.camMode = M.label;
    UI.notify('Caméra : ' + M.label, '#7ad0ff');
  }

  castPlayerSkill(skill) {
    const p = this.player;
    if (skill.targetType === 'enemy') p.tryCast(skill, p.target);
    else if (skill.targetType === 'ally') { const a = this.pickEntity(x => x.faction === p.faction) || p; p.tryCast(skill, a); }
    else if (skill.targetType === 'ground') { this.updateMouseWorld(); p.tryCast(skill, null, this.mouseWorld.x, this.mouseWorld.y); }
    else p.tryCast(skill, p);
  }

  startJump() {
    const p = this.player;
    if (!p || p.dead || this.jumpState || p.flags.canMove === false) return;
    this.jumpState = { elapsed: 0, duration: 0.72, height: 2.25 };
  }

  updateJump(dt) {
    const p = this.player;
    if (!p || p.dead) { this.jumpState = null; this.jumpOffset = 0; return; }
    const j = this.jumpState;
    if (!j) { this.jumpOffset = 0; return; }
    j.elapsed += dt;
    const t = Math.min(1, j.elapsed / j.duration);
    this.jumpOffset = 4 * j.height * t * (1 - t);
    if (t >= 1) { this.jumpState = null; this.jumpOffset = 0; }
  }

  clearStick(notify) {
    const p = this.player;
    if (!p) return false;
    const wasActive = !!(p._stickActive || p.followTarget);
    p._stickActive = false;
    p.followTarget = null;
    if (notify && wasActive) UI.notify('Stick annulé', '#b8c8d8');
    return wasActive;
  }

  activateStick() {
    const p = this.player;
    if (!p) return;
    const target = p.target;
    if (!target || target === p || target.dead || !this.isEnemyVisible(target)) {
      UI.notify('Sélectionne un personnage avant d’utiliser Stick.', '#d8c59b');
      return;
    }
    if (p.distanceTo(target) > STICK_MAX_DISTANCE) {
      this.clearStick(false);
      UI.notify('Cible trop éloignée pour Stick.', '#d8c59b');
      return;
    }
    p.followTarget = target;
    p.moveTarget = null;
    p._stickActive = true;
    this.wasdActive = false;
    const raceName = target.race && RACES[target.race] ? RACES[target.race].name : target.def.name;
    UI.notify('Stick : ' + raceName, '#ffffff');
  }

  targetNearestEnemy() {
    const p = this.player;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const e of this.entities) {
      if (e === p || e.dead || e.faction === p.faction || !this.isEnemyVisible(e)) continue;
      const distance = p.distanceTo(e);
      if (distance < nearestDistance) { nearest = e; nearestDistance = distance; }
    }
    if (!nearest) {
      UI.notify('Aucune cible ennemie visible à proximité.', '#d8c59b');
      return;
    }
    if (p.followTarget !== nearest) this.clearStick(false);
    p.target = nearest;
    p.attacking = true;
    const raceName = nearest.race && RACES[nearest.race] ? RACES[nearest.race].name : '';
    const targetName = [raceName, nearest.def.name].filter(Boolean).join('_').replace(/\s+/g, '_');
    UI.notify('Cible : ' + targetName, '#ffffff');
  }

  selectAtPointer() {
    const ent = this.pickEntity();
    if (ent && this.isEnemyVisible(ent)) {
      if (this.player.followTarget !== ent) this.clearStick(false);
      this.player.target = ent;
      // Un allié reste ciblable pour le stick et le retour visuel blanc, mais
      // l'intention d'auto-attaque ne s'active que contre un ennemi.
      this.player.attacking = ent.faction !== this.player.faction;
    }
  }

  pickEntity(filter) {
    const pick = this.scene.pick(this.pointer.x, this.pointer.y,
      m => m.metadata && m.metadata.entity && (!filter || filter(m.metadata.entity)));
    if (pick && pick.hit && pick.pickedMesh && pick.pickedMesh.metadata) return pick.pickedMesh.metadata.entity;
    return null;
  }

  updateMouseWorld() {
    // Intersection ANALYTIQUE du rayon souris avec le plan y=0 (indépendant des chunks).
    const ray = this.scene.createPickingRay(this.pointer.x, this.pointer.y, BABYLON.Matrix.Identity(), this.camera);
    if (Math.abs(ray.direction.y) < 1e-6) return;
    const t = -ray.origin.y / ray.direction.y;
    if (t <= 0) return;
    this.mouseWorld.x = (ray.origin.x + ray.direction.x * t) / S;
    this.mouseWorld.y = (ray.origin.z + ray.direction.z * t) / S;
  }
  moveToMouse() { this.updateMouseWorld(); this.clearStick(false); this.player.moveTarget = { x: this.mouseWorld.x, y: this.mouseWorld.y }; this.wasdActive = false; }

  /* HUD debug (V0.4.0) : position monde, chunk, compteurs, estimation de trajet. */
  updateDebugHUD() {
    const el = this._hud || (this._hud = document.getElementById('debug-hud'));
    if (!el || !this.chunkManager) return;
    const p = this.player, cm = this.chunkManager;
    const ch = cm.worldToChunk(p.x, p.y);
    const est = this._estimates || WorldDefinition.estimates(p.baseSpeed);
    const th = this.getTerrainHeight(p.x, p.y);
    const slope = TerrainGenerator.slopeDeg(p.x, p.y, WORLD_SEED);
    el.textContent =
      'FPS ' + Math.round(this.engine.getFps()) +
      '\nWORLD   X:' + Math.round(p.x) + '  Y:' + Math.round(p.y) +
      '\nCHUNK   ' + ch.cx + ',' + ch.cy + '   seed ' + cm.chunkId(ch.cx, ch.cy) +
      '\nTERRAIN height ' + th.toFixed(1) + '   slope ' + slope.toFixed(1) + '°' +
      '\nACTIVE CHUNKS  ' + cm.activeCount() +
      '\nTERRAIN verts ' + cm.vertexCount() + '  tris ' + cm.triangleCount() +
      '\nSCENE MESHES   ' + this.scene.meshes.length + '   CHARACTERS ' + this.entities.filter(e => !e.dead).length +
      (this.vegetation ? '\nVEGET  T:' + this.vegetation._counts.tree + ' R:' + this.vegetation._counts.rock + ' B:' + this.vegetation._counts.bush + ' G:' + this.vegetation._counts.grass : '') +
      '\nSEAM max err   ' + (this._seamErr != null ? this._seamErr.toExponential(1) : '—') +
      '\nSLOPE max ' + (this._slopeStats ? this._slopeStats.maxDeg.toFixed(1) : '—') + '°  avg ' + (this._slopeStats ? this._slopeStats.avgDeg.toFixed(1) : '—') + '°' +
      '\nTRAVEL  spawn→center ≈ ' + est.spawnToCenterMin.toFixed(1) + ' min   full ≈ ' + est.fullTraversalMin.toFixed(1) + ' min';
  }

  /* Erreur de couture max : reproduit EXACTEMENT le mapping vertex de generateChunk
     pour les arêtes de chunks voisins et compare les hauteurs (doit être ≈ 0). */
  computeSeamError() {
    const cm = this.chunkManager, CS = cm.chunkSize, N = cm.res, seed = cm.seed; let maxErr = 0;
    const yAt = (cx, cy, i, j) => TerrainGenerator.height(cx * CS + (i / N) * CS, cy * CS + (j / N) * CS, seed);
    for (const [cx, cy] of [[4, 4], [7, 3], [2, 6]]) {
      for (let k = 0; k <= N; k++) {
        maxErr = Math.max(maxErr, Math.abs(yAt(cx, cy, N, k) - yAt(cx + 1, cy, 0, k)));  // EST vs OUEST voisin
        maxErr = Math.max(maxErr, Math.abs(yAt(cx, cy, k, N) - yAt(cx, cy + 1, k, 0)));  // NORD vs SUD voisin
      }
    }
    return maxErr;
  }

  toggleDebug() {
    // cycle : 0 = HUD+bordures | 1 = + wireframe terrain | 2 = tout off
    this._debugMode = ((this._debugMode == null ? 0 : this._debugMode) + 1) % 3;
    const m = this._debugMode, cm = this.chunkManager;
    const el = document.getElementById('debug-hud'); if (el) el.style.display = (m === 2) ? 'none' : 'block';
    if (cm) {
      cm.setWireframe(m === 1);
      cm.showDebug = (m !== 2);
      for (const k of [...cm.chunks.keys()]) cm.disposeChunk(k);
      cm.forceRestream(); cm.update(this.player.x, this.player.y);
    }
  }

  /* Choisit le clip de locomotion depuis le VECTEUR DE DÉPLACEMENT RÉEL du perso,
     exprimé dans son repère LOCAL (relatif à e.facing). Indépendant des touches ->
     valable joueur, bots, click-to-move, knockback, déplacement réseau. */
  locomotionClip(e, dt) {
    const px = e._px != null ? e._px : e.x;
    const py = e._py != null ? e._py : e.y;
    const dx = e.x - px, dy = e.y - py;
    const speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
    // ALLURE depuis la vitesse réelle (pas speedMult) : Idle / Walk / Jog
    if (speed < LOCO_IDLE_SPEED) return 'Idle';
    const a = normalizeAngle(Math.atan2(dy, dx) - e.facing);   // 0 = avant
    const idx = ((Math.round((a * 180 / Math.PI) / 45) % 8) + 8) % 8;
    const gait = speed >= LOCO_JOG_SPEED ? 'Jog_' : 'Walk_';
    return gait + LOCO_SUFFIX[idx];
  }

  /* déplacement clavier relatif à la caméra */
  handleMovement() {
    const p = this.player;
    if (p.dead) return;
    const K = this.keys;
    const pressed = actionId => [...K].some(code => RWAKeybindings.matches(actionId, code));
    const up = pressed('moveForward');
    const dn = pressed('moveBackward');
    const lf = pressed('moveLeft');
    const rt = pressed('moveRight');
    if (!(up || dn || lf || rt)) { if (this.wasdActive) { p.moveTarget = null; this.wasdActive = false; } return; }
    this.clearStick(false);
    // Base caméra RÉELLE (Babylon) projetée au sol -> évite toute désynchro de signe.
    // forward = direction où regarde la caméra (Axis.Z) ; right = Axis.X.
    const fwd = this.camera.getDirection(BABYLON.Axis.Z);
    const right = this.camera.getDirection(BABYLON.Axis.X);
    let fx = fwd.x, fy = fwd.z;   // world (X→sim x, Z→sim y)
    let rx = right.x, ry = right.z;
    let fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
    let rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl;
    let mx = 0, my = 0;
    if (up) { mx += fx; my += fy; }   // W/Z = vers où regarde la caméra
    if (dn) { mx -= fx; my -= fy; }   // S = recul
    if (rt) { mx += rx; my += ry; }   // D = droite
    if (lf) { mx -= rx; my -= ry; }   // A/Q = gauche
    const len = Math.hypot(mx, my) || 1;
    mx /= len; my /= len;
    p.moveTarget = { x: p.x + mx * 900, y: p.y + my * 900 };
    this.wasdActive = true;
  }

  /* ================= SIM (inchangée) ================= */
  spawnGroundEffect(cfg) { this.groundEffects.push(Object.assign({ timer: 0, ticksDone: 0 }, cfg)); }
  spawnHitFx(x, y, magic) {
    // petit flash 3D éphémère
    if (!this.scene) return;
    const s = BABYLON.MeshBuilder.CreateSphere('hit', { diameter: 1.2 }, this.scene);
    s.position = this.wpos(x, y, 2);
    s.material = this.mat(magic ? 'hitm' : 'hitp', magic ? '#9678ff' : '#ffdc78', { emissive: magic ? '#9678ff' : '#ffdc78' });
    s.isPickable = false; s._life = 0.22;
    (this._fx = this._fx || []).push(s);
  }
  recomputeFocus() {
    for (const f of FACTION_IDS) {
      let best = null, bs = -Infinity;
      for (const t of this.map.territories) {
        if (t.base || t.owner === f) continue;
        if (!this.map.factionOwnsAdjacent(t, f)) continue;
        const ed = FACTION_IDS.reduce((s, o) => o !== f ? s + t.presence[o] : s, 0);
        const sc = t.value * 10 - ed * 2 + Math.random() * 4;
        if (sc > bs) { bs = sc; best = t; }
      }
      this.factionFocus[f] = best;
    }
  }
  isEnemyVisible(e) {
    if (e.faction === this.player.faction) return true;
    let best = this.player.distanceTo(e), rangerNear = this.player.def.detectStealth ? best : Infinity;
    for (const a of this.entities) {
      if (a.dead || a.faction !== this.player.faction) continue;
      const d = a.distanceTo(e); if (d < best) best = d;
      if (a.def.detectStealth) rangerNear = Math.min(rangerNear, d);
    }
    if (e.isStealthed) { if (best < 130) return true; if (rangerNear < 260) return true; return false; }
    if (e.isCamouflaged) return best < 320 || rangerNear < 480;
    return best < 720;
  }
  isVisibleToPlayer(e) { return this.isEnemyVisible(e); }

  update(dt) {
    this.focusTimer -= dt;
    if (this.focusTimer <= 0) { this.focusTimer = 3; this.recomputeFocus(); }
    this.handleMovement();
    this.updateJump(dt);

    // Une cible morte, devenue invisible, remplacée ou trop éloignée met fin au stick.
    if (this.player._stickActive) {
      const st = this.player.followTarget;
      if (!st || st.dead || st !== this.player.target || !this.isEnemyVisible(st)
        || this.player.distanceTo(st) > STICK_MAX_DISTANCE) this.clearStick(false);
    }

    for (const e of this.entities) if (e !== this.player && !e.dead) BotAI.update(e, this, dt);
    for (const e of this.entities) e.update(dt);
    if (this.player.dead && this.player.respawnTimer <= 0) this.player.respawn();

    this.map.update(dt, this.entities, (t, prev, now) => {
      UI.notify(`${t.name} capturé par ${FACTIONS[now].name} !`, FACTIONS[now].color);
      UI.log(`${t.name} : ${prev ? FACTIONS[prev].short : 'Neutre'} → ${FACTIONS[now].short}`);
    });

    // ground effects (volley)
    for (const g of this.groundEffects) {
      g.timer -= dt;
      if (g.timer <= 0 && g.ticksDone < g.ticks) {
        g.timer = g.interval; g.ticksDone++;
        const ts = CombatSystem.gatherAoe(g.caster, g.x, g.y, g.radius, g.cap, true);
        for (const t of ts) CombatSystem.dealDamage(g.caster, t, g.damage, { magic: false });
      }
    }
    this.groundEffects = this.groundEffects.filter(g => g.ticksDone < g.ticks);

    this.updateCamera(dt);

    // FACING DÉCOUPLÉ DU DÉPLACEMENT : le joueur regarde là où pointe la caméra.
    // La direction de déplacement (WASD relatif caméra) reste indépendante ->
    // strafe, recul et diagonales possibles sans rotation artificielle du modèle.
    if (this.player && !this.player.dead) {
      if (this.player._stickActive && this.player.followTarget) {
        const st = this.player.followTarget;
        this.player.facing = Math.atan2(st.y - this.player.y, st.x - this.player.x);
      } else {
        const f = this.camera.getDirection(BABYLON.Axis.Z); // avant caméra (dans l'écran)
        this.player.facing = Math.atan2(f.z, f.x);          // (X->sim x, Z->sim y)
      }
    }

    // STREAMING du terrain autour du joueur (chunks)
    if (this.chunkManager) this.chunkManager.update(this.player.x, this.player.y);
    // LOD végétation (bandes NEAR/MID/FAR + rebuild dirty) — chaque frame, bon marché
    if (this.vegetation) this.vegetation.update(this.player.x, this.player.y);
    if (this.water) this.water.update();   // reconstruit l'eau si les chunks actifs ont changé
    if (this.audio) this.audio.updateWorldAudio(this.player);
    if (this._playerShadow && this.player && !this.player.dead) {
      const sh = this._playerShadow; sh.setEnabled(true);
      sh.position.set(this.player.x * S, this.getTerrainHeight(this.player.x, this.player.y) + 0.15, this.player.y * S);
    } else if (this._playerShadow) this._playerShadow.setEnabled(false);

    this.updateMeshes(dt);
    this.updateMouseWorld();
    this.updateDebugHUD();
  }

  /* ================= CAMÉRA ================= */
  updateCamera(dt) {
    const c = this.cam;
    const k = 1 - Math.exp(-dt / 0.12);
    c.pitch += (c.tPitch - c.pitch) * k;
    c.dist += (c.tDist - c.dist) * k;

    const p = this.player;
    const target = this.wpos(p.x, p.y, this.getTerrainHeight(p.x, p.y) + 3.0 + this.jumpOffset);
    const dir = new BABYLON.Vector3(
      Math.cos(c.pitch) * Math.sin(c.yaw),
      Math.sin(c.pitch),
      Math.cos(c.pitch) * Math.cos(c.yaw)
    );
    let dist = c.dist;
    // Anti-clip 3D par RAYCAST (target -> caméra) contre murs/tours.
    // Gère correctement la hauteur : la caméra qui passe AU-DESSUS d'un mur
    // n'est pas rapprochée à tort (contrairement à l'ancien test 2D).
    const ray = new BABYLON.Ray(target, dir, dist);
    const hit = this.scene.pickWithRay(ray, m => m.metadata && m.metadata.wall);
    if (hit && hit.hit && hit.distance < dist) dist = Math.max(2.5, hit.distance - 0.6);

    const camPos = target.add(dir.scale(dist));
    // empêche la caméra de passer sous le terrain (échantillonne le sol sous la caméra)
    const camTerrain = this.getTerrainHeight(camPos.x / S, camPos.z / S);
    if (camPos.y < camTerrain + 2) camPos.y = camTerrain + 2;
    this.camera.position.copyFrom(camPos);
    this.camera.setTarget(target);
    this._camDir = target.subtract(camPos).normalize();

    this.camMode = CAM_MODES[this.mode].label;
  }

  updateMeshes(dt) {
    const p = this.player;
    for (const e of this.entities) {
      const v = e.visual; if (!v) continue;
      const visible = !e.dead && (e.faction === p.faction || this.isEnemyVisible(e));
      v.setEnabled(visible);
      if (!visible) continue;
      const jumpY = e === p ? this.jumpOffset : 0;
      v.setTransform(e.x * S, this.getTerrainHeight(e.x, e.y) + jumpY, e.y * S, Math.PI / 2 - e.facing);
      const ally = e.faction === p.faction;
      v.setFactionRing(ally ? '#3fbf6a' : '#d94f4f', ally);
      // stealth / camouflage : appliqué à TOUT le modèle (corps + tête + accessoires)
      const st = e.isStealthed || e.isCamouflaged;
      v.setVisibility(st ? (ally ? 0.4 : 0.25) : 1);

      const inMelee = e.target && !e.target.dead && e.faction !== e.target.faction
        && e.distanceTo(e.target) <= (e.def.attackRange + e.radius + e.target.radius);

      if (v.animator) {
        // GLB rig Manny : attaque prioritaire, sinon LOCOMOTION DIRECTIONNELLE
        // déterminée par le VECTEUR DE DÉPLACEMENT RÉEL (pas les touches).
        if (inMelee) v.animator.play('Attack_01');
        else v.animator.play(this.locomotionClip(e, dt));
      } else {
        // placeholder / britm (anims internes) : état simple
        const moving = (e.moveTarget || e.followTarget) && e.flags.canMove;
        v.playAnim(inMelee ? 'attack' : (moving ? 'run' : 'idle'));
      }

      // mémorise la position pour le calcul de déplacement de la frame suivante
      e._px = e.x; e._py = e.y;
    }
    // (V0.4.0 : landmarks statiques colorés par type — pas de recolor par propriétaire)
    // hit fx
    if (this._fx) { for (const s of this._fx) { s._life -= dt; s.scaling.setAll(1 + (0.22 - s._life) * 4); s.material.alpha = Math.max(0, s._life / 0.22); } this._fx = this._fx.filter(s => { if (s._life <= 0) { s.dispose(); return false; } return true; }); }
  }

  /* ================= OVERLAY DOM (HP / texte flottant) ================= */
  renderOverlay() {
    const eng = this.engine;
    const w = eng.getRenderWidth(), h = eng.getRenderHeight();
    const vp = this.camera.viewport.toGlobal(w, h);
    const tmat = this.scene.getTransformMatrix();
    const camPos = this.camera.position;
    const p = this.player;
    // Project() renvoie des pixels du BACKBUFFER (× device pixel ratio car
    // adaptToDeviceRatio:true). L'overlay est en pixels CSS -> on convertit,
    // sinon la plaque se décale de la tête sur les écrans HiDPI.
    const cvs = this.canvas;
    const sx = w ? (cvs.clientWidth / w) : 1;
    const sy = h ? (cvs.clientHeight / h) : 1;
    for (const e of this.entities) {
      const plate = e._plate; if (!plate) continue;
      // modèle GLB pas encore chargé (async) : pas de plaque tant que le visuel n'existe pas
      if (!e.visual || e._bodyTopY == null) { plate.style.display = 'none'; continue; }
      const visible = !e.dead && (e.faction === p.faction || this.isEnemyVisible(e));
      if (!visible) { plate.style.display = 'none'; continue; }
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy > NAMEPLATE_MAX_DISTANCE * NAMEPLATE_MAX_DISTANCE) { plate.style.display = 'none'; continue; }
      const jumpY = e === p ? this.jumpOffset : 0;
      const wp = new BABYLON.Vector3(e.x * S, this.getTerrainHeight(e.x, e.y) + e._bodyTopY + jumpY, e.y * S);
      // cull derrière la caméra
      if (this._camDir && BABYLON.Vector3.Dot(wp.subtract(camPos), this._camDir) < 0.5) { plate.style.display = 'none'; continue; }
      const sp = BABYLON.Vector3.Project(wp, BABYLON.Matrix.Identity(), tmat, vp);
      plate.style.display = 'block';
      plate.style.left = (sp.x * sx) + 'px';
      plate.style.top = (sp.y * sy) + 'px';

      const ally = e.faction === p.faction;
      const hpR = Math.max(0, e.hp / e.maxHp);
      const enduR = Math.max(0, e.endurance / e.maxEndurance);
      const isTarget = (e === p.target);
      const isFocus = (e === p || isTarget);
      const raceName = e.race && RACES[e.race] ? RACES[e.race].name : '';
      const plateName = [raceName, e.def.name].filter(Boolean).join('_').replace(/\s+/g, '_');
      // Gris-bleu clair pour les alliés, rouge pour les ennemis ; la cible active
      // devient blanche quelle que soit sa faction.
      const nameColor = isTarget ? '#ffffff' : (ally ? '#b8c8d8' : '#ff5a5a');
      let html = '';
      html += `<div class="np-name" style="color:${nameColor}">${plateName}</div>`;
      html += `<div class="np-hp"><span style="width:${hpR * 100}%"></span></div>`;
      html += `<div class="np-endu"><span style="width:${enduR * 100}%"></span></div>`;
      if (e.casting) html += `<div class="np-cast"><span style="width:${(1 - e.casting.remaining / e.casting.total) * 100}%"></span></div>`;
      // chips CC (cibles focus)
      if (isFocus) { const chips = EffectSystem.statusChips(e).map(c => `<span class="np-chip ${c.cls}">${c.label}</span>`).join(''); if (chips) html += `<div class="np-chips">${chips}</div>`; }
      // textes flottants
      let ft = '';
      for (const f of e.floats) ft += `<span class="np-float" style="color:${f.color};opacity:${Math.max(0, f.life)};transform:translateY(${f.y}px)">${f.text}</span>`;
      if (ft) html += `<div class="np-floats">${ft}</div>`;
      plate.innerHTML = html;
    }
  }

  /* Skillbar : rendre les slots cliquables + libellés de touches adaptés */
  patchSkillbar() {
    const actions = ['ability1', 'ability2', 'ability3', 'ability4', 'realmAbility', 'sprint', 'purge'];
    const refreshBindings = () => UI.slots.forEach((slot, index) => {
      const keyEl = slot.el.querySelector('.key');
      if (keyEl) keyEl.textContent = RWAKeybindings.label(actions[index]);
    });
    for (const slot of UI.slots) {
      const s = slot.skill;
      slot.el.style.cursor = 'pointer';
      slot.el.onclick = () => { if (!this.player.dead) this.castPlayerSkill(s); };
    }
    refreshBindings();
    if (!this._keybindingUiListener) {
      this._keybindingUiListener = true;
      window.addEventListener('rwa-keybindings-changed', refreshBindings);
    }
  }
}

/* -------------------- BOOT -------------------- */
window.addEventListener('DOMContentLoaded', () => {
  const g = new Game3D();
  window.GAME = g;
  g.setupMenu();
});

/* ============================================================
   vegetation.js — Chunked Vegetation + LOD (V0.4.7 assets)

   Industrialisation du prototype 4.5b. Objectif : densités crédibles SANS
   dette de perf. Reste COSMÉTIQUE PUR (isPickable=false, aucune collision,
   aucun obstacle bot, aucune modif Entity/sim/pathfinding/combat).

   PRINCIPES CLÉS
   - Génération CANONIQUE déterministe par chunk : rng = mulberry32(hash(seed,cx,cy)),
     ordre de tirage FIXE. Le LOD ne change JAMAIS la génération : un arbre a une
     transform canonique unique ; la distance décide seulement s'il est RENDU.
   - LOD par bande (distance chunk→joueur), avec hystérésis :
       NEAR : arbres+rochers+buissons+herbe (densité pleine)
       MID  : arbres+rochers+quelques buissons (densité réduite, pas d'herbe)
       FAR  : arbres majeurs seulement (très faible densité, silhouettes)
     La sélection dans une bande se fait par un RANG déterministe [0..1) par
     instance (rank<frac) -> l'objet apparaît/disparaît mais ne bouge pas.
   - THIN INSTANCES : 1 mesh de base par famille. Reconstruction par DIRTY FLAG
     (on ne reconstruit que les familles dont le contenu visible a changé).
   - Budgets (cibles) : arbres<800, rochers<500, buissons<1200, herbe qq milliers,
     draw calls quasi constants (= nb de familles), pas d'accumulation en streaming.
   ============================================================ */

function _vegHash(seed, cx, cy) {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 2654435761);
  h ^= Math.imul((cx | 0) + 0x85ebca6b, 2246822519);
  h ^= Math.imul((cy | 0) + 0xc2b2ae35, 3266489917);
  h = (h ^ (h >>> 15)) >>> 0; return h >>> 0;
}
function _mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VEG_CONFIG = {
  // génération canonique (densité PLEINE = NEAR)
  candWoody: 200,          // candidats arbres/rochers/buissons par chunk
  candGrass: 160,          // candidats herbe par chunk (densité allégée)
  slopeLimitDeg: 32,
  woodyDensity: 0.95,      // facteur global woody
  grassDensity: 0.85,      // facteur global herbe (NEAR only)
  typeProb: { FOREST: 1.0, GRASSLAND: 0.7, HIGHLAND: 0.6, WETLAND: 0.7, BARREN: 0.35 },
  familyWeights: {         // [tree, rock, bush]
    FOREST:    [0.62, 0.10, 0.28], GRASSLAND: [0.10, 0.18, 0.72],
    HIGHLAND:  [0.06, 0.76, 0.18], WETLAND:   [0.14, 0.12, 0.74],
    BARREN:    [0.04, 0.78, 0.18],
  },
  grassTypes: { FOREST: 0.5, GRASSLAND: 1.0, WETLAND: 0.9, HIGHLAND: 0.15, BARREN: 0.05 },
  scale: { tree: [0.75, 1.35], rock: [0.55, 1.5], bush: [0.7, 1.45], grass: [0.55, 1.0] },
  // LOD (distances SIM chunk-centre -> joueur)
  nearR: 2600, midR: 4600, hyst: 450,
  frac: { NEAR: 1.0, MID: 0.5, FAR: 0.18 },
  famAllowed: { NEAR: { tree: 1, rock: 1, grass: 1 }, MID: { tree: 1, rock: 1 }, FAR: { tree: 1 } },
};

class VegetationSystem {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.S = opts.S != null ? opts.S : RENDER_SCALE;
    this.seed = opts.seed != null ? opts.seed : WORLD_SEED;
    this.chunkSize = opts.chunkSize != null ? opts.chunkSize : CHUNK_SIZE;
    this.enabled = opts.enabled !== false;
    this.chunks = new Map();               // key -> { cx,cy, band, data:{tree,rock,bush,grass}[{r,m}] }
    this.dirty = { tree: false, rock: false, bush: false, grass: false };
    this._counts = { tree: 0, rock: 0, bush: 0, grass: 0 };
    this._rebuilds = 0;   // debug : nb de reconstructions de buffer (doit rester bas)
    this.families = this._buildBases();
    this.treeAssetsReady = this._loadTreeAssets();
  }
  key(cx, cy) { return cx + ',' + cy; }

  _mat(name, hex) {
    const m = new BABYLON.StandardMaterial('veg_' + name, this.scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(0, 0, 0); m.backFaceCulling = false; return m;
  }

  /* V0.4.6d — ART PASS : variantes low-poly par famille (apparence seule).
     La génération canonique (positions/rng/rank) reste GELÉE ; la variante est
     choisie déterministiquement à partir d'un hash de position + du biome. */
  _cyl(s, name, h, dt, db, y, mat) { const c = BABYLON.MeshBuilder.CreateCylinder(name, { height: h, diameterTop: dt, diameterBottom: db, tessellation: 6 }, s); c.position.y = y; if (mat) c.material = mat; return c; }
  _cone(s, name, h, d, y) { const c = BABYLON.MeshBuilder.CreateCylinder(name, { height: h, diameterTop: 0, diameterBottom: d, tessellation: 6 }, s); c.position.y = y; return c; }
  _ico(s, name, r, y, mat) { const b = BABYLON.MeshBuilder.CreateIcoSphere(name, { radius: r, subdivisions: 1 }, s); b.position.y = y; if (mat) b.material = mat; return b; }

  _sph(s, name, d, y, mat) { const b = BABYLON.MeshBuilder.CreateSphere(name, { diameter: d, segments: 6 }, s); b.position.y = y; if (mat) b.material = mat; return b; }
  _treeVariants(s) {
    // palette froide mais LISIBLE (pas near-black) contre un terrain clair.
    const bark = this._mat('bark', '#5a4632'), pine = this._mat('pine', '#456a4a'), leaf = this._mat('leaf', '#527a48'), dead = this._mat('dead', '#736855');
    const V = [];
    // 0 PINE_01 : conifère large (2 cônes) — silhouette triangulaire nette
    { const tr = this._cyl(s, 'p1t', 4, 0.6, 1.0, 2, bark); const c1 = this._cone(s, 'p1a', 6.5, 5.4, 5.2); const c2 = this._cone(s, 'p1b', 4.5, 3.6, 8.2); c1.material = c2.material = pine; V.push(BABYLON.Mesh.MergeMeshes([tr, c1, c2], true, true, undefined, false, true)); }
    // 1 PINE_02 : plus haut/étroit
    { const tr = this._cyl(s, 'p2t', 5, 0.5, 0.9, 2.5, bark); const c1 = this._cone(s, 'p2a', 7.5, 4.6, 6.2); c1.material = pine; V.push(BABYLON.Mesh.MergeMeshes([tr, c1], true, true, undefined, false, true)); }
    // 2 BROADLEAF_01 : houppier arrondi (sphères)
    { const tr = this._cyl(s, 'b1t', 5, 0.7, 1.1, 2.5, bark); const b1 = this._sph(s, 'b1a', 6.4, 6.8, leaf); b1.scaling.set(1.05, 0.82, 0.95); const b2 = this._sph(s, 'b1b', 4.4, 8.4, leaf); b2.position.x = 1.9; b2.position.z = 0.7; const b3 = this._sph(s, 'b1c', 3.6, 7.4, leaf); b3.position.x = -1.8; b3.position.z = -0.9; b3.position.y = 7.4; V.push(BABYLON.Mesh.MergeMeshes([tr, b1, b2, b3], true, true, undefined, false, true)); }
    // 3 DEAD_01 : arbre mort, clair, quelques branches
    { const tr = this._cyl(s, 'd1t', 7, 0.4, 1.0, 3.5, dead); const br = []; [[0.7, 5.5, 0, 0.8, 0.2], [-0.6, 6.3, 0.5, -0.9, -0.3], [0.2, 7.2, -0.7, 0.5, 0.6], [-0.3, 5.9, -0.4, 0.3, -0.7]].forEach((p, i) => { const b = BABYLON.MeshBuilder.CreateCylinder('d1' + i, { height: 3.0, diameterTop: 0.1, diameterBottom: 0.4, tessellation: 5 }, s); b.material = dead; b.position.set(p[0], p[1], p[2]); b.rotation.z = p[3]; b.rotation.x = p[4]; br.push(b); }); V.push(BABYLON.Mesh.MergeMeshes([tr, ...br], true, true, undefined, false, false)); }
    // 4 SMALL_01 : jeune arbre
    { const tr = this._cyl(s, 's1t', 2.2, 0.4, 0.7, 1.1, bark); const bl = this._sph(s, 's1a', 3.4, 3.4, leaf); bl.scaling.y = 0.85; V.push(BABYLON.Mesh.MergeMeshes([tr, bl], true, true, undefined, false, true)); }
    return V;
  }

  _configureTreeMaterial(mat) {
    if (!mat) return;
    if (mat.subMaterials) { mat.subMaterials.forEach(m => this._configureTreeMaterial(m)); return; }
    mat.backFaceCulling = false; mat.twoSidedLighting = true;
    if (mat.albedoTexture) {
      mat.albedoTexture.updateSamplingMode(BABYLON.Texture.NEAREST_SAMPLINGMODE);
      mat.albedoTexture.anisotropicFilteringLevel = 1;
    }
    if (mat.diffuseTexture) {
      mat.diffuseTexture.updateSamplingMode(BABYLON.Texture.NEAREST_SAMPLINGMODE);
      mat.diffuseTexture.anisotropicFilteringLevel = 1;
    }
    if (mat.metallic != null) mat.metallic = 0;
    if (mat.roughness != null) mat.roughness = Math.max(0.78, mat.roughness || 0);
  }

  async _loadTreeAsset(def, index, family = 'tree') {
    const root = def.root || './assets/vegetation/trees/';
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', root, def.file, this.scene, undefined, '.glb');
    const meshes = result.meshes.filter(m => m.getTotalVertices && m.getTotalVertices() > 0);
    if (!meshes.length) throw new Error('Aucune géométrie dans ' + def.file);
    for (const mesh of meshes) {
      mesh.setEnabled(false);
      // Préserve la rotation +90° X fournie par le pack et la conversion glTF du loader.
      const importedWorld = mesh.computeWorldMatrix(true).clone();
      mesh.parent = null; mesh.bakeTransformIntoVertices(importedWorld);
      mesh.position.set(0, 0, 0); mesh.rotationQuaternion = null; mesh.rotation.set(0, 0, 0); mesh.scaling.setAll(def.scale);
      mesh.bakeCurrentTransformIntoVertices();
      mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scaling.setAll(1);
      this._configureTreeMaterial(mesh.material);
    }
    let mesh = meshes[0];
    if (meshes.length > 1) mesh = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, true, true);
    for (const extra of result.meshes) if (extra !== mesh && meshes.indexOf(extra) < 0 && !extra.isDisposed()) extra.dispose();
    if (!mesh) throw new Error('Fusion impossible pour ' + def.file);
    mesh.name = 'veg_' + family + '_asset_' + index; mesh.isPickable = false; mesh.checkCollisions = false;
    mesh.alwaysSelectAsActiveMesh = true; mesh.setEnabled(false); mesh.thinInstanceCount = 0;
    this._configureTreeMaterial(mesh.material);
    return mesh;
  }

  async _loadTreeAssets() {
    const treeDefs = [
      { file: 'tree_rt_4.glb', scale: 2.05 },
    ];
    let treeCount = 0;
    try {
      const meshes = await Promise.all(treeDefs.map((d, i) => this._loadTreeAsset(d, i, 'tree')));
      const old = this.families.tree.variants;
      this.families.tree = { variants: meshes.map(mesh => ({ mesh })) };
      old.forEach(v => v.mesh.dispose());
      this.dirty.tree = true;
      treeCount = meshes.length;
    } catch (err) {
      console.warn('[RWA Vegetation] Arbres GLB indisponibles, placeholders conservés :', err);
    }
    console.log('[RWA Vegetation] Assets chargés : ' + treeCount + ' arbre GLB, buissons désactivés.');
    return treeCount === treeDefs.length;
  }
  _rockVariants(s) {
    // boulders trapus, gris froid SOMBRE, icosaèdres irréguliers (pas de pyramide/cube),
    // partiellement ENFONCÉS dans le sol (y bas), asymétriques.
    const rock = this._mat('rock', '#6b6862'); const V = [];
    const mk = (name, size, y, rot, sc) => { const r = BABYLON.MeshBuilder.CreatePolyhedron(name, { type: 1, size }, s); r.position.y = y; r.rotation.set(rot[0], rot[1], rot[2]); r.scaling.set(sc[0], sc[1], sc[2]); r.bakeCurrentTransformIntoVertices(); r.material = rock; return r; };
    V.push(mk('r0', 1.3, 0.35, [0.25, 0.6, 0.15], [1.3, 0.75, 1.05]));
    V.push(mk('r1', 1.4, 0.30, [0.5, 1.1, 0.3], [1.15, 0.7, 1.35]));
    V.push(mk('r2', 1.05, 0.30, [0.3, 0.3, 0.5], [1.1, 0.9, 0.85]));
    return V;
  }
  _bushVariants(s) {
    const g = this._mat('bushG', '#3f5f38'), w = this._mat('bushW', '#37503f');
    const cluster = (name, mat, rs) => { const parts = rs.map((r, i) => { const b = this._ico(s, name + i, r.r, r.y, mat); b.position.x = r.x; b.position.z = r.z; b.scaling.y = 0.8; return b; }); return BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, false); };
    return [
      cluster('bu0', g, [{ r: 1.0, x: 0, y: 0.7, z: 0 }, { r: 0.8, x: 0.9, y: 0.6, z: 0.3 }, { r: 0.7, x: -0.7, y: 0.6, z: -0.4 }]),
      cluster('bu1', w, [{ r: 0.9, x: 0, y: 0.6, z: 0 }, { r: 0.7, x: 0.7, y: 0.5, z: -0.5 }]),
    ];
  }
  _grassVariants(s) {
    const tex = new BABYLON.Texture('./assets/vegetation/grass/vegetation_grass_card_03.png', s, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    tex.hasAlpha = true; tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; tex.anisotropicFilteringLevel = 4;
    const grassMat = new BABYLON.StandardMaterial('veg_grass_card', s);
    grassMat.diffuseTexture = tex; grassMat.useAlphaFromDiffuseTexture = true;
    grassMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST; grassMat.alphaCutOff = 0.38;
    grassMat.diffuseColor = new BABYLON.Color3(0.72, 0.80, 0.62);
    grassMat.specularColor = new BABYLON.Color3(0, 0, 0); grassMat.backFaceCulling = false; grassMat.twoSidedLighting = true;
    const mk = (name, w, h) => {
      const g1 = BABYLON.MeshBuilder.CreatePlane(name + 'a', { width: w, height: h, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, s); g1.position.y = h / 2;
      const g2 = BABYLON.MeshBuilder.CreatePlane(name + 'b', { width: w, height: h, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, s); g2.position.y = h / 2; g2.rotation.y = Math.PI / 2;
      const m = BABYLON.Mesh.MergeMeshes([g1, g2], true, true, undefined, false, false); m.material = grassMat; return m;
    };
    return [mk('g0', 1.7, 1.3), mk('g1', 1.35, 1.0), mk('g2', 1.9, 1.5)];
  }

  _pickVariant(fam, type, h) {
    if (fam === 'tree') return 0;
    if (fam === 'rock') return Math.min(2, Math.floor(h * 3));
    if (fam === 'bush') return (type === 'WETLAND' || type === 'BARREN') ? (h < 0.7 ? 1 : 0) : (h < 0.15 ? 1 : 0);
    return Math.min(2, Math.floor(h * 3)); // grass
  }

  _buildBases() {
    const s = this.scene;
    const fam = { tree: this._treeVariants(s), rock: this._rockVariants(s), bush: this._bushVariants(s), grass: this._grassVariants(s) };
    const out = {};
    for (const k in fam) {
      const variants = fam[k].map((mesh, vi) => {
        mesh.name = 'veg_' + k + '_' + vi; mesh.isPickable = false; mesh.checkCollisions = false;
        mesh.alwaysSelectAsActiveMesh = true; mesh.setEnabled(false); mesh.thinInstanceCount = 0;
        return { mesh };
      });
      out[k] = { variants };
    }
    return out;
  }

  /* GÉNÉRATION CANONIQUE PURE d'un chunk : liste par famille de {r(rank 0..1), m(16)}.
     Ordre de tirage rng FIXE (7 woody / 6 grass par candidat) -> reproductible. */
  generateChunkData(cx, cy) {
    const rng = _mulberry32(_vegHash(this.seed, cx, cy));
    const CS = this.chunkSize, S = this.S, seed = this.seed, C = VEG_CONFIG;
    const TG = (typeof TerrainGenerator !== 'undefined') ? TerrainGenerator : window.TerrainGenerator;
    const BS = (typeof BiomeSystem !== 'undefined') ? BiomeSystem : window.BiomeSystem;
    const data = { tree: [], rock: [], bush: [], grass: [] };
    const scl = new BABYLON.Vector3(), pos = new BABYLON.Vector3(), q = new BABYLON.Quaternion();
    const M = BABYLON.Matrix.Identity();
    // --- woody : arbres / rochers / buissons ---
    for (let i = 0; i < C.candWoody; i++) {
      const rx = rng(), rz = rng(), rDens = rng(), rFam = rng(), rRot = rng(), rScl = rng(), rRank = rng();
      const x = (cx + rx) * CS, z = (cy + rz) * CS;
      const bio = BS.getBiome(x, z, seed);
      if (bio.exclude || bio.slope > C.slopeLimitDeg) continue;
      if (rDens > (C.typeProb[bio.type] || 0.5) * bio.density * C.woodyDensity) continue;
      const w = C.familyWeights[bio.type] || C.familyWeights.GRASSLAND;
      const t = rFam * (w[0] + w[1] + w[2]);
      const fam = t < w[0] ? 'tree' : (t < w[0] + w[1] ? 'rock' : 'bush');
      if (fam === 'bush') continue;
      const rg = C.scale[fam]; const sc = rg[0] + rScl * (rg[1] - rg[0]);
      // rotation via rRot (indépendante du rank)
      scl.set(sc, sc, sc); BABYLON.Quaternion.RotationYawPitchRollToRef(rRot * Math.PI * 2, 0, 0, q);
      pos.set(x * S, TG.height(x, z, seed), z * S); BABYLON.Matrix.ComposeToRef(scl, q, pos, M);
      const m = new Array(16); M.copyToArray(m, 0);
      // vi/t = métadonnées d'APPARENCE (variante) — n'affectent ni rng ni transform.
      const vi = this._pickVariant(fam, bio.type, _vegHash(seed, Math.floor(x), Math.floor(z)) / 4294967296);
      data[fam].push({ r: rRank, m, t: bio.type, vi });
    }
    // --- herbe (NEAR only) ---
    for (let i = 0; i < C.candGrass; i++) {
      const rx = rng(), rz = rng(), rDens = rng(), rScl = rng(), rRot = rng(), rRank = rng();
      const x = (cx + rx) * CS, z = (cy + rz) * CS;
      const bio = BS.getBiome(x, z, seed);
      if (bio.exclude || bio.slope > C.slopeLimitDeg) continue;
      const gp = (C.grassTypes[bio.type] || 0) * (0.4 + bio.density) * C.grassDensity;
      if (rDens > gp) continue;
      const rg = C.scale.grass; const sc = rg[0] + rScl * (rg[1] - rg[0]);
      scl.set(sc, sc, sc); BABYLON.Quaternion.RotationYawPitchRollToRef(rRot * Math.PI * 2, 0, 0, q);
      pos.set(x * S, TG.height(x, z, seed), z * S); BABYLON.Matrix.ComposeToRef(scl, q, pos, M);
      const m = new Array(16); M.copyToArray(m, 0);
      const vi = this._pickVariant('grass', bio.type, _vegHash(seed, Math.floor(x) + 7, Math.floor(z) + 13) / 4294967296);
      data.grass.push({ r: rRank, m, t: bio.type, vi });
    }
    return data;
  }

  _bandFor(dist, current) {
    const C = VEG_CONFIG, h = C.hyst;
    // hystérésis : on “monte” (plus proche) aux seuils, on “redescend” aux seuils+h
    if (current === 'NEAR') return dist <= C.nearR + h ? 'NEAR' : (dist <= C.midR + h ? 'MID' : 'FAR');
    if (current === 'MID') return dist <= C.nearR ? 'NEAR' : (dist <= C.midR + h ? 'MID' : 'FAR');
    return dist <= C.nearR ? 'NEAR' : (dist <= C.midR ? 'MID' : 'FAR');
  }

  attachToChunk(cx, cy) {
    if (!this.enabled) return;
    const k = this.key(cx, cy);
    if (this.chunks.has(k)) return;
    this.chunks.set(k, { cx, cy, band: null, data: this.generateChunkData(cx, cy) });
    this.dirty.tree = this.dirty.rock = this.dirty.bush = this.dirty.grass = true;
  }
  releaseChunk(cx, cy) {
    const k = this.key(cx, cy);
    if (!this.chunks.delete(k)) return;
    this.dirty.tree = this.dirty.rock = this.dirty.bush = this.dirty.grass = true;
  }

  /* Appelé CHAQUE FRAME : recalcule les bandes (bon marché) et ne reconstruit
     que les familles dont le contenu visible a changé (dirty flag). */
  update(playerSimX, playerSimY) {
    if (!this.enabled) return;
    const CS = this.chunkSize;
    for (const c of this.chunks.values()) {
      const ccx = (c.cx + 0.5) * CS, ccy = (c.cy + 0.5) * CS;
      const dist = Math.hypot(playerSimX - ccx, playerSimY - ccy);
      const nb = this._bandFor(dist, c.band);
      if (nb !== c.band) { c.band = nb; this.dirty.tree = this.dirty.rock = this.dirty.bush = this.dirty.grass = true; }
    }
    for (const fam of ['tree', 'rock', 'bush', 'grass']) if (this.dirty[fam]) { this._rebuild(fam); this.dirty[fam] = false; }
  }

  /* Nb d'instances rendues d'une famille dans une bande (fraction par rank). */
  _fracFor(fam, band) {
    const C = VEG_CONFIG;
    if (!C.famAllowed[band][fam]) return 0;
    let f = C.frac[band];
    return f;
  }

  _rebuild(fam) {
    this._rebuilds++;
    const variants = this.families[fam].variants;
    const buckets = variants.map(() => []);
    let total = 0;
    for (const c of this.chunks.values()) {
      const f = this._fracFor(fam, c.band); if (f <= 0) continue;
      const arr = c.data[fam];
      for (let i = 0; i < arr.length; i++) {
        const inst = arr[i];
        if (inst.r < f) { const vi = inst.vi | 0; (buckets[vi] || buckets[0]).push(inst.m); total++; }
      }
    }
    this._counts[fam] = total;
    for (let v = 0; v < variants.length; v++) {
      const mesh = variants[v].mesh, list = buckets[v];
      if (list.length === 0) { mesh.thinInstanceCount = 0; mesh.setEnabled(false); continue; }
      const buf = new Float32Array(list.length * 16); let o = 0;
      for (const m of list) { for (let j = 0; j < 16; j++) buf[o + j] = m[j]; o += 16; }
      mesh.thinInstanceSetBuffer('matrix', buf, 16, false); mesh.setEnabled(true);
    }
  }

  counts() { return Object.assign({}, this._counts); }
  renderedTotal() { return this._counts.tree + this._counts.rock + this._counts.bush + this._counts.grass; }
  activeChunks() { return this.chunks.size; }
  canonicalCount(cx, cy) { const c = this.chunks.get(this.key(cx, cy)); if (!c) return 0; return c.data.tree.length + c.data.rock.length + c.data.bush.length + c.data.grass.length; }
  bandOf(cx, cy) { const c = this.chunks.get(this.key(cx, cy)); return c ? c.band : null; }
}

if (typeof window !== 'undefined') {
  window.VegetationSystem = VegetationSystem;
  window.VEG_CONFIG = VEG_CONFIG;
}

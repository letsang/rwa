/* ============================================================
   chunks.js — WorldChunkManager (V0.4.0)

   Le monde logique est immense ; Babylon ne maintient qu'une petite
   fenêtre de terrain autour du joueur. Terrain PLAT (V0.4.0), un Ground
   Babylon indépendant par chunk. Aucun contenu procédural.

   Règle : le fort/objectif est une DONNÉE du monde (WorldDefinition).
   Le chunk est un mécanisme de RENDU/STREAMING uniquement.
   ============================================================ */

const CHUNK_SIZE = 3000;   // taille d'un chunk en unités SIM
const CHUNK_RADIUS = 2;    // rayon par défaut (5x5 = 25 chunks actifs). Configurable.

class WorldChunkManager {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.S = opts.S != null ? opts.S : RENDER_SCALE;
    this.chunkSize = opts.chunkSize || CHUNK_SIZE;
    this.radius = opts.radius != null ? opts.radius : CHUNK_RADIUS;
    this.seed = opts.seed != null ? opts.seed : WORLD_SEED;
    this.bounds = opts.bounds || WORLD_BOUNDS;
    this.showDebug = opts.showDebug !== false;   // bordures visibles par défaut

    // Nombre de chunks par axe (bornes -> refuse de générer hors zone).
    this.nx = Math.ceil((this.bounds.maxX - this.bounds.minX) / this.chunkSize);
    this.ny = Math.ceil((this.bounds.maxY - this.bounds.minY) / this.chunkSize);

    this.res = opts.res != null ? opts.res : (TERRAIN_CONFIG ? TERRAIN_CONFIG.resolution : 24); // subdivisions/chunk
    this.vegetation = opts.vegetation || null;   // système végé optionnel (V0.4.5b), branché par hooks
    this.worldvisuals = opts.worldvisuals || null;  // couche visuelle (V0.4.6a) : peinture vertex-color
    this.water = opts.water || null;                // eau (V0.4.6c) : nappes le long des rivières

    this.chunks = new Map();     // "cx,cy" -> { cx, cy, ground, border }
    this._lastKey = null;        // dernière cellule joueur (évite le recalcul chaque frame)

    // matériaux partagés (damier léger pour lisibilité debug ; culling off pour éviter
    // toute face invisible selon le winding du terrain déplacé)
    this._matA = new BABYLON.StandardMaterial('chunkA', scene);
    this._matA.diffuseColor = new BABYLON.Color3(0.13, 0.16, 0.13);
    this._matA.specularColor = new BABYLON.Color3(0, 0, 0); this._matA.backFaceCulling = false;
    this._matB = new BABYLON.StandardMaterial('chunkB', scene);
    this._matB.diffuseColor = new BABYLON.Color3(0.16, 0.19, 0.16);
    this._matB.specularColor = new BABYLON.Color3(0, 0, 0); this._matB.backFaceCulling = false;
  }

  key(cx, cy) { return cx + ',' + cy; }
  worldToChunk(simX, simY) { return { cx: Math.floor(simX / this.chunkSize), cy: Math.floor(simY / this.chunkSize) }; }
  inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.nx && cy < this.ny; }

  /* Identité déterministe d'un chunk (prépare le procédural V0.4.1). */
  chunkId(cx, cy) { return this.seed + ':' + cx + ':' + cy; }

  /* Streaming : appelé chaque frame avec la position SIM du joueur.
     Ne recalcule que lorsque le joueur change de cellule. */
  update(playerSimX, playerSimY) {
    const { cx, cy } = this.worldToChunk(playerSimX, playerSimY);
    const cellKey = this.key(cx, cy);
    if (cellKey === this._lastKey) return false;   // pas de changement de chunk
    this._lastKey = cellKey;
    this.playerChunk = { cx, cy };

    // 1) chunks requis dans le rayon (bornés au monde)
    const required = new Set();
    for (let dy = -this.radius; dy <= this.radius; dy++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (this.inBounds(nx, ny)) required.add(this.key(nx, ny));
      }
    }
    // 2) créer les manquants
    for (const k of required) if (!this.chunks.has(k)) { const [a, b] = k.split(',').map(Number); this.createChunk(a, b); }
    // 3) détruire les chunks hors rayon (garde ceux qui restent requis)
    for (const k of [...this.chunks.keys()]) if (!required.has(k)) this.disposeChunk(k);
    return true;
  }

  /* generateChunk (V0.4.1) : mesh subdivisé DÉPLACÉ par TerrainGenerator.height()
     évalué en COORDONNÉES MONDE ABSOLUES -> continuité parfaite entre chunks.
     Positions absolues en rendu + normales analytiques (cohérentes aux frontières). */
  generateChunk(cx, cy, seed) {
    const s = this.S, CS = this.chunkSize, N = this.res;
    const positions = [], indices = [], normals = [], uvs = [];
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const wsx = cx * CS + (i / N) * CS;      // coord MONDE (sim) absolue
        const wsy = cy * CS + (j / N) * CS;
        const y = TerrainGenerator.height(wsx, wsy, seed);
        positions.push(wsx * s, y, wsy * s);      // rendu absolu
        const n = TerrainGenerator.normal(wsx, wsy, seed);
        normals.push(n.x, n.y, n.z);
        uvs.push(i / N, j / N);
      }
    }
    const W = N + 1;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const mesh = new BABYLON.Mesh('chunk_' + cx + '_' + cy, this.scene);
    const vd = new BABYLON.VertexData();
    vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
    vd.applyToMesh(mesh, false);
    mesh.material = ((cx + cy) & 1) ? this._matA : this._matB;
    mesh.isPickable = true; mesh.metadata = { ground: true, chunk: this.key(cx, cy) };
    mesh.freezeWorldMatrix();
    mesh._vertCount = W * W; mesh._triCount = N * N * 2;
    return mesh;
  }

  createChunk(cx, cy) {
    if (this.chunks.has(this.key(cx, cy))) return;
    const ground = this.generateChunk(cx, cy, this.seed);
    let border = null;
    if (this.showDebug) border = this._makeBorder(cx, cy);
    if (this.worldvisuals) this.worldvisuals.paintChunk(ground, cx, cy);  // hook visuel (peinture terrain)
    this.chunks.set(this.key(cx, cy), { cx, cy, ground, border, id: this.chunkId(cx, cy) });
    if (this.vegetation) this.vegetation.attachToChunk(cx, cy);   // hook végé (streaming)
    if (this.water) this.water.attachToChunk(cx, cy);             // hook eau (streaming)
  }

  /* Bordure debug qui SUIT le terrain (échantillonne la hauteur le long des arêtes). */
  _makeBorder(cx, cy) {
    const s = this.S, CS = this.chunkSize, K = 8, pts = [];
    const at = (wsx, wsy) => new BABYLON.Vector3(wsx * s, TerrainGenerator.height(wsx, wsy, this.seed) + 0.4, wsy * s);
    for (let i = 0; i <= K; i++) pts.push(at((cx + i / K) * CS, cy * CS));         // sud
    for (let i = 0; i <= K; i++) pts.push(at((cx + 1) * CS, (cy + i / K) * CS));   // est
    for (let i = 0; i <= K; i++) pts.push(at((cx + 1 - i / K) * CS, (cy + 1) * CS)); // nord
    for (let i = 0; i <= K; i++) pts.push(at(cx * CS, (cy + 1 - i / K) * CS));     // ouest
    const b = BABYLON.MeshBuilder.CreateLines('cb_' + cx + '_' + cy, { points: pts }, this.scene);
    b.color = new BABYLON.Color3(0.3, 0.42, 0.55); b.isPickable = false;
    return b;
  }

  disposeChunk(k) {
    const c = this.chunks.get(k); if (!c) return;
    if (this.vegetation) this.vegetation.releaseChunk(c.cx, c.cy);   // hook végé (streaming)
    if (this.water) this.water.releaseChunk(c.cx, c.cy);             // hook eau (streaming)
    if (c.ground) c.ground.dispose();
    if (c.border) c.border.dispose();
    this.chunks.delete(k);
  }

  setDebug(on) {
    this.showDebug = on;
    for (const c of this.chunks.values()) {
      if (on && !c.border) { /* recréé au prochain stream */ }
      if (!on && c.border) { c.border.dispose(); c.border = null; }
    }
  }

  /* Compteurs debug */
  activeCount() { return this.chunks.size; }
  meshCount() { let n = 0; for (const c of this.chunks.values()) { if (c.ground) n++; if (c.border) n++; } return n; }
  vertexCount() { let n = 0; for (const c of this.chunks.values()) if (c.ground) n += c.ground._vertCount || 0; return n; }
  triangleCount() { let n = 0; for (const c of this.chunks.values()) if (c.ground) n += c.ground._triCount || 0; return n; }
  setWireframe(on) { this._matA.wireframe = on; this._matB.wireframe = on; if (this.worldvisuals) this.worldvisuals.setWireframe(on); }
  forceRestream() { this._lastKey = null; }
}

window.WorldChunkManager = WorldChunkManager;
window.CHUNK_SIZE = CHUNK_SIZE;
window.CHUNK_RADIUS = CHUNK_RADIUS;

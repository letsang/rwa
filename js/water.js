/* ============================================================
   water.js — Rivers & Water (V0.4.6c)

   COUCHE VISUELLE, LECTURE SEULE. Pose une surface d'eau le long de
   TERRAIN_GEO.rivers, DANS le lit déjà creusé par V0.4.4 (ne touche pas
   terrainHeight). Streaming : eau construite uniquement autour des chunks
   actifs (hooks attachToChunk/releaseChunk). COSMÉTIQUE : aucune collision.

   Gués : là où une route croise une rivière, V0.4.4 a relevé le lit -> on
   COUPE l'eau (roadPaint élevé) => le gué devient un passage à sec visible.
   ============================================================ */

const WATER_CONFIG = {
  step: 300,            // pas d'échantillonnage le long de la rivière (sim)
  halfWidth: 520,       // demi-largeur de la nappe (sim) — reste dans le lit
  rise: 5,              // hauteur d'eau au-dessus du fond du lit (rendu)
  fordCut: 0.35,        // roadPaint au-dessus duquel on coupe l'eau (gué)
  scrollSpeed: 0.015,   // vitesse de défilement des normales (mouvement subtil)
};

class WaterSystem {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.S = opts.S != null ? opts.S : RENDER_SCALE;
    this.seed = opts.seed != null ? opts.seed : WORLD_SEED;
    this.chunkSize = opts.chunkSize != null ? opts.chunkSize : CHUNK_SIZE;
    this.active = new Set();
    this.dirty = false;
    this.mesh = null;
    this._t = 0;
    this.mat = this._buildMaterial();
    this._obs = scene.onBeforeRenderObservable.add(() => this._animate());
  }
  key(cx, cy) { return cx + ',' + cy; }

  _buildMaterial() {
    const scene = this.scene, E = (typeof RWA_ENV !== 'undefined') ? RWA_ENV : { fogColor: [0.6, 0.64, 0.7] };
    const m = new BABYLON.StandardMaterial('rwaWater', scene);
    m.diffuseColor = new BABYLON.Color3(1, 1, 1);            // couleur portée par les vertex (depth tint)
    m.specularColor = new BABYLON.Color3(0.22, 0.28, 0.30);
    m.specularPower = 64;                                     // reflet modéré (glint soleil)
    m.emissiveColor = new BABYLON.Color3(0.03, 0.05, 0.06);
    m.alpha = 0.74;                                           // transparence
    m.backFaceCulling = false;
    // normal map procédurale (ondulation douce) -> mouvement subtil via UV scroll
    m.bumpTexture = this._rippleNormal();
    m.bumpTexture.level = 0.35;
    return m;
  }

  _rippleNormal() {
    const size = 128, t = new BABYLON.DynamicTexture('rwaRipple', { width: size, height: size }, this.scene, true);
    const ctx = t.getContext(), img = ctx.createImageData(size, size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const u = i / size * Math.PI * 2, v = j / size * Math.PI * 2;
      // hauteur = somme de deux ondes ; normal = gradient
      const nx = Math.cos(u * 3) * 0.5 + Math.cos(v * 2 + u) * 0.3;
      const nz = Math.cos(v * 3) * 0.5 + Math.cos(u * 2 + v) * 0.3;
      const o = (j * size + i) * 4;
      img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (nz * 0.5 + 0.5) * 255; img.data[o + 2] = 255; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); t.update();
    t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; t.uScale = t.vScale = 40; return t;
  }

  _animate() {
    if (!this.mat.bumpTexture) return;
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this._t += dt;
    this.mat.bumpTexture.uOffset = this._t * WATER_CONFIG.scrollSpeed;
    this.mat.bumpTexture.vOffset = this._t * WATER_CONFIG.scrollSpeed * 0.6;
  }

  attachToChunk(cx, cy) { this.active.add(this.key(cx, cy)); this.dirty = true; }
  releaseChunk(cx, cy) { if (this.active.delete(this.key(cx, cy))) this.dirty = true; }

  update() {
    if (!this.dirty) return; this.dirty = false; this._rebuild();
  }

  _rebuild() {
    const G = (typeof TERRAIN_GEO !== 'undefined') ? TERRAIN_GEO : window.TERRAIN_GEO;
    const TG = (typeof TerrainGenerator !== 'undefined') ? TerrainGenerator : window.TerrainGenerator;
    const rp = (typeof roadPaint !== 'undefined') ? roadPaint : window.roadPaint;
    const C = WATER_CONFIG, S = this.S, CS = this.chunkSize, seed = this.seed;
    const positions = [], indices = [], normals = [], uvs = [], colors = [];
    const shallow = [0.30, 0.44, 0.44], deep = [0.09, 0.19, 0.24];
    let vbase = 0;
    const inActive = (x, z) => this.active.has(this.key(Math.floor(x / CS), Math.floor(z / CS)));
    for (const river of G.rivers) {
      for (let s = 0; s < river.length - 1; s++) {
        const a = river[s], b = river[s + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.round(segLen / C.step));
        const dx = (b.x - a.x) / segLen, dz = (b.y - a.y) / segLen;   // direction
        const px = -dz, pz = dx;                                       // perpendiculaire
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps, t1 = (k + 1) / steps;
          const c0x = a.x + (b.x - a.x) * t0, c0z = a.y + (b.y - a.y) * t0;
          const c1x = a.x + (b.x - a.x) * t1, c1z = a.y + (b.y - a.y) * t1;
          const mx = (c0x + c1x) / 2, mz = (c0z + c1z) / 2;
          if (!inActive(mx, mz)) continue;
          if (rp(mx, mz, seed) > C.fordCut) continue;                  // GUÉ -> pas d'eau
          const hw = C.halfWidth;
          const bedY = TG.height(mx, mz, seed);
          const y = bedY + C.rise;                                     // nappe au-dessus du fond
          // CONTENANCE : n'afficher l'eau que si elle est retenue par les berges
          const bankL = TG.height(mx + px * hw * 1.25, mz + pz * hw * 1.25, seed);
          const bankR = TG.height(mx - px * hw * 1.25, mz - pz * hw * 1.25, seed);
          if (y > Math.min(bankL, bankR) + 1) continue;                // déborderait -> on saute
          // depth tint : plus sombre au plus profond, plus clair aux gués/berges
          const depth = Math.min(bankL, bankR) - bedY;
          const td = Math.max(0, Math.min(1, depth / 34));
          const cr = shallow[0] + (deep[0] - shallow[0]) * td, cg = shallow[1] + (deep[1] - shallow[1]) * td, cb = shallow[2] + (deep[2] - shallow[2]) * td;
          // 4 sommets du quad (rendu)
          positions.push((c0x - px * hw) * S, y, (c0z - pz * hw) * S);
          positions.push((c0x + px * hw) * S, y, (c0z + pz * hw) * S);
          positions.push((c1x + px * hw) * S, y, (c1z + pz * hw) * S);
          positions.push((c1x - px * hw) * S, y, (c1z - pz * hw) * S);
          for (let n = 0; n < 4; n++) { normals.push(0, 1, 0); colors.push(cr, cg, cb, 1); }
          uvs.push(c0x * 0.01, c0z * 0.01, (c0x + px * hw) * 0.01, (c0z + pz * hw) * 0.01, (c1x + px * hw) * 0.01, (c1z + pz * hw) * 0.01, c1x * 0.01, c1z * 0.01);
          indices.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
          vbase += 4;
        }
      }
    }
    if (this.mesh) { this.mesh.dispose(); this.mesh = null; }
    if (positions.length === 0) return;
    const mesh = new BABYLON.Mesh('rwaWaterMesh', this.scene);
    const vd = new BABYLON.VertexData(); vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs; vd.colors = colors;
    vd.applyToMesh(mesh, false);
    mesh.useVertexColors = true;
    mesh.material = this.mat; mesh.isPickable = false; mesh.checkCollisions = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.mesh = mesh;
  }

  meshCount() { return this.mesh ? 1 : 0; }
  quadCount() { return this.mesh ? (this.mesh.getTotalVertices() / 4) : 0; }
}

if (typeof window !== 'undefined') {
  window.WaterSystem = WaterSystem;
  window.WATER_CONFIG = WATER_CONFIG;
}

/* ============================================================
   environment.js — Sky HDRI / Fog / Lighting + palette RWA (V0.4.7)

   Couche ATMOSPHÈRE. LECTURE SEULE du monde ; ne touche ni la géographie
   ni le gameplay. Fournit une CONFIG PARTAGÉE (RWA_ENV) que le shader de
   terrain (worldvisuals.js) réutilise pour rester cohérent (mêmes lumière
   et fog que les StandardMaterials des persos/végé).

   Direction : MMORPG RvR old-school — froid, brumeux, désaturé, immense,
   légèrement mélancolique. Sobriété des effets (pas de tech-demo Babylon).
   ============================================================ */

// Palette froide/désaturée (RGB 0..1). Couleurs jamais trop pures (§26).
const RWA_ENV = {
  fogColor:   [0.60, 0.64, 0.70],   // brume bleu-gris
  skyTop:     [0.46, 0.53, 0.62],   // ciel gris-bleu (zénith)
  skyHorizon: [0.68, 0.71, 0.75],   // horizon plus clair, laiteux
  sunDir:     [-0.45, -0.82, 0.35], // lumière descendante, légèrement de côté (dir de propagation)
  sunColor:   [0.92, 0.90, 0.84],   // soleil voilé, frais
  ambUp:      [0.52, 0.57, 0.65],   // ciel (hémisphérique haut)
  ambDown:    [0.26, 0.27, 0.26],   // sol (hémisphérique bas)
  fogStart:   140,                  // unités RENDU (fog LINÉAIRE)
  fogEnd:     760,
  skySize:    800,                  // reste dans le far clip caméra (maxZ 950)
  // palette de terrain (sert à générer les textures procédurales)
  colGrass:  [0.34, 0.42, 0.26],
  colDirt:   [0.40, 0.34, 0.25],
  colRock:   [0.44, 0.44, 0.42],
  colWet:    [0.24, 0.34, 0.32],
  colRoad:   [0.40, 0.33, 0.24],
};

class Environment {
  constructor(scene, opts = {}) {
    this.scene = scene;
    const E = RWA_ENV;
    const c3 = a => new BABYLON.Color3(a[0], a[1], a[2]);

    // --- FOG atmosphérique (linéaire, froid) — profondeur, jamais un mur ---
    scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
    scene.fogColor = c3(E.fogColor);
    scene.fogStart = E.fogStart;
    scene.fogEnd = E.fogEnd;
    scene.clearColor = new BABYLON.Color4(E.skyHorizon[0], E.skyHorizon[1], E.skyHorizon[2], 1);

    // --- LIGHTING : hémisphérique (ambiance ciel/sol) + directionnel doux ---
    // Hémisphérique un peu plus fort + sol moins noir -> personnages/végé lisibles
    // (le terrain a son PROPRE shader calé sur RWA_ENV, non affecté).
    this.hemi = new BABYLON.HemisphericLight('rwaHemi', new BABYLON.Vector3(0, 1, 0), scene);
    this.hemi.diffuse = new BABYLON.Color3(0.72, 0.75, 0.80);
    this.hemi.groundColor = new BABYLON.Color3(0.34, 0.36, 0.38);
    this.hemi.intensity = 1.08;
    this.sun = new BABYLON.DirectionalLight('rwaSun', new BABYLON.Vector3(E.sunDir[0], E.sunDir[1], E.sunDir[2]), scene);
    this.sun.diffuse = c3(E.sunColor);
    this.sun.specular = new BABYLON.Color3(0.05, 0.05, 0.05);
    this.sun.intensity = 1.0;

    // --- SKY : gradient de secours, remplacé par le HDRI CC0 après chargement. ---
    this._buildSkyDome();
    this._buildHDRISky();

    // --- IMAGE PROCESSING : finition légère (pas pour cacher un mauvais matériau) ---
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.contrast = 1.06;
    ip.exposure = 1.0;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 2.2;
    ip.vignetteColor = new BABYLON.Color4(0.05, 0.06, 0.09, 0);

    // --- LANDMARKS (V0.4.6f) : orientation + identité de royaume, déterministes ---
    this.buildLandmarks();
  }

  _stoneMat(name, a) { const m = new BABYLON.StandardMaterial('lm_' + name, this.scene); m.diffuseColor = new BABYLON.Color3(a[0], a[1], a[2]); m.specularColor = new BABYLON.Color3(0.03, 0.03, 0.03); return m; }

  /* Landmarks statiques (peu nombreux, grands, visibles de loin). Placement
     DÉTERMINISTE aux approches de royaume, crêtes d'arêtes et centre. LECTURE SEULE. */
  buildLandmarks() {
    const scene = this.scene, S = (typeof RENDER_SCALE !== 'undefined') ? RENDER_SCALE : 0.08;
    const TG = (typeof TerrainGenerator !== 'undefined') ? TerrainGenerator : window.TerrainGenerator;
    const G = (typeof TERRAIN_GEO !== 'undefined') ? TERRAIN_GEO : window.TERRAIN_GEO;
    const seed = (typeof WORLD_SEED !== 'undefined') ? WORLD_SEED : 1337;
    if (!TG || !G) return;
    const light = this._stoneMat('light', [0.55, 0.54, 0.51]);
    const dry = this._stoneMat('dry', [0.60, 0.55, 0.46]);
    const dark = this._stoneMat('dark', [0.33, 0.33, 0.36]);
    const grey = this._stoneMat('grey', [0.48, 0.47, 0.44]);
    const place = (mesh, sx, sz) => { const y = TG.height(sx, sz, seed); mesh.position.set(sx * S, y, sz * S); mesh.isPickable = false; mesh.getChildMeshes().forEach(c => c.isPickable = false); };
    const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

    // menhirs (Nord/CENTER) : cercle de pierres claires + autel
    const menhirCircle = () => {
      const root = new BABYLON.TransformNode('lmMenhir', scene); const parts = [];
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, R = 36;
        const st = BABYLON.MeshBuilder.CreateBox('mh' + i, { width: 6, height: 26 + (i % 2) * 6, depth: 4 }, scene);
        st.position.set(Math.cos(a) * R, 13, Math.sin(a) * R); st.rotation.y = a; st.rotation.z = (i % 2 ? 0.06 : -0.05); st.material = light; st.parent = root; parts.push(st);
      }
      const altar = BABYLON.MeshBuilder.CreateBox('mhA', { width: 12, height: 5, depth: 8 }, scene); altar.position.y = 2.5; altar.material = light; altar.parent = root;
      return root;
    };
    // obélisque (Est/EAST) : flèche minérale + socle
    const obelisk = () => {
      const root = new BABYLON.TransformNode('lmObelisk', scene);
      const base = BABYLON.MeshBuilder.CreateBox('obB', { width: 14, height: 6, depth: 14 }, scene); base.position.y = 3; base.material = dry; base.parent = root;
      const shaft = BABYLON.MeshBuilder.CreateCylinder('obS', { height: 50, diameterTop: 3, diameterBottom: 9, tessellation: 4 }, scene); shaft.position.y = 31; shaft.rotation.y = Math.PI / 4; shaft.material = dry; shaft.parent = root;
      const cap = BABYLON.MeshBuilder.CreateCylinder('obC', { height: 6, diameterTop: 0, diameterBottom: 4, tessellation: 4 }, scene); cap.position.y = 59; cap.rotation.y = Math.PI / 4; cap.material = dry; cap.parent = root;
      return root;
    };
    // tour brisée (Ouest/WEST) : ruine sombre
    const brokenTower = () => {
      const root = new BABYLON.TransformNode('lmTower', scene);
      const body = BABYLON.MeshBuilder.CreateCylinder('twB', { height: 42, diameter: 22, tessellation: 10 }, scene); body.position.y = 21; body.material = dark; body.parent = root;
      // sommet ébréché : quelques créneaux irréguliers
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const cr = BABYLON.MeshBuilder.CreateBox('twc' + i, { width: 5, height: 6 + (i % 3) * 4, depth: 5 }, scene); cr.position.set(Math.cos(a) * 9, 42 + (i % 3) * 2, Math.sin(a) * 9); cr.material = dark; cr.parent = root; }
      return root;
    };
    // formation rocheuse (crêtes) : polyèdres empilés
    const rockForm = (mat) => {
      const root = new BABYLON.TransformNode('lmRock', scene);
      const heights = [[0, 10, 18], [8, 22, 12], [-6, 30, 10], [4, 40, 7]];
      for (let i = 0; i < heights.length; i++) { const h = heights[i]; const r = BABYLON.MeshBuilder.CreatePolyhedron('rk' + i, { type: 1, size: h[2] }, scene); r.position.set(h[0], h[1], (i % 2 ? 5 : -4)); r.rotation.y = i * 0.7; r.material = mat; r.parent = root; }
      return root;
    };

    // --- placements ---
    const c = G.center;
    // approches de royaume (entre spawn et centre)
    const centN = lerp(G.realms.CENTER.spawn, c, 0.48); place(menhirCircle(), centN.x, centN.y);
    const centE = lerp(G.realms.EAST.spawn, c, 0.48); place(obelisk(), centE.x, centE.y);
    const centW = lerp(G.realms.WEST.spawn, c, 0.48); place(brokenTower(), centW.x, centW.y);
    // repère central : décalé du centre exact pour laisser la WARZONE lisible/dégagée
    const monoX = c.x + 2600, monoZ = c.y - 2600;
    const mono = BABYLON.MeshBuilder.CreateCylinder('lmCenter', { height: 46, diameterTop: 2, diameterBottom: 7, tessellation: 5 }, scene);
    mono.material = grey; place(mono, monoX, monoZ); mono.position.y += 23;
    // crêtes d'arêtes : formations rocheuses (orientation à l'horizon)
    if (G.ridges) G.ridges.forEach((R, i) => {
      const px = c.x + R.cx * 15000, pz = c.y + R.sy * 15000;
      if (px > 1500 && px < 48500 && pz > 1500 && pz < 48500) place(rockForm(grey), px, pz);
    });
    this._landmarksBuilt = true;
  }

  _buildSkyDome() {
    const scene = this.scene, E = RWA_ENV;
    const dome = BABYLON.MeshBuilder.CreateSphere('rwaSky', { diameter: E.skySize, segments: 16, sideOrientation: BABYLON.Mesh.BACKSIDE }, scene);
    dome.infiniteDistance = true;        // suit la caméra -> ciel “à l'infini”
    dome.isPickable = false;
    dome.applyFog = false;
    // gradient vertical par couleurs de vertex (zénith -> horizon)
    const pos = dome.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const n = pos.length / 3, col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const y = pos[i * 3 + 1];
      const t = Math.max(0, Math.min(1, (y / (E.skySize * 0.5)) * 0.5 + 0.5)); // -1..1 -> 0..1
      const up = E.skyTop, ho = E.skyHorizon;
      const k = Math.pow(t, 0.75);
      col[i * 4] = ho[0] + (up[0] - ho[0]) * k;
      col[i * 4 + 1] = ho[1] + (up[1] - ho[1]) * k;
      col[i * 4 + 2] = ho[2] + (up[2] - ho[2]) * k;
      col[i * 4 + 3] = 1;
    }
    dome.setVerticesData(BABYLON.VertexBuffer.ColorKind, col, false);
    dome.useVertexColors = true;
    const m = new BABYLON.StandardMaterial('rwaSkyMat', scene);
    m.backFaceCulling = false;
    m.disableLighting = true;                 // le ciel s'éclaire lui-même
    m.emissiveColor = new BABYLON.Color3(1, 1, 1);
    m.diffuseColor = new BABYLON.Color3(0, 0, 0);
    m.specularColor = new BABYLON.Color3(0, 0, 0);
    dome.material = m;
    this.skyDome = dome;
  }

  _buildHDRISky() {
    if (!BABYLON.HDRCubeTexture) return;
    const scene = this.scene;
    const hdri = new BABYLON.HDRCubeTexture('./assets/environment/golden_gate_hills_1k.hdr', scene, 256, false, true, false, true);
    hdri.name = 'rwaGoldenGateHillsHDR';
    scene.environmentTexture = hdri;
    scene.environmentIntensity = 0.62;

    const sky = BABYLON.MeshBuilder.CreateBox('rwaHDRSky', { size: RWA_ENV.skySize }, scene);
    sky.infiniteDistance = true; sky.isPickable = false; sky.applyFog = false;
    const skyTex = hdri.clone();
    skyTex.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
    skyTex.level = 0.82;
    const mat = new BABYLON.StandardMaterial('rwaHDRSkyMat', scene);
    mat.backFaceCulling = false; mat.disableLighting = true;
    mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    mat.reflectionTexture = skyTex;
    sky.material = mat; sky.setEnabled(false);

    // Le dôme froid reste visible pendant le chargement et sert de fallback offline.
    hdri.onLoadObservable.addOnce(() => {
      sky.setEnabled(true);
      if (this.skyDome) this.skyDome.setEnabled(false);
    });
    this.hdri = hdri; this.hdriSky = sky;
  }
}

if (typeof window !== 'undefined') {
  window.Environment = Environment;
  window.RWA_ENV = RWA_ENV;
}

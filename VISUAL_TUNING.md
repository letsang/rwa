# Visual Tuning Panel — V1

Outil de développement live pour calibrer l'atmosphère Babylon.js sans modifier
la simulation, la génération canonique, les chunks, les biomes, les coordonnées,
les personnages ou le gameplay. `WORLD_SIZE = 50000` reste inchangé.

## Utilisation

1. Lancer une partie et attendre la fin du chargement.
2. Appuyer sur `F8` pour afficher ou masquer le panneau.
3. Déplier les sections et déplacer les sliders : l'effet est appliqué immédiatement.
4. Choisir `CURRENT`, `NEUTRAL`, `FOGGY`, `OVERCAST` ou `DARK` pour comparer.
5. Cliquer sur `RESET CURRENT` pour restaurer exactement la baseline capturée au
   démarrage de la scène.
6. Cliquer sur `SAVE PRESET`, saisir un nom tel que `VISUAL_FINAL_01` et valider.
   Le preset est enregistré dans le stockage local du navigateur sous
   `rwa-visual-presets-v1`.
7. Cliquer sur `COPY SETTINGS` pour copier le JSON actif dans le presse-papiers.
   Ce JSON peut ensuite servir à une demande `FREEZE VISUAL PRESET`.

Le rendu par défaut ne dépend jamais du panneau. Aucun preset sauvegardé n'est
chargé automatiquement au lancement.
`F8` est réservé à cet outil DEV et n'est pas réaffectable dans les key bindings.

## Référence visuelle active

La baseline `CURRENT` est figée avec la calibration validée : fog linéaire
50–100 (`#969696`), saturation 1, contraste 1.2, exposition 1, lumière
directionnelle 1.3 (`#dedede`), ambiance 1.5 (`#646464`), environnement 0.2,
grain 0.2, sans sharpen ni vignette, et ombre de contact à 0.5.

## Paramètres réellement exposés

| Section | Contrôle | Propriété Babylon / runtime |
| --- | --- | --- |
| Atmosphere | Fog Start | `scene.fogStart` + uniform terrain `fogRange.x` |
| Atmosphere | Fog End | `scene.fogEnd` + uniform terrain `fogRange.y` |
| Atmosphere | Fog Color | `scene.fogColor` + uniform terrain `fogColor` |
| Atmosphere | Saturation | `ColorCurves.globalSaturation`, activé uniquement hors valeur neutre |
| Atmosphere | Contrast | `scene.imageProcessingConfiguration.contrast` |
| Atmosphere | Exposure | `scene.imageProcessingConfiguration.exposure` |
| Lighting | Directional Intensity | `Environment.sun.intensity` + uniform terrain `sunIntensity` |
| Lighting | Ambient Intensity | `Environment.hemi.intensity` + uniform terrain `ambIntensity` |
| Lighting | Environment Intensity | `scene.environmentIntensity` |
| Lighting | Directional Color | `Environment.sun.diffuse` + uniform terrain `sunColor` |
| Lighting | Ambient Color | `Environment.hemi.diffuse` + adaptation relative de `ambUp/ambDown` |
| Shadows | Contact Shadow Opacity | alpha du matériau de l'ombre blob existante du joueur |
| Post Process | Sharpen | `DefaultRenderingPipeline.sharpen.edgeAmount` |
| Post Process | Vignette Intensity | `imageProcessingConfiguration.vignetteWeight` |
| Post Process | Grain Intensity | `DefaultRenderingPipeline.grain.intensity` (échelle Babylon 0–50) |

Le pipeline post-process unique est créé à la demande lorsque Sharpen ou Grain
devient non nul. Il est supprimé lorsque les deux valeurs reviennent à zéro,
notamment avec `RESET CURRENT`. Aucun bloom n'est activé.

## Paramètres volontairement absents

- `Fog Density` : le jeu utilise `FOGMODE_LINEAR`; Babylon n'emploie que Start/End
  dans ce mode.
- Shadow darkness, bias, normalBias et filtering : aucun `ShadowGenerator` n'est
  actif. Le jeu utilise une ombre de contact blob, dont seule l'opacité est réelle.
- Brightness/saturation par surface terrain : le shader ne possède pas encore de
  coefficients runtime dédiés. Aucun contrôle artificiel ni rebuild n'a été ajouté.
- Grass wind, vegetation sway et particules atmosphériques : ces systèmes ne sont
  pas présents dans l'implémentation actuelle.

## Performance et invariants

- aucun polling ni travail par frame dans `visualtuning.js` ;
- application uniquement sur événement `input`, changement de preset ou reset ;
- aucune lumière, texture ou matériau recréé par les sliders ;
- aucun vertex, heightmap, biome, rivière, route ou chunk recalculé ;
- synchronisation terrain limitée à sept uniforms de shader ;
- panneau masqué : un listener clavier F8 et aucun autre coût régulier ;
- pipeline Sharpen/Grain absent tant que ses deux contrôles valent zéro.

## Validation automatisée

```text
node tests/environment-tuning.test.js
node tests/visualtuning.test.js
```

Les tests couvrent les propriétés Babylon pilotées, les uniforms terrain, F8,
les presets, RESET, SAVE PRESET et COPY SETTINGS.

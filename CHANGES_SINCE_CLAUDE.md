# Modifications depuis la dernière version de Claude

Cette note décrit exclusivement les changements réalisés par Codex à partir de l'état
du projet trouvé le 19 août 2026 dans `realm-warfare-v0.3.1-light`.

## État de référence laissé par Claude

La version de départ disposait déjà des éléments suivants :

- simulation de combat, bots, compétences, capture territoriale et minimap ;
- monde V0.4.0 de 50 000 unités et renderer terrain par chunks ;
- génération canonique du terrain, biomes, eau, environnement et végétation procédurale ;
- caméra troisième personne et vue tactique ;
- matrice canonique royaume → race → classe ;
- neuf personnages GLB et bibliothèque d'animations Manny ;
- menu unique réunissant royaume, race et classe ;
- aucun système audio intégré ;
- aucun écran-titre cinématique ;
- aucun dépôt Git dans le dossier de travail local.

Les nouveaux assets présents dans `C:\RWA\assets-incoming` n'ont pas été intégrés
au terrain pendant cette passe. Ils restent réservés au prochain Visual Quality Pass.

## Changements réalisés par Codex

### 1. Nouveau parcours d'ouverture

Le menu unique a été remplacé par une séquence en plusieurs écrans :

1. écran-titre cinématique ;
2. choix du royaume dans un triptyque Nord / Ouest / Est ;
3. choix de la race, filtré par le royaume ;
4. choix de la classe, filtré par la race ;
5. écran de chargement ;
6. entrée dans le jeu.

La matrice existante `FACTION_RACES` / `RACE_CLASSES` reste la source canonique.
Aucune combinaison royaume/race/classe n'a été ajoutée ou supprimée.

Fichiers concernés :

- `index.html` : nouvelle structure des écrans et de la fenêtre Options ;
- `style.css` : identité visuelle cinématique, triptyque, création du personnage,
  fenêtre Options, écran de chargement et responsive mobile ;
- `js/game3d.js` : orchestration du nouveau parcours avant `Game3D.start()`.

### 2. Illustration d'ouverture

L'image fournie par l'utilisateur a été intégrée sous :

- `assets/ui/title-background.png`

Elle sert à l'écran-titre et aux trois volets du choix de royaume. Des cadrages,
dégradés et teintes différents distinguent chaque volet sans générer d'autres images.

### 3. Typographies

Les quatre polices fournies dans `C:\RWA\fonts-incoming` ont été copiées sous
`assets/fonts/` et déclarées avec `@font-face` :

- Minion Pro Regular ;
- Minion Pro Bold ;
- Myriad Pro Regular ;
- Myriad Pro Semibold.

Minion Pro est utilisée pour les titres et l'identité médiévale. Myriad Pro est
utilisée pour l'interface, les boutons, les informations de jeu, le HUD de debug et
l'ancien renderer Canvas. Aucune déclaration active ne demande encore Segoe UI,
Consolas, Courier New ou une famille générique seule.

### 4. Nouveau système audio

Le fichier `js/audio.js` a été créé. Il contient `RWAudioManager`, chargé avant
`game3d.js`.

Fonctionnalités ajoutées :

- tentative de lecture de `title.mp3` sur l'écran-titre, avec reprise au premier
  geste utilisateur lorsque l'autoplay du navigateur est bloqué ;
- lecture de `play.mp3` au clic sur Jouer ;
- lecture de `midplay.mp3` lors de l'entrée effective dans le jeu ;
- démarrage automatique de l'ambiance du royaume après `midplay` ;
- playlists aléatoires sans répétition immédiate ;
- volume général, musique, effets et mute ;
- sauvegarde locale des réglages dans la clé `localStorage` `rwa-audio`.

Répartition des ambiances intégrées :

- royaume Est : 15 segments ;
- royaume du Nord (faction moteur `CENTER`) : 44 segments ;
- royaume Ouest : 100 segments ;
- total : 159 segments d'ambiance.

Les 16 sons de `assets/audio/Zone/` sont utilisés comme effets de proximité des
forts. Un son est choisi aléatoirement à l'entrée dans un rayon de 1 500 unités de
simulation autour d'un fort ou de la forteresse neutre. Une temporisation globale de
30 secondes empêche les déclenchements rapprochés. Rester à l'intérieur d'une zone
ne relance pas continuellement le son : il faut entrer dans une nouvelle zone.

### 5. Assets audio intégrés

Les dossiers suivants ont été copiés dans le build offline :

- `assets/audio/Intro/` : 3 fichiers ;
- `assets/audio/Ambient/` : 159 fichiers ;
- `assets/audio/Zone/` : 16 fichiers.

Le jeu ne dépend d'aucun service audio externe.

### 6. Options

Le bouton Options ouvre une fenêtre modale contenant :

- volume général, valeur par défaut 80 % ;
- volume musique, valeur par défaut 65 % ;
- volume effets, valeur par défaut 80 % ;
- bouton couper/réactiver le son.

La fenêtre se ferme par son bouton, un clic sur l'arrière-plan ou la touche Échap.

### 7. Intégration dans la boucle de jeu

`Game3D` possède maintenant une instance de `RWAudioManager`.

La boucle `Game3D.update()` appelle `updateWorldAudio(player)` afin de détecter
l'approche des objectifs. Cette lecture est uniquement observationnelle : elle ne
modifie ni la position, ni les captures, ni l'IA, ni les combats.

Un verrou `started` empêche également un double lancement accidentel du moteur 3D.

### 8. Publication GitHub

Le dossier de travail de Claude n'étant pas un dépôt Git, le dépôt existant
`letsang/rwa` a été cloné séparément dans `C:\RWA\rwa-git`.

Éléments ajoutés pour la publication :

- branche `agent/cinematic-opening-audio` ;
- commit initial de cette passe : `5383dbf` ;
- pull request brouillon : https://github.com/letsang/rwa/pull/1 ;
- `.gitattributes` pour stocker les assets binaires avec Git LFS.

Les deux fichiers préexistants du dépôt distant, consacrés au pipeline d'auto-rig,
n'ont pas été modifiés.

## Éléments volontairement non modifiés

Cette passe ne change pas :

- `js/terrain.js` et la génération canonique du terrain ;
- l'architecture du renderer par chunks ;
- le LOD et le streaming ;
- les biomes ;
- le placement canonique des objectifs ;
- les statistiques, hitboxes, vitesses et portées ;
- le système de combat ;
- l'IA des bots ;
- la logique de capture ;
- la matrice royaume/race/classe ;
- le retargeting Manny et les clips d'animation.

Il n'y a eu aucune migration vers DynamicTerrain, Ring LOD ou clipmap.

## Vérifications effectuées

- vérification syntaxique de tous les fichiers JavaScript avec `node --check` ;
- contrôle de l'unicité des identifiants HTML ;
- contrôle de l'équilibre des accolades CSS ;
- vérification des 178 références audio runtime : aucun fichier manquant ;
- vérification HTTP 200 pour les fichiers principaux, l'image, les polices et un
  échantillon de chaque famille audio ;
- contrôle Git LFS : 213 assets binaires indexés.

La validation visuelle automatisée dans le navigateur intégré n'a pas pu démarrer à
cause d'une restriction Windows sur le runtime du navigateur. Les vérifications
statiques et HTTP ont néanmoins toutes réussi.

## Visual Quality Pass CC0 — terrain, ciel et végétation

Ajouts postérieurs à la première passe Codex :

- remplacement des quatre textures procédurales du shader terrain par 12 cartes
  Poly Haven CC0 : albedo, normal et roughness pour grass/dirt/rock/mud ;
- conservation des masques vertex, des routes, du blending biome et de l'anti-tiling ;
- ajout du HDRI Golden Gate Hills CC0 comme ciel et environnement de réflexion,
  avec l'ancien dôme gradient conservé uniquement comme fallback de chargement ;
- remplacement des cartes d'herbe unies par la texture alpha CC0 OpenGameArt ;
- chargement asynchrone de huit arbres GLB du Retro Tree Pack, puis remplacement
  des placeholders sans changer les transforms, positions, rangs ou bandes LOD ;
- ajout de `assets/SOURCES.txt` et d'une notice locale transparente pour le pack
  d'arbres, dont l'archive fournie ne contenait pas de licence autonome.

## Simplification du HUD en jeu

La surcouche de jeu a été allégée sans modifier les systèmes correspondants :

- suppression de la bulle permanente indiquant le mode de caméra ;
- suppression du panneau central « Guerre en cours » ;
- suppression de la minimap et de son rendu Canvas à chaque mise à jour ;
- déplacement du panneau de performances et de diagnostic dans l'ancien
  emplacement de la minimap, en haut à droite ;
- déplacement du panneau du personnage (PV et ressource) en haut à gauche,
  tout en conservant la barre de compétences centrée en bas ;
- placement du panneau de cible sous celui du personnage pour éviter tout
  chevauchement ;
- augmentation de la transparence des fonds du HUD : panneaux principaux,
  diagnostic, notifications et cases de compétences ;
- conservation de la touche `V` pour changer de caméra et de la notification
  temporaire associée ;
- conservation de `F3` pour changer le niveau d'affichage du diagnostic.

Cette modification concerne uniquement la présentation du HUD. La logique de
caméra, de contrôle territorial et de simulation reste active.

## Correction du terrain blanc

L'audit visuel a révélé que les cartes Poly Haven avaient été affectées aux
mauvais slots lors de leur première intégration : les fichiers utilisés comme
normales étaient en réalité les diffuses colorées, tandis que les albedos runtime
étaient des cartes en niveaux de gris. Le shader ne pouvait donc produire qu'un
terrain gris-blanc.

La correction comprend :

- remplacement des 12 cartes par les variantes officielles Poly Haven 1K :
  Diffuse, Normal OpenGL et Roughness pour grass/dirt/rock/mud ;
- validation MD5 de chaque fichier contre l'API officielle Poly Haven ;
- ajout des quatre URL sources précises dans `assets/SOURCES.txt` ;
- réduction de la modulation macro qui surexposait les pixels clairs ;
- plafonnement du cumul ambiance + soleil pour éviter le clipping blanc ;
- diminution de la force des normal maps pour un relief plus naturel.

La peinture des poids, les biomes, les routes, la génération canonique et le
renderer par chunks ne sont pas modifiés.

## Prochaine passe recommandée

- valider visuellement les échelles et l'orientation des huit arbres sur plusieurs biomes ;
- ajuster le tiling, la force des normales et la roughness après comparaison en jeu ;
- intégrer les rochers et buissons correctement licenciés encore en attente ;
- conserver la génération, les biomes et le LOD existants ;
- garder DynamicTerrain / Ring LOD en roadmap uniquement jusqu'à ce qu'un besoin
  mesuré justifie un prototype.

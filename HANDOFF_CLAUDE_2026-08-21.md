# RWA — Passation à Claude et roadmap

**Date de référence :** 21 août 2026
**Projet :** Realm Warfare Arena (RWA)
**Dépôt local :** `C:\RWA\rwa-git`
**Branche :** `main`
**HEAD au moment de la passation :** `1e043d4` — `Update calibrated visual baseline`
**Build affiché dans le jeu :** `V0.4.7`

Ce document décrit l’état réel du projet à la fin de la session Codex, y compris
les changements présents dans le worktree mais pas encore commités. Il doit être
lu avant toute modification.

## 1. Consigne critique sur l’état Git

Le dépôt contient un ensemble important de modifications locales appartenant au
projet. Elles ne doivent pas être annulées, écrasées ou remplacées par la version
de `origin/main`.

À ne pas faire :

- ne pas lancer `git reset --hard` ;
- ne pas restaurer globalement les fichiers avec `git checkout --` ou
  `git restore .` ;
- ne pas supprimer les fichiers non suivis sans validation du propriétaire ;
- ne pas écraser les changements existants de `game3d.js`, `style.css`,
  `index.html`, des assets ou de la documentation ;
- ne pas lancer une normalisation Git LFS globale avant d’avoir compris les
  fichiers locaux concernés.

État de référence : `main` et `origin/main` pointent tous deux vers `1e043d4`,
mais le worktree contient la suite du développement. Les changements devront être
audités puis commités par lots fonctionnels cohérents.

Un appel à `git diff --stat` a rencontré une erreur du filtre Git LFS sur
`.git/lfs/tmp` (`Access is denied`). `git status`, les diffs ciblés sur les fichiers
texte et les tests Node fonctionnent. Ne pas interpréter cette erreur LFS comme un
fichier à supprimer.

## 2. Vision actuelle du jeu

RWA est un prototype MMOBA/RvR 3D jouable hors ligne dans le navigateur avec
Babylon.js. Le joueur choisit un royaume, une race et une classe, puis rejoint un
monde ouvert déterministe où des groupes alliés et ennemis combattent et capturent
des objectifs.

La direction actuelle privilégie :

- un monde vaste mais lisible grâce au fog et au streaming par chunks ;
- une esthétique dark fantasy / MMORPG classique ;
- un combat immédiatement visible près du point d’arrivée ;
- une interface en jeu minimale ;
- des systèmes déclaratifs conservant la simulation, les classes et le combat
  indépendants de la couche visuelle ;
- un fonctionnement local et offline.

## 3. État fonctionnel actuel

### 3.1 Parcours d’ouverture et création du personnage

- Écran-titre illustré avec zones `JOUER` et `OPTIONS` interactives.
- Choix du royaume sous forme de triptyque Ouest–Nord–Est.
- Neuf races réparties entre les trois royaumes.
- Huit classes disponibles selon les matrices de compatibilité.
- Écran de création plein écran avec modèle 3D central, description à gauche et
  choix race/classe à droite.
- Aperçu Babylon animé et libéré avant l’entrée en jeu.
- Écran de chargement illustré avec préchargement des éléments visibles.
- Playlist d’introduction pendant les menus, puis musique de jeu après le
  chargement.

### 3.2 Monde et environnement

- Monde canonique déterministe de `50 000 × 50 000` unités de simulation.
- Échelle rendu `S = 0.08` conservée.
- Terrain généré par chunks, topographie RvR, biomes, routes, rivières et zones
  de guerre.
- Matériau terrain multi-surfaces : herbe, terre, roche et boue.
- Textures PBR 1K avec albedo, normal OpenGL et roughness.
- Shader avec UV monde, blending par poids et anti-tiling.
- HDRI Kloofendal, fog linéaire et éclairage partagé avec le shader terrain.
- Eau rendue dans les lits de rivière et aux gués.
- Végétation chunkée et LOD, avec arbres GLB du Retro Tree Pack.
- Buissons actuellement désactivés ; rochers/buissons définitifs encore à
  intégrer ou valider.

### 3.3 Personnages, animations et équipement

- Chargement d’un modèle GLB par race avec fallback placeholder.
- Détection du rig Manny et utilisation de la RWA Animation Library.
- États minimaux : `Idle`, `Jog_F`, `Attack_01`.
- Déclenchement de l’attaque sur une frappe réellement résolue, plus en boucle
  continue lorsque la cible est simplement à portée.
- Feedback d’impact : réaction du modèle, flash mêlée/magie, éclats de mort,
  secousse caméra et son synthétisé.
- Prototype d’équipement rigide ajouté dans `visual.js`.
- `helmet2.glb` est équipé uniquement sur le joueur Troll.
- Outil DEV `F9` dans `equipmenttuning.js` pour régler position, rotation et
  échelle du casque en direct.
- `helmet1.glb` est archivé et n’est pas utilisé au runtime.

### 3.4 Combat, classes et IA

- Huit classes : Guardian, Berserker, Sorcerer, Mage, Cleric, Skald, Ranger,
  Rogue.
- Chaque classe possède quatre compétences et une compétence de royaume.
- Combat piloté par données dans `data.js`, exécuté génériquement dans
  `combat.js`.
- CC, soins, dégâts, coûts, cooldowns, effets, positions et portées sont actifs.
- BotAI réutilisée sans seconde simulation parallèle.
- Événement de feedback centralisé après chaque dégât réellement appliqué.

### 3.5 Battlefield Prototype et boucle de front

Les fichiers `js/battlefield.js` et `tests/battlefield.test.js` sont présents dans
le worktree mais ne sont pas encore commités.

- Deux escouades de quatre bots sont placées près du spawn du joueur.
- L’escarmouche est positionnée sur l’axe menant du fort du joueur vers le front.
- La caméra initiale regarde cette bataille.
- Les bots reprennent immédiatement la BotAI normale.
- Après une mort et le respawn canonique, les membres regagnent leur slot de
  bataille et reprennent une cible.
- Le compteur de renforts est exposé dans le diagnostic `F3`.

Ce système est volontairement un prototype de mise en scène : il ne doit pas
devenir une IA ou une règle de combat parallèle.

### 3.6 Visual Interest Management

Les fichiers `js/interest.js` et `tests/interest.test.js` sont présents dans le
worktree mais ne sont pas encore commités.

- La simulation de toutes les entités reste globale.
- Le rendu, les plaques et les animations sont suspendus pour les entités hors
  intérêt visuel.
- Le rayon d’intérêt est dérivé de `scene.fogEnd`, converti avec `S = 0.08` et
  une marge de transition.
- Le rayon réagit aux réglages live du panneau visuel `F8`.
- Le diagnostic `F3` affiche `INTEREST n/total` et le rayon courant.

Cette première version est un filtre visuel linéaire. Un index spatial ne sera
utile que si les mesures montrent que le parcours de toutes les entités devient
un coût réel.

### 3.7 HUD et contrôles

La dernière direction validée est une interface en jeu très légère.

- Les panneaux permanents de joueur, cible, minimap et mode caméra ont été
  supprimés.
- Les plaques au-dessus des personnages portent l’information de combat utile.
- Le diagnostic est masqué par défaut et se contrôle avec `F3`.
- Le panneau visuel DEV se contrôle avec `F8`.
- Le panneau casque DEV se contrôle avec `F9`.

Nouvelle barre de compétences :

- asset runtime : `assets/ui/skillbar-frame.png` ;
- style MMORPG médiéval sombre inspiré d’une barre fournie par le propriétaire ;
- cinq slots identiques ;
- quatre compétences de classe dans les slots 1 à 4 ;
- compétence de royaume dans le cinquième slot ;
- cooldowns, indisponibilité de ressource, libellés de touche et clic conservés ;
- barre complète réduite à 50 % avec une transformation CSS uniforme ;
- Sprint n’apparaît plus dans la barre mais reste bindé au clavier ;
- Sprint est assigné à `Maj` par défaut et reste configurable dans Options ;
- Purge est retiré de la barre, de la liste des raccourcis et des commandes
  joueur pour le moment.

Important : la structure de données et l’exécution générique de Purge existent
encore dans `data.js`, `effects.js` et `combat.js`. Cela permet une réactivation
future sans recréer le système. Ne pas le remettre dans les commandes joueur sans
une décision explicite du propriétaire.

Contrôles joueur actuels :

| Action | Touche par défaut |
| --- | --- |
| Déplacement | Z/W, Q/A, S, D |
| Cibler l’ennemi proche | C |
| Sauter | Espace |
| Stick / suivre la cible | F |
| Changer de caméra | V |
| Compétences de classe | 1 à 4 |
| Compétence de royaume | R |
| Sprint | Maj |
| Diagnostic | F3 |
| Visual Tuning DEV | F8 |
| Equipment Tuning DEV | F9 |

### 3.8 Outils de tuning

`Visual Tuning Panel V1` :

- accessible avec `F8` ;
- pilote fog, color grading, lumières, HDRI, ombre blob et post-process ;
- presets `CURRENT`, `NEUTRAL`, `FOGGY`, `OVERCAST`, `DARK` ;
- sauvegarde locale, copie JSON et reset de la baseline ;
- aucun polling permanent ;
- documentation détaillée dans `VISUAL_TUNING.md`.

`Equipment Tuning` :

- accessible avec `F9` ;
- prototype limité au casque du joueur Troll ;
- valeurs sauvegardées dans le stockage local ;
- copie des valeurs et reset disponibles.

## 4. Assets et provenance

`assets/SOURCES.txt` contient les sources et conditions connues des textures,
du HDRI, de l’herbe, des arbres et des casques Meshy.

Points à résoudre avant une publication publique :

- confirmer le plan Meshy utilisé pour `helmet1.glb` et `helmet2.glb`, car les
  conditions d’attribution dépendent du plan ;
- vérifier la licence complète du Retro Tree Pack si un fichier plus détaillé
  existe dans l’archive originale ;
- clarifier l’utilité du HDRI non suivi
  `kloofendal_48d_partly_cloudy_puresky_1k2.hdr` ;
- décider quelles variantes d’images de titre doivent rester dans le build ;
- conserver la provenance de la barre UI fournie par le propriétaire.

## 5. État Git détaillé à protéger

### Fichiers texte modifiés importants

- `CHANGES_SINCE_CLAUDE.md`
- `assets/SOURCES.txt`
- `index.html`
- `style.css`
- `js/audio.js`
- `js/combat.js`
- `js/game.js`
- `js/game3d.js`
- `js/keybindings.js`
- `js/ui.js`
- `js/vegetation.js`
- `js/visual.js`
- `js/worldvisuals.js`

### Nouveaux modules et tests non suivis

- `js/battlefield.js`
- `js/equipmenttuning.js`
- `js/interest.js`
- `tests/battlefield.test.js`
- `tests/combat-feedback.test.js`
- `tests/equipmenttuning.test.js`
- `tests/interest.test.js`
- `tests/vegetation-assets.test.js`
- `tests/worldvisuals-antitiling.test.js`

### Assets nouveaux ou modifiés à auditer

- textures terrain PBR ;
- HDRI Kloofendal et variante `1k2` non suivie ;
- cartes d’herbe ;
- Retro Tree Pack ;
- `assets/equipment/` ;
- `assets/ui/skillbar-frame.png` ;
- variantes d’images de titre ;
- `assets/ui/title-background.png` actuellement supprimé dans le worktree.

## 6. Validation effectuée

La dernière exécution complète des tests Node a réussi :

- `battlefield.test.js`
- `combat-feedback.test.js`
- `environment-tuning.test.js`
- `equipmenttuning.test.js`
- `interest.test.js`
- `vegetation-assets.test.js`
- `visualtuning.test.js`
- `worldvisuals-antitiling.test.js`

La syntaxe des fichiers JavaScript touchés par le HUD a également été validée.
Un test isolé a confirmé :

- exactement cinq compétences dans la barre ;
- Sprint toujours présent dans les key bindings ;
- Purge absent des key bindings et de la table de commandes joueur.

La prévisualisation automatisée dans le navigateur intégré n’a pas pu démarrer
sur cette machine à cause du runtime du composant navigateur. Une validation
visuelle manuelle en jeu reste obligatoire, en particulier après la réduction de
la barre à 50 %.

Commande de test recommandée depuis le dépôt :

```powershell
Get-ChildItem tests -Filter '*.test.js' | Sort-Object Name | ForEach-Object { node $_.FullName }
```

Lancement local :

```text
python -m http.server 8000
http://localhost:8000
```

## 7. Problèmes et limites connus

### P0 — avant tout nouveau développement

- Le worktree est volumineux et non commit : risque principal de perte de travail.
- Le README annonce encore `V0.3.1` alors que l’interface affiche `V0.4.7`.
- Git LFS peut échouer sur son dossier temporaire avec un refus d’accès Windows.
- La nouvelle barre réduite à 50 % n’a pas encore reçu une validation visuelle
  manuelle sur plusieurs résolutions.

### Fonctionnel

- Le front est une mise en scène déterministe, pas encore une boucle RvR complète.
- L’intérêt visuel n’arrête pas la simulation globale.
- Le casque est un prototype réservé au joueur Troll.
- Les icônes de compétences restent des emoji déclaratifs, pas un set graphique
  final cohérent.
- Purge est désactivé pour le joueur mais reste présent dans le moteur.
- Sprint est clavier uniquement ; aucun indicateur HUD dédié n’affiche son état.

### Visuel et contenu

- Échelle/orientation des arbres à valider dans tous les biomes.
- Intensité du tiling, des normales et des roughness terrain à valider en jeu.
- Rochers et buissons définitifs encore à intégrer.
- Locomotion Manny limitée au minimum ; les huit directions restent en roadmap.
- Assets et variantes de titre à nettoyer uniquement après décision explicite.

## 8. Roadmap priorisée

### Jalon A — Stabilisation du worktree (`V0.4.8`)

**Priorité : P0 — immédiate**

1. Lire ce document, `CHANGES_SINCE_CLAUDE.md`, `VISUAL_TUNING.md` et
   `assets/SOURCES.txt`.
2. Faire un audit ciblé des diffs sans reset global.
3. Lancer tous les tests Node.
4. Démarrer le jeu et valider manuellement : menus, création, chargement, HUD,
   combat proche du spawn, `F3`, `F8`, `F9`.
5. Vérifier la barre à 1280×720, 1920×1080 et sur une fenêtre étroite.
6. Corriger uniquement les problèmes observés.
7. Créer des commits séparés et lisibles :
   - environnement et assets ;
   - combat feedback et battlefield ;
   - visual interest ;
   - équipement ;
   - HUD et contrôles ;
   - documentation.
8. Mettre à jour le README et aligner le numéro de version réel.

**Critères de sortie :** worktree expliqué et segmenté, suite de tests verte,
parcours de jeu vérifié manuellement, aucune régression des contrôles, aucun asset
local perdu.

### Jalon B — Boucle de combat lisible (`V0.5.0`)

**Priorité : P1**

1. Transformer le front de démonstration en boucle locale compréhensible : arrivée,
   engagement, mort, renfort, reprise du front.
2. Ajouter des objectifs visibles sans créer une IA parallèle.
3. Relier progressivement la bataille aux territoires et captures existants.
4. Améliorer la lecture des impacts, soins, CC et interruptions.
5. Ajouter des tests d’entrée pour ciblage, Stick, Sprint et key bindings.
6. Mesurer les coûts CPU/GPU avant toute optimisation structurelle.

**Critères de sortie :** le joueur comprend où aller et pourquoi combattre dans
les trente premières secondes ; le front se maintient sans blocage ; les contrôles
essentiels sont couverts par des tests.

### Jalon C — HUD et compétences finalisés (`V0.5.x`)

**Priorité : P1**

1. Valider la taille finale de la barre à 50 %.
2. Remplacer les emoji par un set cohérent d’icônes dark fantasy si les assets sont
   fournis ou approuvés.
3. Vérifier lisibilité des touches, noms et cooldowns à petite taille.
4. Ajouter un retour visuel non intrusif pour Sprint clavier uniquement.
5. Décider plus tard si Purge revient, sous quelle forme et avec quel raccourci.
6. Tester clic, clavier, cooldown, manque de ressource et redimensionnement.

**Critères de sortie :** cinq slots nets et cohérents, aucune confusion entre
Sprint et compétences, Purge reste absent tant que non validé, utilisation clavier
et souris fiable.

### Jalon D — Personnages, animations et équipement (`V0.6.0`)

**Priorité : P1/P2**

1. Valider et figer les valeurs du casque Troll avec `F9`.
2. Décider si `helmet1.glb` doit rester archivé ou sortir du dépôt.
3. Formaliser les slots d’équipement et sockets par race.
4. Ajouter la locomotion directionnelle et les transitions Walk/Jog.
5. Vérifier les rigs et proportions des neuf races.
6. Documenter la provenance/licence de chaque nouvel asset.

**Critères de sortie :** équipement reproductible sans réglage manuel, animations
sans glissement majeur, fallback fiable, provenance complète.

### Jalon E — Monde et direction artistique (`V0.6.x`)

**Priorité : P2**

1. Valider terrain et végétation royaume par royaume.
2. Corriger uniquement les défauts observables de tiling, normales et roughness.
3. Valider orientation, pivot, échelle et LOD des arbres.
4. Intégrer rochers et buissons licenciés.
5. Figer un preset visuel via l’export JSON du panneau `F8`.
6. Éviter DynamicTerrain/Ring LOD tant qu’aucune mesure ne le justifie.

**Critères de sortie :** identité visuelle stable, pas de seam notable, densité
cohérente, budget de rendu mesuré et documenté.

### Jalon F — Pré-alpha distribuable (`V0.7.0`)

**Priorité : P2/P3**

1. Nettoyer les variantes d’assets après validation explicite.
2. Résoudre les avertissements et la configuration Git LFS.
3. Vérifier toutes les licences et attributions.
4. Ajouter une procédure de build/packaging offline reproductible.
5. Ajouter une matrice de tests manuels par classe, race et résolution.
6. Mettre en place une validation automatique des tests Node.

**Critères de sortie :** clone propre, assets récupérables, lancement documenté,
tests reproductibles, licences prêtes pour distribution.

## 9. Première mission recommandée pour Claude

La meilleure première mission n’est pas d’ajouter une nouvelle fonctionnalité.
Elle consiste à stabiliser proprement l’état actuel :

1. auditer le worktree sans rien restaurer ;
2. lancer les tests ;
3. faire une session de validation manuelle centrée sur la barre HUD à 50 %, le
   front initial et le casque Troll ;
4. corriger les défauts réellement observés ;
5. proposer au propriétaire un plan de commits avant publication.

Après ce jalon, la priorité gameplay recommandée est la boucle de front lisible,
puis la finalisation des icônes et retours de compétences.

## 10. Documents complémentaires

- `README.md` — lancement et architecture historique, actuellement en retard sur
  la version réelle.
- `CHANGES_SINCE_CLAUDE.md` — historique détaillé des passes Codex.
- `SESSION_CODEX_2026-08-19.md` — consolidation de la session précédente.
- `VISUAL_TUNING.md` — contrat et utilisation du panneau `F8`.
- `assets/SOURCES.txt` — provenance et conditions connues des assets.

---

**Résumé en une phrase :** RWA possède maintenant un parcours complet, un monde
3D chunké, un front de combat proche du spawn, un premier interest management,
du feedback de combat, un prototype d’équipement et une barre dark fantasy à cinq
compétences ; l’urgence est de sécuriser et valider ce worktree avant d’étendre la
boucle RvR.

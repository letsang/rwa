# Realm Warfare Arena — V0.3.1 (3D · offline · AnimationLibrary intégrée)

> Passation détaillée : [modifications depuis la dernière version de Claude](./CHANGES_SINCE_CLAUDE.md).

Prototype MMOBA, rendu Babylon.js **offline**. V0.3.1 branche la **RWA Animation Library**
(rig Manny partagé, retarget par nom de bone) dans le vrai jeu.

## Personnages / animations
- **Humain + Guardian → `britm.glb`** (anims internes du GLB — pas de skeleton Manny).
- **Ogre + Guardian → `Stonehide.glb`** (rig Manny 162 os → **AnimationLibrary**).
- Toutes les autres combinaisons → placeholders capsules.

`CharacterVisual` détecte automatiquement si le GLB a un skeleton Manny :
si oui → `game.animLib.attach(character)` puis `playAnim('idle'|'run'|'attack')` mappe vers
**Idle / Jog_F / Attack_01** (V0.3.1 minimal). Sinon → anims internes. Les clips sont
**lazy-loadés** (chargés à la première demande, cache partagé entre tous les persos).

## Lancer (offline, serveur local requis pour lire les .glb)
```
python3 -m http.server 8000     # depuis ce dossier
```
puis http://localhost:8000/index.html — choisis **Ogre + Guardian** pour voir Stonehide
animé (Idle à l'arrêt, Jog en déplacement, Attack en mêlée), ou **Humain + Guardian** pour britm.

## Structure
```
index.html  style.css  style3d.css
lib/        babylon.js  babylonjs.loaders.min.js
assets/characters/       britm.glb  Stonehide.glb
assets/animations/Manny/ Locomotion/{Idle,Jog_F}.glb  Combat/Attack_01.glb
js/  …  animlib.js (RWA Animation Library)  visual.js  game3d.js
```
Note : seuls les 3 clips utilisés en V0.3.1 sont inclus. La bibliothèque complète (24 clips)
et sa démo sont dans `rwa-animation-library.zip`. Pour la V0.3.2 (locomotion 8 directions),
on ajoutera Walk_*/Jog_* dans `assets/animations/Manny/Locomotion/`.

## Contrat
Tout Character GLB au rig Manny fonctionne automatiquement avec l'AnimationLibrary.
Aucune modification de Entity / CombatSystem / BotAI / Map / EffectSystem. entity.radius,
attackRange, moveSpeed, hitbox et stats inchangés (changement purement visuel).

## ⚠ Build légère : ajoute 4 fichiers (tu les as déjà dans C:\RWA\Exports)
Pour garder l'envoi < 30 Mo, cette archive N'INCLUT PAS Stonehide ni les clips Manny.
Copie-les depuis ton dossier connecté vers assets/ (Stonehide 52 Mo, 3 clips ~22 Mo) :

  C:\RWA\Exports\Characters\Stonehide.glb
      → assets\characters\Stonehide.glb
  C:\RWA\Exports\Animations\Manny\Locomotion\Idle.glb
      → assets\animations\Manny\Locomotion\Idle.glb
  C:\RWA\Exports\Animations\Manny\Locomotion\Jog_F.glb
      → assets\animations\Manny\Locomotion\Jog_F.glb
  C:\RWA\Exports\Animations\Manny\Combat\Attack_01.glb
      → assets\animations\Manny\Combat\Attack_01.glb

Sans ces fichiers, le jeu tourne quand même : Ogre+Guardian retombe simplement sur la
capsule placeholder (fallback), et Humain+Guardian (britm, inclus) fonctionne tel quel.

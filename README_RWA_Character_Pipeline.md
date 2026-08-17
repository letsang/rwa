# RWA Character Pipeline

Pipeline automatisée pour convertir un personnage humanoïde généré avec
**Meshy** en **Skeletal Mesh Unreal Engine compatible avec le squelette
UE5 Manny et ses animations**.

## Statut

**Version actuelle : V3 CLEAN / v0.3.0**

Pipeline validée sur :

-   Unreal Engine 5.8
-   `SKM_Manny_Simple`
-   personnage de référence : Ironbound Warden
-   Static Mesh Meshy non riggé
-   animations Manny

Résultat de validation de référence :

``` text
Height .............. 180.54 cm   OK
Feet Z .............. -0.02 cm    OK
Bones ............... 89          OK
Root ................ root        OK
Weighted vertices ... 7741/7741   OK
Unweighted vertices . 0           OK
Max ACTIVE influences 4           OK
Vertices >4 ACTIVE .. 0           OK
IK/control weights .. 0           OK

>>> READY FOR ANIMATION <<<
```

> `READY FOR ANIMATION` signifie que le rig est techniquement valide.
> Cela ne garantit pas que toutes les déformations soient visuellement
> parfaites.

------------------------------------------------------------------------

## 1. Objectif

L'objectif est d'éviter une chaîne manuelle de rigging, de weight
painting et de retargeting pour chaque personnage.

Le workflow recherché est :

``` text
Meshy
  ↓
Static Mesh
  ↓
Analyse des dimensions
  ↓
Alignement automatique sur Manny
  ↓
Copie du squelette Manny
  ↓
Transfert des skin weights
  ↓
Nettoyage des influences
  ↓
Quality Check automatique
  ↓
Skeletal Mesh
  ↓
Animations Manny
```

Le principe est de conserver **Manny comme squelette de référence
unique** pour les personnages humanoïdes RWA.

------------------------------------------------------------------------

## 2. Préparation du personnage dans Meshy

Le personnage doit être généré comme un humanoïde dont les proportions
restent suffisamment proches d'un corps humain standard.

Recommandations :

-   pose neutre permettant de distinguer les bras du torse ;
-   jambes séparées ;
-   mains éloignées des hanches ;
-   éviter les accessoires qui fusionnent fortement plusieurs membres ;
-   conserver une topologie raisonnable pour un personnage temps réel ;
-   exporter les textures avec le modèle.

Le pipeline ne nécessite pas que Meshy fournisse son propre rig.

------------------------------------------------------------------------

## 3. Import dans Unreal Engine

Importer le personnage comme **Static Mesh**.

Le script travaille directement à partir du Static Mesh sélectionné dans
le Content Browser.

Il n'est pas nécessaire de :

-   créer un squelette Meshy ;
-   faire un retargeting depuis un squelette Meshy ;
-   déplacer manuellement le root ;
-   modifier manuellement les bone weights ;
-   passer par Blender pour le rig.

------------------------------------------------------------------------

## 4. Référence Manny

Le pipeline utilise :

``` text
/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple
```

Valeurs observées sur la référence utilisée :

``` text
Hauteur : 180.54 cm
Min Z   : -0.02 cm
Bones   : 89
Root    : root
```

Ces valeurs sont utilisées par le contrôle qualité, mais la hauteur et
le niveau du sol sont calculés dynamiquement depuis Manny par le script.

------------------------------------------------------------------------

## 5. Alignement automatique

Le Static Mesh Meshy est converti en `DynamicMesh`.

Le script calcule :

``` text
scale = hauteur_Manny / hauteur_Meshy
```

Puis il applique un scale uniforme et aligne :

-   le centre X du Meshy sur Manny ;
-   le centre Y du Meshy sur Manny ;
-   le point le plus bas du Meshy sur le niveau des pieds de Manny.

Exemple de référence :

``` text
Meshy height : 250.000 cm
Manny height : 180.544 cm
Scale        : 0.722176
```

Cette étape évite tout réglage manuel de taille ou de position.

------------------------------------------------------------------------

## 6. Copie du squelette

Le squelette de Manny est copié vers le `DynamicMesh` cible avec
Geometry Script.

Le root attendu est :

``` text
root
```

Le personnage final conserve ainsi directement la hiérarchie Manny.

------------------------------------------------------------------------

## 7. Transfert des skin weights

Méthode de production validée :

``` text
CLOSEST_POINT_ON_SURFACE
```

Configuration :

``` text
Layered Mesh Support  : False
Smoothing Iterations  : 0
Smoothing Strength    : 0
Output Target Bones   : SOURCE_BONES
```

Cette méthode est actuellement la baseline stable.

### Expérience abandonnée : INPAINT_WEIGHTS

`INPAINT_WEIGHTS` a été testé pendant le développement.

Résultat observé :

-   le squelette continuait à jouer l'animation ;
-   le mesh ne suivait plus correctement le squelette.

Cette méthode n'est donc **pas utilisée dans la version de production
actuelle**.

------------------------------------------------------------------------

## 8. V3 CLEAN --- nettoyage des weights

Après le transfert, les weights sont nettoyés automatiquement.

Configuration :

``` text
Minimum Weight        : 0.01
Maximum Influences    : 4
QC Weight Epsilon     : 0.0001
```

Pour chaque vertex :

1.  les influences inférieures à `0.01` sont supprimées ;
2.  si aucune influence ne subsiste, l'influence dominante d'origine est
    conservée ;
3.  seules les quatre influences les plus fortes sont conservées ;
4.  les weights sont renormalisés pour obtenir une somme de `1.0`.

Sur l'Ironbound Warden de référence :

``` text
Vertices nettoyés     : 7741
Micro-poids supprimés : 19355
Max influences cible  : 4
```

------------------------------------------------------------------------

## 9. Bones non-déformants

Le Quality Check vérifie qu'aucun poids actif n'est attribué aux bones
de contrôle/IK suivants :

``` text
ik_foot_root
ik_foot_l
ik_foot_r
ik_hand_root
ik_hand_gun
ik_hand_l
ik_hand_r
interaction
center_of_mass
```

Sur le personnage de référence :

``` text
IK/control weights : 0
```

Les twist bones ne sont volontairement **pas supprimés**, car ils
peuvent contribuer aux déformations des membres.

------------------------------------------------------------------------

## 10. Quality Check

Le script valide automatiquement :

-   hauteur compatible avec Manny ;
-   pieds au niveau du sol Manny ;
-   présence des 89 bones attendus ;
-   root nommé `root` ;
-   100 % des vertices pondérés ;
-   aucun vertex sans weight ;
-   maximum quatre influences actives par vertex ;
-   aucun vertex dépassant quatre influences actives ;
-   aucune influence active sur les bones IK/control surveillés.

Un asset qui passe toutes les règles reçoit :

``` text
>>> READY FOR ANIMATION <<<
```

Sinon :

``` text
>>> RIG NEEDS REVIEW <<<
```

Le Skeletal Mesh est malgré tout créé afin de permettre son inspection.

------------------------------------------------------------------------

## 11. Limites actuelles

Le Quality Check mesure la validité **technique**, pas la qualité
esthétique des déformations.

Les zones à surveiller visuellement restent notamment :

-   épaules ;
-   aisselles ;
-   coudes ;
-   poignets ;
-   hanches ;
-   aine ;
-   genoux ;
-   vêtements rigides ;
-   armures ;
-   géométries très éloignées des proportions de Manny.

Un personnage très différent de Manny peut passer le QC tout en
nécessitant une amélioration du skinning.

------------------------------------------------------------------------

## 12. Test visuel recommandé

Après génération du Skeletal Mesh :

1.  ouvrir l'asset créé ;
2.  charger une animation Manny ;
3.  tester au minimum une marche ;
4.  tester une animation impliquant fortement les bras ;
5.  observer épaules, coudes, bassin et genoux.

Animations utilisées pendant le développement :

``` text
MF_Unarmed_Walk_Fwd
MF_Pistol_Walk_Fwd
```

------------------------------------------------------------------------

## 13. Utilisation du script

1.  Importer le personnage Meshy comme Static Mesh.
2.  Sélectionner ce Static Mesh dans le Content Browser.
3.  Ouvrir la console / l'environnement Python de l'éditeur Unreal.
4.  Exécuter `auto_rig_meshy.py`.
5.  Lire le bloc `RIG QUALITY CHECK`.
6.  Ouvrir le Skeletal Mesh généré.
7.  Tester une animation Manny.

Nom de sortie par défaut :

``` text
SKM_<NOM_SOURCE>_AUTORIG_V3_CLEAN
```

Si un asset du même nom existe déjà, le script le supprime avant de
créer la nouvelle version.

------------------------------------------------------------------------

## 14. Troubleshooting

### `source_models` introuvable

Erreur rencontrée lors d'une première tentative de modification directe
d'un Static Mesh :

``` text
StaticMesh: Failed to find property 'source_models'
```

Solution retenue : ne pas modifier `source_models` directement. Le
pipeline utilise Geometry Script et des `DynamicMesh`.

### Le squelette bouge mais le mesh reste immobile

Cas observé avec une expérimentation `INPAINT_WEIGHTS`.

Solution : revenir à :

``` text
CLOSEST_POINT_ON_SURFACE
```

### `invalid characters (probably spaces)`

Un espace parasite dans le suffixe d'asset provoquait :

``` text
DoesAssetExist failed
```

Le suffixe correct est :

``` python
SUFFIX = "_AUTORIG_V3_CLEAN"
```

### Le QC indique plus de quatre influences alors que le nettoyage en conserve quatre

Le premier QC comptait toutes les entrées retournées par Unreal, y
compris les weights nuls.

Le QC actuel compte uniquement les influences dont :

``` text
weight > 0.0001
```

### Warning sur des vertices inutilisés de Manny

Unreal peut afficher :

``` text
CopyMeshFromSkeletalMesh: ToDynamicMesh a des vertex inutilisés
```

Ce warning n'a pas empêché la pipeline validée de fonctionner.

------------------------------------------------------------------------

## 15. Versioning

### v0.3.0 --- V3 CLEAN

-   nettoyage des micro-influences ;
-   maximum quatre influences actives ;
-   renormalisation des weights ;
-   Quality Check automatique ;
-   contrôle des bones IK/control ;
-   asset final compatible Manny.

### v0.2.0 --- V2 SAFE

-   copie du squelette Manny ;
-   transfert `CLOSEST_POINT_ON_SURFACE` ;
-   animations Manny fonctionnelles ;
-   abandon de l'expérience `INPAINT_WEIGHTS`.

### v0.1.0 --- Normalisation / alignement

-   lecture automatique des bounds ;
-   calcul automatique du scale ;
-   alignement au sol ;
-   alignement spatial Meshy → Manny.

------------------------------------------------------------------------

## 16. Prochaines améliorations

Pistes pour les versions futures :

-   validation automatique de plusieurs morphologies Meshy ;
-   mesure de qualité par zones anatomiques ;
-   amélioration spécifique des épaules et des hanches ;
-   presets pour personnages massifs, fins ou de petite taille ;
-   tests automatiques sur plusieurs animations ;
-   génération de rapports QC ;
-   traitement batch de plusieurs Static Meshes ;
-   séparation claire entre géométrie souple et pièces d'armure rigides.

------------------------------------------------------------------------

## Philosophie du pipeline

La priorité est la **reproductibilité**.

Une amélioration ne doit pas rendre nécessaire une correction manuelle
différente pour chaque personnage. Le pipeline doit pouvoir être
appliqué à une bibliothèque de personnages avec le minimum
d'intervention possible.

La version V3 CLEAN constitue la baseline technique actuelle.

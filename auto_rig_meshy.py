"""
RWA CHARACTER PIPELINE
======================

Meshy -> Unreal Engine Manny Auto-Rig

Version:
    0.3.0 / V3 CLEAN

Validated with:
    Unreal Engine 5.8
    SKM_Manny_Simple
    Meshy humanoid Static Mesh

Pipeline:
    Static Mesh
        -> automatic Manny alignment
        -> Manny skeleton copy
        -> Closest Point On Surface weight transfer
        -> micro-weight cleanup
        -> max 4 active influences
        -> automated QC
        -> Skeletal Mesh

IMPORTANT:
    QC READY means technically valid.
    It does not guarantee visually perfect deformation.
"""

import unreal

SUFFIX = "_AUTORIG_V3_CLEAN"

MIN_WEIGHT = 0.01
MAX_INFLUENCES = 4
WEIGHT_EPSILON = 0.0001

MANNY_PATH = "/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple"

NON_DEFORM_BONES = {
    "ik_foot_root",
    "ik_foot_l",
    "ik_foot_r",
    "ik_hand_root",
    "ik_hand_gun",
    "ik_hand_l",
    "ik_hand_r",
    "interaction",
    "center_of_mass",
}


# ============================================================
# 0. SELECT MESHY STATIC MESH
# ============================================================

selected = unreal.EditorUtilityLibrary.get_selected_assets()

if not selected:
    raise RuntimeError("Sélectionne le Static Mesh Meshy dans le Content Browser.")

meshy_static = selected[0]

if not isinstance(meshy_static, unreal.StaticMesh):
    raise RuntimeError("L'asset sélectionné doit être un Static Mesh.")


# ============================================================
# 1. LOAD MANNY
# ============================================================

manny = unreal.EditorAssetLibrary.load_asset(MANNY_PATH)

if not manny:
    raise RuntimeError(f"SKM_Manny_Simple introuvable : {MANNY_PATH}")

manny_skeleton = manny.get_editor_property("skeleton")

if not manny_skeleton:
    raise RuntimeError("Skeleton Manny introuvable.")

unreal.log("")
unreal.log("============================================")
unreal.log("===== MESHY AUTO RIG =======================")
unreal.log("============================================")
unreal.log(f"Target : {meshy_static.get_name()}")
unreal.log(f"Source : {manny.get_name()}")


# ============================================================
# 2. LOD OPTIONS
# ============================================================

read_options = unreal.GeometryScriptCopyMeshFromAssetOptions()

lod = unreal.GeometryScriptMeshReadLOD()
lod.lod_type = unreal.GeometryScriptLODType.SOURCE_MODEL
lod.lod_index = 0


# ============================================================
# 3. MANNY -> DYNAMIC MESH
# ============================================================

manny_dm = unreal.DynamicMesh()

manny_dm, outcome = unreal.GeometryScript_AssetUtils.copy_mesh_from_skeletal_mesh(
    manny,
    manny_dm,
    read_options,
    lod,
)

unreal.log(f"Manny extract : {outcome}")


# ============================================================
# 4. MESHY -> DYNAMIC MESH
# ============================================================

meshy_dm = unreal.DynamicMesh()

meshy_dm, outcome = unreal.GeometryScript_AssetUtils.copy_mesh_from_static_mesh(
    meshy_static,
    meshy_dm,
    read_options,
    lod,
)

unreal.log(f"Meshy extract : {outcome}")


# ============================================================
# 5. AUTO ALIGN MESHY -> MANNY
# ============================================================

meshy_bounds = meshy_dm.get_mesh_bounding_box()
manny_bounds = manny.get_bounds()

meshy_height = meshy_bounds.max.z - meshy_bounds.min.z

if meshy_height <= 0:
    raise RuntimeError("Hauteur Meshy invalide.")

manny_min_z = manny_bounds.origin.z - manny_bounds.box_extent.z
manny_max_z = manny_bounds.origin.z + manny_bounds.box_extent.z
manny_height = manny_max_z - manny_min_z

scale = manny_height / meshy_height

meshy_center_x = (meshy_bounds.min.x + meshy_bounds.max.x) * 0.5
meshy_center_y = (meshy_bounds.min.y + meshy_bounds.max.y) * 0.5

tx = manny_bounds.origin.x - meshy_center_x * scale
ty = manny_bounds.origin.y - meshy_center_y * scale
tz = manny_min_z - meshy_bounds.min.z * scale

unreal.log("")
unreal.log("===== AUTO ALIGN =====")
unreal.log(f"Meshy height : {meshy_height:.3f} cm")
unreal.log(f"Manny height : {manny_height:.3f} cm")
unreal.log(f"Scale        : {scale:.6f}")
unreal.log(f"Translation  : X={tx:.3f} Y={ty:.3f} Z={tz:.3f}")

unreal.GeometryScript_MeshTransforms.scale_mesh(
    meshy_dm,
    unreal.Vector(scale, scale, scale),
    unreal.Vector(0, 0, 0),
)

unreal.GeometryScript_MeshTransforms.translate_mesh(
    meshy_dm,
    unreal.Vector(tx, ty, tz),
)


# ============================================================
# 6. COPY MANNY SKELETON
# ============================================================

bone_options = unreal.GeometryScriptCopyBonesFromMeshOptions()

unreal.GeometryScript_BoneWeights.copy_bones_from_mesh(
    manny_dm,
    meshy_dm,
    bone_options,
)

_, root_name = unreal.GeometryScript_BoneWeights.get_root_bone_name(meshy_dm)

unreal.log("")
unreal.log(f"Root après copie : {root_name}")


# ============================================================
# 7. V2 SAFE - TRANSFER SKIN WEIGHTS
# ============================================================

weight_options = unreal.GeometryScriptTransferBoneWeightsOptions()

weight_options.set_editor_property(
    "transfer_method",
    unreal.TransferBoneWeightsMethod.CLOSEST_POINT_ON_SURFACE,
)

try:
    weight_options.set_editor_property(
        "output_target_mesh_bones",
        unreal.OutputTargetMeshBones.SOURCE_BONES,
    )
except Exception as exc:
    unreal.log_warning(f"output_target_mesh_bones non modifié : {exc}")

weight_options.set_editor_property("layered_mesh_support", False)
weight_options.set_editor_property("num_smoothing_iterations", 0)
weight_options.set_editor_property("smoothing_strength", 0.0)

unreal.GeometryScript_BoneWeights.transfer_bone_weights_from_mesh(
    manny_dm,
    meshy_dm,
    weight_options,
)

_, has_weights = unreal.GeometryScript_BoneWeights.mesh_has_bone_weights(meshy_dm)

unreal.log("")
unreal.log(f"Bone weights V2 SAFE présents : {has_weights}")

if not has_weights:
    raise RuntimeError("Le transfert des bone weights a échoué.")


# ============================================================
# 8. V3 CLEAN
# ============================================================

vertex_count = meshy_dm.get_vertex_count()

cleaned_vertices = 0
removed_weights = 0

for vertex_id in range(vertex_count):
    _, weights, valid = unreal.GeometryScript_BoneWeights.get_vertex_bone_weights(
        meshy_dm,
        vertex_id,
    )

    if not valid or not weights:
        continue

    cleaned = []

    # Remove micro-influences.
    for bw in weights:
        bone_index = bw.get_editor_property("bone_index")
        weight = bw.get_editor_property("weight")

        if weight >= MIN_WEIGHT:
            cleaned.append((bone_index, weight))
        else:
            removed_weights += 1

    # Safety: if everything was removed, preserve the original strongest weight.
    if not cleaned:
        strongest = max(
            weights,
            key=lambda x: x.get_editor_property("weight"),
        )

        cleaned = [
            (
                strongest.get_editor_property("bone_index"),
                1.0,
            )
        ]

    # Keep the strongest influences only.
    cleaned.sort(key=lambda x: x[1], reverse=True)
    cleaned = cleaned[:MAX_INFLUENCES]

    # Renormalize to 1.
    total = sum(weight for _, weight in cleaned)

    if total <= 0:
        continue

    new_weights = []

    for bone_index, weight in cleaned:
        bw = unreal.GeometryScriptBoneWeight()
        bw.set_editor_property("bone_index", bone_index)
        bw.set_editor_property("weight", weight / total)
        new_weights.append(bw)

    unreal.GeometryScript_BoneWeights.set_vertex_bone_weights(
        meshy_dm,
        vertex_id,
        new_weights,
    )

    cleaned_vertices += 1

unreal.log("")
unreal.log("===== V3 CLEAN =====")
unreal.log(f"Vertices nettoyés     : {cleaned_vertices}")
unreal.log(f"Micro-poids supprimés : {removed_weights}")
unreal.log(f"Seuil                 : {MIN_WEIGHT}")
unreal.log(f"Max influences cible  : {MAX_INFLUENCES}")
unreal.log("====================")


# ============================================================
# 9. OUTPUT PATH
# ============================================================

source_package = meshy_static.get_outermost().get_name()
folder, source_name = source_package.rsplit("/", 1)

base_name = source_name

while base_name.endswith("_NORMALIZED"):
    base_name = base_name[:-11]

if base_name.startswith("SKM_"):
    base_name = base_name[4:]

new_name = "SKM_" + base_name + SUFFIX
new_path = folder + "/" + new_name

unreal.log("")
unreal.log(f"Destination : {new_path}")

if unreal.EditorAssetLibrary.does_asset_exist(new_path):
    unreal.log_warning("Ancien asset V3 supprimé.")
    unreal.EditorAssetLibrary.delete_asset(new_path)


# ============================================================
# 10. MATERIALS
# ============================================================

materials, slot_names = (
    unreal.GeometryScript_AssetUtils.get_material_list_from_static_mesh(
        meshy_static
    )
)

material_map = unreal.GeometryScript_AssetUtils.convert_material_list_to_material_map(
    materials,
    slot_names,
)


# ============================================================
# 11. QUALITY CHECK
# ============================================================

unreal.log("")
unreal.log("============================================")
unreal.log("===== RIG QUALITY CHECK ====================")
unreal.log("============================================")

# Dimensions.
bounds = meshy_dm.get_mesh_bounding_box()

height = bounds.max.z - bounds.min.z
min_z = bounds.min.z

height_ok = abs(height - manny_height) < 3.0
ground_ok = abs(min_z - manny_min_z) < 1.0

unreal.log(
    f"Height .............. {height:.2f} cm   "
    f"{'OK' if height_ok else 'CHECK'}"
)

unreal.log(
    f"Feet Z .............. {min_z:.2f} cm   "
    f"{'OK' if ground_ok else 'CHECK'}"
)

# Skeleton.
bones_result = unreal.GeometryScript_BoneWeights.get_all_bones_info(meshy_dm)
bones_info = bones_result[1]

bone_count = len(bones_info)
bones_ok = bone_count == 89

unreal.log(
    f"Bones ............... {bone_count}   "
    f"{'OK' if bones_ok else 'CHECK'}"
)

_, root_name = unreal.GeometryScript_BoneWeights.get_root_bone_name(meshy_dm)
root_ok = str(root_name) == "root"

unreal.log(
    f"Root ................ {root_name}   "
    f"{'OK' if root_ok else 'CHECK'}"
)

# Active vertex weights.
weighted_vertices = 0
unweighted_vertices = 0
max_influences_found = 0
vertices_over_limit = 0

for vertex_id in range(vertex_count):
    _, weights, valid = unreal.GeometryScript_BoneWeights.get_vertex_bone_weights(
        meshy_dm,
        vertex_id,
    )

    if not valid:
        unweighted_vertices += 1
        continue

    active_weights = [
        bw
        for bw in weights
        if bw.get_editor_property("weight") > WEIGHT_EPSILON
    ]

    if not active_weights:
        unweighted_vertices += 1
        continue

    weighted_vertices += 1

    influence_count = len(active_weights)
    max_influences_found = max(max_influences_found, influence_count)

    if influence_count > MAX_INFLUENCES:
        vertices_over_limit += 1

unreal.log(
    f"Weighted vertices ... {weighted_vertices}/{vertex_count}   "
    f"{'OK' if weighted_vertices == vertex_count else 'CHECK'}"
)

unreal.log(
    f"Unweighted vertices . {unweighted_vertices}   "
    f"{'OK' if unweighted_vertices == 0 else 'CHECK'}"
)

unreal.log(
    f"Max ACTIVE influences {max_influences_found}   "
    f"{'OK' if max_influences_found <= MAX_INFLUENCES else 'CHECK'}"
)

unreal.log(
    f"Vertices >4 ACTIVE .. {vertices_over_limit}   "
    f"{'OK' if vertices_over_limit == 0 else 'CHECK'}"
)

# Non-deforming IK/control bones.
non_deform_indices = {}

for bone_name in NON_DEFORM_BONES:
    _, valid, index = unreal.GeometryScript_BoneWeights.get_bone_index(
        meshy_dm,
        unreal.Name(bone_name),
    )

    if valid:
        non_deform_indices[index] = bone_name

bad_non_deform_weights = 0

for vertex_id in range(vertex_count):
    _, weights, valid = unreal.GeometryScript_BoneWeights.get_vertex_bone_weights(
        meshy_dm,
        vertex_id,
    )

    if not valid:
        continue

    for bw in weights:
        bone_index = bw.get_editor_property("bone_index")
        weight = bw.get_editor_property("weight")

        if (
            bone_index in non_deform_indices
            and weight > WEIGHT_EPSILON
        ):
            bad_non_deform_weights += 1

unreal.log(
    f"IK/control weights ... {bad_non_deform_weights}   "
    f"{'OK' if bad_non_deform_weights == 0 else 'CHECK'}"
)

# Final verdict.
ready = (
    height_ok
    and ground_ok
    and bones_ok
    and root_ok
    and weighted_vertices == vertex_count
    and unweighted_vertices == 0
    and max_influences_found <= MAX_INFLUENCES
    and vertices_over_limit == 0
    and bad_non_deform_weights == 0
)

unreal.log("")

if ready:
    unreal.log(">>> READY FOR ANIMATION <<<")
else:
    unreal.log(">>> RIG NEEDS REVIEW <<<")

unreal.log("============================================")


# ============================================================
# 12. CREATE FINAL SKELETAL MESH
# ============================================================

create_options = unreal.GeometryScriptCreateNewSkeletalMeshAssetOptions()

if hasattr(create_options, "materials"):
    create_options.set_editor_property(
        "materials",
        material_map,
    )

result = (
    unreal.GeometryScript_NewAssetUtils.create_new_skeletal_mesh_asset_from_mesh(
        meshy_dm,
        manny_skeleton,
        new_path,
        create_options,
    )
)

new_skm = result[0]
outcome = result[1]

unreal.log("")
unreal.log(f"Create Skeletal Mesh : {outcome}")

if not new_skm:
    raise RuntimeError("Création du Skeletal Mesh impossible.")


# ============================================================
# 13. SAVE
# ============================================================

unreal.EditorAssetLibrary.save_loaded_asset(new_skm)

unreal.log("")
unreal.log("============================================")
unreal.log("===== AUTO RIG COMPLETE ====================")
unreal.log("============================================")
unreal.log(f"Asset    : {new_path}")
unreal.log("Skeleton : Manny")
unreal.log(f"QC       : {'READY' if ready else 'REVIEW'}")
unreal.log("============================================")

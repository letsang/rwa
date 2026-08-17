import unreal
import os

# ============================================================
# RWA CHARACTER PIPELINE
# GLB EXPORTER v0.4.0
# ============================================================

EXPORT_DIR = r"C:\RWA\Exports\Characters"

# ------------------------------------------------------------
# 1. GET SELECTED SKELETAL MESH
# ------------------------------------------------------------

selected = unreal.EditorUtilityLibrary.get_selected_assets()

if not selected:
    raise RuntimeError(
        "Sélectionne le Skeletal Mesh à exporter."
    )

mesh = selected[0]

if not isinstance(mesh, unreal.SkeletalMesh):
    raise RuntimeError(
        f"L'asset sélectionné n'est pas un Skeletal Mesh : "
        f"{mesh.get_name()}"
    )

unreal.log("")
unreal.log("============================================")
unreal.log("===== RWA GLB EXPORT =======================")
unreal.log("============================================")
unreal.log(f"Asset : {mesh.get_name()}")


# ------------------------------------------------------------
# 2. OUTPUT DIRECTORY
# ------------------------------------------------------------

os.makedirs(EXPORT_DIR, exist_ok=True)

name = mesh.get_name()

# Nettoyage du nom pour obtenir un fichier plus lisible
name = name.replace("SKM_", "")

if name.endswith("_AUTORIG_V3_CLEAN"):
    name = name[:-len("_AUTORIG_V3_CLEAN")]

output_file = os.path.join(
    EXPORT_DIR,
    name + ".glb"
)

unreal.log(f"Output : {output_file}")


# ------------------------------------------------------------
# 3. GLTF OPTIONS
# ------------------------------------------------------------

options = unreal.GLTFExportOptions()

# ------------------------------------------------------------
# Geometry
# ------------------------------------------------------------

options.set_editor_property(
    "export_vertex_skin_weights",
    True
)

options.set_editor_property(
    "export_vertex_colors",
    True
)

options.set_editor_property(
    "export_morph_targets",
    True
)

options.set_editor_property(
    "export_source_model",
    False
)


# ------------------------------------------------------------
# Animation
#
# Claude / Unreal utilisera les animations Manny existantes.
# On n'embarque donc pas toute la bibliothèque d'animations.
# ------------------------------------------------------------

options.set_editor_property(
    "export_animation_sequences",
    False
)


# ------------------------------------------------------------
# Materials / textures
# ------------------------------------------------------------

options.set_editor_property(
    "bake_material_inputs",
    unreal.GLTFMaterialBakeMode.USE_MESH_DATA
)

options.set_editor_property(
    "adjust_normalmaps",
    True
)


# ------------------------------------------------------------
# Character scale
# ------------------------------------------------------------

options.set_editor_property(
    "export_uniform_scale",
    1.0
)


# ------------------------------------------------------------
# GLB hierarchy
# ------------------------------------------------------------

options.set_editor_property(
    "make_skinned_meshes_root",
    True
)


# ------------------------------------------------------------
# 4. EXPORT
# ------------------------------------------------------------

messages = unreal.GLTFExportMessages()

success = unreal.GLTFExporter.export_to_gltf(
    mesh,
    output_file,
    options,
    set()
)


# ------------------------------------------------------------
# 5. RESULT
# ------------------------------------------------------------

unreal.log("")
unreal.log("===== GLB EXPORT RESULT =====")

if success:

    unreal.log("SUCCESS")
    unreal.log(f"GLB : {output_file}")

else:

    unreal.log_error("GLB EXPORT FAILED")


unreal.log("=============================")

from __future__ import annotations

import json
import math
import shutil
import stat
import struct
import uuid
import zipfile
from pathlib import Path
from typing import Any

import numpy as np
import trimesh


class ConvertError(RuntimeError):
    pass


MAX_ZIP_FILES = 50_000
MAX_ZIP_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB limit
MAX_ZIP_FILE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB limit per individual file
MAX_COMPRESSION_RATIO = 100.0  # Max 100:1 compression ratio to prevent zip bombs


def safe_extract_zip(archive_path: Path, dest_dir: Path) -> Path:
    """Extract zip archive safely guarding against directory traversal, absolute paths, symlinks, and bombs."""
    archive_path = Path(archive_path).resolve()
    if not archive_path.is_file():
        raise ConvertError(f"Archive not found: {archive_path}")

    dest_dir = Path(dest_dir).resolve()
    dest_dir.mkdir(parents=True, exist_ok=True)

    temp_dir = dest_dir.parent / f"_extract_tmp_{uuid.uuid4().hex[:10]}"
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(archive_path) as zf:
            bad_crc = zf.testzip()
            if bad_crc is not None:
                raise ConvertError(f"Archive CRC check failed for member: {bad_crc}")

            members = zf.infolist()
            if len(members) > MAX_ZIP_FILES:
                raise ConvertError(f"Zip archive exceeds maximum entry limit ({len(members)} > {MAX_ZIP_FILES})")

            total_bytes = 0
            for m in members:
                # Disallow encrypted members
                if m.flag_bits & 0x1:
                    raise ConvertError("Encrypted zip archives are not supported")

                # Disallow symbolic links or special files
                mode = (m.external_attr >> 16) & 0xFFFF
                if stat.S_ISLNK(mode) or stat.S_ISFIFO(mode) or stat.S_ISSOCK(mode):
                    raise ConvertError(f"Archive member contains forbidden file type (symlink/pipe): {m.filename}")

                # Reject absolute paths, drive letters, and UNC paths
                raw_name = m.filename.replace("\\", "/")
                if raw_name.startswith("/") or ":" in raw_name or raw_name.startswith("//"):
                    raise ConvertError(f"Illegal absolute or drive-letter path detected in archive: {m.filename}")

                # Check path traversal
                parts = [p for p in raw_name.split("/") if p and p != "."]
                if ".." in parts:
                    raise ConvertError(f"Illegal relative path or directory traversal detected in archive: {m.filename}")

                total_bytes += m.file_size
                if total_bytes > MAX_ZIP_UNCOMPRESSED_BYTES:
                    raise ConvertError("Zip archive exceeds decompression safety limit (10 GB)")

                if m.file_size > MAX_ZIP_FILE_BYTES:
                    raise ConvertError(f"Archive entry {m.filename} exceeds single-file size limit (2 GB)")

                if m.file_size > 1024 and m.compress_size > 0:
                    ratio = m.file_size / m.compress_size
                    if ratio > MAX_COMPRESSION_RATIO:
                        raise ConvertError(f"Suspicious compression ratio ({ratio:.1f}:1) for entry: {m.filename}")

                # Verify target resolution inside temp_dir
                target = (temp_dir / raw_name).resolve()
                try:
                    target.relative_to(temp_dir)
                except ValueError:
                    raise ConvertError(f"Illegal relative path detected in archive: {m.filename}")

            # Extract into temp directory
            zf.extractall(temp_dir)

        # Promote extracted files into destination directory
        for item in temp_dir.iterdir():
            target_dest = dest_dir / item.name
            if target_dest.exists():
                if target_dest.is_dir():
                    shutil.rmtree(target_dest)
                else:
                    target_dest.unlink()
            shutil.move(str(item), str(dest_dir))

        return dest_dir
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


def validate_glb(path: Path) -> dict[str, Any]:
    """
    Strictly validate a glTF 2.0 Binary (GLB) file.
    Validates binary header, JSON chunk, meshes, accessors, vertex counts,
    finite bounding coordinates, non-empty geometry, and external texture references.
    """
    path = Path(path).resolve()
    if not path.is_file():
        raise ConvertError(f"GLB file not found: {path}")

    file_size = path.stat().st_size
    if file_size < 20:
        raise ConvertError(f"GLB file too small to be valid ({file_size} bytes)")

    with path.open("rb") as f:
        header = f.read(12)
        if len(header) < 12:
            raise ConvertError("Incomplete GLB header")
        magic, version, length = struct.unpack("<4sII", header)
        if magic != b"glTF":
            raise ConvertError(f"Invalid GLB magic bytes: {magic!r}")
        if version != 2:
            raise ConvertError(f"Unsupported glTF version: {version} (posEye requires glTF 2.0)")
        if length > file_size:
            raise ConvertError(f"Truncated GLB: declared length {length} > actual file size {file_size}")

        chunk_header = f.read(8)
        if len(chunk_header) < 8:
            raise ConvertError("Incomplete GLB JSON chunk header")
        chunk_len, chunk_type = struct.unpack("<II", chunk_header)
        if chunk_type != 0x4E4F534A:  # ASCII 'JSON'
            raise ConvertError("First GLB chunk is not JSON")
        json_bytes = f.read(chunk_len)
        if len(json_bytes) < chunk_len:
            raise ConvertError("Truncated GLB JSON chunk data")

    try:
        data = json.loads(json_bytes.decode("utf-8"))
    except Exception as exc:
        raise ConvertError(f"Failed to parse GLB JSON manifest: {exc}") from exc

    meshes = data.get("meshes")
    if not meshes or not isinstance(meshes, list):
        raise ConvertError("GLB contains no mesh definitions")

    accessors = data.get("accessors", [])
    total_vertices = 0
    total_triangles = 0
    global_min = [float("inf"), float("inf"), float("inf")]
    global_max = [float("-inf"), float("-inf"), float("-inf")]

    for m_idx, mesh in enumerate(meshes):
        primitives = mesh.get("primitives", [])
        if not primitives:
            raise ConvertError(f"Mesh {m_idx} contains no primitives")

        for p_idx, prim in enumerate(primitives):
            attributes = prim.get("attributes", {})
            if "POSITION" not in attributes:
                raise ConvertError(f"Mesh {m_idx} primitive {p_idx} missing POSITION attribute")

            pos_idx = attributes["POSITION"]
            if not (0 <= pos_idx < len(accessors)):
                raise ConvertError(f"Invalid POSITION accessor index: {pos_idx}")

            pos_acc = accessors[pos_idx]
            v_count = int(pos_acc.get("count", 0))
            if v_count <= 0:
                raise ConvertError(f"Mesh {m_idx} primitive {p_idx} has 0 vertices")
            total_vertices += v_count

            min_vals = pos_acc.get("min")
            max_vals = pos_acc.get("max")
            if min_vals and max_vals and len(min_vals) >= 3 and len(max_vals) >= 3:
                for val in min_vals[:3] + max_vals[:3]:
                    if math.isnan(val) or math.isinf(val):
                        raise ConvertError("Non-finite coordinates detected in vertex position bounds")
                for i in range(3):
                    global_min[i] = min(global_min[i], float(min_vals[i]))
                    global_max[i] = max(global_max[i], float(max_vals[i]))

            if "indices" in prim:
                idx_acc_idx = prim["indices"]
                if not (0 <= idx_acc_idx < len(accessors)):
                    raise ConvertError(f"Invalid indices accessor index: {idx_acc_idx}")
                idx_acc = accessors[idx_acc_idx]
                i_count = int(idx_acc.get("count", 0))
                if i_count < 3:
                    raise ConvertError(f"Primitive has {i_count} indices (fewer than 3)")
                total_triangles += i_count // 3
            else:
                total_triangles += v_count // 3

    if total_vertices == 0 or total_triangles == 0:
        raise ConvertError(f"Empty geometry detected: {total_vertices} vertices, {total_triangles} triangles")

    # Bounding dimensions
    dims = [0.0, 0.0, 0.0]
    if not math.isinf(global_min[0]) and not math.isinf(global_max[0]):
        dims = [global_max[i] - global_min[i] for i in range(3)]
        if max(dims) <= 0.0 or math.isinf(max(dims)):
            raise ConvertError("Model has zero or non-finite bounding dimensions")

    # Check external images/textures
    for img in data.get("images", []):
        uri = img.get("uri")
        if uri and not uri.startswith("data:"):
            tex_file = path.parent / uri
            if not tex_file.is_file():
                raise ConvertError(f"GLB references missing external texture: {uri}")

    return {
        "valid": True,
        "vertexCount": total_vertices,
        "triangleCount": total_triangles,
        "bounds": {
            "min": [round(v, 4) for v in global_min] if not math.isinf(global_min[0]) else None,
            "max": [round(v, 4) for v in global_max] if not math.isinf(global_max[0]) else None,
            "dimensions": [round(d, 4) for d in dims],
        },
    }


def extract_glb_rtc_center(glb_path: Path) -> list[float] | None:
    """Read GLB 2.0 JSON chunk header and extract extensions.CESIUM_RTC.center if present."""
    path = Path(glb_path)
    if not path.is_file():
        return None
    try:
        if path.stat().st_size < 20:
            return None
        with path.open("rb") as f:
            header = f.read(12)
            if len(header) < 12:
                return None
            magic, version, _length = struct.unpack("<4sII", header)
            if magic != b"glTF" or version != 2:
                return None
            chunk_header = f.read(8)
            if len(chunk_header) < 8:
                return None
            chunk_len, chunk_type = struct.unpack("<II", chunk_header)
            if chunk_type != 0x4E4F534A:
                return None
            json_bytes = f.read(chunk_len)
            if len(json_bytes) < chunk_len:
                return None
        data = json.loads(json_bytes.decode("utf-8"))
        extensions = data.get("extensions")
        if not isinstance(extensions, dict):
            return None
        rtc = extensions.get("CESIUM_RTC")
        if not isinstance(rtc, dict):
            return None
        center = rtc.get("center")
        if isinstance(center, (list, tuple)) and len(center) == 3:
            vals = [float(v) for v in center]
            if all(math.isfinite(v) for v in vals):
                return vals
    except Exception:
        return None
    return None


def _copy_and_validate_glb(
    src_glb: Path,
    dest_glb: Path,
    transform_out: dict[str, Any] | None,
) -> Path:
    validate_glb(src_glb)
    dest_glb.write_bytes(src_glb.read_bytes())
    validate_glb(dest_glb)
    if transform_out is not None:
        rtc = extract_glb_rtc_center(src_glb)
        transform_out.update({
            "origin": rtc or [0.0, 0.0, 0.0],
            "axisConvention": "z_up",
            "hasCesiumRtc": rtc is not None,
        })
    return dest_glb


def _recenter_and_export_scene(loaded: Any, dest_glb: Path) -> list[float]:
    """Bake node transforms, subtract bounds center in float64, rotate Z-up -> Y-up, and export GLB."""
    if not isinstance(loaded, trimesh.Scene):
        loaded = trimesh.Scene(loaded)

    if loaded.bounds is None or not loaded.geometry:
        raise ConvertError("Loaded model contains empty geometry")

    bounds = np.asarray(loaded.bounds, dtype=np.float64)
    if not np.isfinite(bounds).all():
        raise ConvertError("Model contains non-finite bounding coordinates")

    origin_arr = bounds.mean(axis=0)
    origin = [float(v) for v in origin_arr]

    dumped = loaded.dump(concatenate=False)
    if not dumped:
        raise ConvertError("Loaded model contains no mesh instances")

    # Rotate -90 deg around X: (x, y, z) -> (x, z, -y)
    rot_x_neg90 = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, -1.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )

    recentered_scene = trimesh.Scene()
    has_vertices = False
    for idx, geom in enumerate(dumped):
        verts = getattr(geom, "vertices", None)
        if verts is not None and len(verts) > 0:
            if not np.isfinite(verts).all():
                raise ConvertError("Model contains non-finite vertex coordinates")
            has_vertices = True
            geom.vertices = np.asarray(verts, dtype=np.float64) - origin_arr
            geom.apply_transform(rot_x_neg90)
        base_name = "mesh"
        if hasattr(geom, "metadata") and isinstance(geom.metadata, dict):
            base_name = str(geom.metadata.get("node") or geom.metadata.get("name") or "mesh")
        unique_name = f"{base_name}_{idx}"
        recentered_scene.add_geometry(geom, geom_name=unique_name, node_name=unique_name)

    if not has_vertices:
        raise ConvertError("Loaded model contains empty geometry")

    recentered_scene.export(str(dest_glb))
    if not dest_glb.is_file() or dest_glb.stat().st_size == 0:
        raise ConvertError("GLB export failed or generated empty 0-byte file")
    return origin


def convert_textured_model(
    archive: Path,
    dest_glb: Path,
    *,
    transform_out: dict[str, Any] | None = None,
) -> Path:
    """Turn NodeODM textured_model.zip (or a folder / OBJ / GLB) into a validated web-ready GLB."""
    archive = Path(archive)
    dest_glb = Path(dest_glb).resolve()
    dest_glb.parent.mkdir(parents=True, exist_ok=True)

    # 1. Direct GLB input: validate first, do NOT blindly copy!
    if archive.is_file() and archive.suffix.lower() == ".glb":
        return _copy_and_validate_glb(archive, dest_glb, transform_out)

    obj: Path | None = None
    gltf: Path | None = None

    if archive.is_file():
        suffix = archive.suffix.lower()
        if suffix == ".zip":
            work = dest_glb.parent / "_mesh"
            work.mkdir(parents=True, exist_ok=True)
            safe_extract_zip(archive, work)
            obj = _first(work, {".obj"})
            gltf = _first(work, {".glb", ".gltf"})
        elif suffix == ".obj":
            obj = archive
        elif suffix == ".gltf":
            gltf = archive
    elif archive.is_dir():
        obj = _first(archive, {".obj"})
        gltf = _first(archive, {".glb", ".gltf"})

    if gltf and gltf.suffix.lower() == ".glb":
        return _copy_and_validate_glb(gltf, dest_glb, transform_out)

    if gltf and gltf.suffix.lower() == ".gltf":
        loaded = trimesh.load(str(gltf), force="scene")
        origin = _recenter_and_export_scene(loaded, dest_glb)
        validate_glb(dest_glb)
        if transform_out is not None:
            transform_out.update({
                "origin": origin,
                "axisConvention": "z_up_to_y_up",
                "hasCesiumRtc": False,
            })
        return dest_glb

    if not obj:
        raise ConvertError(f"No OBJ/GLTF mesh found in {archive}")

    # For OBJ conversion: verify material (.mtl) and textures if referenced
    obj_text = obj.read_text(encoding="utf-8", errors="replace")
    for line in obj_text.splitlines():
        line_s = line.strip()
        if line_s.startswith("mtllib "):
            mtl_name = line_s.split(None, 1)[1].strip()
            mtl_path = obj.parent / mtl_name
            if not mtl_path.is_file():
                # Report missing MTL if specified
                raise ConvertError(f"OBJ model references missing material file: '{mtl_name}' in {obj.parent}")
            mtl_text = mtl_path.read_text(encoding="utf-8", errors="replace")
            for m_line in mtl_text.splitlines():
                m_s = m_line.strip()
                if m_s.startswith("map_Kd ") or m_s.startswith("map_Ka ") or m_s.startswith("map_Bump "):
                    tex_file_name = m_s.split(None, 1)[1].strip()
                    tex_path = obj.parent / tex_file_name
                    if not tex_path.is_file():
                        raise ConvertError(f"Material '{mtl_name}' references texture '{tex_file_name}' which does not exist")

    loaded = trimesh.load(str(obj), force="scene")
    origin = _recenter_and_export_scene(loaded, dest_glb)

    # Validate output geometry and structure
    validate_glb(dest_glb)
    if transform_out is not None:
        transform_out.update({
            "origin": origin,
            "axisConvention": "z_up_to_y_up",
            "hasCesiumRtc": False,
        })
    return dest_glb


def extract_all_zip(all_zip: Path, dest_dir: Path) -> Path:
    return safe_extract_zip(all_zip, dest_dir)


def _first(root: Path, suffixes: set[str]) -> Path | None:
    matches = [p for p in root.rglob("*") if p.suffix.lower() in suffixes]
    return matches[0] if matches else None

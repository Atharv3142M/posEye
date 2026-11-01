from __future__ import annotations

import zipfile
from pathlib import Path

import trimesh


class ConvertError(RuntimeError):
    pass


MAX_ZIP_FILES = 50_000
MAX_ZIP_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB limit


def safe_extract_zip(archive_path: Path, dest_dir: Path) -> Path:
    """Extract zip archive safely guarding against directory traversal and decompression bombs."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_resolved = dest_dir.resolve()

    with zipfile.ZipFile(archive_path) as zf:
        members = zf.infolist()
        if len(members) > MAX_ZIP_FILES:
            raise ConvertError(f"Zip archive exceeds maximum entry limit ({len(members)} > {MAX_ZIP_FILES})")

        total_bytes = 0
        for m in members:
            total_bytes += m.file_size
            if total_bytes > MAX_ZIP_UNCOMPRESSED_BYTES:
                raise ConvertError("Zip archive exceeds decompression safety limit (10 GB)")

            target_path = (dest_dir / m.filename).resolve()
            try:
                target_path.relative_to(dest_resolved)
            except ValueError:
                raise ConvertError(f"Illegal relative path detected in archive: {m.filename}")

        zf.extractall(dest_dir)
    return dest_dir


def convert_textured_model(archive: Path, dest_glb: Path) -> Path:
    """Turn NodeODM textured_model.zip (or a folder / OBJ) into a web-ready GLB."""
    dest_glb.parent.mkdir(parents=True, exist_ok=True)
    if archive.is_file() and archive.suffix.lower() == ".glb":
        dest_glb.write_bytes(archive.read_bytes())
        return dest_glb

    work = dest_glb.parent / "_mesh"
    work.mkdir(parents=True, exist_ok=True)
    source_dir = archive
    if archive.is_file() and archive.suffix.lower() == ".zip":
        safe_extract_zip(archive, work)
        source_dir = work
    elif archive.is_file():
        source_dir = archive.parent

    obj = _first(source_dir, {".obj"}) if source_dir.is_dir() else None
    gltf = _first(source_dir, {".glb", ".gltf"}) if source_dir.is_dir() else None
    if archive.suffix.lower() == ".obj":
        obj = archive
    if archive.suffix.lower() in {".gltf", ".glb"}:
        gltf = archive
    if gltf and gltf.suffix.lower() == ".glb":
        dest_glb.write_bytes(gltf.read_bytes())
        return dest_glb
    if gltf and gltf.suffix.lower() == ".gltf":
        scene = trimesh.load(str(gltf), force="scene")
        scene.export(str(dest_glb))
        return dest_glb
    if not obj:
        raise ConvertError(f"No OBJ/GLTF mesh found in {archive}")
    loaded = trimesh.load(str(obj), force="scene")
    loaded.export(str(dest_glb))
    if not dest_glb.is_file() or dest_glb.stat().st_size == 0:
        raise ConvertError("GLB export failed or generated empty 0-byte file")
    return dest_glb


def extract_all_zip(all_zip: Path, dest_dir: Path) -> Path:
    return safe_extract_zip(all_zip, dest_dir)


def _first(root: Path, suffixes: set[str]) -> Path | None:
    matches = [p for p in root.rglob("*") if p.suffix.lower() in suffixes]
    return matches[0] if matches else None

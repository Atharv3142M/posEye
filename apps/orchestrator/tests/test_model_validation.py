from __future__ import annotations

import json
import struct
import zipfile
from pathlib import Path
import pytest
import trimesh

from orchestrator.convert import ConvertError, safe_extract_zip, validate_glb, convert_textured_model


def _create_minimal_glb(dest: Path, empty: bool = False, non_finite: bool = False) -> Path:
    """Create a synthetic GLB 2.0 file for test assertions."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if empty:
        # Mesh with 0 vertices
        manifest = {
            "asset": {"version": "2.0"},
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"count": 0, "type": "VEC3", "componentType": 5126, "min": [0, 0, 0], "max": [0, 0, 0]}],
        }
    elif non_finite:
        manifest = {
            "asset": {"version": "2.0"},
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"count": 3, "type": "VEC3", "componentType": 5126, "min": [float("nan"), 0, 0], "max": [1, 1, 1]}],
        }
    else:
        manifest = {
            "asset": {"version": "2.0"},
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"count": 3, "type": "VEC3", "componentType": 5126, "min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 1.0]}],
        }

    json_bytes = json.dumps(manifest).encode("utf-8")
    # Pad to 4-byte boundary
    pad_len = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b" " * pad_len

    total_len = 12 + 8 + len(json_bytes)
    header = struct.pack("<4sII", b"glTF", 2, total_len)
    chunk_header = struct.pack("<II", len(json_bytes), 0x4E4F534A)

    with open(dest, "wb") as f:
        f.write(header)
        f.write(chunk_header)
        f.write(json_bytes)
    return dest


def test_validate_glb_valid(tmp_path: Path):
    valid_glb = _create_minimal_glb(tmp_path / "valid.glb")
    res = validate_glb(valid_glb)
    assert res["valid"] is True
    assert res["vertexCount"] == 3
    assert res["bounds"]["dimensions"] == [1.0, 1.0, 1.0]


def test_validate_glb_rejects_empty(tmp_path: Path):
    empty_glb = _create_minimal_glb(tmp_path / "empty.glb", empty=True)
    with pytest.raises(ConvertError, match="0 vertices|Empty geometry"):
        validate_glb(empty_glb)


def test_validate_glb_rejects_non_finite(tmp_path: Path):
    bad_glb = _create_minimal_glb(tmp_path / "bad.glb", non_finite=True)
    with pytest.raises(ConvertError, match="Non-finite coordinates"):
        validate_glb(bad_glb)


def test_validate_glb_rejects_truncated(tmp_path: Path):
    trunc_path = tmp_path / "trunc.glb"
    trunc_path.write_bytes(b"glTF\x02\x00\x00\x00\x00")
    with pytest.raises(ConvertError, match="too small|Truncated"):
        validate_glb(trunc_path)


def test_zip_security_absolute_path_rejected(tmp_path: Path):
    zip_path = tmp_path / "abs.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("/etc/passwd", "root:x:0:0")
    dest = tmp_path / "dest"
    with pytest.raises(ConvertError, match="Illegal absolute or drive-letter path"):
        safe_extract_zip(zip_path, dest)


def test_zip_security_drive_letter_rejected(tmp_path: Path):
    zip_path = tmp_path / "drive.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("C:/Windows/system32/cmd.exe", "fake")
    dest = tmp_path / "dest"
    with pytest.raises(ConvertError, match="Illegal absolute or drive-letter path"):
        safe_extract_zip(zip_path, dest)


def test_zip_security_traversal_rejected(tmp_path: Path):
    zip_path = tmp_path / "traversal.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("sub/../../traversal.txt", "payload")
    dest = tmp_path / "dest"
    with pytest.raises(ConvertError, match="Illegal relative path or directory traversal"):
        safe_extract_zip(zip_path, dest)


def test_obj_conversion_missing_mtl_rejected(tmp_path: Path):
    obj_file = tmp_path / "cube.obj"
    obj_file.write_text("mtllib missing.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")
    dest_glb = tmp_path / "out.glb"
    with pytest.raises(ConvertError, match="missing material file"):
        convert_textured_model(obj_file, dest_glb)

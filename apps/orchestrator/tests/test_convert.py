import json
import struct
import zipfile
from pathlib import Path

import numpy as np
import pytest
import trimesh

from orchestrator.convert import (
    ConvertError,
    convert_textured_model,
    extract_glb_rtc_center,
    safe_extract_zip,
)


def test_convert_obj_to_glb(tmp_path: Path):
    obj = tmp_path / "mesh.obj"
    obj.write_text("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n", encoding="utf-8")
    dest = tmp_path / "model.glb"
    convert_textured_model(obj, dest)
    assert dest.is_file()
    assert dest.stat().st_size > 20


def test_safe_extract_zip_normal(tmp_path: Path):
    zip_path = tmp_path / "good.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("test.txt", "hello safe zip")
    dest = tmp_path / "extracted"
    safe_extract_zip(zip_path, dest)
    assert (dest / "test.txt").read_text(encoding="utf-8") == "hello safe zip"


def test_safe_extract_zip_rejects_zip_slip(tmp_path: Path):
    zip_path = tmp_path / "slip.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("../evil.txt", "traversal attempt")
    dest = tmp_path / "target_dir"
    with pytest.raises(ConvertError, match="Illegal relative path"):
        safe_extract_zip(zip_path, dest)


def _write_glb_with_manifest(dest: Path, manifest: dict) -> Path:
    json_bytes = json.dumps(manifest).encode("utf-8")
    json_bytes += b" " * ((4 - (len(json_bytes) % 4)) % 4)
    total_len = 12 + 8 + len(json_bytes)
    with dest.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
    return dest


def test_convert_utm_obj_float64_recentering_and_z_up_to_y_up(tmp_path: Path):
    obj = tmp_path / "utm.obj"
    # Large UTM coordinates with 1 mm offset that float32 would lose without float64 subtraction
    obj.write_text(
        "v 500000.000 4500000.000 100.000\n"
        "v 500001.000 4500000.000 100.000\n"
        "v 500000.001 4500002.000 104.000\n"
        "f 1 2 3\n",
        encoding="utf-8",
    )
    dest = tmp_path / "model.glb"
    tx: dict = {}
    convert_textured_model(obj, dest, transform_out=tx)

    assert tx["axisConvention"] == "z_up_to_y_up"
    assert tx["hasCesiumRtc"] is False
    assert tx["origin"] == pytest.approx([500000.5, 4500001.0, 102.0], abs=1e-6)

    scene = trimesh.load(str(dest), force="scene")
    verts = np.vstack([g.vertices for g in scene.dump(concatenate=False)])
    verts_sorted = verts[np.argsort(verts[:, 0])]
    # (x, y, z) - origin -> (x', z', -y'):
    # v0 - origin = (-0.5, -1.0, -2.0) -> (-0.5, -2.0, 1.0)
    # v2 - origin = (-0.499, 1.0, 2.0) -> (-0.499, 2.0, -1.0)
    expected = np.array(
        [
            [-0.5, -2.0, 1.0],
            [-0.499, 2.0, -1.0],
            [0.5, -2.0, 1.0],
        ]
    )
    assert np.allclose(verts_sorted, expected, atol=1e-4)
    assert abs((verts_sorted[1, 0] - verts_sorted[0, 0]) - 0.001) < 1e-5


def test_convert_empty_obj_rejected(tmp_path: Path):
    obj = tmp_path / "empty.obj"
    obj.write_text("# no geometry here\n", encoding="utf-8")
    with pytest.raises(ConvertError, match="empty geometry"):
        convert_textured_model(obj, tmp_path / "out.glb")


def test_convert_obj_ignores_sibling_glb(tmp_path: Path):
    sibling = tmp_path / "sibling.glb"
    _write_glb_with_manifest(
        sibling,
        {
            "asset": {"version": "2.0"},
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"count": 3, "type": "VEC3", "componentType": 5126, "min": [0, 0, 0], "max": [1, 1, 1]}],
            "extensions": {"CESIUM_RTC": {"center": [10.0, 20.0, 30.0]}},
        },
    )
    obj = tmp_path / "mesh.obj"
    obj.write_text("v 0 0 0\nv 2 0 0\nv 0 2 0\nf 1 2 3\n", encoding="utf-8")
    dest = tmp_path / "converted.glb"
    tx: dict = {}
    convert_textured_model(obj, dest, transform_out=tx)
    assert tx["axisConvention"] == "z_up_to_y_up"
    assert tx["hasCesiumRtc"] is False


def test_extract_glb_rtc_center(tmp_path: Path):
    rtc_glb = _write_glb_with_manifest(
        tmp_path / "rtc.glb",
        {
            "asset": {"version": "2.0"},
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"count": 3, "type": "VEC3", "componentType": 5126, "min": [0, 0, 0], "max": [1, 1, 1]}],
            "extensions": {"CESIUM_RTC": {"center": [619301.0, 3350278.0, 0.0]}},
        },
    )
    assert extract_glb_rtc_center(rtc_glb) == [619301.0, 3350278.0, 0.0]

    tx: dict = {}
    convert_textured_model(rtc_glb, tmp_path / "copied.glb", transform_out=tx)
    assert tx == {
        "origin": [619301.0, 3350278.0, 0.0],
        "axisConvention": "z_up",
        "hasCesiumRtc": True,
    }

    no_rtc_glb = _write_glb_with_manifest(
        tmp_path / "plain.glb",
        {
            "asset": {"version": "2.0"},
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"count": 3, "type": "VEC3", "componentType": 5126, "min": [0, 0, 0], "max": [1, 1, 1]}],
        },
    )
    assert extract_glb_rtc_center(no_rtc_glb) is None


_TEST7_GLB = Path(__file__).resolve().parents[3] / "testing results" / "test7.glb"


@pytest.mark.skipif(not _TEST7_GLB.is_file(), reason="testing results/test7.glb fixture not present")
def test_extract_glb_rtc_center_test7_fixture():
    center = extract_glb_rtc_center(_TEST7_GLB)
    assert center == [619301.0, 3350278.0, 0.0]

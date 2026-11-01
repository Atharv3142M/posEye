import zipfile
from pathlib import Path

import pytest

from orchestrator.convert import ConvertError, convert_textured_model, safe_extract_zip


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

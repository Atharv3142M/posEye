import json
from pathlib import Path

from orchestrator.preview import cloud_preview


def test_cloud_preview_samples_obj_vertices(tmp_path: Path):
    odm = tmp_path / "odm"
    odm.mkdir()
    (odm / "model.obj").write_text("v 0 0 0\nv 1 2 3\nf 1 1 1\n", encoding="utf-8")
    path = cloud_preview(tmp_path, odm, limit=10)
    assert path is not None
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["count"] == 2
    assert data["positions"] == [0.0, 0.0, 0.0, 1.0, 2.0, 3.0]
    assert cloud_preview(tmp_path, odm, limit=10) == path

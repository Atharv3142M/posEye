from pathlib import Path

import httpx

from orchestrator.nodeodm import NodeODMClient
from orchestrator.presets import detect_preset, preset_options


class _MockTransport(httpx.BaseTransport):
    def __init__(self):
        self.created = False
        self.output_lines = [
            "Initializing OpenSfM...",
            "Matching 15 image pairs...",
            "Bundle adjustment converged in 14 iterations.",
            "Exporting dense point cloud...",
        ]

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("task/new/init"):
            return httpx.Response(200, json={"uuid": "multi-stage-uuid"})
        if "task/new/upload/multi-stage-uuid" in url:
            return httpx.Response(200, json={"success": True})
        if "task/new/commit/multi-stage-uuid" in url:
            return httpx.Response(200, json={"success": True})
        if url.endswith("task/new"):
            self.created = True
            return httpx.Response(200, json={"uuid": "abc-123"})
        if "/task/abc-123/info" in url or "/task/multi-stage-uuid/info" in url:
            return httpx.Response(
                200,
                json={"status": {"code": 40}, "progress": 100},
            )
        if "/task/abc-123/output" in url or "/task/multi-stage-uuid/output" in url:
            return httpx.Response(200, json=self.output_lines)
        if "/task/abc-123/download/all.zip" in url or "/task/multi-stage-uuid/download/all.zip" in url:
            return httpx.Response(200, content=b"PK\x03\x04fake")
        if url.endswith("/info"):
            return httpx.Response(200, json={"version": "test"})
        return httpx.Response(404)


def test_preset_options():
    opts = preset_options("low")
    names = {o["name"] for o in opts}
    assert "resize-to" in names
    assert detect_preset() in {"low", "medium", "high"}


def test_create_task_multi_stage_lifecycle(tmp_path: Path, monkeypatch):
    images = tmp_path / "frames"
    images.mkdir()
    (images / "image_000001.jpg").write_bytes(b"\xff\xd8\xff")
    (images / "image_000002.jpg").write_bytes(b"\xff\xd8\xff")

    client = NodeODMClient("http://nodeodm.test")
    transport = _MockTransport()
    real_client = httpx.Client

    def fake_client(*args, **kwargs):
        kwargs["transport"] = transport
        kwargs["base_url"] = "http://nodeodm.test"
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", fake_client)

    uuid = client.create_task(images, preset_options("medium"), tmp_path / "upload.zip")
    assert uuid == "multi-stage-uuid"
    assert (tmp_path / "upload.zip").is_file()

    # Test real-time output line fetching
    lines = client.task_output(uuid, line=0)
    assert len(lines) == 4
    assert "Bundle adjustment" in lines[2]

    # Test wait with progress callback
    emitted = []
    info = client.wait(uuid, progress=lambda s, p, m: emitted.append((s, p, m)))
    assert info.completed
    assert any("Bundle adjustment" in m for _, _, m in emitted)

    dest = client.download_asset(uuid, "all.zip", tmp_path / "all.zip")
    assert dest.read_bytes().startswith(b"PK")


def test_create_task_fallback_to_single_shot(tmp_path: Path, monkeypatch):
    images = tmp_path / "frames"
    images.mkdir()
    (images / "image_000001.png").write_bytes(b"\x89PNG")
    (images / "image_000002.tif").write_bytes(b"II*\x00")

    class _FallbackTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            if url.endswith("task/new/init"):
                return httpx.Response(404, text="Not Found")
            if url.endswith("task/new"):
                return httpx.Response(200, json={"uuid": "single-shot-uuid"})
            if "task/cancel" in url:
                return httpx.Response(200, json={"success": True})
            return httpx.Response(404)

    client = NodeODMClient("http://nodeodm.test")
    transport = _FallbackTransport()
    real_client = httpx.Client

    def fake_client(*args, **kwargs):
        kwargs["transport"] = transport
        kwargs["base_url"] = "http://nodeodm.test"
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", fake_client)

    uuid = client.create_task(images, preset_options("low"))
    assert uuid == "single-shot-uuid"
    assert client.cancel_task(uuid) is True


def test_mime_for_types():
    from orchestrator.nodeodm import _mime_for
    assert _mime_for(Path("test.jpg")) == "image/jpeg"
    assert _mime_for(Path("test.jpeg")) == "image/jpeg"
    assert _mime_for(Path("test.png")) == "image/png"
    assert _mime_for(Path("test.tif")) == "image/tiff"
    assert _mime_for(Path("test.tiff")) == "image/tiff"

from fastapi.testclient import TestClient

from orchestrator.main import app


def test_health():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "docker" in data
    assert "nodeodm" in data
    assert "ffmpeg" in data
    assert "gpu" in data
    assert "status" in data["docker"]
    assert "status" in data["nodeodm"]


def test_system_status_contract():
    client = TestClient(app)
    res = client.get("/system/status")
    assert res.status_code == 200
    data = res.json()
    assert "cpuPercent" in data
    assert "ramUsedGb" in data
    assert "docker" in data
    assert "nodeodm" in data
    assert "ffmpeg" in data
    assert "gpuAvailable" in data
    assert data["docker"]["status"] in {"running", "stopped", "not_installed", "error"}
    assert data["nodeodm"]["status"] in {"connected", "unreachable", "unavailable"}
    assert data["ffmpeg"]["status"] in {"detected", "missing"}


def test_job_event_deduplication(tmp_path):
    from orchestrator.jobs import JobStore

    store = JobStore(tmp_path)
    job = store.create(tmp_path / "video.mp4")
    initial_count = len(job.events)  # 1 ("queued")

    # Emit first event
    store._emit(job, "reconstructing", 50.0, "Dense point cloud")
    assert len(job.events) == initial_count + 1

    # Emit identical consecutive event (duplicate)
    store._emit(job, "reconstructing", 50.0, "Dense point cloud")
    assert len(job.events) == initial_count + 1  # duplicate suppressed!

    # Emit distinct event
    store._emit(job, "reconstructing", 52.0, "Surface meshing")
    assert len(job.events) == initial_count + 2


def test_missing_video():
    client = TestClient(app)
    res = client.post("/jobs", json={"videoPath": "C:/nope/missing.mp4"})
    assert res.status_code == 400


def test_unknown_logs():
    client = TestClient(app)
    res = client.get("/jobs/nope/logs")
    assert res.status_code == 404


def test_probe_missing():
    client = TestClient(app)
    res = client.post("/probe/video", json={"videoPath": "C:/nope/missing.mp4"})
    assert res.status_code == 400

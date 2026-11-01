import json
from pathlib import Path
from fastapi.testclient import TestClient

from orchestrator.main import app, store


def test_health():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["orchestratorVersion"] == "0.1.2"
    assert "docker" in data
    assert "nodeodm" in data
    assert "ffmpeg" in data
    assert "ok" in data["ffmpeg"]
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
    assert "ok" in data["ffmpeg"]


def test_job_event_deduplication(tmp_path: Path):
    from orchestrator.jobs import JobStore

    store_inst = JobStore(tmp_path)
    job = store_inst.create(tmp_path / "video.mp4")
    initial_count = len(job.events)  # 1 ("queued")

    # Emit first event
    store_inst._emit(job, "reconstructing", 50.0, "Dense point cloud")
    assert len(job.events) == initial_count + 1

    # Emit identical consecutive event (duplicate)
    store_inst._emit(job, "reconstructing", 50.0, "Dense point cloud")
    assert len(job.events) == initial_count + 1  # duplicate suppressed!

    # Emit distinct event
    store_inst._emit(job, "reconstructing", 52.0, "Surface meshing")
    assert len(job.events) == initial_count + 2


def test_delete_active_job_conflict(tmp_path: Path):
    client = TestClient(app)
    # Create fake active job in global store
    job = store.create(tmp_path / "video.mp4")
    job.stage = "reconstructing"
    res = client.delete(f"/jobs/{job.id}")
    assert res.status_code == 409
    assert "Cannot delete active job" in res.json()["detail"]

    # Now cancel and delete
    job.stage = "cancelled"
    res2 = client.delete(f"/jobs/{job.id}")
    assert res2.status_code == 200


def test_startup_recovery(tmp_path: Path):
    from orchestrator.jobs import JobStore

    job_dir = tmp_path / "job_recov"
    job_dir.mkdir()
    (job_dir / "job.json").write_text(
        json.dumps(
            {
                "id": "job_recov",
                "videoPath": "test.mp4",
                "stage": "reconstructing",
                "percent": 45.0,
                "message": "Reconstructing point cloud",
            }
        ),
        encoding="utf-8",
    )
    reloaded_store = JobStore(tmp_path)
    loaded_job = reloaded_store.get("job_recov")
    assert loaded_job is not None
    assert loaded_job.stage == "interrupted"
    assert loaded_job.error_code == "INTERRUPTED"
    assert "interrupted by shutdown or restart" in loaded_job.message


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

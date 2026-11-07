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
    assert data["serviceId"] == "poseye-orchestrator"
    assert data["product"] == "posEye"
    assert data["component"] == "Orchestrator"
    assert data["orchestratorVersion"] == "0.1.6"
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
    assert "gpuHardware" in data
    assert "nvidiaDriver" in data
    assert "nvidiaSmi" in data
    assert "dockerGpuAccess" in data
    assert "engineGpuCapability" in data
    assert "gpuProcessingActive" in data
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


def test_cors_origins_isolation(tmp_path: Path):
    from orchestrator.main import API_TOKEN

    client = TestClient(app)

    # 1. Packaged Electron origin 'poseye://app' MUST be allowed
    res_packaged = client.options(
        "/health",
        headers={
            "Origin": "poseye://app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res_packaged.status_code == 200
    assert res_packaged.headers.get("access-control-allow-origin") == "poseye://app"

    # 2. Local development origin 'http://127.0.0.1:5173' MUST be allowed
    res_local = client.options(
        "/health",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res_local.status_code == 200
    assert res_local.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"

    # 3. Arbitrary opaque 'null' origin MUST be REJECTED
    res_null = client.options(
        "/health",
        headers={
            "Origin": "null",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res_null.status_code == 400
    assert res_null.headers.get("access-control-allow-origin") is None

    # 4. Unrelated external HTTPS origin MUST be REJECTED
    res_evil = client.options(
        "/health",
        headers={
            "Origin": "https://malicious-site.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res_evil.status_code == 400
    assert res_evil.headers.get("access-control-allow-origin") is None

    # 5. Direct GET without Origin header receives no Access-Control headers
    res_direct = client.get("/health")
    assert res_direct.status_code == 200
    assert res_direct.headers.get("access-control-allow-origin") is None


def test_authentication_enforcement(monkeypatch, tmp_path: Path):
    token = "test-token-sec-98765"
    monkeypatch.setattr("orchestrator.main.API_TOKEN", token)

    client = TestClient(app)

    # 1. Standard API endpoint: /system/status
    res = client.get("/system/status")
    assert res.status_code == 401
    assert "Unauthorized" in res.json().get("detail", "")

    res_bad = client.get("/system/status", headers={"Authorization": "Bearer wrong-token"})
    assert res_bad.status_code == 401

    res_query = client.get(f"/system/status?token={token}")
    assert res_query.status_code == 401

    res_ok_bearer = client.get("/system/status", headers={"Authorization": f"Bearer {token}"})
    assert res_ok_bearer.status_code == 200

    res_ok_x_api = client.get("/system/status", headers={"X-Api-Token": token})
    assert res_ok_x_api.status_code == 200

    # 2. Asset endpoint: /jobs/{id}/assets/{asset}
    job = store.create(tmp_path / "flight.mp4")
    (job.work_dir / "model.glb").write_bytes(b"mock_glb")

    res_asset_unauth = client.get(f"/jobs/{job.id}/assets/model.glb")
    assert res_asset_unauth.status_code == 401

    res_asset_bad = client.get(f"/jobs/{job.id}/assets/model.glb", headers={"Authorization": "Bearer wrong-token"})
    assert res_asset_bad.status_code == 401

    res_asset_query = client.get(f"/jobs/{job.id}/assets/model.glb?token={token}")
    assert res_asset_query.status_code == 401

    res_asset_ok_bearer = client.get(f"/jobs/{job.id}/assets/model.glb", headers={"Authorization": f"Bearer {token}"})
    assert res_asset_ok_bearer.status_code == 200

    res_asset_ok_x_api = client.get(f"/jobs/{job.id}/assets/model.glb", headers={"X-Api-Token": token})
    assert res_asset_ok_x_api.status_code == 200


def test_asset_route_security_and_cors(tmp_path: Path, monkeypatch):
    token = "test-cors-token-abc"
    monkeypatch.setattr("orchestrator.main.API_TOKEN", token)

    client = TestClient(app)

    # Set up a real job in store with real assets
    job = store.create(tmp_path / "flight.mp4")
    (job.work_dir / "model.glb").write_bytes(b"glTF_binary_mock_data")
    odm_dir = job.work_dir / "odm"
    odm_dir.mkdir(parents=True, exist_ok=True)
    (odm_dir / "orthophoto.tif").write_bytes(b"TIFF_mock_data")
    (odm_dir / "cloud.laz").write_bytes(b"LAZ_mock_data")

    auth_headers = {"Authorization": f"Bearer {token}"}

    # A. Unauthorized asset requests MUST be rejected (401)
    res_unauth = client.get(f"/jobs/{job.id}/assets/model.glb")
    assert res_unauth.status_code == 401

    res_bad_token = client.get(
        f"/jobs/{job.id}/assets/model.glb",
        headers={"Authorization": "Bearer bad-token-xyz"},
    )
    assert res_bad_token.status_code == 401

    # Query parameter tokens MUST NOT be accepted
    res_query_token = client.get(f"/jobs/{job.id}/assets/model.glb?token={token}")
    assert res_query_token.status_code == 401

    # B. Allowed Packaged Origin (poseye://app) on actual asset route
    res_opt_asset = client.options(
        f"/jobs/{job.id}/assets/model.glb",
        headers={
            "Origin": "poseye://app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res_opt_asset.status_code == 200
    assert res_opt_asset.headers.get("access-control-allow-origin") == "poseye://app"

    res_get_asset = client.get(
        f"/jobs/{job.id}/assets/model.glb",
        headers={"Origin": "poseye://app", **auth_headers},
    )
    assert res_get_asset.status_code == 200
    assert res_get_asset.headers.get("access-control-allow-origin") == "poseye://app"
    assert res_get_asset.headers.get("content-type") == "model/gltf-binary"
    assert res_get_asset.content == b"glTF_binary_mock_data"

    # C. Allowed Dev Origin (http://127.0.0.1:5173) on actual asset route
    res_dev_asset = client.get(
        f"/jobs/{job.id}/assets/model.glb",
        headers={"Origin": "http://127.0.0.1:5173", **auth_headers},
    )
    assert res_dev_asset.status_code == 200
    assert res_dev_asset.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"

    # D. Unrelated Origin (https://malicious.com) on actual asset route MUST NOT get CORS header
    res_evil_asset = client.get(
        f"/jobs/{job.id}/assets/model.glb",
        headers={"Origin": "https://malicious.com", **auth_headers},
    )
    assert res_evil_asset.headers.get("access-control-allow-origin") is None

    # E. Opaque Origin (null) on actual asset route MUST NOT get CORS header
    res_null_asset = client.get(
        f"/jobs/{job.id}/assets/model.glb",
        headers={"Origin": "null", **auth_headers},
    )
    assert res_null_asset.headers.get("access-control-allow-origin") is None

    # F. Direct GET without Origin header (e.g. from Python / backend script)
    res_direct_asset = client.get(
        f"/jobs/{job.id}/assets/model.glb",
        headers=auth_headers,
    )
    assert res_direct_asset.status_code == 200
    assert res_direct_asset.headers.get("access-control-allow-origin") is None

    # G. Asset types: Orthophoto (.tif) and Point Cloud (.laz)
    res_ortho = client.get(
        f"/jobs/{job.id}/assets/orthophoto.tif",
        headers={"Origin": "poseye://app", **auth_headers},
    )
    assert res_ortho.status_code == 200
    assert res_ortho.headers.get("access-control-allow-origin") == "poseye://app"
    assert res_ortho.headers.get("content-type") == "image/tiff"
    assert res_ortho.content == b"TIFF_mock_data"

    res_laz = client.get(
        f"/jobs/{job.id}/assets/model.laz",
        headers={"Origin": "poseye://app", **auth_headers},
    )
    assert res_laz.status_code == 200
    assert res_laz.headers.get("access-control-allow-origin") == "poseye://app"
    assert res_laz.headers.get("content-type") == "application/octet-stream"
    assert res_laz.content == b"LAZ_mock_data"


def test_system_diagnostics_redacts_secrets(monkeypatch):
    token = "super-secret-token-12345"
    monkeypatch.setattr("orchestrator.main.API_TOKEN", token)
    monkeypatch.setenv("DT_API_TOKEN", token)
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "super-secret-aws-key")

    client = TestClient(app)
    # 1. Unauthenticated request rejected
    res_unauth = client.get("/system/diagnostics")
    assert res_unauth.status_code == 401

    # 2. Authenticated request succeeds and redacts secrets
    res = client.get("/system/diagnostics", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert "reportGeneratedAt" in data
    assert "platform" in data
    assert "systemStatus" in data
    assert "pinnedImages" in data
    assert data["pinnedImages"]["nodeodmVersion"] == "3.6.2"
    assert data["pinnedImages"]["cpuImage"] == "opendronemap/nodeodm:3.6.2"
    assert data["pinnedImages"]["gpuImage"] == "opendronemap/nodeodm:3.6.2-gpu"

    env_vars = data.get("environmentVariables", {})
    for key, val in env_vars.items():
        if any(term in key.upper() for term in ["TOKEN", "SECRET", "KEY", "PASSWORD", "AUTH"]):
            assert val == "[REDACTED]"
            assert token not in val


def test_websocket_authentication(monkeypatch, tmp_path: Path):
    token = "ws-secret-token-456"
    monkeypatch.setattr("orchestrator.main.API_TOKEN", token)

    client = TestClient(app)
    job = store.create(tmp_path / "flight.mp4")

    # 1. WebSocket with invalid token fails with close code 4401
    with client.websocket_connect(
        f"/jobs/{job.id}/events",
        headers={"Authorization": "Bearer bad-token"},
    ) as ws:
        # Should be closed by server with 4401
        try:
            ws.receive_json()
            assert False, "Should have disconnected"
        except Exception:
            pass

    # 2. WebSocket with valid Bearer header succeeds
    with client.websocket_connect(
        f"/jobs/{job.id}/events",
        headers={"Authorization": f"Bearer {token}"},
    ) as ws:
        # Initial queued event is received
        data = ws.receive_json()
        assert data["stage"] == "queued"

    # 3. WebSocket with subprotocol succeeds
    with client.websocket_connect(
        f"/jobs/{job.id}/events",
        subprotocols=[f"poseye-auth.{token}"],
    ) as ws:
        data = ws.receive_json()
        assert data["stage"] == "queued"


def test_create_job_timestamp_validation(tmp_path: Path):
    client = TestClient(app)
    vid = tmp_path / "valid.mp4"
    vid.write_bytes(b"dummy_video")

    # Invalid timestamp order: end before start
    res_bad = client.post(
        "/jobs",
        json={
            "videoPath": str(vid),
            "captureStart": "2026-05-10T12:00:00Z",
            "captureEnd": "2026-05-10T11:00:00Z",
        },
    )
    assert res_bad.status_code == 400
    assert "earlier" in res_bad.json()["detail"]

    # Valid timestamp order
    res_ok = client.post(
        "/jobs",
        json={
            "videoPath": str(vid),
            "captureStart": "2026-05-10T12:00:00Z",
            "captureEnd": "2026-05-10T12:15:00Z",
        },
    )
    assert res_ok.status_code == 200
    data = res_ok.json()
    assert data["captureStart"] == "2026-05-10T12:00:00Z"
    assert data["captureEnd"] == "2026-05-10T12:15:00Z"


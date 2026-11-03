from __future__ import annotations

import collections
import json
import os
import secrets
import sys
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from orchestrator.jobs import JobStore
from orchestrator.presets import detect_preset
from orchestrator.system import system_status

JOBS_ROOT = Path(os.environ.get("DT_JOBS_DIR", Path.cwd() / ".jobs"))
store = JobStore(JOBS_ROOT)

# Per-launch API token for local API security (empty string disables auth in dev/tests if env not set)
API_TOKEN = os.environ.get("DT_API_TOKEN", "")

# ---------------------------------------------------------------------------
# In-memory circular buffer for orchestrator-level log entries
# ---------------------------------------------------------------------------
_APP_LOG: collections.deque[dict] = collections.deque(maxlen=500)


def _app_log(level: str, message: str) -> None:
    _APP_LOG.append(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
        }
    )
    print(message, flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup diagnostics
    try:
        import fastapi as _fastapi
        import trimesh as _trimesh
        import httpx as _httpx

        fa_ver = getattr(_fastapi, "__version__", "?")
        tm_ver = getattr(_trimesh, "__version__", "?")
        hx_ver = getattr(_httpx, "__version__", "?")
    except Exception:
        fa_ver = tm_ver = hx_ver = "?"

    py_ver = sys.version.split()[0]
    _app_log(
        "INFO",
        f"posEye orchestrator v0.1.4 started — Python {py_ver} | "
        f"fastapi={fa_ver} trimesh={tm_ver} httpx={hx_ver}",
    )

    try:
        status = system_status()
        ffmpeg = status.get("ffmpeg", {})
        if ffmpeg.get("ok"):
            _app_log("INFO", f"[posEye] ffmpeg: detected at {ffmpeg.get('path')}")
        else:
            _app_log("WARNING", f"[posEye] ffmpeg: NOT detected — {ffmpeg.get('error', 'not found')}")

        docker = status.get("docker", {})
        if docker.get("ok"):
            _app_log("INFO", f"[posEye] Docker: Running {docker.get('version', '')}")
        else:
            _app_log("WARNING", "[posEye] Docker: not available or not running")

        nodeodm = status.get("nodeodm", {})
        if nodeodm.get("ok"):
            _app_log("INFO", f"[posEye] NodeODM: Connected at {nodeodm.get('url')}")
        else:
            _app_log("WARNING", f"[posEye] NodeODM: not reachable at {nodeodm.get('url')} — is Docker running?")
    except Exception as exc:
        _app_log("ERROR", f"[posEye] system_status() check failed: {exc}")

    yield


app = FastAPI(title="posEye Orchestrator", version="0.1.4", lifespan=lifespan)

# Allowed CORS origins: restricted strictly to desktop Electron origins and local development hosts
DEFAULT_ALLOWED_ORIGINS = [
    "poseye://app",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]
_env_origins = os.environ.get("DT_ALLOWED_ORIGINS")
allowed_origins = list(DEFAULT_ALLOWED_ORIGINS)
if _env_origins:
    for _o in _env_origins.split(","):
        _o = _o.strip()
        if _o and _o not in allowed_origins:
            allowed_origins.append(_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)


# Token authentication dependency
bearer_scheme = HTTPBearer(auto_error=False)


def verify_api_token(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> None:
    if not API_TOKEN:
        return
    token = None
    if creds:
        token = creds.credentials
    if not token:
        token = request.headers.get("x-api-token")
    if token != API_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized: invalid or missing API token")


class CreateJob(BaseModel):
    videoPath: str
    srtPath: str | None = None
    preset: str | None = None
    generateMasks: bool = False
    name: str | None = None
    description: str | None = None
    fps: float | None = None
    blurThreshold: float | None = None


class JobOut(BaseModel):
    id: str
    name: str = ""
    description: str = ""
    stage: str
    percent: float
    message: str
    error: str | None = None
    geotagged: int = 0
    frameCount: int = 0
    preset: str
    hasModel: bool = False
    isGeoreferenced: bool = False
    georeferencing: dict = {}
    modelStats: dict = {}
    createdAt: str = ""
    updatedAt: str = ""
    videoPath: str = ""
    errorCode: str | None = None
    extract: dict = {}
    assets: dict = {}
    durationS: float = 0.0


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return JSONResponse(status_code=500, content={"error": str(exc), "stage": "unknown"})


# ---------------------------------------------------------------------------
# Health endpoint (service identity & version contract)
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    status = system_status()
    terminal = {"ready", "error", "cancelled", "interrupted"}
    active_jobs = sum(1 for j in store.jobs.values() if j.stage not in terminal)
    return {
        "serviceId": "poseye-orchestrator",
        "product": "posEye",
        "component": "Orchestrator",
        "orchestratorVersion": "0.1.4",
        "ok": True,
        "defaultPreset": detect_preset(),
        "ffmpeg": status.get("ffmpeg"),
        "nodeodm": status.get("nodeodm"),
        "docker": status.get("docker"),
        "gpu": {
            "available": status.get("gpuAvailable", False),
            "name": status.get("gpuName"),
            "nvidiaSmi": status.get("nvidiaSmiAvailable", False),
            "cuda": status.get("cudaAvailable", False),
            "acceleration": status.get("nodeodmAcceleration"),
            "message": status.get("message"),
        },
        "pythonVersion": sys.version.split()[0],
        "jobsDir": str(JOBS_ROOT),
        "activeJobs": active_jobs,
    }


@app.get("/system/status", dependencies=[Depends(verify_api_token)])
def get_system() -> dict:
    return system_status()


class ProbeBody(BaseModel):
    videoPath: str


@app.post("/probe/video", dependencies=[Depends(verify_api_token)])
def probe_video_endpoint(body: ProbeBody) -> dict:
    from pipeline.probe import probe_video

    try:
        info = probe_video(body.videoPath)
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc

    default_fps = 3.0
    estimated_frames = int((info.duration_s or 0) * default_fps) if info.duration_s else None

    dur_s = info.duration_s or 0
    minutes = int(dur_s // 60)
    seconds = int(dur_s % 60)
    dur_str = f"{minutes}m {seconds}s" if minutes else f"{seconds}s"
    res_str = f"{info.width}×{info.height}" if info.width and info.height else "?"
    fps_str = f"{info.fps:.0f}fps" if info.fps else "?"
    size_mb = round((info.size_bytes or 0) / 1024 / 1024, 0)
    size_str = f"{int(size_mb)}MB"
    summary = f"{dur_str} · {res_str} · {fps_str} · {size_str}"

    return {
        "path": str(info.path),
        "durationS": info.duration_s,
        "estimatedDuration": info.duration_s,
        "width": info.width,
        "height": info.height,
        "fps": info.fps,
        "sizeBytes": info.size_bytes,
        "name": info.path.name,
        "estimatedFrames": estimated_frames,
        "summary": summary,
    }


@app.get("/presets/default", dependencies=[Depends(verify_api_token)])
def default_preset() -> dict:
    return {"preset": detect_preset()}


@app.post("/jobs", response_model=JobOut, dependencies=[Depends(verify_api_token)])
async def create_job(body: CreateJob) -> JobOut:
    video = Path(body.videoPath)
    if not video.is_file():
        raise HTTPException(400, f"Video not found: {video}")
    srt = Path(body.srtPath) if body.srtPath else None
    if srt and not srt.is_file():
        raise HTTPException(400, f"SRT not found: {srt}")
    import asyncio

    job = store.create(
        video,
        srt,
        body.preset,
        body.generateMasks,
        asyncio.get_running_loop(),
        name=body.name or "",
        description=body.description or "",
        fps=body.fps if body.fps and body.fps > 0 else 3.0,
        blur_threshold=body.blurThreshold if body.blurThreshold and body.blurThreshold > 0 else 40.0,
    )
    # Track worker thread
    worker = threading.Thread(target=store.run_job, args=(job,), name=f"poseye-worker-{job.id}", daemon=True)
    worker.start()
    return _out(job)


@app.get("/jobs", response_model=list[JobOut], dependencies=[Depends(verify_api_token)])
def list_jobs() -> list[JobOut]:
    return [_out(j) for j in store.list()]


@app.get("/jobs/{job_id}", response_model=JobOut, dependencies=[Depends(verify_api_token)])
def get_job(job_id: str) -> JobOut:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    return _out(job)


@app.post("/jobs/{job_id}/cancel", response_model=JobOut, dependencies=[Depends(verify_api_token)])
def cancel_job(job_id: str) -> JobOut:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    store.cancel(job)
    return _out(job)


@app.delete("/jobs/{job_id}", dependencies=[Depends(verify_api_token)])
def delete_job(job_id: str) -> dict:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    try:
        store.delete(job)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"ok": True}


@app.get("/jobs/{job_id}/assets/{asset}", dependencies=[Depends(verify_api_token)])
def job_asset(job_id: str, asset: str) -> FileResponse:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    mapping = {
        "model.glb": job.work_dir / "model.glb",
        "all.zip": job.work_dir / "all.zip",
    }
    odm = job.work_dir / "odm"
    if asset == "orthophoto.tif":
        hits = list(odm.rglob("*orthophoto*.tif"))
        path = hits[0] if hits else None
    elif asset == "model.laz":
        hits = list(odm.rglob("*.laz"))
        path = hits[0] if hits else None
    elif asset == "dsm.tif":
        hits = list(odm.rglob("*dsm*.tif"))
        path = hits[0] if hits else None
    elif asset == "dtm.tif":
        hits = list(odm.rglob("*dtm*.tif"))
        path = hits[0] if hits else None
    elif asset == "report.pdf":
        hits = list(odm.rglob("*report*.pdf"))
        path = hits[0] if hits else None
    else:
        path = mapping.get(asset)
    if path is None or not path.is_file():
        raise HTTPException(404, f"Asset not available: {asset}")

    media_types = {
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
        ".laz": "application/octet-stream",
        ".las": "application/octet-stream",
        ".pdf": "application/pdf",
        ".zip": "application/zip",
        ".json": "application/json",
    }
    media_type = media_types.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type, filename=path.name)


@app.get("/jobs/{job_id}/logs", dependencies=[Depends(verify_api_token)])
def job_logs(job_id: str) -> dict:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    return {"id": job.id, "events": [e.as_dict() for e in job.events]}


@app.get("/jobs/{job_id}/logs/text", dependencies=[Depends(verify_api_token)])
def job_logs_text(job_id: str) -> PlainTextResponse:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    last_events = job.events[-200:]
    lines = [f"[{e.ts}] {e.stage} {e.percent:.0f}% {e.message}" for e in last_events]
    return PlainTextResponse("\n".join(lines))


@app.get("/logs/app", dependencies=[Depends(verify_api_token)])
def app_logs() -> list[dict]:
    return list(_APP_LOG)


@app.get("/jobs/{job_id}/metadata", dependencies=[Depends(verify_api_token)])
def job_metadata(job_id: str) -> dict:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    store.persist(job)
    meta_path = job.work_dir / "job.json"
    return json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else _out(job).model_dump()


@app.get("/jobs/{job_id}/diagnostics", dependencies=[Depends(verify_api_token)])
def job_diagnostics(job_id: str) -> dict:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    err_file = job.work_dir / "error.txt"
    return {
        "id": job.id,
        "stage": job.stage,
        "error": job.error,
        "errorCode": job.error_code,
        "traceback": err_file.read_text(encoding="utf-8") if err_file.is_file() else None,
        "system": system_status(),
    }


@app.websocket("/jobs/{job_id}/events")
async def job_events(websocket: WebSocket, job_id: str, token: str | None = Query(None)) -> None:
    if API_TOKEN:
        auth_header = websocket.headers.get("authorization", "")
        token_val = token or (auth_header.split(" ", 1)[1] if " " in auth_header else "")
        if token_val != API_TOKEN:
            await websocket.close(code=4401)
            return

    job = store.get(job_id)
    if not job:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    queue = store.subscribe(job)
    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event.as_dict())
            if event.stage in {"ready", "error", "cancelled", "interrupted"}:
                break
    except WebSocketDisconnect:
        return
    except Exception:
        return
    finally:
        store.unsubscribe(job, queue)


def _out(job) -> JobOut:
    odm_dir = job.work_dir / "odm"
    return JobOut(
        id=job.id,
        name=job.name,
        description=job.description,
        stage=job.stage,
        percent=job.percent,
        message=job.message,
        error=job.error,
        geotagged=job.geotagged,
        frameCount=job.frame_count,
        preset=job.preset,
        hasModel=bool(job.glb_path and job.glb_path.is_file()),
        isGeoreferenced=bool(getattr(job, "is_georeferenced", False)),
        georeferencing=getattr(job, "georeferencing", {}),
        modelStats=getattr(job, "model_stats", {}),
        createdAt=job.created_at,
        updatedAt=job.updated_at,
        videoPath=str(job.video_path),
        errorCode=job.error_code,
        extract=job.extract_stats,
        assets={
            "glb": bool(job.glb_path and job.glb_path.is_file()),
            "laz": odm_dir.exists() and any(odm_dir.rglob("*.laz")),
            "orthophoto": odm_dir.exists() and any(odm_dir.rglob("*orthophoto*.tif")),
            "dsm": odm_dir.exists() and any(odm_dir.rglob("*dsm*.tif")),
            "dtm": odm_dir.exists() and any(odm_dir.rglob("*dtm*.tif")),
            "report": odm_dir.exists() and any(odm_dir.rglob("*report*.pdf")),
        },
        durationS=getattr(job, "duration_s", 0.0),
    )


def run() -> None:
    import uvicorn

    host = os.environ.get("DT_HOST", "127.0.0.1")
    port = int(os.environ.get("DT_PORT", "8765"))
    uvicorn.run(app, host=host, port=port, reload=False)


if __name__ == "__main__":
    run()

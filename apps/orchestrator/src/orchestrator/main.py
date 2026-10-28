from __future__ import annotations

import collections
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel

from orchestrator.jobs import JobStore
from orchestrator.presets import detect_preset
from orchestrator.system import system_status

JOBS_ROOT = Path(os.environ.get("DT_JOBS_DIR", Path.cwd() / ".jobs"))
store = JobStore(JOBS_ROOT)

# ---------------------------------------------------------------------------
# In-memory circular buffer for orchestrator-level log entries (Task 3)
# ---------------------------------------------------------------------------
_APP_LOG: collections.deque[dict] = collections.deque(maxlen=500)


def _app_log(level: str, message: str) -> None:
    """Append an entry to the in-memory app log buffer."""
    _APP_LOG.append(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
        }
    )
    print(message, flush=True)


app = FastAPI(title="posEye Orchestrator", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3001", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Startup events (Tasks 4 & 7)
# ---------------------------------------------------------------------------
@app.on_event("startup")
def on_startup() -> None:
    # --- Task 4: log Python + dep versions ---
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
        f"posEye orchestrator started — Python {py_ver} | "
        f"fastapi={fa_ver} trimesh={tm_ver} httpx={hx_ver}",
    )

    # --- Task 7: system check at startup ---
    try:
        status = system_status()
    except Exception as exc:
        _app_log("ERROR", f"[posEye] system_status() failed: {exc}")
        return

    ffmpeg = status.get("ffmpeg", {})
    if ffmpeg.get("detected"):
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
# Health (Task 4: extended fields)
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    status = system_status()
    terminal = {"ready", "error", "cancelled"}
    active_jobs = sum(1 for j in store.jobs.values() if j.stage not in terminal)
    return {
        "ok": True,
        "defaultPreset": detect_preset(),
        "ffmpeg": status.get("ffmpeg"),
        "nodeodm": {"ok": status["nodeodm"]["ok"], "url": status["nodeodm"]["url"]},
        "docker": status.get("docker"),
        "pythonVersion": sys.version.split()[0],
        "orchestratorVersion": "0.1.0",
        "jobsDir": str(JOBS_ROOT),
        "activeJobs": active_jobs,
    }


@app.get("/system/status")
def get_system() -> dict:
    return system_status()


class ProbeBody(BaseModel):
    videoPath: str


# ---------------------------------------------------------------------------
# Probe (Task 8: estimatedFrames, estimatedDuration, summary)
# ---------------------------------------------------------------------------
@app.post("/probe/video")
def probe_video_endpoint(body: ProbeBody) -> dict:
    from pipeline.probe import probe_video

    try:
        info = probe_video(body.videoPath)
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc

    default_fps = 3.0
    estimated_frames = int((info.duration_s or 0) * default_fps) if info.duration_s else None

    # Build friendly summary string
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


@app.get("/presets/default")
def default_preset() -> dict:
    return {"preset": detect_preset()}


@app.post("/jobs", response_model=JobOut)
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
    asyncio.get_running_loop().run_in_executor(None, store.run_job, job)
    return _out(job)


@app.get("/jobs", response_model=list[JobOut])
def list_jobs() -> list[JobOut]:
    return [_out(j) for j in store.list()]


@app.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str) -> JobOut:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    return _out(job)


@app.post("/jobs/{job_id}/cancel", response_model=JobOut)
def cancel_job(job_id: str) -> JobOut:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    store.cancel(job)
    return _out(job)


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str) -> dict:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    store.delete(job)
    return {"ok": True}


@app.get("/jobs/{job_id}/assets/{asset}")
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
    else:
        path = mapping.get(asset)
    if path is None or not path.is_file():
        raise HTTPException(404, f"Asset not available: {asset}")
    return FileResponse(path, filename=path.name)


@app.get("/jobs/{job_id}/logs")
def job_logs(job_id: str) -> dict:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    return {"id": job.id, "events": [e.as_dict() for e in job.events]}


# ---------------------------------------------------------------------------
# Task 3: plain-text log endpoint
# ---------------------------------------------------------------------------
@app.get("/jobs/{job_id}/logs/text")
def job_logs_text(job_id: str) -> PlainTextResponse:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    last_events = job.events[-200:]
    lines = [f"[{e.ts}] {e.stage} {e.percent:.0f}% {e.message}" for e in last_events]
    return PlainTextResponse("\n".join(lines))


# ---------------------------------------------------------------------------
# Task 3: app-level log endpoint
# ---------------------------------------------------------------------------
@app.get("/logs/app")
def app_logs() -> list[dict]:
    return list(_APP_LOG)


@app.get("/jobs/{job_id}/metadata")
def job_metadata(job_id: str) -> dict:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    store.persist(job)
    meta_path = job.work_dir / "job.json"
    return json_load(meta_path) if meta_path.is_file() else _out(job).model_dump()


@app.get("/jobs/{job_id}/diagnostics")
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


def json_load(path: Path) -> dict:
    import json

    return json.loads(path.read_text(encoding="utf-8"))


@app.websocket("/jobs/{job_id}/events")
async def job_events(websocket: WebSocket, job_id: str) -> None:
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
            if event.stage in {"ready", "error", "cancelled"}:
                break
    except WebSocketDisconnect:
        return


def _out(job) -> JobOut:
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
        createdAt=job.created_at,
        updatedAt=job.updated_at,
        videoPath=str(job.video_path),
        errorCode=job.error_code,
        extract=job.extract_stats,
        assets={
            "glb": bool(job.glb_path and job.glb_path.is_file()),
            "laz": (job.work_dir / "odm").exists() and any(job.work_dir.joinpath("odm").rglob("*.laz")),
            "orthophoto": (job.work_dir / "odm").exists()
            and any(job.work_dir.joinpath("odm").rglob("*orthophoto*.tif")),
        },
        durationS=getattr(job, "duration_s", 0.0),
    )


def run() -> None:
    import uvicorn

    host = os.environ.get("DT_HOST", "127.0.0.1")
    port = int(os.environ.get("DT_PORT", "8765"))
    uvicorn.run("orchestrator.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    run()

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pipeline.errors import ExtractCanceledError, ExtractError, PipelineError
from pipeline.extract import ExtractConfig, extract_frames

from orchestrator.convert import ConvertError, convert_textured_model, extract_all_zip, validate_glb
from orchestrator.nodeodm import NodeODMClient, NodeODMError
from orchestrator.presets import canonical_preset, detect_preset, preset_options

logger = logging.getLogger("orchestrator.jobs")

Stage = str

ACTIVE_STAGES = {
    "queued",
    "validating",
    "extracting",
    "filtering",
    "geotagging",
    "masking",
    "uploading",
    "reconstructing",
    "postprocessing",
    "converting",
}
CANCELLATION_STAGES = {"cancellation_requested", "cancelling"}
TERMINAL_STAGES = {"ready", "cancelled", "error", "interrupted"}
ALL_STAGES = ACTIVE_STAGES | CANCELLATION_STAGES | TERMINAL_STAGES

LIFECYCLE_ORDER = [
    "queued",
    "validating",
    "extracting",
    "filtering",
    "geotagging",
    "masking",
    "uploading",
    "reconstructing",
    "postprocessing",
    "converting",
    "ready",
]

# Build state transition model
VALID_TRANSITIONS: dict[str, set[str]] = {}
for idx, stage in enumerate(LIFECYCLE_ORDER[:-1]):
    # Any active stage can transition forward in lifecycle or to cancellation/failure
    VALID_TRANSITIONS[stage] = set(LIFECYCLE_ORDER[idx + 1:]) | {
        "cancellation_requested",
        "cancelling",
        "cancelled",
        "error",
        "interrupted",
    }

VALID_TRANSITIONS["cancellation_requested"] = {"cancelling", "cancelled", "error", "interrupted"}
VALID_TRANSITIONS["cancelling"] = {"cancelled", "error", "interrupted"}
# Terminal states are strictly immutable
VALID_TRANSITIONS["ready"] = set()
VALID_TRANSITIONS["cancelled"] = set()
VALID_TRANSITIONS["error"] = set()
VALID_TRANSITIONS["interrupted"] = set()


class InvalidStateTransitionError(RuntimeError):
    pass


@dataclass
class JobEvent:
    stage: Stage
    percent: float
    message: str
    ts: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def as_dict(self) -> dict[str, Any]:
        return {"stage": self.stage, "percent": self.percent, "message": self.message, "ts": self.ts}


@dataclass
class Job:
    id: str
    video_path: Path
    srt_path: Path | None
    preset: str
    generate_masks: bool
    work_dir: Path
    name: str = ""
    description: str = ""
    stage: Stage = "queued"
    percent: float = 0
    message: str = "Queued"
    error: str | None = None
    glb_path: Path | None = None
    frames_dir: Path | None = None
    geotagged: int = 0
    frame_count: int = 0
    nodeodm_uuid: str | None = None
    nodeodm_url: str = "http://127.0.0.1:3000"
    canceled: bool = False
    error_code: str | None = None
    extract_stats: dict[str, Any] = field(default_factory=dict)
    fps: float = 3.0
    blur_threshold: float = 40.0
    duration_s: float = 0.0
    is_georeferenced: bool = False
    georeferencing: dict[str, Any] = field(default_factory=dict)
    model_stats: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    events: list[JobEvent] = field(default_factory=list)
    subscribers: list[asyncio.Queue] = field(default_factory=list)
    loop: asyncio.AbstractEventLoop | None = None


def _inspect_georeferencing(unpacked: Path, geotagged_frames: int) -> tuple[bool, dict[str, Any]]:
    """Determine structured geospatial metadata from actual reconstruction outputs."""
    coords_txt = unpacked / "odm_georeferencing" / "coords.txt"
    proj_txt = unpacked / "odm_georeferencing" / "proj.txt"
    geo_model = (unpacked / "odm_texturing" / "odm_textured_model_geo.obj").is_file() or any(unpacked.rglob("*_geo.obj"))

    crs = None
    if proj_txt.is_file():
        try:
            crs = proj_txt.read_text(encoding="utf-8", errors="replace").strip()
        except Exception:
            pass

    has_transform = coords_txt.is_file()
    has_geo_output = bool(geo_model or has_transform)
    is_georef = bool(has_geo_output and (crs is not None or has_transform))

    horiz_units = "meters" if (crs and ("utm" in crs.lower() or "proj=utm" in crs.lower())) else ("degrees" if crs else None)
    metric_scale = "approximate_consumer_gps" if (is_georef and geotagged_frames > 0) else "unreferenced"

    meta = {
        "gpsMetadataAvailable": geotagged_frames > 0,
        "odmGeoreferencingOutputAvailable": has_geo_output,
        "crsIdentified": crs,
        "horizontalUnits": horiz_units,
        "verticalDatum": "WGS84_ellipsoidal" if crs else None,
        "metricScaleStatus": metric_scale,
        "coordinateTransformAvailable": has_transform,
        "checkpointValidationStatus": "unvalidated",
    }
    return is_georef, meta


class JobStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
        self._workers: dict[str, threading.Thread] = {}
        self._deletion_lock = threading.Lock()
        self._load_existing()

    def _load_existing(self) -> None:
        for meta in self.root.glob("*/job.json"):
            try:
                data = json.loads(meta.read_text(encoding="utf-8"))
            except Exception:
                continue
            job_id = data.get("id") or meta.parent.name
            raw_stage = data.get("stage") or "queued"
            glb = meta.parent / "model.glb"
            has_model = glb.is_file()

            # Validate existing model if present
            valid_model = False
            model_info = {}
            if has_model:
                try:
                    model_info = validate_glb(glb)
                    valid_model = True
                except Exception:
                    valid_model = False

            # Startup recovery: reconcile abandoned or interrupted jobs
            if raw_stage not in TERMINAL_STAGES:
                if valid_model:
                    raw_stage = "ready"
                    percent = 100.0
                    msg = "Model ready"
                else:
                    raw_stage = "interrupted"
                    percent = float(data.get("percent") or 0)
                    msg = "Job interrupted by shutdown or restart. Ready to retry."
            else:
                percent = float(data.get("percent") or 0)
                msg = data.get("message") or ""

            job = Job(
                id=job_id,
                video_path=Path(data.get("videoPath") or ""),
                srt_path=Path(data["srtPath"]) if data.get("srtPath") else None,
                preset=data.get("preset") or "medium",
                generate_masks=bool(data.get("generateMasks")),
                work_dir=meta.parent,
                name=data.get("name") or job_id,
                description=data.get("description") or "",
                stage=raw_stage,
                percent=percent,
                message=msg,
                error=data.get("error"),
                geotagged=int(data.get("geotagged") or 0),
                frame_count=int(data.get("frameCount") or 0),
                created_at=data.get("createdAt") or "",
                fps=float(data.get("fps") or 3.0),
                blur_threshold=float(data.get("blurThreshold") or 40.0),
                duration_s=float(data.get("durationS") or 0.0),
                is_georeferenced=bool(data.get("isGeoreferenced", False)),
                georeferencing=data.get("georeferencing") or {},
                model_stats=data.get("modelStats") or model_info,
                nodeodm_uuid=data.get("nodeodmUuid"),
                nodeodm_url=data.get("nodeodmUrl") or "http://127.0.0.1:3000",
            )
            if valid_model:
                job.glb_path = glb
            if raw_stage == "interrupted":
                job.error_code = "INTERRUPTED"
                self.persist(job)
            self.jobs[job_id] = job

    def is_worker_running(self, job_id: str) -> bool:
        with self.lock:
            worker = self._workers.get(job_id)
            return bool(worker and worker.is_alive())

    def create(
        self,
        video_path: Path,
        srt_path: Path | None = None,
        preset: str | None = None,
        generate_masks: bool = False,
        loop: asyncio.AbstractEventLoop | None = None,
        *,
        name: str = "",
        description: str = "",
        fps: float = 3.0,
        blur_threshold: float = 40.0,
    ) -> Job:
        job_id = uuid.uuid4().hex[:12]
        job = Job(
            id=job_id,
            video_path=video_path,
            srt_path=srt_path,
            preset=canonical_preset(preset or detect_preset()),
            generate_masks=generate_masks,
            work_dir=self.root / job_id,
            name=name or video_path.stem,
            description=description,
            loop=loop,
            fps=fps,
            blur_threshold=blur_threshold,
        )
        job.work_dir.mkdir(parents=True, exist_ok=True)
        with self.lock:
            self.jobs[job_id] = job
        self._emit(job, "queued", 0, "Queued")
        return job

    def get(self, job_id: str) -> Job | None:
        with self.lock:
            return self.jobs.get(job_id)

    def list(self) -> list[Job]:
        with self.lock:
            return sorted(self.jobs.values(), key=lambda j: j.created_at, reverse=True)

    def cancel(self, job: Job) -> None:
        with self.lock:
            if job.stage in TERMINAL_STAGES:
                return
            job.canceled = True
            job.error_code = "CANCELLED"

        if job.nodeodm_uuid:
            try:
                NodeODMClient(job.nodeodm_url).cancel_task(job.nodeodm_uuid)
            except Exception as exc:
                logger.debug("Failed to cancel NodeODM task %s: %s", job.nodeodm_uuid, exc)

        worker_active = self.is_worker_running(job.id)
        if worker_active:
            # Transition to cancellation_requested; worker will complete shutdown and transition to cancelled
            self._emit(job, "cancellation_requested", job.percent, "Cancellation requested by operator")
        else:
            self._emit(job, "cancelled", job.percent, "Canceled by operator")

    def delete(self, job: Job) -> None:
        with self._deletion_lock:
            if job.stage not in TERMINAL_STAGES or self.is_worker_running(job.id):
                raise RuntimeError(
                    f"Cannot delete active job '{job.id}' in stage '{job.stage}'. Cancel it first and wait for worker termination."
                )

            with self.lock:
                self.jobs.pop(job.id, None)

            # Safe cleanup of workspace
            shutil.rmtree(job.work_dir, ignore_errors=True)

    def subscribe(self, job: Job) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        with self.lock:
            job.subscribers.append(q)
            recent_events = list(job.events[-40:])
        for event in recent_events:
            q.put_nowait(event)
        return q

    def unsubscribe(self, job: Job, q: asyncio.Queue) -> None:
        with self.lock:
            if q in job.subscribers:
                job.subscribers.remove(q)

    def persist(self, job: Job) -> None:
        """Atomic metadata persistence protecting against incomplete writes."""
        odm_dir = job.work_dir / "odm"
        payload = {
            "id": job.id,
            "name": job.name,
            "description": job.description,
            "videoPath": str(job.video_path),
            "srtPath": str(job.srt_path) if job.srt_path else None,
            "preset": job.preset,
            "generateMasks": job.generate_masks,
            "stage": job.stage,
            "percent": job.percent,
            "message": job.message,
            "error": job.error,
            "errorCode": job.error_code,
            "geotagged": job.geotagged,
            "frameCount": job.frame_count,
            "isGeoreferenced": job.is_georeferenced,
            "georeferencing": job.georeferencing,
            "modelStats": job.model_stats,
            "nodeodmUuid": job.nodeodm_uuid,
            "nodeodmUrl": job.nodeodm_url,
            "createdAt": job.created_at,
            "updatedAt": job.updated_at,
            "extract": job.extract_stats,
            "fps": job.fps,
            "blurThreshold": job.blur_threshold,
            "durationS": job.duration_s,
            "hasModel": bool(job.glb_path and job.glb_path.is_file()),
            "assets": {
                "glb": (job.work_dir / "model.glb").is_file(),
                "laz": odm_dir.exists() and any(odm_dir.rglob("*.laz")),
                "orthophoto": odm_dir.exists() and any(odm_dir.rglob("*orthophoto*.tif")),
                "dsm": odm_dir.exists() and any(odm_dir.rglob("*dsm*.tif")),
                "dtm": odm_dir.exists() and any(odm_dir.rglob("*dtm*.tif")),
                "report": odm_dir.exists() and any(odm_dir.rglob("*report*.pdf")),
            },
        }

        tmp_file = job.work_dir / "job.json.tmp"
        final_file = job.work_dir / "job.json"
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_file, final_file)
        except Exception as exc:
            logger.error("Failed to persist job %s metadata: %s", job.id, exc)

    def _emit(self, job: Job, stage: Stage, percent: float, message: str) -> None:
        with self.lock:
            current_stage = job.stage

            # Rule 1: Terminal stages are immutable. Reject any transition out of a terminal stage.
            if current_stage in TERMINAL_STAGES:
                logger.warning(
                    "Rejected invalid state transition for job %s: cannot transition from terminal stage '%s' to '%s'",
                    job.id,
                    current_stage,
                    stage,
                )
                return

            # Rule 2: Validate state transitions
            if stage != current_stage:
                allowed = VALID_TRANSITIONS.get(current_stage, set())
                if stage not in allowed:
                    logger.warning(
                        "Rejected invalid state transition for job %s: '%s' -> '%s'",
                        job.id,
                        current_stage,
                        stage,
                    )
                    return

            # Rule 3: Enforce monotonic progress (percent never regresses)
            if stage not in TERMINAL_STAGES and stage not in CANCELLATION_STAGES:
                percent = max(job.percent, percent)

            # Rule 4: Duplicate suppression
            if job.events:
                last = job.events[-1]
                if last.stage == stage and abs(last.percent - percent) < 0.1 and last.message == message:
                    return

            event = JobEvent(stage, percent, message)
            job.stage = stage
            job.percent = percent
            job.message = message
            job.updated_at = event.ts
            job.events.append(event)
            self.persist(job)

            subscribers = list(job.subscribers)
            loop = job.loop

        if loop and subscribers:
            for q in subscribers:
                loop.call_soon_threadsafe(q.put_nowait, event)

    @staticmethod
    def _enrich_error(exc: Exception, error_code: str | None) -> str:
        msg = str(exc)
        if error_code == "NOT_ENOUGH_FRAMES":
            msg += " Try lowering the blur threshold in Settings or use a longer video clip."
        elif isinstance(exc, NodeODMError):
            lower = msg.lower()
            if "memory" in lower or "ram" in lower:
                msg += " NodeODM ran out of memory. Try a lower quality preset."
            elif "port" in lower or "connection refused" in lower:
                msg += " Cannot reach NodeODM at port 3000. Check Docker is running."
        return msg

    def run_job(self, job: Job) -> None:
        with self.lock:
            if job.id in self._workers and self._workers[job.id].is_alive():
                raise RuntimeError(f"A worker is already running for job {job.id}")
            self._workers[job.id] = threading.current_thread()

        _start = time.monotonic()
        try:
            if job.canceled:
                self._emit(job, "cancelled", job.percent, "Canceled before processing began")
                return

            extract_dir = job.work_dir / "extract"
            self._emit(job, "validating", 1.0, "Validating input video container")
            self._emit(job, "extracting", 2.0, "Extracting frames")

            def on_progress(stage: str, pct: float, message: str) -> None:
                if job.canceled:
                    return
                mapped = min(35.0, max(2.0, pct * 0.35))
                self._emit(job, stage or "extracting", mapped, message)

            result = extract_frames(
                ExtractConfig(
                    video_path=job.video_path,
                    output_dir=extract_dir,
                    srt_path=job.srt_path,
                    generate_masks=job.generate_masks,
                    fps=job.fps,
                    blur_threshold=job.blur_threshold,
                ),
                progress=on_progress,
                should_stop=lambda: job.canceled,
            )

            if job.canceled:
                self._emit(job, "cancelled", job.percent, "Extraction canceled")
                return

            job.frames_dir = extract_dir / "frames"
            job.geotagged = result.geotagged
            job.frame_count = len(result.frames)
            job.extract_stats = result.as_dict()

            self._emit(job, "uploading", 36.0, f"Uploading {len(result.frames)} frames to NodeODM")

            client = NodeODMClient(job.nodeodm_url)
            uuid_task = client.create_task(
                job.frames_dir,
                preset_options(job.preset),
                job.work_dir / "upload.zip",
            )
            job.nodeodm_uuid = uuid_task
            self.persist(job)

            if job.canceled:
                client.cancel_task(uuid_task)
                self._emit(job, "cancelled", job.percent, "Task canceled during upload")
                return

            self._emit(job, "reconstructing", 38.0, "NodeODM photogrammetry reconstruction started")
            client.wait(
                uuid_task,
                progress=lambda s, p, m: self._emit(job, "reconstructing", min(85.0, max(38.0, 38.0 + (p * 0.47))), m),
                should_stop=lambda: job.canceled,
            )

            if job.canceled:
                client.cancel_task(uuid_task)
                self._emit(job, "cancelled", job.percent, "Task canceled during reconstruction")
                return

            self._emit(job, "postprocessing", 86.0, "Downloading reconstruction assets from NodeODM")
            all_zip = client.download_asset(uuid_task, "all.zip", job.work_dir / "all.zip")

            self._emit(job, "postprocessing", 88.0, "Unpacking NodeODM outputs safely")
            unpacked = extract_all_zip(all_zip, job.work_dir / "odm")

            self._emit(job, "converting", 90.0, "Validating and converting mesh to GLB")

            # Determine genuine geospatial accuracy and CRS
            is_geo, geo_meta = _inspect_georeferencing(unpacked, job.geotagged)
            job.is_georeferenced = is_geo
            job.georeferencing = geo_meta

            textured = unpacked / "odm_texturing" / "odm_textured_model_geo.obj"
            if not textured.is_file():
                textured = next(unpacked.rglob("*.obj"), None) or next(unpacked.rglob("*.glb"), None)
            if textured is None:
                raise ConvertError("NodeODM output did not include a 3D mesh")

            glb = convert_textured_model(textured, job.work_dir / "model.glb")
            model_info = validate_glb(glb)
            job.glb_path = glb
            job.model_stats = model_info

            job.duration_s = round(time.monotonic() - _start, 2)
            self._emit(job, "ready", 100.0, "Model ready")

        except (ExtractCanceledError, ) as exc:
            self._emit(job, "cancelled", job.percent, "Job canceled by operator")
        except (ExtractError, PipelineError, NodeODMError, ConvertError) as exc:
            if job.canceled:
                self._emit(job, "cancelled", job.percent, "Job canceled by operator")
                return
            error_code = getattr(exc, "code", None) or "NODEODM_FAILED"
            job.error = self._enrich_error(exc, error_code)
            job.error_code = error_code
            job.duration_s = round(time.monotonic() - _start, 2)
            self._emit(job, "error", job.percent, job.error)
        except Exception as exc:
            if job.canceled:
                self._emit(job, "cancelled", job.percent, "Job canceled by operator")
                return
            job.error = str(exc)
            job.error_code = "UNKNOWN"
            job.duration_s = round(time.monotonic() - _start, 2)
            (job.work_dir / "error.txt").write_text(traceback.format_exc(), encoding="utf-8")
            self._emit(job, "error", job.percent, str(exc))
        finally:
            with self.lock:
                self._workers.pop(job.id, None)
                # If worker finished after cancellation was requested, ensure terminal stage is cancelled
                if job.canceled and job.stage not in TERMINAL_STAGES:
                    job.stage = "cancelled"
                    job.message = "Job canceled"
                    self.persist(job)

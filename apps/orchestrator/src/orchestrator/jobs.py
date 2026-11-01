from __future__ import annotations

import asyncio
import json
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pipeline.errors import PipelineError
from pipeline.extract import ExtractConfig, ExtractError, extract_frames

from orchestrator.convert import ConvertError, convert_textured_model, extract_all_zip
from orchestrator.nodeodm import NodeODMClient, NodeODMError
from orchestrator.presets import canonical_preset, detect_preset, preset_options

Stage = str
TERMINAL_STAGES = {"ready", "error", "cancelled", "interrupted"}


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
    canceled: bool = False
    error_code: str | None = None
    extract_stats: dict[str, Any] = field(default_factory=dict)
    fps: float = 3.0
    blur_threshold: float = 40.0
    duration_s: float = 0.0
    is_georeferenced: bool = False
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    events: list[JobEvent] = field(default_factory=list)
    subscribers: list[asyncio.Queue] = field(default_factory=list)
    loop: asyncio.AbstractEventLoop | None = None


class JobStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
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

            # Startup recovery: reconcile abandoned/interrupted jobs
            if raw_stage not in TERMINAL_STAGES:
                if has_model:
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
            )
            if has_model:
                job.glb_path = glb
            if raw_stage == "interrupted":
                job.error_code = "INTERRUPTED"
                self.persist(job)
            self.jobs[job_id] = job

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
        return self.jobs.get(job_id)

    def list(self) -> list[Job]:
        return sorted(self.jobs.values(), key=lambda j: j.created_at, reverse=True)

    def cancel(self, job: Job) -> None:
        job.canceled = True
        if job.nodeodm_uuid:
            try:
                NodeODMClient().cancel_task(job.nodeodm_uuid)
            except Exception:
                pass
        job.error_code = "CANCELLED"
        self._emit(job, "cancelled", job.percent, "Canceled by operator")

    def delete(self, job: Job) -> None:
        import shutil

        if job.stage not in TERMINAL_STAGES:
            raise RuntimeError(f"Cannot delete active job in stage '{job.stage}'. Cancel it first.")

        with self.lock:
            self.jobs.pop(job.id, None)
        shutil.rmtree(job.work_dir, ignore_errors=True)

    def subscribe(self, job: Job) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        with self.lock:
            job.subscribers.append(q)
        for event in job.events[-40:]:
            q.put_nowait(event)
        return q

    def unsubscribe(self, job: Job, q: asyncio.Queue) -> None:
        with self.lock:
            if q in job.subscribers:
                job.subscribers.remove(q)

    def persist(self, job: Job) -> None:
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
        (job.work_dir / "job.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _emit(self, job: Job, stage: Stage, percent: float, message: str) -> None:
        # Never allow active stage emissions to overwrite a terminal state (cancelled, error, ready, interrupted)
        if job.stage in TERMINAL_STAGES and stage not in TERMINAL_STAGES:
            return

        # Duplicate suppression: do not store or broadcast identical consecutive stage/percent/message
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
        if job.loop:
            with self.lock:
                subs = list(job.subscribers)
            for q in subs:
                job.loop.call_soon_threadsafe(q.put_nowait, event)

    @staticmethod
    def _enrich_error(exc: Exception, error_code: str | None) -> str:
        """Append helpful hints to known error messages."""
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
        _start = time.monotonic()
        try:
            if job.canceled:
                raise NodeODMError("Job canceled")
            extract_dir = job.work_dir / "extract"
            self._emit(job, "extracting", 2, "Extracting frames")

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
                raise NodeODMError("Job canceled")
            job.frames_dir = extract_dir / "frames"
            job.geotagged = result.geotagged
            job.frame_count = len(result.frames)
            job.extract_stats = result.as_dict()
            self._emit(job, "uploading", 36, f"Uploading {len(result.frames)} frames to NodeODM")

            client = NodeODMClient()
            uuid_task = client.create_task(
                job.frames_dir,
                preset_options(job.preset),
                job.work_dir / "upload.zip",
            )
            job.nodeodm_uuid = uuid_task
            client.wait(
                uuid_task,
                progress=lambda s, p, m: self._emit(job, "reconstructing", p, m),
                should_stop=lambda: job.canceled,
            )
            all_zip = client.download_asset(uuid_task, "all.zip", job.work_dir / "all.zip")
            self._emit(job, "postprocessing", 88, "Unpacking NodeODM outputs")
            unpacked = extract_all_zip(all_zip, job.work_dir / "odm")
            self._emit(job, "converting", 90, "Converting mesh to GLB")

            # Check if reconstruction generated georeferenced output
            is_geo = (
                (unpacked / "odm_texturing" / "odm_textured_model_geo.obj").is_file()
                or (unpacked / "odm_georeferencing" / "coords.txt").is_file()
                or any(unpacked.rglob("*_geo.obj"))
            )
            job.is_georeferenced = is_geo

            textured = unpacked / "odm_texturing" / "odm_textured_model_geo.obj"
            if not textured.is_file():
                textured = next(unpacked.rglob("*.obj"), None) or next(unpacked.rglob("*.glb"), None)
            if textured is None:
                raise ConvertError("NodeODM output did not include a mesh")
            glb = convert_textured_model(textured, job.work_dir / "model.glb")
            job.glb_path = glb
            (job.work_dir / "meta.json").write_text(
                json.dumps(
                    {
                        "id": job.id,
                        "preset": job.preset,
                        "frames": len(result.frames),
                        "geotagged": result.geotagged,
                        "isGeoreferenced": job.is_georeferenced,
                        "nodeodm": uuid_task,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            job.duration_s = round(time.monotonic() - _start, 2)
            self._emit(job, "ready", 100, "Model ready")
        except (ExtractError, PipelineError, NodeODMError, ConvertError) as exc:
            if job.canceled:
                return
            error_code = getattr(exc, "code", None) or "NODEODM_FAILED"
            job.error = self._enrich_error(exc, error_code)
            job.error_code = error_code
            job.duration_s = round(time.monotonic() - _start, 2)
            self._emit(job, "error", job.percent, job.error)
        except Exception as exc:
            if job.canceled:
                return
            job.error = str(exc)
            job.error_code = "UNKNOWN"
            job.duration_s = round(time.monotonic() - _start, 2)
            (job.work_dir / "error.txt").write_text(traceback.format_exc(), encoding="utf-8")
            self._emit(job, "error", job.percent, str(exc))

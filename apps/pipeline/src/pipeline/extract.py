from __future__ import annotations

import shutil
import subprocess
import time
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from pipeline.errors import ExtractCanceledError, ExtractError, FfmpegUnavailable, NotEnoughFrames
from pipeline.exif import write_gps_exif
from pipeline.ffmpeg import resolve_ffmpeg
from pipeline.filters import select_frames, score_frames
from pipeline.probe import probe_video
from pipeline.srt import MatchStats, parse_srt, sample_at

ProgressCb = Callable[[str, float, str], None]


@dataclass
class ExtractConfig:
    video_path: Path
    output_dir: Path
    srt_path: Path | None = None
    fps: float = 3.0
    blur_threshold: float = 40.0
    max_hash_distance: int = 6
    min_retained_frames: int = 8
    jpeg_quality: int = 92
    generate_masks: bool = False


@dataclass
class ExtractResult:
    frames: list[Path]
    geotagged: int
    dropped_blur: int
    dropped_dup: int
    raw_count: int
    mask_paths: list[Path] = field(default_factory=list)
    duration_s: float | None = None
    source_fps: float | None = None
    width: int | None = None
    height: int | None = None
    match_stats: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        data = {
            "rawFrames": self.raw_count,
            "retainedFrames": len(self.frames),
            "droppedBlur": self.dropped_blur,
            "droppedDuplicates": self.dropped_dup,
            "geotaggedFrames": self.geotagged,
            "masksGenerated": len(self.mask_paths),
            "duration": self.duration_s,
            "fps": self.source_fps,
            "resolution": f"{self.width}x{self.height}" if self.width and self.height else None,
        }
        if self.match_stats:
            data.update(self.match_stats)
        return data


def _emit(cb: ProgressCb | None, stage: str, pct: float, message: str) -> None:
    if cb:
        cb(stage, pct, message)


def _run_ffmpeg(
    ffmpeg: str,
    video: Path,
    pattern: Path,
    fps: float,
    quality: int,
    progress: ProgressCb | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> None:
    qscale = max(2, min(10, round((100 - quality) / 10)))
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(video),
        "-vf",
        f"fps={fps}",
        "-qscale:v",
        str(qscale),
        str(pattern),
    ]
    _emit(progress, "extracting", 8.0, f"Running FFmpeg: extracting stills at {fps} fps...")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        while True:
            if should_stop and should_stop():
                try:
                    proc.terminate()
                    proc.wait(timeout=2.0)
                except (subprocess.TimeoutExpired, Exception):
                    try:
                        proc.kill()
                        proc.wait(timeout=1.0)
                    except Exception:
                        pass
                raise ExtractCanceledError("Extraction canceled during FFmpeg processing")

            try:
                ret = proc.wait(timeout=0.15)
                break
            except subprocess.TimeoutExpired:
                continue

        stderr = proc.stderr.read() if proc.stderr else ""
        if ret != 0:
            raise ExtractError(stderr.strip() or "ffmpeg failed to extract frames")
    except ExtractCanceledError:
        raise
    except Exception as exc:
        if proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=1.0)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        raise exc


def extract_frames(
    config: ExtractConfig,
    progress: ProgressCb | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> ExtractResult:
    video = config.video_path.resolve()
    if not video.is_file():
        raise ExtractError(f"Video not found: {video}")

    out = config.output_dir.resolve()
    raw_dir = out / "raw"
    keep_dir = out / "frames"
    if out.exists():
        shutil.rmtree(out, ignore_errors=True)
    raw_dir.mkdir(parents=True, exist_ok=True)
    keep_dir.mkdir(parents=True, exist_ok=True)

    try:
        ffmpeg = resolve_ffmpeg()
    except FileNotFoundError as exc:
        raise FfmpegUnavailable(str(exc)) from exc

    if should_stop and should_stop():
        shutil.rmtree(out, ignore_errors=True)
        raise ExtractCanceledError("Extraction canceled")

    info = probe_video(video)
    _emit(progress, "validating", 3.0, f"Validated video container: {info.width}x{info.height} @ {info.fps:.1f} fps")
    _emit(progress, "extracting", 6.0, f"Extracting stills from {video.name}...")

    try:
        _run_ffmpeg(
            ffmpeg,
            video,
            raw_dir / "frame_%06d.jpg",
            config.fps,
            config.jpeg_quality,
            progress=progress,
            should_stop=should_stop,
        )
    except ExtractCanceledError:
        shutil.rmtree(out, ignore_errors=True)
        raise

    if should_stop and should_stop():
        shutil.rmtree(out, ignore_errors=True)
        raise ExtractCanceledError("Extraction canceled")

    raw_paths = sorted(raw_dir.glob("frame_*.jpg"))
    if not raw_paths:
        shutil.rmtree(out, ignore_errors=True)
        raise ExtractError("No frames were extracted from the video")

    total_raw = len(raw_paths)
    _emit(progress, "filtering", 15.0, f"Extracted {total_raw} raw frames. Scoring sharpness & perceptual hash...")

    def on_filter_tick(curr: int, total: int):
        if should_stop and should_stop():
            return
        pct = 15.0 + (curr / total) * 30.0
        _emit(progress, "filtering", pct, f"Filtering frames: scored {curr}/{total} frames")

    scores = score_frames(raw_paths, on_progress=on_filter_tick)

    if should_stop and should_stop():
        shutil.rmtree(out, ignore_errors=True)
        raise ExtractCanceledError("Extraction canceled")

    kept = select_frames(
        scores,
        blur_threshold=config.blur_threshold,
        max_hash_distance=config.max_hash_distance,
    )
    dropped_blur = sum(1 for s in scores if s.sharpness < config.blur_threshold)
    dropped_dup = max(0, len(scores) - dropped_blur - len(kept))

    _emit(progress, "filtering", 48.0, f"Filter result: kept {len(kept)} frames (dropped {dropped_blur} blur, {dropped_dup} duplicates)")

    if len(kept) < config.min_retained_frames:
        shutil.rmtree(out, ignore_errors=True)
        raise NotEnoughFrames(
            f"Only {len(kept)} sharp, unique frames remain (need at least "
            f"{config.min_retained_frames}). Lower the blur threshold or use a longer clip."
        )

    _emit(progress, "geotagging", 50.0, "Parsing SRT flight telemetry & matching timestamps...")
    samples = parse_srt(config.srt_path) if config.srt_path else []
    geotagged = 0
    written: list[Path] = []
    total_kept = len(kept)
    stats = MatchStats(total_frames=total_kept)
    # Resolve base capture datetime strictly from trustworthy source metadata:
    # 1. First sample with an explicit telemetry timestamp from the SRT log
    # 2. Or video container creation_time metadata (via FFmpeg probe)
    # Do NOT fabricate capture dates when metadata is unavailable.
    base_dt: datetime | None = None
    for s in samples:
        if s.timestamp is not None:
            base_dt = s.timestamp - timedelta(seconds=s.t_start)
            break
    if base_dt is None and getattr(info, "creation_time", None) is not None:
        base_dt = info.creation_time

    for index, score in enumerate(kept, start=1):
        if should_stop and should_stop():
            shutil.rmtree(out, ignore_errors=True)
            raise ExtractCanceledError("Extraction canceled")

        dest = keep_dir / f"image_{index:06d}.jpg"
        shutil.copy2(score.path, dest)
        stem = score.path.stem
        digits = "".join(ch for ch in stem if ch.isdigit())
        raw_index = int(digits) if digits else index
        t = max(0.0, (raw_index - 1) / config.fps)
        frame_dt = (base_dt + timedelta(seconds=t)) if base_dt is not None else None
        sample = sample_at(samples, t, max_offset_s=1.5, stats=stats)
        if sample and sample.latitude is not None and sample.longitude is not None:
            ts_to_write = sample.timestamp if sample.timestamp is not None else frame_dt
            write_gps_exif(dest, sample.latitude, sample.longitude, sample.altitude, sample.altitude_ref, timestamp=ts_to_write)
            geotagged += 1
        written.append(dest)

        if index % 10 == 0 or index == total_kept:
            pct = 50.0 + (index / total_kept) * 25.0
            _emit(progress, "geotagging", pct, f"Geotagging: processed {index}/{total_kept} frames ({geotagged} matched GPS)")

    mask_paths: list[Path] = []
    if config.generate_masks:
        if should_stop and should_stop():
            shutil.rmtree(out, ignore_errors=True)
            raise ExtractCanceledError("Extraction canceled")
        try:
            from pipeline.masks import generate_moving_object_masks

            _emit(progress, "masking", 78.0, "Detecting moving objects via YOLOv8n...")
            mask_paths = generate_moving_object_masks(written)
            _emit(progress, "masking", 88.0, f"Generated {len(mask_paths)} dynamic object masks")
        except RuntimeError as _mask_err:
            warnings.warn(f"Masking skipped: {_mask_err}", stacklevel=2)
            _emit(progress, "masking", 88.0, f"Masking skipped: {_mask_err}")
        except Exception as _mask_err:
            warnings.warn(f"Masking failed and will be skipped: {_mask_err}", stacklevel=2)
            _emit(progress, "masking", 88.0, "Masking skipped: optional model not available")

    shutil.rmtree(raw_dir, ignore_errors=True)
    _emit(progress, "geotagging", 100.0, f"Preprocessing complete: {len(written)} sharp, geotagged frames ready for reconstruction")
    return ExtractResult(
        frames=written,
        geotagged=geotagged,
        dropped_blur=dropped_blur,
        dropped_dup=dropped_dup,
        raw_count=len(scores),
        mask_paths=mask_paths,
        duration_s=info.duration_s,
        source_fps=info.fps,
        width=info.width,
        height=info.height,
        match_stats=stats.as_dict() if samples else {},
    )

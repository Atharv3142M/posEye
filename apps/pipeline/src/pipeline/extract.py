from __future__ import annotations

import shutil
import subprocess
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from pipeline.errors import ExtractError, FfmpegUnavailable, NotEnoughFrames
from pipeline.exif import write_gps_exif
from pipeline.ffmpeg import resolve_ffmpeg
from pipeline.filters import select_frames, score_frames
from pipeline.probe import probe_video
from pipeline.srt import parse_srt, sample_at

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

    def as_dict(self) -> dict:
        return {
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


def _emit(cb: ProgressCb | None, stage: str, pct: float, message: str) -> None:
    if cb:
        cb(stage, pct, message)


def _run_ffmpeg(ffmpeg: str, video: Path, pattern: Path, fps: float, quality: int) -> None:
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
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise ExtractError(proc.stderr.strip() or "ffmpeg failed to extract frames")


def extract_frames(config: ExtractConfig, progress: ProgressCb | None = None) -> ExtractResult:
    video = config.video_path.resolve()
    if not video.is_file():
        raise ExtractError(f"Video not found: {video}")

    out = config.output_dir.resolve()
    raw_dir = out / "raw"
    keep_dir = out / "frames"
    if out.exists():
        shutil.rmtree(out)
    raw_dir.mkdir(parents=True)
    keep_dir.mkdir(parents=True)

    try:
        ffmpeg = resolve_ffmpeg()
    except FileNotFoundError as exc:
        raise FfmpegUnavailable(str(exc)) from exc
    info = probe_video(video)
    _emit(progress, "validating", 3, "Validating video")
    _emit(progress, "extracting", 5, "Extracting frames")
    _run_ffmpeg(ffmpeg, video, raw_dir / "frame_%06d.jpg", config.fps, config.jpeg_quality)

    raw_paths = sorted(raw_dir.glob("frame_*.jpg"))
    if not raw_paths:
        raise ExtractError("No frames were extracted from the video")

    _emit(progress, "filtering", 40, f"Scoring {len(raw_paths)} frames")
    scores = score_frames(raw_paths)
    kept = select_frames(
        scores,
        blur_threshold=config.blur_threshold,
        max_hash_distance=config.max_hash_distance,
    )
    dropped_blur = sum(1 for s in scores if s.sharpness < config.blur_threshold)
    dropped_dup = max(0, len(scores) - dropped_blur - len(kept))

    if len(kept) < config.min_retained_frames:
        raise NotEnoughFrames(
            f"Only {len(kept)} sharp, unique frames remain (need at least "
            f"{config.min_retained_frames}). Lower the blur threshold or use a longer clip."
        )

    _emit(progress, "geotagging", 55, "Matching telemetry")
    samples = parse_srt(config.srt_path) if config.srt_path else []
    geotagged = 0
    written: list[Path] = []
    for index, score in enumerate(kept, start=1):
        dest = keep_dir / f"image_{index:06d}.jpg"
        shutil.copy2(score.path, dest)
        stem = score.path.stem
        digits = "".join(ch for ch in stem if ch.isdigit())
        raw_index = int(digits) if digits else index
        t = max(0.0, (raw_index - 1) / config.fps)
        sample = sample_at(samples, t)
        if sample and sample.latitude is not None and sample.longitude is not None:
            write_gps_exif(dest, sample.latitude, sample.longitude, sample.altitude)
            geotagged += 1
        written.append(dest)

    mask_paths: list[Path] = []
    if config.generate_masks:
        try:
            from pipeline.masks import generate_moving_object_masks

            _emit(progress, "masking", 80, "Masking moving objects")
            mask_paths = generate_moving_object_masks(written)
        except RuntimeError as _mask_err:
            warnings.warn(f"Masking skipped: {_mask_err}", stacklevel=2)
        except Exception as _mask_err:
            warnings.warn(f"Masking failed and will be skipped: {_mask_err}", stacklevel=2)

    shutil.rmtree(raw_dir, ignore_errors=True)
    last = "masking" if mask_paths else "geotagging"
    _emit(progress, last, 100, f"Kept {len(written)} frames")
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
    )

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from pipeline.errors import FfmpegUnavailable, VideoUnreadable
from pipeline.ffmpeg import resolve_ffmpeg


@dataclass
class VideoInfo:
    path: Path
    duration_s: float | None
    width: int | None
    height: int | None
    fps: float | None
    size_bytes: int
    creation_time: datetime | None = None


def ffmpeg_version(ffmpeg: str | None = None) -> str:
    try:
        bin_path = ffmpeg or resolve_ffmpeg()
    except FileNotFoundError as exc:
        raise FfmpegUnavailable(str(exc)) from exc
    proc = subprocess.run([bin_path, "-version"], capture_output=True, text=True)
    line = (proc.stdout or proc.stderr or "").splitlines()
    return line[0] if line else "unknown"


def probe_video(path: str | Path) -> VideoInfo:
    video = Path(path)
    if not video.is_file():
        raise VideoUnreadable(f"Video not found: {video}")
    try:
        ffmpeg = resolve_ffmpeg()
    except FileNotFoundError as exc:
        raise FfmpegUnavailable(str(exc)) from exc
    proc = subprocess.run([ffmpeg, "-hide_banner", "-i", str(video)], capture_output=True, text=True)
    text = proc.stderr or proc.stdout or ""
    duration = None
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if m:
        duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    width = height = None
    res = re.search(r"(\d{2,5})x(\d{2,5})", text)
    if res:
        width, height = int(res.group(1)), int(res.group(2))
    fps = None
    fp = re.search(r"(\d+(?:\.\d+)?)\s*fps", text)
    if fp:
        fps = float(fp.group(1))

    creation_time = None
    ct_m = re.search(
        r"\bcreation_time\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z?)",
        text,
    )
    if ct_m:
        try:
            iso_str = ct_m.group(1).replace("Z", "+00:00")
            creation_time = datetime.fromisoformat(iso_str)
        except Exception:
            creation_time = None

    if duration is None and width is None:
        raise VideoUnreadable(text.strip()[:400] or f"Unreadable video: {video}")
    return VideoInfo(video, duration, width, height, fps, video.stat().st_size, creation_time)

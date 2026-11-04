from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def _repo_root() -> Path | None:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "third_party").is_dir() or (parent / "Docs" / "MVP_Spec.md").is_file():
            return parent
    return None


def resolve_ffmpeg() -> str:
    """Bundled ffmpeg.exe, then PATH. Never triggers an imageio download."""
    env = os.environ.get("FFMPEG_PATH")
    if env:
        path = Path(env)
        if path.is_file():
            return str(path)

    resources = os.environ.get("ELECTRON_RESOURCES", "")
    meipass = getattr(sys, "_MEIPASS", "")
    root = _repo_root()
    candidates: list[Path] = []
    if root is not None:
        candidates.extend(
            [
                root / "third_party" / "ffmpeg.exe",
                root / "third_party" / "ffmpeg" / "bin" / "ffmpeg.exe",
                root / "third_party" / "ffmpeg" / "ffmpeg.exe",
            ]
        )
    if resources:
        candidates.append(Path(resources) / "ffmpeg.exe")
    if meipass:
        candidates.append(Path(meipass) / "ffmpeg.exe")
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "ffmpeg.exe")
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)

    fallback = shutil.which("ffmpeg")
    if fallback:
        return fallback

    raise FileNotFoundError(
        "ffmpeg binary not found. Place ffmpeg.exe in third_party/ or set FFMPEG_PATH."
    )

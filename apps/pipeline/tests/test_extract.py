from __future__ import annotations

import subprocess
from pathlib import Path

import cv2
import numpy as np
import pytest

from pipeline.exif import read_gps_exif, write_gps_exif
from pipeline.extract import ExtractConfig, ExtractError, extract_frames
from pipeline.ffmpeg import resolve_ffmpeg
from pipeline.filters import dhash64, hamming64, laplacian_variance
from pipeline.srt import parse_srt, sample_at


def _write_srt(path: Path) -> None:
    lines = []
    for i in range(20):
        t0 = i * 0.25
        t1 = t0 + 0.25
        lat = 28.6139 + i * 0.0001
        lon = 77.2090 + i * 0.0001
        lines.append(
            f"{i+1}\n"
            f"00:00:{t0:06.3f} --> 00:00:{t1:06.3f}\n".replace(".", ",", 1).replace(".", ",", 1)
        )
        # SRT timestamps need comma milliseconds; keep it simple:
    path.write_text(
        "\n".join(
            [
                "1",
                "00:00:00,000 --> 00:00:00,500",
                "latitude: 28.613900 longitude: 77.209000 altitude: 120.0",
                "",
                "2",
                "00:00:00,500 --> 00:00:01,000",
                "GPS(28.614000, 77.209100, 121.5)",
                "",
                "3",
                "00:00:01,000 --> 00:00:04,000",
                "lat: 28.614200 lon: 77.209300 alt: 122",
                "",
            ]
        ),
        encoding="utf-8",
    )


def _make_video(path: Path, seconds: float = 3.0, fps: int = 10) -> None:
    ffmpeg = resolve_ffmpeg()
    frames_dir = path.parent / "_src_frames"
    frames_dir.mkdir(exist_ok=True)
    n = int(seconds * fps)
    for i in range(n):
        img = np.zeros((180, 320, 3), dtype=np.uint8)
        x = 20 + int((i / max(n - 1, 1)) * 220)
        cv2.rectangle(img, (x, 40), (x + 60, 140), (40, 180, 80), -1)
        cv2.putText(img, f"{i:03d}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (240, 240, 240), 2)
        if i % 7 == 0:
            img = cv2.GaussianBlur(img, (21, 21), 8)
        cv2.imwrite(str(frames_dir / f"f_{i:04d}.png"), img)
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-framerate",
        str(fps),
        "-i",
        str(frames_dir / "f_%04d.png"),
        "-pix_fmt",
        "yuv420p",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr


def test_parse_srt_and_sample(tmp_path: Path) -> None:
    srt = tmp_path / "clip.srt"
    _write_srt(srt)
    samples = parse_srt(srt)
    assert len(samples) == 3
    first = sample_at(samples, 0.1)
    assert first is not None
    assert first.latitude == pytest.approx(28.6139, abs=1e-4)
    mid = sample_at(samples, 0.7)
    assert mid is not None and mid.longitude == pytest.approx(77.2091, abs=1e-4)
    # Beyond max_offset_s tolerance
    far = sample_at(samples, 10.0, max_offset_s=1.5)
    assert far is None


def test_exif_roundtrip(tmp_path: Path) -> None:
    img = np.zeros((32, 32, 3), dtype=np.uint8)
    path = tmp_path / "g.jpg"
    cv2.imwrite(str(path), img)
    write_gps_exif(path, 12.9716, 77.5946, 900.0)
    lat, lon, alt = read_gps_exif(path)
    assert lat == pytest.approx(12.9716, abs=1e-4)
    assert lon == pytest.approx(77.5946, abs=1e-4)
    assert alt == pytest.approx(900.0, abs=0.1)


def test_hash_near_duplicates() -> None:
    a = np.zeros((64, 64, 3), dtype=np.uint8)
    a[::8, :] = (10, 200, 20)
    a[:, ::8] = (240, 40, 20)
    b = a.copy()
    b[0, 0] = (11, 81, 21)
    assert hamming64(dhash64(a), dhash64(b)) <= 4
    sharp = laplacian_variance(a)
    blurry = laplacian_variance(cv2.GaussianBlur(a, (15, 15), 5))
    assert sharp > blurry


def test_extract_geotags_and_min_frames(tmp_path: Path) -> None:
    video = tmp_path / "clip.mp4"
    _make_video(video, seconds=4.0, fps=12)
    srt = tmp_path / "clip.srt"
    _write_srt(srt)
    out = tmp_path / "work"
    result = extract_frames(
        ExtractConfig(
            video_path=video,
            output_dir=out,
            srt_path=srt,
            fps=4.0,
            blur_threshold=5.0,
            max_hash_distance=4,
            min_retained_frames=5,
        )
    )
    assert len(result.frames) >= 8
    assert result.geotagged == len(result.frames)
    lat, lon, _ = read_gps_exif(result.frames[0])
    assert lat is not None and lon is not None


def test_min_retained_frames_fails(tmp_path: Path) -> None:
    video = tmp_path / "clip.mp4"
    _make_video(video, seconds=1.0, fps=8)
    with pytest.raises(ExtractError, match="sharp, unique frames"):
        extract_frames(
            ExtractConfig(
                video_path=video,
                output_dir=tmp_path / "work",
                fps=2.0,
                blur_threshold=10_000,
                min_retained_frames=8,
            )
        )

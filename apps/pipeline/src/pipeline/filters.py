from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import cv2
import numpy as np


@dataclass(frozen=True)
class FrameScore:
    path: Path
    sharpness: float
    phash: int


def laplacian_variance(image_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def dhash64(image_bgr: np.ndarray, hash_size: int = 8) -> int:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    diff = resized[:, 1:] > resized[:, :-1]
    bits = 0
    for i, flag in enumerate(diff.flatten()):
        if flag:
            bits |= 1 << i
    return bits


def hamming64(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def score_frames(
    paths: list[Path],
    on_progress: Callable[[int, int], None] | None = None,
) -> list[FrameScore]:
    scores: list[FrameScore] = []
    total = len(paths)
    for i, path in enumerate(paths, start=1):
        image = cv2.imread(str(path))
        if image is None:
            continue
        scores.append(FrameScore(path, laplacian_variance(image), dhash64(image)))
        if on_progress and (i % 10 == 0 or i == total):
            on_progress(i, total)
    return scores


def select_frames(
    scores: list[FrameScore],
    *,
    blur_threshold: float,
    max_hash_distance: int = 6,
) -> list[FrameScore]:
    """Drop blurry frames, then near-duplicates by perceptual hash."""
    sharp = [s for s in scores if s.sharpness >= blur_threshold]
    kept: list[FrameScore] = []
    for score in sharp:
        if kept and hamming64(kept[-1].phash, score.phash) <= max_hash_distance:
            if score.sharpness > kept[-1].sharpness:
                kept[-1] = score
            continue
        kept.append(score)
    return kept

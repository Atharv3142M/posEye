"""Lightweight viewer previews. No LAZ decoder and no new dependencies."""

from __future__ import annotations

import json
import random
from pathlib import Path

# shortcut: OBJ vertex sample is the mesh, not the dense LAZ cloud; swap in laspy when a decoder is added.
# shortcut: orthophoto JPEG decodes the whole GeoTIFF; switch to windowed reads if previews run out of memory.


def cloud_preview(work_dir: Path, odm: Path, limit: int = 25000) -> Path | None:
    cache = work_dir / "cloud_preview.json"
    if cache.is_file() and cache.stat().st_size > 20:
        return cache
    obj = next(odm.rglob("*.obj"), None) if odm.is_dir() else None
    if obj is None:
        return None

    kept: list[tuple[float, float, float]] = []
    seen = 0
    with obj.open("r", errors="ignore") as handle:
        for line in handle:
            if not line.startswith("v "):
                continue
            parts = line.split()
            if len(parts) < 4:
                continue
            try:
                point = (float(parts[1]), float(parts[2]), float(parts[3]))
            except ValueError:
                continue
            seen += 1
            if len(kept) < limit:
                kept.append(point)
            else:
                pick = random.randrange(seen)
                if pick < limit:
                    kept[pick] = point
    if not kept:
        return None

    flat: list[float] = []
    for x, y, z in kept:
        flat.extend((x, y, z))
    cache.write_text(json.dumps({"count": len(kept), "positions": flat}), encoding="utf-8")
    return cache


def orthophoto_preview(work_dir: Path, odm: Path) -> Path | None:
    cache = work_dir / "orthophoto_preview.jpg"
    if cache.is_file() and cache.stat().st_size > 20:
        return cache
    tif = next(odm.rglob("*orthophoto*.tif"), None) if odm.is_dir() else None
    if tif is None:
        return None
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        Image.MAX_IMAGE_PIXELS = 250_000_000
        with Image.open(tif) as image:
            image.thumbnail((2048, 2048))
            rgb = image.convert("RGB")
            rgb.save(cache, "JPEG", quality=80)
    except Exception:
        return None
    return cache if cache.is_file() else None

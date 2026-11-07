from __future__ import annotations

import os
from typing import Literal

import psutil

PresetName = Literal["low", "medium", "high", "ultra", "fast", "balanced"]

_ALIASES = {
    "fast": "low",
    "balanced": "medium",
    "ultra": "ultra",
}

_PRESETS: dict[str, list[dict[str, str]]] = {
    "low": [
        {"name": "feature-quality", "value": "lowest"},
        {"name": "pc-quality", "value": "lowest"},
        {"name": "mesh-octree-depth", "value": "8"},
        {"name": "resize-to", "value": "1024"},
        {"name": "orthophoto-resolution", "value": "8"},
        {"name": "skip-report", "value": "true"},
    ],
    "medium": [
        {"name": "feature-quality", "value": "medium"},
        {"name": "pc-quality", "value": "medium"},
        {"name": "mesh-octree-depth", "value": "10"},
        {"name": "resize-to", "value": "2048"},
        {"name": "orthophoto-resolution", "value": "5"},
        {"name": "dsm", "value": "true"},
    ],
    "high": [
        {"name": "feature-quality", "value": "high"},
        {"name": "pc-quality", "value": "high"},
        {"name": "mesh-octree-depth", "value": "11"},
        {"name": "resize-to", "value": "4096"},
        {"name": "orthophoto-resolution", "value": "2"},
        {"name": "dsm", "value": "true"},
        {"name": "dtm", "value": "true"},
    ],
    "ultra": [
        {"name": "feature-quality", "value": "ultra"},
        {"name": "pc-quality", "value": "ultra"},
        {"name": "mesh-octree-depth", "value": "12"},
        {"name": "resize-to", "value": "4096"},
        {"name": "orthophoto-resolution", "value": "1"},
        {"name": "dsm", "value": "true"},
        {"name": "dtm", "value": "true"},
    ],
}


def canonical_preset(name: str) -> str:
    key = (name or "medium").lower()
    return _ALIASES.get(key, key)


def preset_options(name: str, use_gpu: bool = False) -> list[dict[str, str]]:
    key = canonical_preset(name)
    if key not in _PRESETS:
        raise ValueError(f"Unknown preset {name}")
    opts = [dict(opt) for opt in _PRESETS[key]]
    if use_gpu:
        opts.append({"name": "feature-extract-gpu", "value": "true"})
    return opts


def detect_preset() -> PresetName:
    forced = os.environ.get("DT_PRESET")
    if forced in _PRESETS or forced in _ALIASES:
        return canonical_preset(forced)  # type: ignore[return-value]
    ram_gb = psutil.virtual_memory().total / (1024**3)
    cores = psutil.cpu_count(logical=True) or 4
    if ram_gb < 24 or cores < 12:
        return "low"
    if ram_gb < 64:
        return "medium"
    return "high"

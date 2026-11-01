from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TelemetrySample:
    t_start: float
    t_end: float
    latitude: float | None
    longitude: float | None
    altitude: float | None
    relative_altitude: float | None = None


_TIME = re.compile(
    r"(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})"
)
_LAT = re.compile(r"(?:latitude|lat)\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I)
_LON = re.compile(r"(?:longitude|lon|lng)\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I)
_ABS_ALT = re.compile(r"(?:abs_alt|altitude|alt)\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I)
_REL_ALT = re.compile(r"rel_alt\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I)
_GPS_PAREN = re.compile(
    r"GPS\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*(-?\d+(?:\.\d+)?))?\s*\)",
    re.I,
)
_CSV_LLA = re.compile(
    r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)"
)


def _to_seconds(h: str | None, m: str, s: str, ms: str) -> float:
    hours = int(h or 0)
    millis = int(ms.ljust(3, "0")[:3])
    return hours * 3600 + int(m) * 60 + int(s) + millis / 1000.0


def parse_srt(path: str | Path) -> list[TelemetrySample]:
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r"\n\s*\n", text.strip())
    samples: list[TelemetrySample] = []
    for block in blocks:
        match = _TIME.search(block)
        if not match:
            continue
        t0 = _to_seconds(match.group(1), match.group(2), match.group(3), match.group(4))
        t1 = _to_seconds(match.group(5), match.group(6), match.group(7), match.group(8))
        lat = lon = alt = rel_alt = None
        gps = _GPS_PAREN.search(block)
        if gps:
            lat = float(gps.group(1))
            lon = float(gps.group(2))
            if gps.group(3) is not None:
                alt = float(gps.group(3))
        lat_m = _LAT.search(block)
        lon_m = _LON.search(block)
        abs_alt_m = _ABS_ALT.search(block)
        rel_alt_m = _REL_ALT.search(block)
        if lat_m:
            lat = float(lat_m.group(1))
        if lon_m:
            lon = float(lon_m.group(1))
        if abs_alt_m:
            alt = float(abs_alt_m.group(1))
        if rel_alt_m:
            rel_alt = float(rel_alt_m.group(1))
            if alt is None:
                alt = rel_alt

        if lat is None or lon is None:
            for line in block.splitlines():
                csv = _CSV_LLA.match(line.strip())
                if csv:
                    lat = float(csv.group(1))
                    lon = float(csv.group(2))
                    alt = float(csv.group(3))
                    break

        # Validate coordinate range
        if lat is not None and not (-90.0 <= lat <= 90.0):
            lat = None
        if lon is not None and not (-180.0 <= lon <= 180.0):
            lon = None

        samples.append(TelemetrySample(t0, t1, lat, lon, alt, rel_alt))
    return samples


def sample_at(
    samples: list[TelemetrySample],
    t: float,
    max_offset_s: float = 1.5,
) -> TelemetrySample | None:
    if not samples:
        return None
    for sample in samples:
        if sample.t_start <= t <= sample.t_end:
            return sample
    best = min(samples, key=lambda s: min(abs(t - s.t_start), abs(t - s.t_end)))
    offset = min(abs(t - best.t_start), abs(t - best.t_end))
    if offset <= max_offset_s:
        return best
    return None

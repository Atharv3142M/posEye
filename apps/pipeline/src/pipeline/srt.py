from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class TelemetrySample:
    t_start: float
    t_end: float
    latitude: float | None
    longitude: float | None
    altitude: float | None  # Absolute altitude (meters)
    relative_altitude: float | None = None  # Relative/AGL altitude (meters)
    altitude_ref: str = "unknown"  # "absolute", "relative", "unknown"
    source: str = "srt"


@dataclass
class MatchStats:
    total_frames: int = 0
    valid_gps_matches: int = 0
    matched_exact: int = 0
    matched_interpolated: int = 0
    rejected_offset: int = 0
    out_of_coverage: int = 0
    invalid_coordinates: int = 0
    max_offset_observed: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "totalFrames": self.total_frames,
            "validGpsMatches": self.valid_gps_matches,
            "matchedExact": self.matched_exact,
            "matchedInterpolated": self.matched_interpolated,
            "rejectedOffset": self.rejected_offset,
            "outOfCoverage": self.out_of_coverage,
            "invalidCoordinates": self.invalid_coordinates,
            "maxOffsetObserved": round(self.max_offset_observed, 3),
        }


_TIME = re.compile(
    r"(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})"
)
_LAT = re.compile(r"\b(?:latitude|lat)\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I)
_LON = re.compile(r"\b(?:longitude|lon|lng)\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I)
_ABS_ALT = re.compile(r"\b(?:abs_alt|altitude|alt)\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I)
_REL_ALT = re.compile(r"\brel_alt\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I)
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
    raw_samples: list[TelemetrySample] = []

    for block in blocks:
        match = _TIME.search(block)
        if not match:
            continue
        t0 = _to_seconds(match.group(1), match.group(2), match.group(3), match.group(4))
        t1 = _to_seconds(match.group(5), match.group(6), match.group(7), match.group(8))
        if t1 < t0:
            continue

        lat = lon = alt = rel_alt = None
        alt_ref = "unknown"

        gps = _GPS_PAREN.search(block)
        if gps:
            lat = float(gps.group(1))
            lon = float(gps.group(2))
            if gps.group(3) is not None:
                alt = float(gps.group(3))
                alt_ref = "absolute"

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
            alt_ref = "absolute"
        if rel_alt_m:
            rel_alt = float(rel_alt_m.group(1))
            # Note: Do NOT fall back to promoting relative altitude to absolute altitude

        if lat is None or lon is None:
            for line in block.splitlines():
                csv = _CSV_LLA.match(line.strip())
                if csv:
                    lat = float(csv.group(1))
                    lon = float(csv.group(2))
                    alt = float(csv.group(3))
                    alt_ref = "absolute"
                    break

        # Validate coordinate range
        if lat is not None and not (-90.0 <= lat <= 90.0):
            lat = None
        if lon is not None and not (-180.0 <= lon <= 180.0):
            lon = None

        if alt is None and rel_alt is not None:
            alt_ref = "relative"

        raw_samples.append(TelemetrySample(t0, t1, lat, lon, alt, rel_alt, alt_ref, "srt"))

    # Sort chronologically
    raw_samples.sort(key=lambda s: s.t_start)

    # Deduplicate timestamps where consecutive samples have identical start/end
    deduped: list[TelemetrySample] = []
    for s in raw_samples:
        if deduped and abs(deduped[-1].t_start - s.t_start) < 1e-4 and abs(deduped[-1].t_end - s.t_end) < 1e-4:
            # Keep the one with valid coordinates
            if deduped[-1].latitude is None and s.latitude is not None:
                deduped[-1] = s
        else:
            deduped.append(s)

    return deduped


def sample_at(
    samples: list[TelemetrySample],
    t: float,
    max_offset_s: float = 1.5,
    stats: MatchStats | None = None,
) -> TelemetrySample | None:
    if not samples:
        if stats:
            stats.out_of_coverage += 1
        return None

    # Coverage bounds check
    first = samples[0]
    last = samples[-1]
    if t < first.t_start - max_offset_s or t > last.t_end + max_offset_s:
        if stats:
            stats.out_of_coverage += 1
        return None

    # 1. Exact interval match
    for sample in samples:
        if sample.t_start <= t <= sample.t_end:
            if sample.latitude is not None and sample.longitude is not None:
                if stats:
                    stats.matched_exact += 1
                    stats.valid_gps_matches += 1
                return sample
            else:
                if stats:
                    stats.invalid_coordinates += 1
                return None

    # 2. Adjacent interpolation if in a small gap between valid samples
    for i in range(len(samples) - 1):
        s_prev = samples[i]
        s_next = samples[i + 1]
        if s_prev.t_end <= t <= s_next.t_start:
            gap = s_next.t_start - s_prev.t_end
            if (
                gap <= 2.0
                and s_prev.latitude is not None
                and s_prev.longitude is not None
                and s_next.latitude is not None
                and s_next.longitude is not None
            ):
                frac = (t - s_prev.t_end) / gap if gap > 0 else 0.0
                interp_lat = s_prev.latitude + frac * (s_next.latitude - s_prev.latitude)
                interp_lon = s_prev.longitude + frac * (s_next.longitude - s_prev.longitude)
                interp_alt = None
                if s_prev.altitude is not None and s_next.altitude is not None:
                    interp_alt = s_prev.altitude + frac * (s_next.altitude - s_prev.altitude)
                interp_rel = None
                if s_prev.relative_altitude is not None and s_next.relative_altitude is not None:
                    interp_rel = s_prev.relative_altitude + frac * (s_next.relative_altitude - s_prev.relative_altitude)

                if stats:
                    stats.matched_interpolated += 1
                    stats.valid_gps_matches += 1
                return TelemetrySample(
                    t_start=t,
                    t_end=t,
                    latitude=interp_lat,
                    longitude=interp_lon,
                    altitude=interp_alt,
                    relative_altitude=interp_rel,
                    altitude_ref=s_prev.altitude_ref,
                    source="interpolated",
                )
            break

    # 3. Nearest sample fallback within tolerance
    best = min(samples, key=lambda s: min(abs(t - s.t_start), abs(t - s.t_end)))
    offset = min(abs(t - best.t_start), abs(t - best.t_end))
    if offset <= max_offset_s:
        if best.latitude is not None and best.longitude is not None:
            if stats:
                stats.valid_gps_matches += 1
                stats.max_offset_observed = max(stats.max_offset_observed, offset)
            return best
        else:
            if stats:
                stats.invalid_coordinates += 1
            return None

    if stats:
        stats.rejected_offset += 1
    return None

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class PointResidual:
    """Individual residual between estimated and reference coordinates."""
    point_id: str
    point_type: str  # "control" (GCP used in alignment) or "checkpoint" (independent validation)
    dx: float
    dy: float
    dz: float
    error_2d: float = field(init=False)
    error_3d: float = field(init=False)

    def __post_init__(self):
        err_2d = math.sqrt(self.dx * self.dx + self.dy * self.dy)
        err_3d = math.sqrt(self.dx * self.dx + self.dy * self.dy + self.dz * self.dz)
        object.__setattr__(self, "error_2d", err_2d)
        object.__setattr__(self, "error_3d", err_3d)

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.point_id,
            "type": self.point_type,
            "dx": round(self.dx, 6),
            "dy": round(self.dy, 6),
            "dz": round(self.dz, 6),
            "error2D": round(self.error_2d, 6),
            "error3D": round(self.error_3d, 6),
        }


@dataclass
class AccuracyStats:
    """Statistical summary of coordinate residuals."""
    count: int
    rms_x: float
    rms_y: float
    rms_z: float
    rms_xy: float
    rms_3d: float
    mean_x: float
    mean_y: float
    mean_z: float
    std_x: float
    std_y: float
    std_z: float
    max_3d: float
    min_3d: float
    point_type: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "count": self.count,
            "pointType": self.point_type,
            "rmsX": round(self.rms_x, 6),
            "rmsY": round(self.rms_y, 6),
            "rmsZ": round(self.rms_z, 6),
            "rmsXY": round(self.rms_xy, 6),
            "rms3D": round(self.rms_3d, 6),
            "meanX": round(self.mean_x, 6),
            "meanY": round(self.mean_y, 6),
            "meanZ": round(self.mean_z, 6),
            "stdX": round(self.std_x, 6),
            "stdY": round(self.std_y, 6),
            "stdZ": round(self.std_z, 6),
            "max3D": round(self.max_3d, 6),
            "min3D": round(self.min_3d, 6),
        }


def compute_residuals(
    points: list[dict[str, Any]],
) -> list[PointResidual]:
    """
    Compute residuals from paired estimated and reference coordinates.
    Each point dict should contain:
      id: str
      type: "control" | "checkpoint"
      estimated: [x, y, z]
      reference: [x, y, z]
    Or directly dx, dy, dz.
    """
    residuals: list[PointResidual] = []
    for p in points:
        p_id = str(p.get("id", f"pt_{len(residuals)}"))
        p_type = str(p.get("type", "control")).lower()
        if p_type not in {"control", "checkpoint"}:
            p_type = "control"

        if "dx" in p and "dy" in p and "dz" in p:
            dx = float(p["dx"])
            dy = float(p["dy"])
            dz = float(p["dz"])
        elif "estimated" in p and "reference" in p:
            est = p["estimated"]
            ref = p["reference"]
            dx = float(est[0]) - float(ref[0])
            dy = float(est[1]) - float(ref[1])
            dz = float(est[2]) - float(ref[2])
        else:
            continue

        residuals.append(PointResidual(point_id=p_id, point_type=p_type, dx=dx, dy=dy, dz=dz))
    return residuals


def calculate_rms(residuals: list[PointResidual], point_type: str = "all") -> AccuracyStats | None:
    """
    Calculate RMS and statistics from underlying floating-point residuals.
    Enforces RMS_3D = sqrt(RMS_X^2 + RMS_Y^2 + RMS_Z^2) for matching samples.
    """
    filtered = [r for r in residuals if point_type == "all" or r.point_type == point_type]
    n = len(filtered)
    if n == 0:
        return None

    sum_sq_x = sum(r.dx * r.dx for r in filtered)
    sum_sq_y = sum(r.dy * r.dy for r in filtered)
    sum_sq_z = sum(r.dz * r.dz for r in filtered)

    rms_x = math.sqrt(sum_sq_x / n)
    rms_y = math.sqrt(sum_sq_y / n)
    rms_z = math.sqrt(sum_sq_z / n)
    # RMS_XY = sqrt(RMS_X^2 + RMS_Y^2)
    rms_xy = math.sqrt(rms_x * rms_x + rms_y * rms_y)
    # RMS_3D = sqrt(RMS_X^2 + RMS_Y^2 + RMS_Z^2)
    rms_3d = math.sqrt(rms_x * rms_x + rms_y * rms_y + rms_z * rms_z)

    mean_x = sum(r.dx for r in filtered) / n
    mean_y = sum(r.dy for r in filtered) / n
    mean_z = sum(r.dz for r in filtered) / n

    std_x = math.sqrt(sum((r.dx - mean_x) ** 2 for r in filtered) / n)
    std_y = math.sqrt(sum((r.dy - mean_y) ** 2 for r in filtered) / n)
    std_z = math.sqrt(sum((r.dz - mean_z) ** 2 for r in filtered) / n)

    max_3d = max(r.error_3d for r in filtered)
    min_3d = min(r.error_3d for r in filtered)

    return AccuracyStats(
        count=n,
        rms_x=rms_x,
        rms_y=rms_y,
        rms_z=rms_z,
        rms_xy=rms_xy,
        rms_3d=rms_3d,
        mean_x=mean_x,
        mean_y=mean_y,
        mean_z=mean_z,
        std_x=std_x,
        std_y=std_y,
        std_z=std_z,
        max_3d=max_3d,
        min_3d=min_3d,
        point_type=point_type,
    )


@dataclass
class TimestampProvenance:
    """Complete timestamp provenance for reconstruction report."""
    video_creation_time: str | None = None
    srt_telemetry_time: str | None = None
    capture_start: str | None = None
    capture_end: str | None = None
    flight_duration_s: float | None = None
    utc_datetime: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    local_display_timezone: str = "UTC"
    report_generation_time: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    provenance_source: str = "telemetry_srt"

    def as_dict(self) -> dict[str, Any]:
        return {
            "videoCreationTime": self.video_creation_time,
            "srtTelemetryTime": self.srt_telemetry_time,
            "captureStart": self.capture_start,
            "captureEnd": self.capture_end,
            "flightDurationS": self.flight_duration_s,
            "utcDateTime": self.utc_datetime,
            "localDisplayTimezone": self.local_display_timezone,
            "reportGenerationTime": self.report_generation_time,
            "provenanceSource": self.provenance_source,
        }


@dataclass
class GeoreferenceReport:
    """Structured accuracy and georeference report distinguishing GCP control vs checkpoint accuracy."""
    is_georeferenced: bool
    crs: str | None
    control_stats: AccuracyStats | None
    checkpoint_stats: AccuracyStats | None
    residuals: list[PointResidual] = field(default_factory=list)
    provenance: TimestampProvenance = field(default_factory=TimestampProvenance)

    def as_dict(self) -> dict[str, Any]:
        return {
            "isGeoreferenced": self.is_georeferenced,
            "crs": self.crs,
            "controlPoints": self.control_stats.as_dict() if self.control_stats else None,
            "checkpoints": self.checkpoint_stats.as_dict() if self.checkpoint_stats else None,
            "residuals": [r.as_dict() for r in self.residuals],
            "provenance": self.provenance.as_dict(),
        }


def parse_odm_accuracy(unpacked_dir: Any) -> dict[str, Any]:
    """Parse ODM stats and residual reports if present."""
    from pathlib import Path
    import json

    unpacked = Path(unpacked_dir)
    if not unpacked.is_dir():
        return {}
    stats_file = unpacked / "odm_report" / "stats.json"
    if not stats_file.is_file():
        stats_file = unpacked / "stats.json"

    points: list[dict[str, Any]] = []
    if stats_file.is_file():
        try:
            data = json.loads(stats_file.read_text(encoding="utf-8"))
            raw_gcps = data.get("gcp_errors") or data.get("gcps") or []
            for g in raw_gcps:
                points.append({
                    "id": str(g.get("id", len(points) + 1)),
                    "type": "checkpoint" if g.get("is_checkpoint") else "control",
                    "dx": float(g.get("error_x", g.get("dx", 0.0))),
                    "dy": float(g.get("error_y", g.get("dy", 0.0))),
                    "dz": float(g.get("error_z", g.get("dz", 0.0))),
                })
        except Exception:
            pass

    residuals = compute_residuals(points)
    control_stats = calculate_rms(residuals, point_type="control")
    checkpoint_stats = calculate_rms(residuals, point_type="checkpoint")
    if not control_stats and not checkpoint_stats:
        return {}
    return {
        "controlPoints": control_stats.as_dict() if control_stats else None,
        "checkpoints": checkpoint_stats.as_dict() if checkpoint_stats else None,
        "residuals": [r.as_dict() for r in residuals],
    }


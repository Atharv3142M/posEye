from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


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
        if self.point_type not in {"control", "checkpoint"}:
            raise ValueError(f"Invalid point_type: '{self.point_type}'. Must be 'control' or 'checkpoint'.")
        if not (math.isfinite(self.dx) and math.isfinite(self.dy) and math.isfinite(self.dz)):
            raise ValueError(f"Point residuals must be finite numbers: dx={self.dx}, dy={self.dy}, dz={self.dz}")
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
    errors: list[str] | None = None,
) -> list[PointResidual]:
    """
    Compute residuals from paired estimated and reference coordinates.
    Never substitutes zero for missing measurements.
    Rejects points with unknown point roles or non-finite coordinates.
    """
    residuals: list[PointResidual] = []
    for idx, p in enumerate(points):
        p_id = str(p.get("id") or f"pt_{idx + 1}").strip()
        raw_type = p.get("type") or p.get("role")
        if raw_type is None:
            if errors is not None:
                errors.append(f"Point '{p_id}': point role missing (neither control nor checkpoint specified); rejected.")
            continue

        p_type = str(raw_type).strip().lower()
        if p_type not in {"control", "checkpoint"}:
            if errors is not None:
                errors.append(f"Point '{p_id}': unknown point role '{raw_type}'; rejected.")
            continue

        # Extract dx, dy, dz without substituting 0.0 for missing data
        dx_val: Any = None
        dy_val: Any = None
        dz_val: Any = None

        if "dx" in p and "dy" in p and "dz" in p:
            dx_val, dy_val, dz_val = p["dx"], p["dy"], p["dz"]
        elif "error_x" in p and "error_y" in p and "error_z" in p:
            dx_val, dy_val, dz_val = p["error_x"], p["error_y"], p["error_z"]
        elif "estimated" in p and "reference" in p:
            est = p["estimated"]
            ref = p["reference"]
            if (
                isinstance(est, (list, tuple))
                and isinstance(ref, (list, tuple))
                and len(est) >= 3
                and len(ref) >= 3
            ):
                try:
                    dx_val = float(est[0]) - float(ref[0])
                    dy_val = float(est[1]) - float(ref[1])
                    dz_val = float(est[2]) - float(ref[2])
                except (TypeError, ValueError):
                    pass

        if dx_val is None or dy_val is None or dz_val is None:
            if errors is not None:
                errors.append(f"Point '{p_id}': incomplete residual measurements; rejected.")
            continue

        try:
            dx = float(dx_val)
            dy = float(dy_val)
            dz = float(dz_val)
        except (TypeError, ValueError):
            if errors is not None:
                errors.append(f"Point '{p_id}': invalid numeric format in residuals; rejected.")
            continue

        if not (math.isfinite(dx) and math.isfinite(dy) and math.isfinite(dz)):
            if errors is not None:
                errors.append(f"Point '{p_id}': non-finite residual coordinates (NaN or Inf); rejected.")
            continue

        try:
            residual = PointResidual(point_id=p_id, point_type=p_type, dx=dx, dy=dy, dz=dz)
            residuals.append(residual)
        except ValueError as val_err:
            if errors is not None:
                errors.append(f"Point '{p_id}': {val_err}; rejected.")

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
    video_recording_start: str | None = None
    telemetry_coverage_start: str | None = None
    telemetry_coverage_end: str | None = None
    first_extracted_frame_time: str | None = None
    last_extracted_frame_time: str | None = None
    reconstruction_duration_s: float | None = None
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
            "videoRecordingStart": self.video_recording_start or self.video_creation_time,
            "telemetryCoverageStart": self.telemetry_coverage_start or self.srt_telemetry_time,
            "telemetryCoverageEnd": self.telemetry_coverage_end,
            "firstExtractedFrameTime": self.first_extracted_frame_time,
            "lastExtractedFrameTime": self.last_extracted_frame_time,
            "reconstructionDurationS": self.reconstruction_duration_s,
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
    parse_errors: list[str] = field(default_factory=list)
    validation_status: str = "valid"

    def as_dict(self) -> dict[str, Any]:
        return {
            "isGeoreferenced": self.is_georeferenced,
            "crs": self.crs,
            "controlPoints": self.control_stats.as_dict() if self.control_stats else None,
            "checkpoints": self.checkpoint_stats.as_dict() if self.checkpoint_stats else None,
            "checkpointValidation": "evaluated" if self.checkpoint_stats else "none_provided",
            "residuals": [r.as_dict() for r in self.residuals],
            "provenance": self.provenance.as_dict(),
            "parseErrors": self.parse_errors,
            "validationStatus": self.validation_status,
        }


def parse_odm_accuracy(unpacked_dir: Any) -> dict[str, Any]:
    """
    Parse ODM stats and residual reports if present.
    Preserves parse errors and never substitutes zero for missing residual measurements.
    Distinguishes independent checkpoint accuracy from control points.
    """
    unpacked = Path(unpacked_dir)
    if not unpacked.is_dir():
        return {}

    stats_file = unpacked / "odm_report" / "stats.json"
    if not stats_file.is_file():
        stats_file = unpacked / "stats.json"

    if not stats_file.is_file():
        return {}

    parse_errors: list[str] = []
    points: list[dict[str, Any]] = []

    try:
        data = json.loads(stats_file.read_text(encoding="utf-8"))
    except Exception as exc:
        err_msg = f"Failed to parse {stats_file.name}: {exc}"
        logger.error(err_msg)
        return {
            "validationStatus": "parse_failed",
            "controlPoints": None,
            "checkpoints": None,
            "checkpointValidation": "none_provided",
            "residuals": [],
            "parseErrors": [err_msg],
        }

    raw_gcps = data.get("gcp_errors") or data.get("gcps")
    if not isinstance(raw_gcps, list) or len(raw_gcps) == 0:
        return {}

    for idx, g in enumerate(raw_gcps):
        if not isinstance(g, dict):
            parse_errors.append(f"GCP index {idx}: entry is not a dictionary; rejected.")
            continue

        g_id = str(g.get("id") or g.get("name") or f"gcp_{idx + 1}").strip()

        # Strict point role determination — do NOT default missing roles to control
        is_chk = g.get("is_checkpoint")
        point_role: str | None = None
        if is_chk is True:
            point_role = "checkpoint"
        elif is_chk is False:
            point_role = "control"
        else:
            raw_role = g.get("type") or g.get("role") or g.get("point_type")
            if raw_role:
                norm_role = str(raw_role).strip().lower()
                if norm_role in {"checkpoint", "control"}:
                    point_role = norm_role

        if point_role is None:
            parse_errors.append(
                f"GCP '{g_id}': point role is missing or ambiguous (neither control nor checkpoint explicitly indicated); rejected."
            )
            continue

        # Extract residual coordinates — do NOT default missing keys to 0.0
        x_val = g.get("error_x") if "error_x" in g else g.get("dx")
        y_val = g.get("error_y") if "error_y" in g else g.get("dy")
        z_val = g.get("error_z") if "error_z" in g else g.get("dz")

        if x_val is None or y_val is None or z_val is None:
            parse_errors.append(
                f"GCP '{g_id}': missing residual coordinate measurements (x={x_val}, y={y_val}, z={z_val}); rejected."
            )
            continue

        points.append({
            "id": g_id,
            "type": point_role,
            "dx": x_val,
            "dy": y_val,
            "dz": z_val,
        })

    residuals = compute_residuals(points, errors=parse_errors)

    if not residuals:
        if parse_errors:
            return {
                "validationStatus": "invalid",
                "controlPoints": None,
                "checkpoints": None,
                "checkpointValidation": "none_provided",
                "residuals": [],
                "parseErrors": parse_errors,
            }
        return {}

    control_stats = calculate_rms(residuals, point_type="control")
    checkpoint_stats = calculate_rms(residuals, point_type="checkpoint")
    validation_status = "incomplete" if parse_errors else "valid"

    return {
        "validationStatus": validation_status,
        "controlPoints": control_stats.as_dict() if control_stats else None,
        "checkpoints": checkpoint_stats.as_dict() if checkpoint_stats else None,
        "checkpointValidation": "evaluated" if checkpoint_stats else "none_provided",
        "residuals": [r.as_dict() for r in residuals],
        "parseErrors": parse_errors,
    }

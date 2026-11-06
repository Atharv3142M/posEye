import math
from datetime import datetime, timezone
import pytest

from orchestrator.accuracy import (
    PointResidual,
    calculate_rms,
    compute_residuals,
    TimestampProvenance,
    GeoreferenceReport,
)


def test_point_residual_calculation():
    r = PointResidual(point_id="GCP_01", point_type="control", dx=3.0, dy=4.0, dz=12.0)
    assert r.error_2d == 5.0  # sqrt(3^2 + 4^2) = 5
    assert r.error_3d == 13.0  # sqrt(5^2 + 12^2) = 13


def test_rms_3d_equation_and_independence():
    """
    Verify RMS_3D == sqrt(RMS_X^2 + RMS_Y^2 + RMS_Z^2) exactly from underlying residuals.
    """
    residuals = [
        PointResidual("P1", "control", dx=1.0, dy=2.0, dz=2.0),
        PointResidual("P2", "control", dx=3.0, dy=4.0, dz=1.0),
        PointResidual("P3", "control", dx=2.0, dy=2.0, dz=5.0),
    ]

    stats = calculate_rms(residuals, point_type="control")
    assert stats is not None
    assert stats.count == 3

    # Hand-calculated expected values:
    # sum(dx^2) = 1 + 9 + 4 = 14 -> RMS_X = sqrt(14/3)
    # sum(dy^2) = 4 + 16 + 4 = 24 -> RMS_Y = sqrt(8)
    # sum(dz^2) = 4 + 1 + 25 = 30 -> RMS_Z = sqrt(10)
    expected_rms_x = math.sqrt(14.0 / 3.0)
    expected_rms_y = math.sqrt(8.0)
    expected_rms_z = math.sqrt(10.0)
    expected_rms_xy = math.sqrt(expected_rms_x**2 + expected_rms_y**2)
    expected_rms_3d = math.sqrt(expected_rms_x**2 + expected_rms_y**2 + expected_rms_z**2)

    assert abs(stats.rms_x - expected_rms_x) < 1e-10
    assert abs(stats.rms_y - expected_rms_y) < 1e-10
    assert abs(stats.rms_z - expected_rms_z) < 1e-10
    assert abs(stats.rms_xy - expected_rms_xy) < 1e-10
    assert abs(stats.rms_3d - expected_rms_3d) < 1e-10

    # Explicit identity test:
    recomputed_rms_3d = math.sqrt(stats.rms_x**2 + stats.rms_y**2 + stats.rms_z**2)
    assert abs(stats.rms_3d - recomputed_rms_3d) < 1e-12


def test_distinguish_control_points_from_checkpoints():
    """
    Photogrammetric integrity: Control points (optimization fit) must be distinguished
    from independent checkpoints (accuracy evaluation).
    """
    raw_points = [
        # Control points (used for georeferencing bundle adjustment)
        {"id": "GCP1", "type": "control", "dx": 0.02, "dy": -0.01, "dz": 0.03},
        {"id": "GCP2", "type": "control", "dx": -0.01, "dy": 0.02, "dz": -0.02},
        # Independent Checkpoints (withheld from bundle adjustment)
        {"id": "CHK1", "type": "checkpoint", "dx": 0.08, "dy": -0.12, "dz": 0.15},
        {"id": "CHK2", "type": "checkpoint", "dx": -0.09, "dy": 0.11, "dz": -0.14},
    ]

    residuals = compute_residuals(raw_points)
    assert len(residuals) == 4

    ctrl_stats = calculate_rms(residuals, point_type="control")
    chk_stats = calculate_rms(residuals, point_type="checkpoint")

    assert ctrl_stats is not None
    assert ctrl_stats.count == 2
    assert ctrl_stats.point_type == "control"
    # Control points typically show smaller fitting residuals
    assert ctrl_stats.rms_3d < 0.05

    assert chk_stats is not None
    assert chk_stats.count == 2
    assert chk_stats.point_type == "checkpoint"
    # Checkpoints reflect true independent accuracy
    assert chk_stats.rms_3d > 0.15

    report = GeoreferenceReport(
        is_georeferenced=True,
        crs="EPSG:32610",
        control_stats=ctrl_stats,
        checkpoint_stats=chk_stats,
        residuals=residuals,
    )
    rep_dict = report.as_dict()
    assert rep_dict["isGeoreferenced"] is True
    assert rep_dict["crs"] == "EPSG:32610"
    assert rep_dict["controlPoints"]["count"] == 2
    assert rep_dict["checkpoints"]["count"] == 2
    assert len(rep_dict["residuals"]) == 4


def test_timestamp_provenance_integrity():
    """
    Never substitute current system time for missing flight metadata.
    Preserve explicit videoCreationTime, srtTelemetryTime, captureStart, captureEnd.
    """
    prov = TimestampProvenance(
        video_creation_time="2024-05-18T14:20:00Z",
        srt_telemetry_time="2024-05-18T14:20:05Z",
        capture_start="2024-05-18T14:20:05Z",
        capture_end="2024-05-18T14:25:35Z",
        flight_duration_s=330.0,
        local_display_timezone="America/Los_Angeles",
        provenance_source="telemetry_srt",
    )
    d = prov.as_dict()
    assert d["videoCreationTime"] == "2024-05-18T14:20:00Z"
    assert d["srtTelemetryTime"] == "2024-05-18T14:20:05Z"
    assert d["captureStart"] == "2024-05-18T14:20:05Z"
    assert d["captureEnd"] == "2024-05-18T14:25:35Z"
    assert d["flightDurationS"] == 330.0
    assert d["localDisplayTimezone"] == "America/Los_Angeles"
    assert d["provenanceSource"] == "telemetry_srt"

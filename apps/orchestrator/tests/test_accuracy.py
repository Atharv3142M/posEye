import json
import math
from datetime import datetime, timezone
from pathlib import Path
import pytest

from orchestrator.accuracy import (
    PointResidual,
    calculate_rms,
    compute_residuals,
    TimestampProvenance,
    GeoreferenceReport,
    parse_odm_accuracy,
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
    assert rep_dict["checkpointValidation"] == "evaluated"
    assert len(rep_dict["residuals"]) == 4


def test_timestamp_provenance_integrity():
    """
    Never substitute current system time for missing flight metadata.
    Preserve explicit videoCreationTime, srtTelemetryTime, captureStart, captureEnd.
    No ambiguous utcDateTime field.
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
    assert "utcDateTime" not in d  # Removed ambiguous field


def test_missing_residual_fields_rejected_never_zeroed():
    """
    P0 integrity test: Parser must reject records missing residual coordinates.
    Never substitute 0.0 for missing dx, dy, or dz.
    """
    errors = []
    points = [
        {"id": "GCP_GOOD", "type": "control", "dx": 0.05, "dy": 0.04, "dz": 0.02},
        {"id": "GCP_MISSING_Z", "type": "control", "dx": 0.05, "dy": 0.04},  # missing dz
        {"id": "GCP_EMPTY", "type": "control"},  # no coordinates at all
    ]
    res = compute_residuals(points, errors=errors)
    assert len(res) == 1
    assert res[0].point_id == "GCP_GOOD"
    assert len(errors) == 2
    assert any("GCP_MISSING_Z" in e for e in errors)
    assert any("GCP_EMPTY" in e for e in errors)


def test_unknown_gcp_role_rejected_never_defaulted_to_control():
    """
    P0 integrity test: An ambiguous point role must be rejected,
    never defaulted to 'control'.
    """
    errors = []
    points = [
        {"id": "P_VALID_CTRL", "type": "control", "dx": 0.01, "dy": 0.02, "dz": 0.03},
        {"id": "P_NO_ROLE", "dx": 0.01, "dy": 0.02, "dz": 0.03},  # missing type
        {"id": "P_BOGUS_ROLE", "type": "tie_point", "dx": 0.01, "dy": 0.02, "dz": 0.03},
    ]
    res = compute_residuals(points, errors=errors)
    assert len(res) == 1
    assert res[0].point_id == "P_VALID_CTRL"
    assert len(errors) == 2


def test_non_finite_residuals_rejected():
    """
    P0 integrity test: NaN or Infinity residuals must be rejected.
    """
    errors = []
    points = [
        {"id": "P_NAN", "type": "control", "dx": float("nan"), "dy": 0.0, "dz": 0.0},
        {"id": "P_INF", "type": "control", "dx": 0.0, "dy": float("inf"), "dz": 0.0},
    ]
    res = compute_residuals(points, errors=errors)
    assert len(res) == 0
    assert len(errors) == 2


def test_odm_stats_json_fixture_parsing(tmp_path: Path):
    """
    Verify parsing against actual ODM stats.json schema with both GCPs and checkpoints.
    """
    odm_dir = tmp_path / "odm_report"
    odm_dir.mkdir(parents=True)
    stats_data = {
        "gcp_errors": [
            {"id": "gcp_01", "error_x": 0.012, "error_y": -0.015, "error_z": 0.020, "is_checkpoint": False},
            {"id": "gcp_02", "error_x": -0.010, "error_y": 0.014, "error_z": -0.018, "is_checkpoint": False},
            {"id": "chk_01", "error_x": 0.045, "error_y": -0.052, "error_z": 0.061, "is_checkpoint": True},
        ]
    }
    (odm_dir / "stats.json").write_text(json.dumps(stats_data), encoding="utf-8")

    result = parse_odm_accuracy(tmp_path)
    assert result["validationStatus"] == "valid"
    assert result["controlPoints"] is not None
    assert result["controlPoints"]["count"] == 2
    assert result["checkpoints"] is not None
    assert result["checkpoints"]["count"] == 1
    assert result["checkpointValidation"] == "evaluated"
    assert len(result["residuals"]) == 3
    assert len(result["parseErrors"]) == 0


def test_distinguish_missing_checkpoints_from_zero_checkpoint_error(tmp_path: Path):
    """
    When no checkpoints were measured, report must show 'none_provided',
    NOT zero checkpoint error.
    """
    odm_dir = tmp_path / "odm_report"
    odm_dir.mkdir(parents=True)
    stats_data = {
        "gcp_errors": [
            {"id": "gcp_01", "error_x": 0.01, "error_y": 0.02, "error_z": 0.03, "is_checkpoint": False},
        ]
    }
    (odm_dir / "stats.json").write_text(json.dumps(stats_data), encoding="utf-8")

    result = parse_odm_accuracy(tmp_path)
    assert result["validationStatus"] == "valid"
    assert result["controlPoints"]["count"] == 1
    assert result["checkpoints"] is None
    assert result["checkpointValidation"] == "none_provided"


def test_malformed_json_stats_error_preserved(tmp_path: Path):
    """
    Preserve parse errors in diagnostics instead of silently swallowing exceptions.
    """
    odm_dir = tmp_path / "odm_report"
    odm_dir.mkdir(parents=True)
    (odm_dir / "stats.json").write_text("{ broken json ...", encoding="utf-8")

    result = parse_odm_accuracy(tmp_path)
    assert result["validationStatus"] == "parse_failed"
    assert len(result["parseErrors"]) >= 1
    assert "Failed to parse stats.json" in result["parseErrors"][0]

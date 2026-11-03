from __future__ import annotations

from pathlib import Path
import pytest
import numpy as np
import cv2

from pipeline.srt import parse_srt, sample_at, MatchStats, TelemetrySample
from pipeline.exif import write_gps_exif, read_gps_exif


def test_relative_altitude_never_promoted(tmp_path: Path):
    srt_content = """1
00:00:01,000 --> 00:00:02,000
[latitude: 37.7749] [longitude: -122.4194] [rel_alt: 45.5]

2
00:00:02,000 --> 00:00:03,000
[latitude: 37.7750] [longitude: -122.4195] [abs_alt: 120.0] [rel_alt: 46.0]
"""
    srt_file = tmp_path / "flight.srt"
    srt_file.write_text(srt_content)

    samples = parse_srt(srt_file)
    assert len(samples) == 2

    # Sample 1: only rel_alt is present. absolute altitude MUST be None!
    s1 = samples[0]
    assert s1.latitude == pytest.approx(37.7749)
    assert s1.longitude == pytest.approx(-122.4194)
    assert s1.relative_altitude == pytest.approx(45.5)
    assert s1.altitude is None
    assert s1.altitude_ref == "relative"

    # Sample 2: both abs_alt and rel_alt present
    s2 = samples[1]
    assert s2.altitude == pytest.approx(120.0)
    assert s2.relative_altitude == pytest.approx(46.0)
    assert s2.altitude_ref == "absolute"


def test_exif_altitude_relative_not_written(tmp_path: Path):
    img = np.zeros((32, 32, 3), dtype=np.uint8)
    path = tmp_path / "test.jpg"
    cv2.imwrite(str(path), img)

    # When altitude_ref is "relative", EXIF GPSAltitude must NOT be written!
    write_gps_exif(path, 12.9716, 77.5946, altitude=45.5, altitude_ref="relative")
    lat, lon, alt = read_gps_exif(path)
    assert lat == pytest.approx(12.9716, abs=1e-4)
    assert lon == pytest.approx(77.5946, abs=1e-4)
    assert alt is None  # Relative altitude not written as GPSAltitude

    # When altitude_ref is "absolute", EXIF GPSAltitude is written
    write_gps_exif(path, 12.9716, 77.5946, altitude=950.0, altitude_ref="absolute")
    lat, lon, alt = read_gps_exif(path)
    assert alt == pytest.approx(950.0, abs=0.1)


def test_exif_negative_altitude_and_coordinates(tmp_path: Path):
    img = np.zeros((32, 32, 3), dtype=np.uint8)
    path = tmp_path / "negative.jpg"
    cv2.imwrite(str(path), img)

    # Negative latitude (South), negative longitude (West), negative altitude (below sea level)
    write_gps_exif(path, -33.8688, -151.2093, altitude=-15.0, altitude_ref="absolute")
    lat, lon, alt = read_gps_exif(path)
    assert lat == pytest.approx(-33.8688, abs=1e-4)
    assert lon == pytest.approx(-151.2093, abs=1e-4)
    assert alt == pytest.approx(-15.0, abs=0.1)


def test_out_of_range_coordinates_rejected(tmp_path: Path):
    srt_content = """1
00:00:01,000 --> 00:00:02,000
[latitude: 95.0] [longitude: 190.0] [abs_alt: 100.0]
"""
    srt_file = tmp_path / "invalid_coords.srt"
    srt_file.write_text(srt_content)

    samples = parse_srt(srt_file)
    assert len(samples) == 1
    assert samples[0].latitude is None
    assert samples[0].longitude is None


def test_srt_tolerance_and_gap_handling():
    samples = [
        TelemetrySample(t_start=1.0, t_end=2.0, latitude=10.0, longitude=20.0, altitude=100.0, altitude_ref="absolute"),
        TelemetrySample(t_start=10.0, t_end=11.0, latitude=10.1, longitude=20.1, altitude=105.0, altitude_ref="absolute"),
    ]

    stats = MatchStats(total_frames=3)

    # Exact match at t=1.5
    m1 = sample_at(samples, 1.5, max_offset_s=1.5, stats=stats)
    assert m1 is not None
    assert m1.latitude == 10.0

    # Within tolerance offset at t=3.0 (offset 1.0s <= 1.5s)
    m2 = sample_at(samples, 3.0, max_offset_s=1.5, stats=stats)
    assert m2 is not None
    assert m2.latitude == 10.0

    # In long gap at t=6.0 (offset 4.0s > 1.5s tolerance) -> rejected!
    m3 = sample_at(samples, 6.0, max_offset_s=1.5, stats=stats)
    assert m3 is None
    assert stats.rejected_offset >= 1


def test_exif_timestamp_and_gps_version(tmp_path: Path):
    from datetime import datetime, timezone
    import piexif

    img = np.zeros((32, 32, 3), dtype=np.uint8)
    path = tmp_path / "ts_test.jpg"
    cv2.imwrite(str(path), img)

    dt = datetime(2024, 5, 18, 14, 22, 10, tzinfo=timezone.utc)
    write_gps_exif(path, 28.6139, 77.2090, altitude=150.0, altitude_ref="absolute", timestamp=dt)

    exif = piexif.load(str(path))
    # EXIF 2.3 GPS Version ID must be (2, 3, 0, 0)
    assert exif["GPS"][piexif.GPSIFD.GPSVersionID] == (2, 3, 0, 0)
    # DateTimeOriginal must be formatted YYYY:MM:DD HH:MM:SS
    assert exif["Exif"][piexif.ExifIFD.DateTimeOriginal] == b"2024:05:18 14:22:10"
    assert exif["0th"][piexif.ImageIFD.DateTime] == b"2024:05:18 14:22:10"
    # GPS DateStamp and TimeStamp
    assert exif["GPS"][piexif.GPSIFD.GPSDateStamp] == b"2024:05:18"
    assert exif["GPS"][piexif.GPSIFD.GPSTimeStamp] == ((14, 1), (22, 1), (10, 1))


def test_trustworthy_srt_datetime_parsing(tmp_path: Path):
    from datetime import datetime, timezone
    srt_text = """1
00:00:01,000 --> 00:00:02,000
2024-05-18 14:22:10,500
GPS(28.613900, 77.209000, 150.0)

2
00:00:02,000 --> 00:00:03,000
HOME(77.2090, 28.6139) 2024.05.18 14:22:11
GPS(28.614000, 77.209100, 151.0)
"""
    f = tmp_path / "telemetry_with_dates.srt"
    f.write_text(srt_text)

    samples = parse_srt(f)
    assert len(samples) == 2
    assert samples[0].timestamp == datetime(2024, 5, 18, 14, 22, 10, 500000, tzinfo=timezone.utc)
    assert samples[1].timestamp == datetime(2024, 5, 18, 14, 22, 11, 0, tzinfo=timezone.utc)


def test_no_fabricated_dates_when_metadata_missing(tmp_path: Path):
    import piexif
    img = np.zeros((32, 32, 3), dtype=np.uint8)
    path = tmp_path / "no_ts.jpg"
    cv2.imwrite(str(path), img)

    # When timestamp is None, no DateTimeOriginal or GPSDateStamp should be written
    write_gps_exif(path, 28.6139, 77.2090, altitude=150.0, altitude_ref="absolute", timestamp=None)

    exif = piexif.load(str(path))
    # Coordinates are still written accurately
    assert exif["GPS"][piexif.GPSIFD.GPSVersionID] == (2, 3, 0, 0)
    # But capture dates must NOT be fabricated
    assert piexif.ExifIFD.DateTimeOriginal not in exif.get("Exif", {})
    assert piexif.GPSIFD.GPSDateStamp not in exif.get("GPS", {})
    assert piexif.GPSIFD.GPSTimeStamp not in exif.get("GPS", {})

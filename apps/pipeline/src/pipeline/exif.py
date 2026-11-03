from __future__ import annotations

from datetime import datetime
from fractions import Fraction
from pathlib import Path

import piexif


def _to_deg_min_sec(value: float) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int]]:
    sign = 1 if value >= 0 else -1
    value = abs(value)
    degrees = int(value)
    minutes_f = (value - degrees) * 60
    minutes = int(minutes_f)
    seconds = Fraction((minutes_f - minutes) * 60).limit_denominator(10000)
    return (
        (degrees * sign if False else degrees, 1),
        (minutes, 1),
        (seconds.numerator, seconds.denominator),
    )


def _rational_altitude(meters: float) -> tuple[int, int]:
    frac = Fraction(abs(meters)).limit_denominator(1000)
    return (frac.numerator, frac.denominator)


def write_gps_exif(
    image_path: str | Path,
    latitude: float,
    longitude: float,
    altitude: float | None = None,
    altitude_ref: str = "absolute",
    timestamp: datetime | None = None,
) -> None:
    path = Path(image_path)
    try:
        exif = piexif.load(str(path))
    except Exception:
        exif = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}

    if "0th" not in exif or not isinstance(exif["0th"], dict):
        exif["0th"] = {}
    if "Exif" not in exif or not isinstance(exif["Exif"], dict):
        exif["Exif"] = {}

    gps: dict = dict(exif.get("GPS") or {})
    gps[piexif.GPSIFD.GPSVersionID] = (2, 3, 0, 0)
    lat_ref = "N" if latitude >= 0 else "S"
    lon_ref = "E" if longitude >= 0 else "W"
    gps[piexif.GPSIFD.GPSLatitudeRef] = lat_ref.encode("ascii")
    gps[piexif.GPSIFD.GPSLatitude] = _to_deg_min_sec(abs(latitude))
    gps[piexif.GPSIFD.GPSLongitudeRef] = lon_ref.encode("ascii")
    gps[piexif.GPSIFD.GPSLongitude] = _to_deg_min_sec(abs(longitude))

    # Only write GPSAltitude if altitude is an absolute altitude, never relative altitude
    if altitude is not None and altitude_ref in {"absolute", "msl", "ellipsoidal"}:
        # GPSAltitudeRef: 0 = Above sea level, 1 = Below sea level
        gps[piexif.GPSIFD.GPSAltitudeRef] = 0 if altitude >= 0 else 1
        gps[piexif.GPSIFD.GPSAltitude] = _rational_altitude(altitude)
    else:
        # Leave EXIF altitude unset if semantics are relative or unknown
        gps.pop(piexif.GPSIFD.GPSAltitude, None)
        gps.pop(piexif.GPSIFD.GPSAltitudeRef, None)

    if timestamp is not None:
        dt_str = timestamp.strftime("%Y:%m:%d %H:%M:%S").encode("ascii")
        exif["0th"][piexif.ImageIFD.DateTime] = dt_str
        exif["Exif"][piexif.ExifIFD.DateTimeOriginal] = dt_str
        exif["Exif"][piexif.ExifIFD.DateTimeDigitized] = dt_str
        gps[piexif.GPSIFD.GPSDateStamp] = timestamp.strftime("%Y:%m:%d").encode("ascii")
        gps[piexif.GPSIFD.GPSTimeStamp] = (
            (timestamp.hour, 1),
            (timestamp.minute, 1),
            (timestamp.second, 1),
        )

    exif["GPS"] = gps
    piexif.insert(piexif.dump(exif), str(path))


def read_gps_exif(image_path: str | Path) -> tuple[float | None, float | None, float | None]:
    exif = piexif.load(str(image_path))
    gps = exif.get("GPS") or {}
    if piexif.GPSIFD.GPSLatitude not in gps or piexif.GPSIFD.GPSLongitude not in gps:
        return None, None, None

    def dms_to_deg(dms) -> float:
        deg = dms[0][0] / dms[0][1]
        minutes = dms[1][0] / dms[1][1]
        seconds = dms[2][0] / dms[2][1]
        return deg + minutes / 60 + seconds / 3600

    lat = dms_to_deg(gps[piexif.GPSIFD.GPSLatitude])
    lon = dms_to_deg(gps[piexif.GPSIFD.GPSLongitude])
    lat_ref = gps.get(piexif.GPSIFD.GPSLatitudeRef, b"N")
    lon_ref = gps.get(piexif.GPSIFD.GPSLongitudeRef, b"E")
    if isinstance(lat_ref, bytes):
        lat_ref = lat_ref.decode()
    if isinstance(lon_ref, bytes):
        lon_ref = lon_ref.decode()
    if lat_ref == "S":
        lat = -lat
    if lon_ref == "W":
        lon = -lon
    alt = None
    if piexif.GPSIFD.GPSAltitude in gps:
        num, den = gps[piexif.GPSIFD.GPSAltitude]
        alt = num / den if den else None
        ref = gps.get(piexif.GPSIFD.GPSAltitudeRef, 0)
        # If byte or int 1, negative altitude below sea level
        if ref in {1, b"\x01"} and alt is not None:
            alt = -alt
    return lat, lon, alt

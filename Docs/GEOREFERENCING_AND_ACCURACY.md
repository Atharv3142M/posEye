# posEye — Georeferencing, Coordinate Systems & Accuracy Disclosures

This document details how posEye handles flight telemetry, associates GPS coordinates with extracted video frames, registers 3D reconstructions in coordinate space, and establishes transparent measurement accuracy boundaries.

---

## 1. Flight Telemetry Ingestion & Parsing

Most modern commercial and consumer camera drones (e.g., DJI Mavic, Phantom, Mini, Air; Autel EVO) record companion subtitle tracks (`.SRT`) containing per-frame or per-second flight telemetry.

posEye automatically parses and extracts telemetry from subtitle streams across multiple industry formats:

### Supported Formats
1. **DJI Parenthesized Format:**
   ```text
   1
   00:00:00,000 --> 00:00:01,000
   GPS(28.613900, 77.209000, 120.5)
   ```
2. **DJI Comma-Separated Values (CSV) Format:**
   ```text
   1
   00:00:00,000 --> 00:00:00,500
   28.613900,77.209000,120.5,45,30,0,5.0,0.0,0.0,0,0,0,1,0
   ```
3. **Key-Value Pairs Format:**
   ```text
   1
   00:00:00,000 --> 00:00:01,000
   latitude: 28.613900 longitude: 77.209000 altitude: 120.5
   ```

### Timestamp Matching & Nearest-Neighbor Interpolation
During frame extraction, posEye calculates the exact video time offset for each extracted frame. The pipeline matches each frame against the telemetry sample list using a nearest-neighbor temporal search with a maximum allowable drift threshold (default: 0.5s).

---

## 2. EXIF Metadata Injection

For each retained frame passing the Laplacian sharpness filter and dHash deduplication:
1. **Coordinate Conversion:** Latitude and longitude decimal degrees are converted into EXIF-compliant Degrees, Minutes, and Seconds (DMS) rational fractions:
   $$\text{DMS} = [(\text{deg}, 1), (\text{min}, 1), (\text{sec} \times 1000, 1000)]$$
2. **Datum:** All coordinates are referenced to the **WGS 84 (EPSG:4326)** geodetic reference system.
3. **Altitude:** Recorded as rational fraction meters relative to sea level (`GPSAltitudeRef = 0`).
4. **EXIF Injection:** Injected directly into the JPEG binary headers via `piexif` (`GPSLatitude`, `GPSLatitudeRef`, `GPSLongitude`, `GPSLongitudeRef`, `GPSAltitude`, `GPSAltitudeRef`).

---

## 3. Scale Registration & Photogrammetry

When the geotagged JPEG image set is submitted to OpenDroneMap (NodeODM):

### With Telemetry (Georeferenced Mode)
- **OpenSfM Bundle Adjustment:** The photogrammetry solver uses camera GPS positions as initial priors in the bundle adjustment optimization.
- **Metric Scaling:** Camera baseline distances solve the scale ambiguity inherent in monocular Structure from Motion (SfM).
- **Coordinate Transformation:** The dense point cloud and textured mesh are aligned to an appropriate local UTM projection (Universal Transverse Mercator) and scaled in real-world **meters**.

### Without Telemetry (Relative Mode)
- When no `.SRT` file is provided and frames lack EXIF GPS tags, monocular SfM cannot resolve real-world scale.
- The resulting 3D model is mathematically valid but scaled arbitrarily.
- **UI Disclosure:** posEye explicitly detects the absence of georeferencing and displays distances in **"model units"** rather than misleading meter units.

---

## 4. Accuracy Boundaries & Error Sources

### 4.1 Inherent Drone GPS Accuracy
- **Standard GNSS (Consumer Drones):** Standard single-frequency GPS/GLONASS receivers without RTK/PPK typically have horizontal positioning errors of $\pm 1.5 - 3.0$ meters and vertical barometric/GNSS errors of $\pm 3.0 - 5.0$ meters.
- **Relative vs Absolute Accuracy:** While absolute geographic positioning may drift by several meters, the relative accuracy between adjacent frames within a single continuous flight is significantly higher ($\approx 0.1 - 0.5$ m), allowing coherent 3D mesh reconstruction.

### 4.2 Measurement Limitations
- **Not Survey-Grade:** posEye reconstructions generated solely from drone video and standard consumer GNSS are intended for situational awareness, asset inspection, visualization, and approximate planning. They are **not** certified for boundary surveys or legal property demarcation.
- **Ground Control Points (GCPs):** Achieving millimeter-to-centimeter survey-grade accuracy requires surveyed Ground Control Points (GCPs) marked on the ground with RTK GPS, which are outside the scope of single-pass video without manual marker collection.
- **Optical Distortions:** Rolling shutter artifacts from non-global-shutter drone cameras and motion blur can introduce localized geometric variations.

---

## 5. Summary Table

| Input Mode | Coordinate System | Scale Unit | Expected Relative Accuracy | Expected Absolute Accuracy |
| :--- | :--- | :--- | :--- | :--- |
| **Video + SRT Telemetry** | WGS 84 / Local UTM | Meters (m) | $\pm 2\% - 5\%$ of measured distance | $\pm 1.5 - 3.0$ m (GNSS bound) |
| **Video Only (No Telemetry)** | Arbitrary Local | Model Units | Proportional (uncalibrated) | None (unregistered) |

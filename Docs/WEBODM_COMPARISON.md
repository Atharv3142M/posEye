# posEye vs. WebODM: Production Architecture & Capability Benchmark

## Executive Summary

**posEye** is a specialized, fully offline Windows desktop application engineered for single-pass drone video photogrammetry. While **WebODM** serves as an enterprise web-based photogrammetry platform for aerial image datasets, posEye bridges the critical workflow gap between raw drone flight videos and 3D geospatial reconstruction without requiring manual intermediate video processing, cloud services, or complex multi-container server administration.

---

## 1. Architectural Comparison Matrix

| Capability | WebODM (OpenDroneMap) | posEye |
| :--- | :--- | :--- |
| **Primary Input** | Image sets (JPEG/TIFF) captured with intervalometer | Drone video (`.mp4`, `.mov`) + Subtitle telemetry (`.SRT`) |
| **Video Preprocessing** | Manual external extraction or custom scripts required | Automated 11-stage pipeline (FFmpeg extraction, Laplacian blur filter, dHash deduplication) |
| **Telemetry & Georeferencing** | Relies on camera EXIF or GCP (Ground Control Points) text files | Automated SRT timestamp parsing and EXIF GPS metadata injection into video frames |
| **Reconstruction Core** | OpenDroneMap (OpenSfM + OpenMVS) | Headless NodeODM container (identical OpenSfM + OpenMVS photogrammetry core) |
| **Deployment Model** | Web client + Python/Django backend + NodeODM + PostgreSQL + Redis | Single packaged Windows Desktop App (Electron + React) + bundled standalone binaries |
| **Runtime Dependencies** | Docker Desktop, Python 3, Git, Node.js, Compose stack | Bundled static `ffmpeg.exe`, standalone `orchestrator.exe`, automated NodeODM container lifecycle |
| **User Interface** | Web browser dashboard (Leaflet / Cesium / Potree) | Native desktop UI with dark theme, real-time 11-stage progress HUD, Three.js 3D viewport |
| **3D Visualization** | Potree (Point Cloud) and Cesium (3D Tiles) | Hardware-accelerated Three.js GLB viewer (OrbitControls, studio lighting, wireframe, camera reset) |
| **Measurement & Inspection**| 2D/3D distance, area, volume (requires DEM/DTM) | Point-to-point Euclidean measurement with strict geospatial disclosure (metric vs model units) |
| **Export Formats** | GeoTIFF, LAZ/LAS, OBJ, GeoPackage, Shapefile, PDF | Optimized GLB (`model.glb`), Point Cloud (`model.laz`), Orthophoto (`orthophoto.tif`), `all.zip` |
| **Offline Privacy** | Local or self-hosted network server | 100% local host isolation (`localhost:8765`, `localhost:3000`); zero telemetry or cloud transit |

---

## 2. In-Depth Technical Analysis

### 2.1 Installation, Deployment & Hardware Virtualization
- **WebODM:** Typically deployed via Docker Compose with 4+ containers (`webodm_webapp`, `webodm_db`, `webodm_broker`, `nodeodm`). Requires command-line proficiency (`./webodm.sh start`) and separate management of Docker Desktop on Windows.
- **posEye:** Distributed as a unified Windows installer (`posEye Setup.exe`). Automatically includes static FFmpeg (101MB) and compiled FastAPI backend (`orchestrator.exe`), removing Python and Node.js prerequisites. Features resilient virtualization detection (differentiating bare CPU MSR flags from Hyper-V root partitions) to guide users without false negatives.

### 2.2 Video Ingestion & Telemetry Processing
- **WebODM:** Expects geotagged still photos. If a user only has drone video footage, they must manually extract frames, manage disk space, and interpolate drone SRT/CSV flight logs using external photogrammetry utilities.
- **posEye:** Automates the complete pre-reconstruction lifecycle:
  1. Validates container, codec, resolution, and duration via bundled FFmpeg.
  2. Extracts frames at configurable sampling rates (default: 3.0 fps).
  3. Computes Laplacian variance blur scores, discarding blurry turns and gimbal adjustments.
  4. Computes 64-bit difference hashes (`dHash`), pruning redundant stationary frames.
  5. Parses video subtitle streams (`.SRT`), correlates timestamps, and writes EXIF GPS tags (`GPSLatitude`, `GPSLongitude`, `GPSAltitude`) directly into frame headers.

### 2.3 Reconstruction Pipeline & NodeODM Integration
- Both systems utilize the OpenDroneMap engine for Structure from Motion (OpenSfM) and Multi-View Stereo (OpenMVS).
- **posEye** integrates with NodeODM via the official multi-stage lifecycle:
  - `POST /task/new/init` to allocate a job uuid.
  - `POST /task/new/upload/{uuid}` to stream image batches with field name `"images"`.
  - `POST /task/new/commit/{uuid}` with tuned photogrammetry presets (`fast`, `balanced`, `high`, `ultra`).
  - Incremental polling of OpenDroneMap console logs via `GET /task/{uuid}/output?line={line}` streamed directly to the desktop progress HUD.

### 2.4 Geospatial Honesty & Measurement Integrity
- **Metric Disclosure:** When drone telemetry (`.SRT` or camera GPS) is present, NodeODM scales the point cloud against real-world coordinates, and posEye reports distances in calibrated meters.
- **Unreferenced Models:** When telemetry is absent, OpenSfM produces an unscaled reconstruction. Rather than presenting misleading meter units, posEye transparently tags measurements as **"model units"** with a visible user disclaimer.

---

## 3. Workflow Comparison: Single-Pass Video to Model

```
WebODM Workflow:
Drone Video ➔ [Manual ffmpeg script] ➔ [Manual Geotagging Tool] ➔ WebODM Web UI ➔ Upload Folder ➔ ODM Processing ➔ Potree/Download

posEye Workflow:
Drone Video + SRT ➔ [Drag & Drop into posEye] ➔ One-Click Start ➔ Fully Automated 11-Stage Pipeline ➔ Interactive 3D Viewer & Exports
```

---

## 4. Conclusion

posEye does not replace WebODM for massive multi-thousand-image mapping surveys or multi-tenant cloud enterprise setups. Instead, it provides a specialized, hardened, zero-dependency desktop client that makes drone video photogrammetry instantly accessible, fully automated, and verifiable on Windows.


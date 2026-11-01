# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Ground Control Points (GCP) text import for millimeter-level survey georeferencing.
- Volumetric analysis and elevation profile plotting backed by Digital Elevation Models (DEM/DTM).
- GPU-accelerated video decoding integration (NVDEC / QuickSync).

---

## [0.1.2] - 2026-11-01

### Added
- **Zip-Slip & Decompression Bomb Protection:** Hardened zip extraction with canonical path validation (`path.resolve().relative_to(dest_dir.resolve())`) and limits (50,000 files, 10 GB uncompressed size).
- **Startup Crash Recovery:** Automatically reconciles non-terminal jobs on startup, marking ready models as completed and incomplete runs as `interrupted` with a ready-to-retry state.
- **True WebGL Screenshot Capture:** Configured WebGLRenderer with `preserveDrawingBuffer: true` to prevent blank/black canvas exports.
- **Full Viewport Memory Disposal:** Hierarchically disposes geometries, materials, and textures on scene unmount to prevent GPU memory leaks.
- **WebODM Asset Inventory:** Exposed Digital Surface Models (`dsm.tif`), Digital Terrain Models (`dtm.tif`), and quality reports (`report.pdf`) with dedicated download endpoints and UI badges.
- **Orchestrator Rebranding:** First-class compilation to `posEye.Orchestrator.exe` with API identity verification on startup.

### Fixed
- **FFmpeg Health Status Bug:** Added explicit `"ok": True/False` in `system.py` to prevent false "Offline" display in UI sidebar.
- **Georeference Status Semantics:** Separated metadata presence (`geotagged > 0`) from photogrammetric georeferencing (`is_georeferenced`), with explicit consumer GNSS accuracy disclaimers.
- **SRT Time Tolerance & Out-of-Bounds Rejection:** Enforced 1.5s maximum telemetry time delta in `sample_at()` and validated latitude/longitude bounds.
- **Safe Job Deletion:** Returns HTTP 409 Conflict when attempting to delete an active running job.
- **Terminal State Guard:** Prevented late worker events from overwriting terminal states (`ready`, `error`, `cancelled`, `interrupted`).
- **WebSocket Resource Leak:** Added explicit `JobStore.unsubscribe()` in WebSocket endpoint disconnect handling.

---

## [0.1.1] - 2026-10-31

### Added
- **Unified Service Health Contract:** Standardized structured service state reporting across Docker, NodeODM, FFmpeg, and GPU in /health and /system/status.
- **Honest System Status UI:** Sidebar and Settings render explicit status badges (Running, Connected, Stopped, Offline, Missing, Checking) with contextual colored indicators and troubleshooting recovery tooltips.
- **Photogrammetry Stage Tracking:** Added parse_odm_phase() to recognize OpenSfM alignment, feature matching, OpenMVS densification, meshing, texturing, and orthophoto generation from NodeODM logs.
- **Elapsed Duration Clock & Diagnostic Log:** Real-time elapsed timer (MM:SS) in processing view with expandable diagnostic console.
- **Extreme Coordinate Centering:** Three.js scene normalization centering large geospatial/UTM coordinates to prevent depth-buffer jitter and clipping while preserving true coordinates in the HUD.
- **Interactive Measurement UX:** Dedicated measuring mode with crosshair cursor, surface hover preview ring, visual point markers, connecting line, distance calculation, clear controls, and Esc shortcut.
- **Draggable Viewer Sidebar:** Resizable left panel with draggable divider (220px–550px) and collapse/expand toolbar toggle.
- **Hardware Telemetry Fallback:** Non-NVIDIA GPU detection via Windows CIM/WMI without fabricating 0% utilization.

### Fixed
- **Timezone Offset Bug:** Replaced naive string slicing (.slice(11, 19)) with formatLocalTime(), eliminating the 5h30m time offset in Indian Standard Time (IST) and aligning with local system clock.
- **Console Message Duplication:** Deduplicated NodeODM heartbeat polling messages and suppressed consecutive identical stage/progress events in the job store.
- **Model Info Stuck on Loading:** Added explicit viewer state machine (idle, loading, ready, error, no_model) with direct BufferGeometry vertex and triangle calculation.
- **Camera Reset:** Unified resetCamera() via imperative ref handle, connecting both the toolbar button and R keyboard shortcut to fit camera to model bounding box.
- **Layer Visibility:** Synchronized mesh visibility toggle with Three.js rendering and replaced dummy layer checkboxes with honest status labels.

---

## [0.1.0] - 2026-10-29

### Added
- **Automated 11-Stage Pipeline:** Single-pass workflow from drone video and SRT telemetry to textured 3D glTF/GLB models.
- **Frame Preprocessing:** Bundled static FFmpeg frame sampling, Laplacian variance sharpness scoring, and 64-bit difference hashing (`dHash`) deduplication.
- **Telemetry Georeferencing:** Subtitle stream parser supporting DJI parenthesized, CSV, and key-value formats, with WGS84 EXIF GPS tag injection (`GPSLatitude`, `GPSLongitude`, `GPSAltitude`).
- **Interactive 3D Viewer:** WebGL Three.js viewport with OrbitControls, directional studio lighting, DoubleSide material rendering, camera reset (`R`), and two-click point-to-point Euclidean measurement.
- **Real-Time Progress HUD & Terminal:** Live 11-stage progress timeline with WebSocket event broadcasting and incremental OpenDroneMap console log streaming (`/task/{uuid}/output`).

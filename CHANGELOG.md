# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Ground Control Points (GCP) text import to enable improved georeferencing and accuracy validation.
- Volumetric analysis and elevation profile plotting backed by Digital Elevation Models (DEM/DTM).
- GPU-accelerated video decoding integration (NVDEC / QuickSync).

---

## [0.1.4] - 2026-11-03

### Added
- **Synchronous Preload Context Hydration with Sender Validation:** Added synchronous `envSync()` preload bridge method with strict sender validation (`isTrustedSender`), eliminating race conditions and ensuring API tokens and port configurations are immediately and safely available on the initial render frame without token exposure.
- **Strict Cross-Origin Security:** Configured FastAPI `CORSMiddleware` with an explicit origin allowlist restricted to desktop Electron origins (`null`, `file://`, `127.0.0.1:5173`, `localhost:5173`), preventing unrelated browser origins from accessing local loopback endpoints.
- **Explicit Asset MIME Types:** FastAPI now explicitly serves `model/gltf-binary` for `.glb`, `image/tiff` for `.tif`, and `application/octet-stream` for `.laz` downloads with cross-origin headers.
- **Multi-Path NVIDIA SMI Probing:** Enhanced GPU hardware discovery in `system.py` probing standard Windows system paths (`C:\Windows\System32\nvidia-smi.exe`, `C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe`) and exposing granular hardware, driver, and container capability flags.
- **Asynchronous Background Engine Provisioning:** Electron window launches immediately (< 300ms) while Docker Desktop startup and container status polling run in a non-blocking background task streaming `app-status` events.
- **Photogrammetry EXIF Timestamp Ingestion:** Injected `DateTimeOriginal`, `DateTime`, `DateTimeDigitized`, `GPSDateStamp`, `GPSTimeStamp`, and standard EXIF `GPSVersionID = (2, 3, 0, 0)` into extracted frames derived strictly from telemetry SRT logs or video container `creation_time` metadata without date fabrication.
- **Dark CAD Monochrome Design System:** Applied a clean, high-contrast engineering visual palette across all views, eliminating visual distractions and aligning with technical GIS/CAD tooling.
- **Multi-Resolution Windows Application Icon:** Embedded 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, and 256x256 pixel layers into `posEye.ico`.

### Fixed
- **Packaged Electron 3D Viewer Asset Loading:** Configured explicit CORS origin allowlist on orchestrator endpoints to allow packaged Electron windows operating under `file://` or `null` origins to stream large 3D glTF models without silent fetch failures while blocking external web origins.
- **Electron WebContents Navigation on Download:** Programmatically intercepted deliverable export clicks via `window.electronAPI.downloadFile()` and attached `will-download`, `will-navigate`, and `setWindowOpenHandler` listeners to prevent window replacement.
- **OpenDroneMap 1970 Timestamp Anomaly:** Fixed OpenSfM and ODM quality reports defaulting flight timestamps to `01/01/1970 00:00:00` by ensuring all extracted frames possess valid EXIF dates and times derived from trustworthy source metadata.
- **Startup Frozen Window Delay:** Eliminated the 90–120s modal blocking freeze during Docker auto-start.

---

## [0.1.3] - 2026-11-01

### Added
- **Formal State Transition Graph:** Thread-safe state transition table with permanently immutable terminal states (`ready`, `cancelled`, `error`, `interrupted`) and monotonic progress enforcement.
- **Worker Registry & Cancellation Tracking:** Thread-safe worker process tracking with graceful termination, cancellation callbacks, and race-free job deletion safety (`HTTP 409 Conflict`).
- **Managed Subprocess Lifecycle:** Replaced blocking subprocess calls in extraction with managed `subprocess.Popen`, graceful shutdown timeout (2s), force-kill fallback, and cancellation file cleanup.
- **GLB Model Deep Validation:** Binary glTF header verification, JSON chunk structure check, non-empty vertex buffers, finite bounding boxes, and missing texture detection before transitioning to ready.
- **Strict Zip-Slip & Archive Security:** Path normalization rejection for directory traversal, drive letters, UNC paths, symlinks, encrypted archives, and zip bombs.
- **Local API Authentication:** Secured orchestrator with session-scoped `DT_API_TOKEN` across HTTP and WebSocket channels and removed wildcard CORS.
- **Windows Version Resource Embedding:** Standalone `posEye.Orchestrator.exe` compiled with embedded Windows version resource metadata (`0.1.3.0`, product name `posEye`).
- **Regression Test Coverage:** Expanded automated test suite from 26 to 43 passing unit and integration tests.

### Fixed
- **Desktop CI TypeScript Failure:** Resolved stale `georef` identifier in `Viewer.tsx`, restoring clean TypeScript compilation and automated desktop packaging in CI.
- **SRT Relative Altitude Promotion:** Removed dangerous fallback promoting relative flight altitude to absolute EXIF `GPSAltitude`. Added regex word boundary anchors (`\b`) to eliminate spurious pattern matching.
- **EXIF Altitude Reference Flag:** Configured `GPSAltitudeRef` to correctly encode 0 for above sea level and 1 for below sea level, leaving altitude unset when semantics are relative or unknown.
- **SRT Telemetry Bounds & Matching:** Enforced 1.5s maximum telemetry time delta tolerance and rejection of out-of-bounds geographic coordinates.
- **Duplicate Binary Bloat:** Removed redundant duplicate `orchestrator.exe` from desktop package resources, reducing installer payload size from ~273 MB to ~192 MB.
- **External Docker Container Preservation:** Electron quit lifecycle cleanly stops local orchestrator without killing external Docker daemon containers.
- **npm Dependency Hardening:** Resolved all critical npm vulnerabilities via explicit overrides for `tar` and `builder-util-runtime`.

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

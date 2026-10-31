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
- **Timezone Offset Bug:** Replaced naive string slicing (.slice(11, 19)) with ormatLocalTime(), eliminating the 5h30m time offset in Indian Standard Time (IST) and aligning with local system clock.
- **Console Message Duplication:** Deduplicated NodeODM heartbeat polling messages and suppressed consecutive identical stage/progress events in the job store.
- **Model Info Stuck on Loading:** Added explicit viewer state machine (idle, loading, 
eady, error, 
o_model) with direct BufferGeometry vertex and triangle calculation.
- **Camera Reset:** Unified 
esetCamera() via imperative ref handle, connecting both the toolbar button and R keyboard shortcut to fit camera to model bounding box.
- **Layer Visibility:** Synchronized mesh visibility toggle with Three.js rendering and replaced dummy layer checkboxes with honest status labels.

---

## [0.1.0] - 2026-10-29

### Added
- **Automated 11-Stage Pipeline:** Single-pass workflow from drone video and SRT telemetry to textured 3D glTF/GLB models.
- **Frame Preprocessing:** Bundled static FFmpeg frame sampling, Laplacian variance sharpness scoring, and 64-bit difference hashing (`dHash`) deduplication.
- **Telemetry Georeferencing:** Subtitle stream parser supporting DJI parenthesized, CSV, and key-value formats, with WGS84 EXIF GPS tag injection (`GPSLatitude`, `GPSLongitude`, `GPSAltitude`).
- **Interactive 3D Viewer:** WebGL Three.js viewport with OrbitControls, directional studio lighting, DoubleSide material rendering, camera reset (`R`), and two-click point-to-point Euclidean measurement.
- **Real-Time Progress HUD & Terminal:** Live 11-stage progress timeline with WebSocket event broadcasting and incremental OpenDroneMap console log streaming (`/task/{uuid}/output`).
- **Windows Release Packaging:** Automated NSIS installer generation (`posEye Setup 0.1.0.exe`) and portable standalone directory (`release\win-unpacked\posEye.exe`) incorporating bundled 64-bit static `ffmpeg.exe` (101 MB) and compiled `orchestrator.exe` (82 MB).
- **Multi-Resolution Windows Icon:** Embedded 16x16 to 256x256 `.ico` icon for desktop shortcuts, installer headers, and application taskbar.
- **Dark Mode Support:** WebODM-inspired dark theme stylesheet with persistent user theme toggle.
- **Continuous Integration:** GitHub Actions Windows CI pipeline covering Pytest (19 tests), TypeScript typechecking, Vite bundling, and Electron packaging.

### Fixed
- **NodeODM Task Submission Bug:** Replaced non-standard `zip` multipart parameter with the official multi-stage NodeODM REST protocol (`/task/new/init` $\rightarrow$ `/task/new/upload/{uuid}` with form field `"images"` $\rightarrow$ `/task/new/commit/{uuid}`), fixing `MulterError: Unexpected field`.
- **Hyper-V / WSL2 Virtualization False Negative:** Fixed virtualization detection check by querying `Win32_ComputerSystem.HypervisorPresent` and running Docker status, eliminating false BIOS warning dialogues on Windows 11.
- **Dynamic Image MIME Types:** Added dynamic MIME detection (`image/jpeg`, `image/png`, `image/tiff`) for uploaded imagery.
- **Orphaned Task Cleanup:** Implemented automated cancellation cleanup on NodeODM if chunk upload or commit fails midway.
- **Offline NodeODM Safety Check:** Packaged application now validates local Docker presence and checks for `nodeodm.tar` before starting container, preventing unhandled online download attempts on offline hosts.
- **npm Lockfile Synchronization:** Reconciled `package-lock.json` with `package.json` to include `electron-builder-squirrel-windows` and Windows native build dependencies for reproducible `npm ci`.

### Security
- Loopback-only binding (`127.0.0.1`) for Orchestrator API (:8765) and NodeODM container (:3000).
- Zero external cloud transmission; all imagery, telemetry, and 3D assets remain on the local machine.


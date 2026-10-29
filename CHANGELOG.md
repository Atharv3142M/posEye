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

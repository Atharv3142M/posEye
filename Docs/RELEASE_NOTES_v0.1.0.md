# posEye v0.1.0 — Initial Windows Pre-release

**Release Date:** October 29, 2026  
**Release Tag:** `v0.1.0`  
**Target Platform:** Windows 10 / 11 (64-bit, x64)  
**Distribution Artifact:** `posEye Setup 0.1.0.exe`  
**Release Status:** **Pre-release / Developer Preview**

---

## 1. Overview

**posEye** ("Single-Pass Drone Video to Accurate 3D Model Generation System") is an offline-first Windows desktop photogrammetry application designed to convert raw drone flight videos and telemetry into georeferenced, interactive 3D models.

posEye automates the workflow between raw drone footage and photogrammetry:
1. Ingests drone video files (`.mp4`, `.mov`) and optional flight telemetry (`.SRT`).
2. Probes metadata (codec, resolution, duration, framerate) using bundled static FFmpeg.
3. Automatically samples frames, filters out blurry frames via Laplacian variance scoring, and deduplicates near-identical frames using 64-bit difference hashing (`dHash`).
4. Extracts GPS telemetry coordinates from timestamped subtitle tracks and injects EXIF GPS metadata into frame headers.
5. Transmits prepared imagery to a local headless NodeODM container via an official multi-stage REST lifecycle (`init` $\rightarrow$ `upload` $\rightarrow$ `commit`).
6. Converts reconstructed OBJ meshes to compact glTF binary (`model.glb`) for web and desktop visualization.
7. Renders the textured model in an interactive Three.js 3D viewport with OrbitControls, directional studio lighting, camera reset (`R`), and two-click point-to-point measurement.

---

## 2. Key Features in v0.1.0

- **Automated 11-Stage Pipeline:** Single-click transition from raw video to textured 3D mesh.
- **Stage-Aware Live Progress HUD:** Real-time timeline visualizing video validation, extraction, sharpness scoring, deduplication, geotagging, ODM reconstruction, mesh conversion, and asset packaging.
- **Real-Time Log Streaming:** Incremental polling of OpenDroneMap console output (`/task/{uuid}/output`) streamed directly to the desktop UI terminal over WebSockets.
- **Bundled Offline Binaries:** Includes static 64-bit `ffmpeg.exe` (101 MB) and standalone FastAPI `orchestrator.exe` (82 MB) directly inside the installer payload.
- **Multi-Resolution Windows Icon:** High-fidelity icon assets (`posEye.ico`, 16x16 to 256x256) embedded in the installer, desktop shortcut, and application window.
- **Dark Mode Support:** WebODM-inspired dark interface with persistent theme toggle.
- **Resilient Hyper-V / WSL2 Virtualization Detection:** Checks running Docker status and evaluates `Win32_ComputerSystem.HypervisorPresent` to eliminate false-negative BIOS virtualization warnings on Windows 11.
- **Geospatial Integrity & Disclosures:** Honest metric measurement: models generated without GPS telemetry transparently report distances in "model units" with an explicit disclaimer.

---

## 3. System Requirements & Prerequisites

| Requirement | Specification |
| :--- | :--- |
| **Operating System** | Windows 10 (Build 19041+) or Windows 11 (64-bit x64) |
| **Processor** | Intel Core i5/i7/i9 or AMD Ryzen with hardware virtualization (VT-x / AMD-V enabled in BIOS/UEFI) |
| **Memory (RAM)** | 16 GB minimum (32 GB recommended for photogrammetry reconstruction) |
| **Storage** | 10 GB free SSD disk space for video extraction, cache, and model output |
| **Docker Desktop** | Docker Desktop with WSL2 backend installed and running |
| **NodeODM Image** | `opendronemap/nodeodm` Docker image loaded locally (`docker pull opendronemap/nodeodm`) |

> **Note on Offline NodeODM:** The installer bundles static FFmpeg and the backend Orchestrator API. The multi-GB NodeODM photogrammetry engine runs via Docker. Ensure Docker Desktop is started before initiating 3D reconstruction.

---

## 4. Installation & First-Launch Guide

1. **Download the Installer:**
   Download `posEye Setup 0.1.0.exe` and verify its SHA-256 checksum against `RELEASE_CHECKSUMS_v0.1.0.txt`:
   ```powershell
   Get-FileHash -Algorithm SHA256 "posEye Setup 0.1.0.exe"
   # Verify output matches: 93F1039E324A1F97E2F7F0D3A563983FC408BF4FBE83BFB7392FA39249B1AB7B
   ```
2. **Run Installer:**
   Double-click `posEye Setup 0.1.0.exe` and follow the setup wizard. You may choose to create a desktop shortcut.
3. **Launch posEye:**
   Open posEye from the Start Menu or Desktop. The application starts the embedded Python Orchestrator API automatically on `http://127.0.0.1:8765`.
4. **Verify Health:**
   Navigate to the **Settings** page in the left sidebar. Ensure:
   - FFmpeg: `Detected` (bundled)
   - Docker: `Running`
   - NodeODM: `Connected` (on `http://127.0.0.1:3000`)

---

## 5. Usage: Creating Your First 3D Reconstruction

1. Click **New Project** in the sidebar.
2. Enter a project name (e.g. `Survey_Flight_01`).
3. Select your drone video file (`.mp4` or `.mov`) via file browser or drag-and-drop.
4. If your drone recorded an `.SRT` subtitle file containing GPS coordinates (standard on DJI and Autel drones), select it in the **Telemetry (SRT)** field.
5. Select a quality preset:
   - `fast`: Quick preview with downsampled imagery (OpenSfM fast matching).
   - `balanced` (default): Optimal balance of detail and processing time.
   - `high`: Dense multi-view stereo point cloud and full-resolution texturing.
6. Click **Start Processing**.
7. Monitor the 11-stage progress timeline and live OpenDroneMap console output.
8. Upon completion, interact with the model in the 3D Viewer (Left-click to orbit, right-click to pan, scroll to zoom, press `R` to reset camera).
9. Export outputs (`model.glb`, `model.laz`, `orthophoto.tif`, or `all.zip`) via the **Export** menu.

---

## 6. Privacy & Local Execution

posEye enforces 100% host isolation:
- All video processing, frame extraction, and photogrammetry occur strictly on `localhost`.
- Zero images, telemetry, or analytics are uploaded to external cloud servers.
- No network connection is required once Docker Desktop and NodeODM are installed.

---

## 7. Known Limitations & Verification Gates (Pre-release Disclosures)

Because v0.1.0 is an initial pre-release:
- **Clean-Machine VM Gate Pending:** While unit tests, backend builds, and packaging have passed in CI, testing on a virgin Windows VM without developer tools remains in progress.
- **Full Flight Ground-Truthing Pending:** Scale and accuracy are dependent on drone GPS telemetry. Survey-grade millimeter accuracy requires Ground Control Points (GCPs), which are planned for future versions.
- **YOLOv8 Masking:** Moving-object masking requires the optional `ultralytics` package. If not installed, posEye gracefully falls back to unmasked frame extraction.
- **Area & Volume Tools:** Point-to-point 3D Euclidean distance measurement is supported; volumetric analysis from DEM/DTM rasters is scheduled for v0.2.0.

---

## 8. Third-Party Licenses & Attributions

posEye incorporates or interfaces with the following open-source software:
- **OpenDroneMap / NodeODM:** Distributed under the GNU General Public License v3.0 (GPLv3).
- **FFmpeg:** Compiled static binary licensed under GNU GPL/LGPL. Source code and build scripts available at [ffmpeg.org](https://ffmpeg.org).
- **Electron:** Licensed under the MIT License. Copyright (c) OpenJS Foundation.
- **Three.js:** Licensed under the MIT License. Copyright (c) 2010-2026 Three.js authors.
- **FastAPI / Uvicorn:** Licensed under the MIT License and BSD-3-Clause.

---

## 9. Verification & Evidence

- **Repository:** [https://github.com/Atharv3142M/posEye](https://github.com/Atharv3142M/posEye)
- **CI Workflow Evidence:** [Run #40839428342](https://github.com/Atharv3142M/posEye/actions/runs/40839428342) (100% passed on Windows runner)
- **Pytest Suite:** 19/19 tests passing (`apps/pipeline` and `apps/orchestrator`)

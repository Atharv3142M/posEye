# posEye v0.1.2 — Architecture Hardening, Geospatial Integrity & Process Safety

**Release Date:** November 1, 2026  
**Release Tag:** `v0.1.2`  
**Target Platform:** Windows 10 / 11 (64-bit, x64)  
**Distribution Artifact:** `posEye.Setup.0.1.2.exe`  
**Release Status:** **Pre-release / Release Candidate**

---

## 1. Executive Summary

**posEye v0.1.2** is a release candidate focusing on architectural stability, geospatial data integrity, photogrammetry pipeline security, job lifecycle safety, and process resilience. It addresses 23 specific findings across the pipeline, orchestrator, and desktop layers, introducing safe zip extraction (Zip-Slip protection), terminal state locking, HTTP 409 conflict safeguards on active deletion, crash/restart job recovery, true WebGL screenshots via drawing buffer preservation, and first-class rebranding to `posEye.Orchestrator.exe`.

---

## 2. Key Improvements & Fixes in v0.1.2

### 2.1 Service Health & Status Reporting
- **FFmpeg Status Contract:** Fixed `_ffmpeg()` in `system.py` to include `"ok": True/False`, eliminating the false "Offline" / "Missing" indicator in the desktop sidebar when FFmpeg was present.
- **CUDA Container Passthrough Accuracy:** Refined GPU diagnostics to verify `nvidia-container-cli` and `nvcc` before asserting container CUDA readiness, preventing false assumptions about GPU passthrough on host machines lacking NVIDIA Container Toolkit.

### 2.2 Geospatial Integrity & Coordinate System Transparency
- **Georeference Distinction:** Separated raw EXIF metadata presence (`geotagged > 0`) from genuine photogrammetric georeferencing (`is_georeferenced`), distinguishing between estimated metric models (consumer GNSS ±2–5m horizontal variance, without GCPs) and uncalibrated / relative coordinate spaces.
- **SRT Timestamp Tolerance:** Added `max_offset_s = 1.5` parameter to `sample_at()`. Video frames outside the flight telemetry window are no longer erroneously mapped to distant GPS coordinates.
- **Coordinate Boundary Validation:** Added strict range checks for latitude ($[-90.0, 90.0]$) and longitude ($[-180.0, 180.0]$) to reject corrupted telemetry records.
- **Altitude Semantics:** Differentiated between absolute altitude AMSL and relative altitude in SRT parsing, writing absolute altitude to EXIF GPSAltitude with `GPSAltitudeRef = 0`.

### 2.3 Safe Extraction & Pipeline Security
- **Safe Zip Extraction:** Replaced raw `zipfile.extractall()` with `safe_extract_zip()` enforcing strict path traversal guards (`path.resolve().relative_to(...)`) and limits on file count (50,000 files) and uncompressed size (10 GB) to mitigate Zip-Slip and decompression bombs.
- **GLB Geometry Validation:** Validated that converted GLB models contain non-empty geometry and non-zero byte size before transitioning to the `ready` state.

### 2.4 Job Lifecycle & Process Resilience
- **Terminal State Guard:** Ensured terminal states (`ready`, `error`, `cancelled`, `interrupted`) are immutable and cannot be overwritten by late asynchronous background events.
- **Safe Deletion (HTTP 409):** `DELETE /jobs/{job_id}` now checks job status and returns `HTTP 409 Conflict` if the job is actively processing, preventing concurrent file deletion while workers are executing.
- **Startup Recovery:** Upon orchestrator startup, non-terminal jobs found on disk are reconciled: jobs with existing models are marked `ready`, while abandoned incomplete runs are transitioned to `interrupted` with a clear retry option.
- **WebSocket Unsubscription:** Fixed `JobStore.unsubscribe()` invoked in WebSocket endpoint `finally:` blocks to prevent leaking subscription queues on client disconnects.
- **Responsive Cancellation:** Passed cancellation check hooks into `extract_frames` to allow prompt termination during frame extraction.

### 2.5 3D Viewport & WebGL Enhancements
- **True WebGL Screenshot Capture:** Configured WebGLRenderer with `preserveDrawingBuffer: true`, allowing `canvas.toDataURL()` to capture actual 3D viewport imagery without producing blank black canvases.
- **GPU Resource Management:** Added complete hierarchical disposal of geometries, materials, and textures when scenes change or unmount, preventing GPU memory leaks.
- **Stale Async Load Rejection:** Implemented request identification tokens on async `GLTFLoader` callbacks so rapid model switches cannot lead to race conditions.

### 2.6 Rebranding & WebODM Feature Parity
- **Orchestrator Executable Rebranding:** Compiled standalone PyInstaller binary as `posEye.Orchestrator.exe` with backwards-compatible fallback to `orchestrator.exe`.
- **API Identity Verification:** Electron main process verifies `orchestratorVersion` from `/health` before treating the backend as ready.
- **Output Asset Inventory:** Added direct endpoints and UI download buttons for Digital Surface Models (`dsm.tif`), Digital Terrain Models (`dtm.tif`), and quality reports (`report.pdf`).
- **Synchronized Presets:** Updated New Project preset descriptions to reflect exact NodeODM parameters (`feature-quality`, `octree-depth`, `resize-to`, `dsm`, `dtm`).

---

## 3. Verification & Build Evidence

- **Python Test Suite:** 26/26 passed in 7.31s (`pytest apps/pipeline apps/orchestrator -v`)
- **TypeScript Typecheck & Build:** Clean Vite production build in 1.83s
- **Standalone Orchestrator:** Compiled `third_party/posEye.Orchestrator.exe` (82,354,302 bytes)
- **Static FFmpeg:** Bundled `third_party/ffmpeg.exe` (101,457,920 bytes) verified
- **NSIS Installer:** Built `posEye.Setup.0.1.2.exe` (273,740,678 bytes)

---

## 4. Verification Checksum

| File | SHA-256 Digest | Size (Bytes) |
|---|---|---|
| `posEye.Setup.0.1.2.exe` | `B5D41677D994D49A05720B7264BF568515EC53A12EE61DFDE7E583031671BB80` | 273,740,678 |

Verify your downloaded installer via PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 ".\posEye.Setup.0.1.2.exe"
# Expected hash: B5D41677D994D49A05720B7264BF568515EC53A12EE61DFDE7E583031671BB80
```

---

## 5. System Requirements & Prerequisites

| Component | Requirement |
|---|---|
| **Operating System** | Windows 10 (Build 19041+) or Windows 11 (64-bit x64) |
| **Processor** | Intel Core i5/i7/i9 or AMD Ryzen (hardware virtualization enabled) |
| **Memory (RAM)** | 16 GB minimum (32 GB recommended for photogrammetry) |
| **Storage** | 10 GB free SSD disk space |
| **Docker Desktop** | Docker Desktop with WSL2 backend installed and running |
| **NodeODM Image** | `opendronemap/nodeodm` loaded locally (`docker pull opendronemap/nodeodm`) |

---

## 6. Known Limitations & Unverified Behaviors

1. **Standalone GPS Limitations:** Standard consumer drone flight video subtitles have ~2–5m GPS inaccuracy and variable barometric altitude drift. Measurements without Ground Control Points (GCPs) provide metric approximations, not certified surveyor tolerances.
2. **Docker Container Dependency:** While static FFmpeg and `posEye.Orchestrator.exe` are bundled inside the application installer, Docker Desktop and the `opendronemap/nodeodm` container image are managed externally and require local container execution.
3. **Unsigned Executable:** The installer and binaries are not signed with a commercial EV certificate; Windows SmartScreen may present an unknown publisher warning upon first launch.

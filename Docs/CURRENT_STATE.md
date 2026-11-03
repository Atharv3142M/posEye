# posEye — Current State

**Date:** 2026-11-03  
**Product version:** 0.1.4  
**Product name:** posEye  
**Source of truth:** [MVP_Spec.md](MVP_Spec.md)

---

## v0.1.4 Engineering Stabilization, Viewer Repair & CAD Redesign (Verified 2026-11-03)

1. **3D Viewer Asset Streaming & Cross-Origin Isolation:**
   - **Packaged Electron Origin Fix & Strict CORS:** Resolved an issue where packaged Electron windows running under `file://` or `null` origins encountered CORS failures when fetching `model.glb` via Three.js `GLTFLoader`. Configured FastAPI with an explicit allowlist restricted to desktop Electron origins (`null`, `file://`, `127.0.0.1:5173`, `localhost:5173`) while rejecting external web origins.
   - **Synchronous Context Hydration & IPC Sender Validation:** Added synchronous preload bridge method `envSync()` with strict sender frame validation (`isTrustedSender`), ensuring the API port and session token (`DT_API_TOKEN`) are instantly and safely available on the initial render frame without token exposure to untrusted frames.
   - **Explicit Content-Type Streaming:** Configured FastAPI to stream `.glb` as `model/gltf-binary`, `.tif` as `image/tiff`, and `.laz` as `application/octet-stream`.

2. **Navigation-Safe Asset Downloads:**
   - Replaced raw browser navigation with programmatic Electron downloads via `window.electronAPI.downloadFile()`.
   - Attached Electron `will-download`, `will-navigate`, and `setWindowOpenHandler` listeners in `apps/desktop/electron/main.cjs` to prevent window content replacement when clicking large asset exports.

3. **NVIDIA SMI Discovery & Granular Hardware Telemetry:**
   - **Multi-Path Probing:** Enhanced `apps/orchestrator/src/orchestrator/system.py` to search standard Windows installation directories (`C:\Windows\System32\nvidia-smi.exe`, `C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe`) in addition to system `PATH`.
   - **Granular Diagnostic Contract:** Exposes granular states for `gpuHardware`, `nvidiaDriver`, `nvidiaSmi`, `dockerGpuAccess`, `engineGpuCapability`, and `gpuProcessingActive`.
   - **Truthful Status Reporting:** Eliminates simulated GPU utilization and fake metrics, reporting exact driver versions, memory, and temperature only when physically queried.

4. **Instant Application Startup (< 300ms) & Asynchronous Engine Provisioning:**
   - Replaced blocking preflight engine checks in the Electron main process with instant window presentation (< 300ms).
   - Docker Desktop initialization and container health polling run as an asynchronous background worker, streaming real-time status updates (`app-status`) to the Dashboard without frozen splash screens.
   - Pinned the photogrammetry processing container to `opendronemap/nodeodm:3.6.2`.

5. **Photogrammetry EXIF Timestamp Ingestion & Metadata Truthfulness:**
   - Injected standard temporal EXIF tags into extracted video frames derived strictly from telemetry SRT timestamps or container `creation_time`: `DateTimeOriginal`, `DateTime`, `DateTimeDigitized`, `GPSDateStamp`, `GPSTimeStamp`, and standard EXIF `GPSVersionID = (2, 3, 0, 0)`.
   - Never fabricates capture dates when source metadata is missing.
   - Resolves the OpenSfM/ODM quality report defect where output reports displayed timestamps falling back to `01/01/1970 00:00:00`.

6. **Dark CAD Monochrome Design System & Multi-Resolution Windows ICO:**
   - Comprehensive UI restyle across all pages (Dashboard, Projects, New Project, Processing, Viewer, Settings, Logs) adhering to a professional monochrome CAD palette.
   - Replaced rainbow visual badges with high-contrast technical indicators and clean typography.
   - Generated a multi-resolution Windows application icon (`posEye.ico`) embedding 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, and 256x256 pixel layers, eliminating taskbar icon distortion.

7. **Test Suite & Build Verification:**
   - **Python Tests:** 47/47 passed cleanly in ~11s (`pytest apps/pipeline apps/orchestrator -v`).
   - **TypeScript Verification:** 0 type errors (`npx tsc --noEmit`).
   - **Frontend Bundle:** Production build succeeded in 1.84s (`npm run build`).
   - **Installer Distribution:** Packaged `posEye.Setup.0.1.4.exe` (192,247,632 bytes, SHA-256: `9B0BA01B12B09545DF0F19EFC48C2816F25B3F78472F086D50CED2677F4BF3C5`).

---

## v0.1.3 Engineering & Security Hardening (Verified 2026-11-01)

1. **State Machine & Terminal State Immutability:**
   - Formal state transition model (`VALID_TRANSITIONS`) with permanent immutability for terminal states (`ready`, `cancelled`, `error`, `interrupted`).
   - Thread-safe worker tracking with `cancellation_requested` stage.
   - Deletion blocked (`HTTP 409 Conflict`) for active and cancelling jobs.
   - Monotonic progress enforcement preventing percentage regression.

2. **Managed Subprocess Lifecycle & Cancellation:**
   - Replaced blocking subprocess calls with managed `subprocess.Popen` in frame extraction and shell invocations.
   - Graceful shutdown timeout (2s) with force-kill fallback.
   - Partial file cleanup on cancellation; returns specialized `ExtractCanceledError`.

3. **Geospatial & Telemetry Accuracy:**
   - Word boundary anchors (`\b`) on all SRT telemetry regex patterns.
   - Eliminated fallback promoting relative flight altitude to absolute EXIF altitude.
   - EXIF `GPSAltitudeRef` accurately indicates sea level reference (0 = above, 1 = below).
   - Reject telemetry coordinates exceeding physical boundaries ($[-90, 90]$ latitude, $[-180, 180]$ longitude) or exceeding 1.5s time gap tolerance.

4. **Model Validation & Archive Security:**
   - Deep GLB verification (`validate_glb`) checking binary magic headers, JSON chunk validity, non-empty vertex buffers, and finite bounding boxes.
   - Hardened `safe_extract_zip()` rejecting directory traversal, absolute paths, drive letters, UNC paths, symlinks, encrypted archives, and zip bombs.

5. **Local API Security & Electron Hardening:**
   - Orchestrator protected with dynamic session bearer token (`DT_API_TOKEN`) on REST and WebSockets.
   - Electron stops orchestrator on quit without killing user Docker daemon containers.

6. **Payload Optimization & Branded Binaries:**
   - Removed duplicate 82MB `orchestrator.exe` from desktop package resources.
   - Standalone `posEye.Orchestrator.exe` compiled with Windows version metadata (`0.1.3.0`).

---

## Production Bug Fixes & UX Overhaul (Verified in v0.1.1 / v0.1.2)

1. **System Health & Service State Contract:**
   - Unified `/health`, `/system/status`, and frontend `useHealth()` hook with structured service states (`running`, `stopped`, `connected`, `unreachable`, `unavailable`, `detected`, `missing`).
   - Honest status rows displaying verified text badges with colored indicators and actionable recovery tooltips.

2. **Local Timezone Synchronization (5h30m Offset Fix):**
   - Eliminated naive UTC string slicing (`.slice(11, 19)`).
   - Centralized `formatLocalTime(isoStr)` and `formatLocalDateTime(isoStr)` in `api.ts`, rendering timestamps correctly in the user's local operating system timezone (e.g. IST).

3. **NodeODM Progress Tracking & Event De-duplication:**
   - Implemented `parse_odm_phase()` to extract human-readable photogrammetry phases from ODM console output (OpenSfM camera alignment, feature extraction, dense point cloud via OpenMVS, 3D surface meshing, texture mapping, orthophoto generation).
   - Suppressed redundant `reconstructing Reconstructing` heartbeat messages across polling cycles and orchestrator job persistence.
   - Enhanced `Processing.tsx` with live elapsed timer (`MM:SS`), prominent stage status, and an expandable technical diagnostic console.

4. **3D Viewer Pipeline & Camera Framing Repair:**
   - Fixed silent unhandled rejection on GLB load errors by attaching `onLoadStart`, `onLoadSuccess`, and `onLoadError` lifecycle callbacks.
   - Geometry centering: model geometry is offset to origin `(0, 0, 0)` using bounding box calculations, preventing floating-point depth buffer jitter and coordinate clipping on georeferenced UTM models.
   - Coordinates HUD converts local hit points to true georeferenced coordinates using the stored model offset.
   - Model info panel displays a robust state machine (`loading`, `ready`, `error`, `no_model`) with accurate vertex and triangle counts derived directly from `BufferGeometry` attributes.

5. **Interactive Distance Measurement Tool:**
   - Dedicated measuring mode with crosshair cursor and hover preview marker on 3D surfaces.
   - Click-to-pick point placement for Point A and Point B with visual spheres and connection lines.
   - Distance calculation with georeference disclosure: displays meters (`m (approx.)`) if GPS EXIF is present, or `model units (relative scale)` if uncalibrated.
   - "Clear Measurements" button and `Esc` keyboard shortcut.

6. **Shared Camera Reset:**
   - Camera reset shared between "Reset Camera (R)" button and `R`/`r` keyboard shortcut via `ThreeViewerHandle` ref.
   - Accurately fits camera to the loaded model bounding box and configures near/far planes.

7. **Resizable & Collapsible Viewer Sidebar:**
   - Flexible left panel with draggable resizer divider (`min: 220px`, `max: 550px`, `default: 300px`).
   - Toolbar toggle button to collapse (`◀ Hide Panel`) and expand (`☰ Show Panel`) the sidebar.
   - Independent vertical scrolling preventing content clipping.

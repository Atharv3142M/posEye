# posEye — Current State

**Date:** 2026-11-01  
**Product version:** 0.1.3  
**Product name:** posEye  
**Source of truth:** [MVP_Spec.md](MVP_Spec.md)

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
   - Removed wildcard CORS headers.
   - Electron stops orchestrator on quit without killing user Docker daemon containers.

6. **Payload Optimization & Branded Binaries:**
   - Removed duplicate 82MB `orchestrator.exe` from desktop package resources.
   - Standalone `posEye.Orchestrator.exe` compiled with Windows version metadata (`0.1.3.0`).
   - Built verified NSIS installer `posEye.Setup.0.1.3.exe` (192,072,051 bytes).

## Production Bug Fixes & UX Overhaul (Verified in v0.1.1 / v0.1.2)

1. **System Health & Service State Contract:**
   - Unified `/health`, `/system/status`, and frontend `useHealth()` hook with structured service states (`running`, `stopped`, `connected`, `unreachable`, `unavailable`, `detected`, `missing`).
   - Honest sidebar status rows showing real text badges (`Running`, `Connected`, `Stopped`, `Offline`, `Missing`, `Checking`) with colored dots (`.ok`, `.warn`, `.err`, `.checking`) and actionable recovery tooltips.

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

8. **Windows GPU & Display Adapter Detection:**
   - Reliable detection using fast `nvidia-smi` probe with Windows CIM/WMI fallback (`Get-CimInstance Win32_VideoController`).
   - Accurately displays GPU display adapter name (e.g. Intel UHD Graphics, AMD Radeon, NVIDIA) without fabricating 0% utilization.
   - Transparently clarifies that NodeODM executes in CPU mode unless a CUDA container is explicitly deployed.

## Test & Build Verification

- **Python Tests:** 43 passed cleanly in 16.14s (`pytest apps/pipeline apps/orchestrator -v`).
- **TypeScript:** 0 errors (`npx tsc --noEmit`).
- **Production Bundle:** Vite build succeeded (`npm run build`).
- **NSIS Installer:** `posEye.Setup.0.1.3.exe` built successfully.

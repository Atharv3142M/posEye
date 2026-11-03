# posEye — Current State

**Date:** 2026-11-03  
**Product version:** 0.1.4  
**Product name:** posEye  
**Source of truth:** [MVP_Spec.md](MVP_Spec.md)

---

## v0.1.4 Engineering Stabilization, Viewer Repair, IPC Security & CAD Redesign (Verified 2026-11-03)

1. **3D Viewer Asset Streaming & Secure Application Protocol:**
   - **Custom Application Scheme (`poseye://app`):** Registered `poseye` as a privileged Electron scheme (`standard`, `secure`, `allowServiceWorkers`, `supportFetchAPI`, `corsEnabled`), serving frontend assets from `dist/` with canonical path resolution and SPA fallback. Packaged renderer origin is strictly `poseye://app`, eliminating opaque `null` or raw `file://` contexts.
   - **Strict CORS Isolation:** Configured FastAPI `CORSMiddleware` with an explicit allowlist restricted strictly to desktop application origins (`poseye://app`) and local development ports (`http://127.0.0.1:5173`, `http://localhost:5173`). Preflight and requests from external web origins, `null`, or unknown origins are rejected with `400 Bad Request` and denied.
   - **Elimination of Endpoint Wildcards & Query-String Tokens:** Removed endpoint-level wildcard headers from `/jobs/{job_id}/assets/{asset}`. Query-string tokens (`?token=...`) are rejected on HTTP asset routes; tokens must be transmitted securely via `Authorization: Bearer <token>` or `X-Api-Token` headers.
   - **Three.js GLTFLoader Headers:** `ThreeViewer.tsx` configures `loader.setRequestHeader({ Authorization: `Bearer ${token}` })` so mesh chunks and textures are retrieved with authenticated headers without exposing credentials in URLs.
   - **Native Streaming Asset Export:** Implemented `asset:save` IPC handler in Electron main to display a native Windows Save As dialog and stream backend assets directly to disk via `Readable.fromWeb()`, avoiding renderer memory exhaustion and query-string exposure.

2. **IPC Sender Validation & Filesystem Path Confinement:**
   - **Sender Verification:** `validateSender()` validates that invocations match the primary `mainWindow.webContents.id`, come strictly from the top-level `mainWindow.webContents.mainFrame` (rejecting child frames/iframes), and verify origin matches `poseye://app` (packaged) or `127.0.0.1:5173` / `localhost:5173` (dev).
   - **Filesystem Access Confinement:** `read:file` IPC handler enforces `isPathAllowed()`. Arbitrary system file paths are rejected; only files explicitly selected by the user via native open/save dialogs (`allowedFilePaths`) or files within the managed `jobsDir` are permitted. Path traversal escaping the jobs directory is rejected.
   - **Automated Desktop Tests:** Added `apps/desktop/tests/ipc_security.test.cjs` covering sender validation in packaged and dev modes, iframe rejection, path traversal rejection, and allowed path verification (`npm test` in CI).

3. **NVIDIA SMI Discovery & Granular Hardware Telemetry:**
   - **Multi-Path Probing:** Enhanced `apps/orchestrator/src/orchestrator/system.py` to search standard Windows installation directories (`C:\Windows\System32\nvidia-smi.exe`, `C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe`) in addition to system `PATH`.
   - **Granular Diagnostic Contract:** Exposes granular states for `gpuHardware`, `nvidiaDriver`, `nvidiaSmi`, `dockerGpuAccess`, `engineGpuCapability`, and `gpuProcessingActive`.
   - **Truthful Status Reporting:** Eliminates simulated GPU utilization and fake metrics, reporting exact driver versions, memory, and temperature only when physically queried.

4. **Instant Startup (< 300ms) & Robust Docker / NodeODM Provisioning:**
   - Window created immediately upon `app.whenReady()` in < 300ms.
   - **Auto-Pull Provisioning:** When `opendronemap/nodeodm:3.6.2` is not present locally and offline tar is unavailable, `ensureNodeOdm()` automatically executes `docker pull opendronemap/nodeodm:3.6.2`, streaming progress to the Dashboard via `app-status` without crashing.
   - **Container Reuse:** Inspects `poseye-nodeodm`; if running and responsive on port 3000 (`/info`), reuses it without recreation. If stopped, attempts `docker start` before recreating.
   - **Race Protection:** Guards concurrent calls with `nodeOdmProvisionPromise`.
   - **Verified Readiness:** Verifies `/info` returns valid JSON before declaring the engine ready.

5. **Photogrammetry EXIF Timestamp Ingestion & Metadata Truthfulness:**
   - Injected standard temporal EXIF tags into extracted video frames derived strictly from telemetry SRT timestamps or container `creation_time`: `DateTimeOriginal`, `DateTime`, `DateTimeDigitized`, `GPSDateStamp`, `GPSTimeStamp`, and standard EXIF `GPSVersionID = (2, 3, 0, 0)`.
   - Never fabricates capture dates when source metadata is missing.
   - Resolves the OpenSfM/ODM quality report defect where output reports displayed timestamps falling back to `01/01/1970 00:00:00`.

6. **Dark CAD Monochrome Design System & Multi-Resolution Windows ICO:**
   - Comprehensive UI restyle across all pages adhering to a professional monochrome CAD palette.
   - Replaced rainbow visual badges with high-contrast technical indicators and clean typography.
   - Generated a multi-resolution Windows application icon (`posEye.ico`) embedding 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, and 256x256 pixel layers, eliminating taskbar icon distortion.

7. **CI Dynamic Versioning & Verification:**
   - `.github/workflows/ci.yml` dynamically resolves version from `apps/desktop/package.json` (`posEye.Setup.$version.exe`).
   - Generates and uploads `build-manifest.json` with SHA-256 and size.
   - **Python Tests:** 48/48 passed cleanly (`pytest apps/pipeline apps/orchestrator -v`).
   - **Desktop Unit Tests:** 3/3 passed cleanly (`npm test`).
   - **TypeScript Verification:** 0 type errors (`npx tsc --noEmit`).
   - **Frontend Bundle:** Production build succeeded (`npm run build`).
   - **Installer Distribution:** Canonical CI build `posEye.Setup.0.1.4.exe` (191,488,690 bytes, SHA-256: `09D92C3FA73E010A145B5D67F0E5D974DEDF81F81436492D13830BFA7F85354B`; CI artifact zip: 191,502,200 bytes).

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

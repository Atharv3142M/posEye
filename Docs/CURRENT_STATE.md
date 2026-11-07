# posEye — Current State

**Date:** 2026-11-07  
**Product version:** 0.1.6  
**Product name:** posEye  
**Source of truth:** [MVP_Spec.md](MVP_Spec.md)

---

## v0.1.6 Engineering Recovery, Stabilization & Clean-Machine Hardening

1. **Authentication Lifecycle & Clean-Machine Authorization (P0):**
   - **Preload Synchronous Hydration:** Replaced fragile early IPC `env:sync` calls with synchronous injection of `--poseye-api-token`, `--poseye-api-base`, and `--poseye-version` via `webPreferences.additionalArguments`. Evaluated at bundle evaluation time on tick 0, eliminating token propagation race conditions and initial-load 401 Unauthorized errors.
   - **Process-Verified Port Reclaiming:** Before spawning orchestrator on port 8765, checks if the port is occupied. Only processes verified as genuine stale posEye orchestrators (`posEye.Orchestrator.exe` or `orchestrator.main`) can be terminated via PowerShell/taskkill. Foreign external processes are never killed.
   - **Clean Subprocess Tree Teardown:** `app.on("before-quit")` terminates the orchestrator child process tree via `taskkill /F /T /PID` to prevent background zombie processes on Windows.
   - **Confined Loopback Network Authorization Interceptor:** `session.defaultSession.webRequest.onBeforeSendHeaders` attaches `Authorization: Bearer <token>` strictly to loopback requests (`http://127.0.0.1:8765`, `http://localhost:8765`) on authorized API paths (`/jobs`, `/system`, `/health`, `/docs`, `/openapi.json`), preventing credential leakage on external URLs or redirects.
   - **Standardized WebSocket Subprotocol Authentication:** WebSocket connections authenticate via documented subprotocol `['poseye-auth.<token>']`, eliminating duplicate in-band token handshakes and query-string secrets (`?token=...`).

2. **3D Viewer Repair & Diagnostics (P0):**
   - **Hardware & WebGL Capability Detection:** Wrapped `new WebGLRenderer` in defensive capability checks with explicit user diagnostic messages when hardware acceleration is unavailable.
   - **Memory Leak Prevention:** Added `OrbitControls.dispose()`, texture disposal, and geometry cleanup on unmount.
   - **Robust Asset Loading:** Configured `GLTFLoader` with explicit Bearer token headers and diagnostic status messages for HTTP 401, network disconnection, or corrupted GLB structures.
   - **ResizeObserver Dimension Handling:** Handled initial zero-dimension layout states gracefully, preventing aspect ratio and camera near/far clipping issues.

3. **Geospatial Accuracy Engine & Provenance Integrity (P0):**
   - **Rejection of Incomplete Residual Records:** Strict parsing in `apps/orchestrator/src/orchestrator/accuracy.py` rejects point records lacking complete $(dx, dy, dz)$ measurements, never substituting zero for missing data.
   - **Finite Number Validation:** Enforces that residual coordinate values are finite numbers ($\text{NaN}$ and $\pm\infty$ rejected).
   - **Control vs. Checkpoint Role Distinction:** Only points explicitly identified as checkpoints (`is_checkpoint: true` or `role: checkpoint`) are evaluated for checkpoint accuracy. Ambiguous or unknown roles are rejected rather than defaulted to control.
   - **Preserved Parse Diagnostics:** Parser errors and malformed records are preserved and exposed in the accuracy dictionary and diagnostics rather than silently swallowed.
   - **Missing Checkpoint Differentiation:** The report clearly distinguishes missing checkpoint validation (`checkpointValidation: "none_provided"`) from zero checkpoint error.
   - **Strict RMS Equation Enforcement:** Guarantees $\text{RMS}_{3D} = \sqrt{\text{RMS}_X^2 + \text{RMS}_Y^2 + \text{RMS}_Z^2}$ and $\text{RMS}_{XY} = \sqrt{\text{RMS}_X^2 + \text{RMS}_Y^2}$ for all matching point samples.
   - **Timestamp Provenance Tracking:** Removed ambiguous `utc_datetime` field. Tracks full provenance (`video_creation_time`, `srt_telemetry_time`, `capture_start`, `capture_end`, and `report_generation_time`). Never fabricates capture dates when telemetry metadata is missing.
   - **Telemetry Pre-flight Protection:** Extracted frames before telemetry start (pre-flight video footage) are rejected as out-of-coverage rather than given fabricated coordinates or times.

4. **NVIDIA GPU Detection & Image Compatibility Contract (Phase 5):**
   - **Exact Pinned GPU Image Contract:** Strict image identification requiring exact match with `opendronemap/nodeodm:3.6.2-gpu` (or its repository digest), rejecting arbitrary substrings containing `"gpu"`.
   - **Container CUDA Runtime Execution Check:** Docker container CUDA capability requires successful execution of `nvidia-smi -L` inside the container.
   - **State Separation:** Discrete separation of `gpuHardwareDetected`, `gpuAvailable`, `gpuCapability`, `containerCudaCapable`, and `gpuProcessingActive`. Active processing is set only when confirmed during reconstruction.
   - **Graceful CPU Fallback:** Seamlessly falls back to CPU execution when NVIDIA drivers or Container Toolkit are absent.

5. **First-Launch Diagnostics Screen (Phase 6):**
   - Implemented `GET /system/diagnostics` and `DiagnosticsModal.tsx` displaying full environment readiness and hardware status.
   - Provides an exportable diagnostic report (`.json`) with whitelisted posEye environment variables (`DT_`, `NODEODM_`, `FFMPEG_`, `POSEYE_`) and all secrets strictly sanitized as `[REDACTED]`.

6. **WebODM-Inspired Viewer Architecture & Export Panels (Phase 8):**
   - Designed 3-viewer domain separation in `Docs/VIEWER_ARCHITECTURE_v0.1.6.md`: Three.js for 3D meshes, Potree for dense LAZ point clouds, and OpenLayers for GeoTIFF orthophotos and GIS maps.
   - Dedicated export panels for Point Clouds and Orthophotos with explicit disclaimers that interactive Potree/OpenLayers rendering is unavailable in this version, while keeping the stable Three.js mesh viewer operational.

---

## v0.1.5 Pre-Release Repair (2026-11-04)

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
   - **Python Tests:** 49/49 passed cleanly (`pytest apps/pipeline apps/orchestrator -v`).
   - **Desktop Unit Tests:** 7/7 passed cleanly (`npm test`).
   - **TypeScript Verification:** 0 type errors (`npx tsc --noEmit`).
   - **Frontend Bundle:** Production build succeeded (`npm run build`).
   - **Installer Distribution:** Canonical CI build `posEye.Setup.0.1.4.exe` (191,484,838 bytes, SHA-256: `749EA9F03D8CF004315879708F59F77B2E2E9BA9250AAC0D6783A4D72FFB357D`; CI artifact zip: 191,498,467 bytes, SHA-256: acdc71d2a0f427ec1a02752825fd087b5134604a1e46fe53c3e4a64bf3fbf37c; run 41663729032, artifact ID 13244801129).

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

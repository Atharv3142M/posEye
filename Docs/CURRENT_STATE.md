# posEye — Current State

**Date:** 2026-11-15  
**Product version:** 0.1.9  
**Product name:** posEye  
**Source of truth:** [MVP_Spec.md](MVP_Spec.md)

---

## v0.1.9 Engineering Enhancements & Production Hardening (2026-11-12)

1. **3D Viewer Infinite Reload Loop Elimination (P0):**
   - **React State Stabilization:** Identified and resolved a critical state synchronization loop in `ThreeViewer.tsx`. Previous builds suffered from unstable hook dependency references that triggered infinite component re-renders, continuously re-instantiating the WebGL renderer, re-fetching the binary GLB, and allocating GPU textures repeatedly.
   - **Model Content Hash Tracking (`lastLoadedHashRef`):** Implemented stable content hash verification. If a model for the current job has already been parsed and mounted to the scene graph, subsequent layout adjustments, resize events, or tab switches do not trigger asset re-fetches.
   - **Stable Geometry Memoization:** Isolated scene mounting logic from parent component re-renders, guaranteeing single-pass execution upon navigation to the Viewer.

2. **Photogrammetric Coordinate Transformation & Ground Alignment (P0):**
   - **Z-up to Y-up Transformation (`utils/coords.ts`):** OpenDroneMap outputs textured meshes oriented in a geographic Z-up coordinate system (where $+Z$ represents altitude/elevation). Standard Three.js uses Y-up world coordinates.
   - **Automated Ground Plane Leveling:** Implemented a spatial transformation matrix in `utils/coords.ts` rotating the root mesh group ($X \rightarrow X, Y \rightarrow Z, Z \rightarrow -Y$). This levels the terrain ground plane horizontally on the $X\text{–}Z$ grid with elevation corresponding directly to the vertical $+Y$ axis.
   - **Origin Centering with Retained Offsets:** Computes the model's exact axis-aligned bounding box (`Box3`), translates the geometry to the origin $(0, 0, 0)$ to prevent 32-bit floating-point camera jitter, and retains the geographic offset vector for accurate coordinate readouts and metric measurements.

3. **Hardware-Aware NodeODM Execution Planning (`nodeodm_plan.cjs`):**
   - **Dynamic Resource Sizing:** Evaluates host topology (CPU physical core count, available memory, swap file size, and NVIDIA GPU capability) before dispatching reconstruction tasks to Docker.
   - **Safe Concurrency & Memory Boundaries:**
     - Bounds CPU worker threads: `max-concurrency = Math.max(1, Math.min(cpuCores - 1, 8))`.
     - Dynamically calculates container memory limits based on available physical RAM and swap, preventing WSL2 Out-of-Memory (OOM) kills during dense Poisson meshing.
     - Automatically activates `--feature-extract-gpu: "true"` when an NVIDIA GPU and container CUDA runtime are confirmed.

4. **High-Resolution Windows Application Icons & Desktop Branding:**
   - **Embedded Multi-Resolution Icons:** Generated and embedded a multi-resolution Windows icon (`posEye.ico`, containing 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, and 256x256 layers) directly into the compiled Electron executable, NSIS uninstaller, and Start Menu/Desktop shortcuts.
   - **Windows Taskbar Grouping:** Configured explicit `AppUserModelId` (`org.icarus.poseye`) before application ready, ensuring consistent taskbar icon grouping and branding across all operating states.

5. **Expanded Test Suite:**
   - Added `apps/desktop/tests/nodeodm_plan.test.cjs` (210 lines) covering resource bounding algorithms.
   - Expanded `apps/desktop/tests/viewer_lifecycle.test.cjs` (382 lines) covering state transitions and canvas mounting.
   - Added `apps/orchestrator/tests/test_system_gpu.py` (63 lines) validating GPU hardware detection.
   - Test totals: 83 Python unit & integration tests, 35 Desktop Electron tests passing.

---

## v0.1.8.1 CI Stabilization & Draco Validation (2026-11-11)

1. **Source Encoding Regression Gate (`test_source_encoding.py`):**
   - Implemented automated CI regression checks ensuring all Python and configuration sources in the repository remain clean UTF-8 without NUL bytes or UTF-16 BOMs.
2. **Draco GLB Integration Verification (`draco_decoder.test.cjs`):**
   - Integrated real-world Draco-compressed binary glTF fixture (`box_draco.glb`) to validate runtime decoding pipelines.
3. **Version Synchronization & Path Normalization:**
   - Synchronized version declarations across Electron `package.json`, Orchestrator API (`ORCHESTRATOR_VERSION = "0.1.9"`), PyInstaller specification, and NSIS installer definitions.
   - Corrected path separator handling in asset resolver routines to prevent backslash/forward-slash mismatch regressions under Windows environments.

---

## v0.1.8 Offline Draco Decoder & UI Performance (2026-11-10)

1. **Offline Draco Decoder Path Resolution (`resolveDracoDecoderPath`):**
   - Replaced fragile hardcoded `'draco/'` loader paths with `resolveDracoDecoderPath()`. Under nested Electron routes (e.g. `/viewer/:jobId`), decoders now resolve directly to the canonical application root `poseye://app/dist/draco/`.
2. **Static-Asset SPA Guard for Custom Protocol (`poseye://app`):**
   - Protocol interceptor strictly intercepts requests ending in `.wasm`, `.js`, `.css`, `.png`, `.jpg`, and `.glb`. If an asset does not exist on disk, it returns HTTP 404 rather than falling back to `index.html`, eliminating silent WebAssembly parse errors.
3. **Draco Nested-Route Path Remapping:**
   - Injected canonical path normalization into `resolveAppAssetPath()`. Any sub-path containing `draco/` is automatically normalized and remapped to canonical `dist/draco/`.
4. **45-Second Viewer Timeout Guard:**
   - Added a 45-second watchdog timer in `ThreeViewer.tsx`. If asset retrieval, Draco decompression, or GPU buffer allocation stalls, the viewer gracefully transitions to `failed` and presents a diagnostic error card with a retry button.
5. **Deferred Shader Compilation via `requestAnimationFrame`:**
   - Deferred `renderer.compile()` to `requestAnimationFrame()`, yielding the main thread before shader compilation and eliminating UI thread lockup on large meshes.
6. **Explicit `framing` Phase:**
   - Added a dedicated `framing` phase to the viewer loading state machine: `initializing` -> `fetching` -> `parsing` -> `uploading` -> `framing` -> `rendering` -> `loaded` (or `failed`).
7. **Sanitized Crash Dump Facility (`writeCrashDump`):**
   - Implemented automated crash logging to `%APPDATA%/posEye/logs/` with Bearer tokens and sensitive query parameters automatically scrubbed.

---

## v0.1.7 Viewer Recovery, GPU Acceleration & Performance (2026-11-07)

1. **3D Viewer Mesh Loading Recovery:**
   - Bundled official Draco WebAssembly decoders (`draco_decoder.wasm`, `draco_decoder.js` in `dist/draco/`) for Three.js `DRACOLoader`.
   - Multi-stage loading state machine with percentage download progress.
2. **High-Performance Demand-Driven Rendering:**
   - Replaced continuous 60–120 FPS animation loop with demand-driven rendering (`requestRender()` via `requestAnimationFrame`).
   - Cached mesh references (`cachedMeshesRef`) and throttled raycasting, eliminating recursive scene traversal and resolving pointer lag on large models (>350,000 triangles).
   - Handled WebGL context loss and restoration (`webglcontextlost`, `webglcontextrestored`).
3. **Processing Duration Metrics:**
   - Monotonic duration tracking (`startedAt`, `completedAt`, `failedAt`, `cancelledAt`, `durationSeconds`) persisted to `job.json`.
   - Live elapsed timer during active pipeline processing without fabricating ETA.
4. **posEye Brand Identity Preservation:**
   - Standardized `BrandLogo` component with inline SVG fallback across all views.
5. **GPU Reconstruction & NodeODM SIFT Integration:**
   - Propagated `feature-extract-gpu: "true"` when container CUDA capability is confirmed; in-flight log detection of GPU SIFT extraction (`gpu_sift_detected`).
6. **Granular Timestamp Provenance:**
   - Enforces distinct provenance for capture time, telemetry coverage, extracted frame timestamps, and report generation time.

---

## v0.1.6 Clean-Machine Authorization & Hardening (2026-11-07)

1. **Authentication Lifecycle & Clean-Machine Authorization:**
   - Preload synchronous hydration of `--poseye-api-token`, `--poseye-api-base`, and `--poseye-version` via `webPreferences.additionalArguments`.
   - Process-verified port reclaiming on port 8765, terminating only genuine stale posEye processes.
   - Clean child subprocess tree teardown on application quit (`taskkill /F /T /PID`).
   - Confined loopback network authorization interceptor attaching Bearer token strictly to loopback requests on authorized API paths.
   - Standardized WebSocket subprotocol authentication (`['poseye-auth.<token>']`).
2. **Geospatial Accuracy Engine:**
   - Rejection of incomplete residual records lacking complete $(dx, dy, dz)$ measurements.
   - Finite number validation (rejecting NaN and ±∞).
   - Distinct evaluation of control points vs checkpoints.
   - Strict RMS equation enforcement ($\text{RMS}_{3D} = \sqrt{\text{RMS}_X^2 + \text{RMS}_Y^2 + \text{RMS}_Z^2}$).
3. **NVIDIA GPU Detection & Image Compatibility Contract:**
   - Exact pinned GPU image contract (`opendronemap/nodeodm:3.6.2-gpu`).
   - Container CUDA execution verification (`nvidia-smi -L` inside container).
   - Graceful CPU fallback when NVIDIA drivers or Container Toolkit are absent.
4. **First-Launch Diagnostics Screen:**
   - `GET /system/diagnostics` and `DiagnosticsModal.tsx` displaying environment readiness with secret sanitization.

---

## v0.1.5 Pre-Release Repair (2026-11-04)

1. **3D Viewer Asset Streaming & Privileged Protocol:**
   - Custom application scheme `poseye://app` serving frontend assets with canonical path resolution.
   - Strict CORS isolation rejecting non-application origins.
   - Elimination of query-string tokens on asset endpoints.
   - Native streaming asset export via `asset:save` IPC handler.
2. **IPC Sender Validation & Filesystem Path Confinement:**
   - `validateSender()` validates invocations against `mainWindow.webContents.id` and top-level frame.
   - `isPathAllowed()` confines filesystem access to user-selected files and managed `jobsDir`.
3. **NVIDIA SMI Multi-Path Discovery:**
   - Multi-path probing searching `PATH`, `System32`, and `NVIDIA Corporation\NVSMI`.
4. **Fast Startup (< 300ms) & Container Lifecycle:**
   - Automated image pull provisioning with progress streaming.
   - Container reuse avoiding redundant recreation.
5. **Photogrammetry EXIF Timestamp Ingestion:**
   - Injected standard temporal EXIF tags (`DateTimeOriginal`, `GPSDateStamp`, `GPSTimeStamp`).
6. **Dark CAD Monochrome Design System & Multi-Resolution Windows ICO.**

---

## v0.1.3 Engineering & Security Hardening (2026-11-01)

1. **State Machine & Terminal State Immutability:**
   - Formal transition model (`VALID_TRANSITIONS`) with permanent immutability for terminal states (`ready`, `cancelled`, `error`, `interrupted`).
   - Thread-safe worker tracking with `cancellation_requested` stage.
   - Monotonic progress enforcement preventing percentage regression.
2. **Managed Subprocess Lifecycle & Cancellation:**
   - Managed `subprocess.Popen` in frame extraction with graceful timeout and force-kill fallback.
3. **Geospatial & Telemetry Accuracy:**
   - Telemetry coordinate validation ($[-90, 90]$ latitude, $[-180, 180]$ longitude).
   - Relative altitude non-promotion to absolute altitude.
4. **Model Validation & Archive Security:**
   - Deep GLB verification (`validate_glb`) checking binary magic headers, vertex buffers, and bounding boxes.
   - Hardened `safe_extract_zip()` rejecting directory traversal, absolute paths, and zip bombs.

---

## v0.1.1 / v0.1.2 Production Bug Fixes & UX Overhaul

1. **System Health & Service State Contract:**
   - Structured service states (`running`, `stopped`, `connected`, `unreachable`, `unavailable`, `detected`, `missing`).
2. **Local Timezone Synchronization:**
   - Centralized `formatLocalTime(isoStr)` and `formatLocalDateTime(isoStr)` in `api.ts`.
3. **NodeODM Progress Tracking & Event De-duplication:**
   - `parse_odm_phase()` extracting human-readable photogrammetry phases from ODM logs.
   - Suppressed redundant heartbeat messages across polling cycles.
4. **3D Viewer Pipeline & Camera Framing:**
   - Geometry centering offsetting model to origin $(0, 0, 0)$ to eliminate floating-point depth buffer jitter.
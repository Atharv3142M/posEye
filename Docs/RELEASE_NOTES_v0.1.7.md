# posEye v0.1.7 Release Notes — Viewer Recovery, GPU Acceleration & Performance (Pre-release)

**posEye v0.1.7** is an engineering pre-release addressing critical 3D viewer recovery, Draco mesh decompression, demand-driven render performance, processing duration metrics, brand identity preservation, and GPU SIFT reconstruction integration.

> **PRE-RELEASE NOTICE:** This release is explicitly marked as a pre-release candidate for validation and diagnostics. It has not been signed with an Authenticode certificate and contains known operational limits described below.

---

## Key Fixes & Enhancements in v0.1.7

### 1. 3D Viewer Mesh Loading Recovery (P0)
- **Draco Compression Decoding:** Bundled official Draco WebAssembly and JavaScript decoders (`draco_decoder.wasm`, `draco_decoder.js`) directly in the packaged application assets (`dist/draco/`). Initialized Three.js `DRACOLoader` with `setDecoderPath("draco/")`. Resolves the unhandled runtime exception that permanently locked Draco-compressed models at `"Loading 3D mesh…"`.
- **Multi-Stage Loading State Machine:** Replaced the binary loading state with an explicit lifecycle: `initializing` → `fetching` (with percentage download progress) → `parsing` (Draco decompression) → `uploading` (GPU buffer upload) → `rendering` (initial frame draw) → `loaded` / `failed`.
- **Actionable Error Feedback:** Displays diagnostic error messages and a responsive Retry button if mesh parsing or retrieval encounters a fault.

### 2. High-Performance Demand-Driven Rendering (P0)
- **Eliminated Continuous Animation Loop:** Replaced continuous 60–120 FPS `setAnimationLoop` polling with demand-driven rendering (`requestRender()` via `requestAnimationFrame`). Frames are rendered only upon camera motion, damping ticks, model loading, viewport resizing, or tool interactions, dropping idle CPU/GPU consumption to near zero.
- **Mesh Traversal Caching:** Implemented `cachedMeshesRef` to eliminate repeated, expensive full-scene tree traversals (`root.traverse`) on every mouse movement.
- **Throttled Raycasting:** Pointer intersection tests are throttled to animation frames with non-recursive mesh picking (`intersectObjects(cachedMeshesRef.current, false)`), completely resolving pointer lag on complex aerial photogrammetry models (>350,000 triangles).
- **WebGL Context-Loss Recovery:** Handled `webglcontextlost` and `webglcontextrestored` events to prevent unrecoverable blank viewports.

### 3. Processing Duration Tracking
- **Schema & Job Store Timestamps:** Extended Job model and `job.json` persistence to record `startedAt`, `completedAt`, `failedAt`, `cancelledAt`, and `durationSeconds` (derived from monotonic clock measurements).
- **UI Duration Display:** Displays elapsed duration in the Projects table, Project detail, Recent Projects dashboard, and 3D Viewer sidebar (`formatDuration`).
- **Live Elapsed Tracking:** Shows live elapsed execution timers for active jobs on the Processing screen without fabricating ETA.

### 4. posEye Brand Identity Preservation
- **Reusable `BrandLogo` Component:** Standardized high-resolution vector/bitmap logo and wordmark display across Dashboard, Projects, Viewer, and Settings.
- **Fallback Resilience:** Implemented graceful SVG inline fallback if packaged image assets fail to load.

### 5. GPU Reconstruction & NodeODM SIFT Integration
- **Explicit GPU Flag Propagation:** OpenDroneMap / NodeODM does not enable GPU SIFT feature extraction automatically merely by running within a GPU container. Added `use_gpu` flag propagation to `preset_options()`, transmitting `feature-extract-gpu: "true"` when container CUDA capability is confirmed.
- **SIFT Log Output Detection:** In-flight detection of `"using gpu for extracting sift features"` in NodeODM task output logs, accurately updating `gpuSiftUsed: true` and active GPU processing confirmation.

### 6. Point Cloud & Orthophoto Domain Clarification
- **Honest Export Labeling:** Point Cloud and Orthophoto tabs are explicitly labeled "Point Cloud — Export" and "Orthophoto — Export".
- **Eliminated Memory Bloat:** Prevented loading dense point-cloud geometry as monolithic JSON arrays into browser memory; users are provided direct one-click exports for ASPRS LAZ 1.4 point clouds and GeoTIFF orthomosaics for external GIS analysis (Potree, CloudCompare, QGIS).

### 7. Capture & Report Metadata Integrity
- **Granular Timestamp Provenance:** Enforces distinct provenance for `video_recording_start`, `telemetry_coverage_start`, `telemetry_coverage_end`, `first_extracted_frame_time`, `last_extracted_frame_time`, `video_creation_time`, `flight_duration_s`, `reconstruction_duration_s`, and `report_generation_time`.
- **Pre-flight Telemetry Alignment:** Preserves true frame EXIF timestamps extracted from DJI SRT cues without synthetic date fabrication.

---

## Automated Validation Summary

- **Python Tests:** 73 passed, 0 failed, 1 warning (deprecation).
- **Desktop Security & Contract Tests:** 17 passed, 0 failed.
- **TypeScript Typecheck:** Clean (0 errors).
- **Frontend Production Build:** Successful (Vite 5.4.21).
- **Standalone Orchestrator Executable:** Successfully built `third_party/posEye.Orchestrator.exe` via PyInstaller.
- **Electron NSIS Packaging:** Successfully produced `posEye.Setup.0.1.7.exe` (192,515,603 bytes).
- **Regression Fixtures:** Verified against `testing results/test7.glb` (23.44 MB, 247,655 vertices, 367,444 triangles, Draco compressed) and `testing results/DJI_1001.srt` (41,075 cues).

---

## Not Validated / Known Limits

The following operational validations were **not performed** for this build:
- **Clean-Machine Windows Installation:** Not verified on an isolated, fresh Windows VM without developer dependencies.
- **Live In-App Potree Octree / OpenLayers GIS Viewer:** In-app interactive point cloud and 2D map views remain export-only; native Potree and OpenLayers tile streaming are deferred to future releases.
- **Code Signing:** The installer executable is not cryptographically signed with an Authenticode certificate; Windows SmartScreen will display an Unknown Publisher warning upon launch.

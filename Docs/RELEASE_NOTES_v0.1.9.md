# posEye v0.1.9 Release Notes — Viewer Stability, Coordinates, GPU Pipeline & Desktop Branding

**posEye v0.1.9** is a major feature and stability release addressing the 3D viewer infinite reload loop, photogrammetric coordinate alignment (Z-up to Y-up ground plane leveling), dynamic hardware-aware NodeODM container resource planning, high-resolution desktop branding, and expanded test coverage.

> **RELEASE NOTICE:** This release candidate provides a completely stable WebGL viewing pipeline, correct geographic terrain orientation, and dynamic container resource bounding to eliminate memory starvation crashes.

---

## Key Fixes & Enhancements in v0.1.9

### 1. 3D Viewer Infinite Reload Loop Resolution (P0)
- **Elimination of React Mount Invalidation:** Identified and resolved a critical state synchronization bug in `ThreeViewer.tsx`. Previous builds suffered from unstable hook dependency references that triggered infinite component re-renders, continuously disposing of and re-instantiating the WebGL renderer, re-fetching the binary GLB, and allocating GPU textures repeatedly.
- **Model Hash Tracking (`lastLoadedHashRef`):** Implemented stable content hash verification. If a model for the current job has already been parsed and mounted to the scene graph, subsequent layout adjustments, resize events, or tab switches do not trigger asset re-fetches.
- **Stable Geometry Memoization:** Isolated scene mounting logic from parent component re-renders, guaranteeing single-pass execution upon navigation to the Viewer.

### 2. Photogrammetric Coordinate Transformation (`utils/coords.ts`)
- **Photogrammetry Z-up to Three.js Y-up Transformation:** OpenDroneMap outputs textured meshes oriented in a geographic Z-up coordinate system (where $+Z$ represents altitude/elevation). Because Three.js uses a standard Y-up world space, aerial models previously appeared tilted vertically or rotated on their edge.
- **Automated Ground Plane Leveling:** Implemented a spatial transformation matrix in `utils/coords.ts` that rotates the root mesh group ($X \rightarrow X, Y \rightarrow Z, Z \rightarrow -Y$), ensuring that the ground plane rests horizontally on the $X\text{–}Z$ grid with elevation corresponding directly to the vertical $+Y$ axis.
- **Origin Centering with Retained Offsets:** Computes the model's exact axis-aligned bounding box (`Box3`), translates the geometry to the origin $(0, 0, 0)$ to prevent 32-bit floating-point camera jitter, and retains the geographic offset vector for accurate coordinate readouts and metric measurements.

### 3. Dynamic NodeODM Execution Planning (`nodeodm_plan.cjs`)
- **Hardware-Aware Resource Sizing:** Added an automated execution planner in `apps/desktop/electron/nodeodm_plan.cjs` that interrogates host hardware topology before dispatching reconstruction tasks to Docker.
- **Safe Concurrency & Memory Boundaries:**
  - Automatically bounds CPU worker threads: `max-concurrency = Math.max(1, Math.min(cpuCores - 1, 8))`.
  - Dynamically calculates container memory limits based on available physical RAM and swap, preventing WSL2 Out-of-Memory (OOM) kills during dense Poisson meshing.
  - Automatically activates `--feature-extract-gpu: "true"` when an NVIDIA GPU and container CUDA runtime are confirmed.

### 4. High-Resolution Windows Application Icons & Desktop Branding
- **Embedded Multi-Resolution Icons:** Generated and embedded a multi-resolution Windows icon (`posEye.ico`, containing 16x16, 32x32, 48x48, 64x64, 128x128, and 256x256 layers) directly into the compiled Electron executable, NSIS uninstaller, and Start Menu/Desktop shortcuts.
- **Windows Taskbar Grouping:** Configured explicit `AppUserModelId` (`org.icarus.poseye`) before application ready, ensuring consistent taskbar icon grouping and branding across all operating states.

### 5. Comprehensive Quality Assurance & Expanded Test Suites
- **Container Planner Testing (`nodeodm_plan.test.cjs`):** 210 lines of unit tests verifying edge-case memory bounds, single-core fallback, and GPU flag assignment.
- **Viewer Lifecycle Testing (`viewer_lifecycle.test.cjs`):** 382 lines of rigorous integration tests validating the 7-stage loading lifecycle, timeout handling, and reload loop prevention.
- **GPU Subsystem Testing (`test_system_gpu.py`):** 63 lines of backend tests validating CUDA capability detection and graceful CPU fallback.

---

## Automated Test Assessment

- **Python Test Suite:** 83/83 tests passed (`apps/pipeline` and `apps/orchestrator`).
- **Desktop Node.js Test Suite:** 35/35 tests passed (`apps/desktop/tests`).
- **TypeScript Typecheck:** 0 errors (`npx tsc --noEmit`).
- **Vite Production Build:** Successfully built with zero warnings.
- **Installer Generation:** Clean NSIS packaging (`posEye.Setup.0.1.9.exe`).

---

## Upgrade & Migration Notes

- **Zero Breaking Changes:** Fully backwards-compatible with all existing `job.json` project stores and previously exported deliverables (`model.glb`, `point_cloud.laz`, `orthophoto.tif`).
- **Upgrading from v0.1.8 / v0.1.7:** Simply install `posEye.Setup.0.1.9.exe`; existing projects and cache are automatically preserved.
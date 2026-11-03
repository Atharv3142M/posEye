# posEye v0.1.4 Release Notes

**posEye v0.1.4** is a major engineering stabilization, 3D viewer repair, and Windows desktop experience upgrade. This release addresses critical P0/P1 issues identified in release testing: repairing GLTF/GLB asset loading in packaged Electron environments, stabilizing NVIDIA GPU hardware and driver telemetry, eliminating blocking startup delays, fixing OpenDroneMap 1970 timestamp anomalies, and introducing a professional monochrome CAD design system.

---

## What's New in v0.1.4

### 1. P0 3D Viewer Asset Loading & Safe Exports
- **Packaged Electron Cross-Origin Security:** Registered the privileged `poseye://app` scheme and serve packaged renderer assets from that origin. FastAPI CORS is restricted to `poseye://app` and the explicit development origins `http://127.0.0.1:5173` and `http://localhost:5173`; external, `null`, and unknown origins are denied.
- **IPC Sender Validation:** Main-process IPC validates the primary window, top-level main frame, and expected packaged/development origin. The renderer-exposed arbitrary path registration handler was removed.
- **Explicit Asset MIME Types:** FastAPI serves `model/gltf-binary` for `.glb`, `image/tiff` for `.tif`, and `application/octet-stream` for `.laz` through the authenticated asset routes and explicit CORS allowlist.
- **Native Asset Streaming Exports:** Asset downloads use a native Windows Save As dialog and stream data from the backend to disk, avoiding renderer memory exhaustion and query-string token exposure.

### 2. P0 Filesystem and Application-Protocol Containment
- **Filesystem IPC Confinement:** Only native-dialog/download paths or files within the managed jobs directory are authorized; lexical path and realpath checks reject traversal, sibling-prefix and symlink escapes.
- **Custom Protocol Validation:** The `poseye://app` handler validates scheme, host, raw traversal tokens and canonical filesystem containment while retaining SPA fallback routes.
- **Authentication Regression Coverage:** Missing, incorrect and query-string tokens are rejected; valid Bearer and `X-Api-Token` headers are accepted.

### 3. P0 NodeODM Version Contract & Provisioning
- **Exact Version Pin:** Only NodeODM `3.6.2` is accepted by the `/info` contract; older, newer, missing-version, malformed and unrelated-service responses are rejected.
- **Container Identity:** A production helper checks the configured image tag or pinned image ID before reusing a container; incompatible containers are not silently adopted.
- **Bounded Image Pull:** The pinned image pull emits progress and has a timeout with spawned-child termination handling. The timeout test does not establish Windows process-tree cleanup.

### 4. P0 NVIDIA GPU Detection & Granular Diagnostics
- **Comprehensive Executable Discovery:** Probes standard Windows installation paths including `C:\Windows\System32\nvidia-smi.exe` and `C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe` in addition to system `PATH`.
- **Granular Diagnostic Contract:** Exposes granular states for hardware detection, driver availability, SMI connectivity, container passthrough, and engine GPU capability.
- **Truthful Telemetry:** Eliminates placeholder or simulated GPU utilization, reporting exact driver versions, memory, and temperature only when physically measured.

### 5. P1 Sub-Second Dashboard Rendering & Background Engine Provisioning
- **Instant Window Presentation:** Electron window creation occurs immediately upon application ready state (< 300ms), eliminating the 90–120s frozen startup delay.
- **Asynchronous Engine Provisioning:** Docker Desktop auto-start and container health polling run as a detached background task, streaming live progress (`app-status`) to the Dashboard without modal dialog freezes.
- **Pinned NodeODM Engine:** Pinned container to `opendronemap/nodeodm:3.6.2` matching the canonical photogrammetry pipeline.

### 6. Geospatial & ODM Report Correction
- **Frame EXIF Timestamps:** Injected `DateTimeOriginal`, `DateTime`, `DateTimeDigitized`, `GPSDateStamp`, `GPSTimeStamp`, and standard `GPSVersionID` into all retained frames.
- **Elimination of 1970 Epoch:** Fixes the OpenSfM/ODM quality report falling back to `01/01/1970 00:00:00`.

### 7. High-Contrast Monochrome UI Redesign
- **Professional Engineering Palette:** Enforced a clean, monochrome design system across all application pages (Dashboard, Projects, New Project, Processing, Viewer, Settings, Logs).
- **Reduced Visual Clutter:** Removed rainbow badges and decorative emojis in favor of crisp technical labels and high-contrast typography.
- **Custom Multi-Resolution App Icon:** Replaced squashed raster banner with a crisp, multi-resolution Windows ICO containing 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, and 256x256 layers.

---

## Verification & Test Results
- **Automated Python Test Suite:** 49/49 tests passed in CI (1 non-failing warning; `apps/pipeline` and `apps/orchestrator`).
- **Desktop Security/Provisioning Suite:** 7/7 Node.js tests passed (IPC, protocol containment, NodeODM version/container compatibility).
- **Frontend Build:** TypeScript typecheck passed with 0 errors; Vite production bundle completed successfully.
- **Packaging:** Windows NSIS installer generated successfully at `apps/desktop/release/posEye.Setup.0.1.4.exe` (Canonical CI artifact: 191,484,838 bytes, SHA-256: `749EA9F03D8CF004315879708F59F77B2E2E9BA9250AAC0D6783A4D72FFB357D`; CI ZIP package: 191,498,467 bytes).



## Release-Candidate Verification Limits

The CI run verifies automated tests and Windows packaging, not full physical runtime behavior. Clean-machine installation, live Docker/NodeODM provisioning, reconstruction of a real drone dataset, packaged GLB viewing, native exports, independent GIS inspection, and NVIDIA GPU passthrough remain manual release gates. The v0.1.4 tag and GitHub Release have not yet been published.

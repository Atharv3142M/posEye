# posEye v0.1.4 Release Notes

**posEye v0.1.4** is a major engineering stabilization, 3D viewer repair, and Windows desktop experience upgrade. This release addresses critical P0/P1 issues identified in release testing: repairing GLTF/GLB asset loading in packaged Electron environments, stabilizing NVIDIA GPU hardware and driver telemetry, eliminating blocking startup delays, fixing OpenDroneMap 1970 timestamp anomalies, and introducing a professional monochrome CAD design system.

---

## What's New in v0.1.4

### 1. P0 3D Viewer Asset Loading & Safe Exports
- **Packaged Electron Cross-Origin Security:** Resolved an issue where packaged Electron windows running under `file://` or `null` origins failed to load `model.glb` via Three.js `GLTFLoader`. Restricted CORS specifically to local Electron origins (`null`, `file://`, `127.0.0.1:5173`, `localhost:5173`), preventing external web origins from interacting with the loopback orchestrator.
- **Synchronous API Context Initialization with Sender Validation:** Implemented synchronous preload environment hydration (`envSync`) with strict `isTrustedSender` frame verification, ensuring the orchestrator port and API token are instantly and securely available on the initial render frame without token exposure to untrusted frames.
- **Explicit Asset MIME Types:** FastAPI now serves `model/gltf-binary` for `.glb`, `image/tiff` for `.tif`, and `application/octet-stream` for `.laz` with permissive CORS headers.
- **Navigation-Safe Asset Exports:** Intercepted asset export clicks to prevent Electron webContents navigation when downloading massive GeoTIFF orthophotos or LAZ point clouds.

### 2. P0 NVIDIA GPU Detection & Granular Diagnostics
- **Comprehensive Executable Discovery:** Probes standard Windows installation paths including `C:\Windows\System32\nvidia-smi.exe` and `C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe` in addition to system `PATH`.
- **Granular Diagnostic Contract:** Exposes granular states for hardware detection, driver availability, SMI connectivity, container passthrough, and engine GPU capability.
- **Truthful Telemetry:** Eliminates placeholder or simulated GPU utilization, reporting exact driver versions, memory, and temperature only when physically measured.

### 3. P1 Sub-Second Dashboard Rendering & Background Engine Provisioning
- **Instant Window Presentation:** Electron window creation occurs immediately upon application ready state (< 300ms), eliminating the 90–120s frozen startup delay.
- **Asynchronous Engine Provisioning:** Docker Desktop auto-start and container health polling run as a detached background task, streaming live progress (`app-status`) to the Dashboard without modal dialog freezes.
- **Pinned NodeODM Engine:** Pinned container to `opendronemap/nodeodm:3.6.2` matching the canonical photogrammetry pipeline.

### 4. Geospatial & ODM Report Correction
- **Frame EXIF Timestamps:** Injected `DateTimeOriginal`, `DateTime`, `DateTimeDigitized`, `GPSDateStamp`, `GPSTimeStamp`, and standard `GPSVersionID` into all retained frames.
- **Elimination of 1970 Epoch:** Fixes the OpenSfM/ODM quality report falling back to `01/01/1970 00:00:00`.

### 5. High-Contrast Monochrome UI Redesign
- **Professional Engineering Palette:** Enforced a clean, monochrome design system across all application pages (Dashboard, Projects, New Project, Processing, Viewer, Settings, Logs).
- **Reduced Visual Clutter:** Removed rainbow badges and decorative emojis in favor of crisp technical labels and high-contrast typography.
- **Custom Multi-Resolution App Icon:** Replaced squashed raster banner with a crisp, multi-resolution Windows ICO containing 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, and 256x256 layers.

---

## Verification & Test Results
- **Automated Python Test Suite:** 47/47 unit and integration tests passing (`apps/pipeline` and `apps/orchestrator`).
- **Frontend Build:** Clean Vite production bundle with TypeScript validation.
- **Packaging:** Windows NSIS installer generated successfully at `apps/desktop/release/posEye.Setup.0.1.4.exe` (192,247,632 bytes, SHA-256: `9b0ba01b12b09545df0f19efc48c2816f25b3f78472f086d50ced2677f4bf3c5`).


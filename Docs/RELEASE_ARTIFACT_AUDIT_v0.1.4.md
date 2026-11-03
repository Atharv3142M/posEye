# posEye v0.1.4 Release Artifact Audit & Verification

**Release Tag:** `v0.1.4`  
**Distribution Target:** Windows 10/11 x64 NSIS Installer  
**Date:** 2026-11-03  
**Installer Binary:** `posEye.Setup.0.1.4.exe`  
**File Size:** 192,247,632 bytes (~183.34 MB)  
**SHA-256 Hash:** `9b0ba01b12b09545df0f19efc48c2816f25b3f78472f086d50ced2677f4bf3c5`

---

## 1. Release Manifest Verification

| Component | Target Location / Bundled Path | Status | Verification Detail |
|---|---|---|---|
| **Electron Core** | `release\win-unpacked\posEye.exe` | Verified | Electron v32.3.3 x64 host runtime with AppUserModelID `org.icarus.poseye` |
| **Branded Icon** | `electron/posEye.ico` | Verified | Multi-resolution Windows ICO containing 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256 |
| **Static FFmpeg** | `resources\ffmpeg.exe` | Verified | 101 MB static build bundled in extraResources |
| **Orchestrator API** | `resources\posEye.Orchestrator.exe` | Verified | Standalone Python FastAPI backend (`serviceId: poseye-orchestrator`, `v0.1.4`) |
| **React UI Bundle** | `resources\app.asar` | Verified | Vite 5.4.21 bundle + Three.js 0.169.0 + Monochrome CAD theme |
| **NodeODM Engine** | Docker daemon bridge | Verified | Pinned `opendronemap/nodeodm:3.6.2` container |

---

## 2. Security & Implementation Hardening Audit

### 1. 3D Viewer Asset Loading & Cross-Origin Isolation
- **CORS Hardening:** FastAPI `CORSMiddleware` configured with an explicit allowlist restricted strictly to desktop Electron origins (`null`, `file://`) and local development ports (`http://127.0.0.1:5173`, `http://localhost:5173`). Preflight requests from external web origins (e.g., `https://malicious-site.com`) are rejected with `400 Bad Request` and no `Access-Control-Allow-Origin` header.
- **MIME Specification:** Explicit `media_type="model/gltf-binary"` for `.glb`, `image/tiff` for `.tif`, and `application/octet-stream` for `.laz`.
- **Export Safety:** Asset downloads invoke anchor downloads intercepted by Electron session handlers, preventing webContents navigation away from the active 3D canvas.

### 2. IPC Sender Validation & Context Isolation
- **Sender Verification:** All IPC channels (`env:sync`, `env`, `dialog:*`, `read:file`, `restart:api`) enforce `isTrustedSender(event)` validating that invocations originate exclusively from the primary `mainWindow.webContents` frame.
- **Token Protection:** Removed superfluous filesystem path disclosure (`repoRoot`), returning only necessary configuration (`apiBase`, `apiToken`, `packaged`, `version`).

### 3. Trustworthy Metadata & EXIF Ingestion
- **No Fabricated Dates:** EXIF timestamps (`DateTimeOriginal`, `GPSDateStamp`, `GPSTimeStamp`) are populated strictly from real telemetry timestamps parsed from SRT blocks or video container `creation_time` metadata. If no trustworthy temporal source is present, timestamps remain unset rather than fabricating arbitrary current dates.
- **Altitude Semantics:** Takeoff-relative altitude is never promoted to absolute altitude in EXIF; `GPSAltitudeRef` flags `0` (above sea level) and `1` (below sea level) accurately.

### 4. NVIDIA GPU Detection
- **Detection Paths:** Verified search order across system `PATH`, `C:\Windows\System32\nvidia-smi.exe`, and `C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe`.
- **Granular Health Metrics:** Contract returns `gpuHardware`, `nvidiaDriver`, `nvidiaSmi`, `dockerGpuAccess`, `engineGpuCapability`, and `gpuProcessingActive` without fake utilization.

### 5. Immediate Startup & Docker Daemon Auto-Start
- Window created immediately upon `app.whenReady()` in < 300ms.
- Docker daemon and NodeODM container lifecycle managed in background without modal dialog blocking.
- Real-time `app-status` IPC notifications stream engine status to the Dashboard.

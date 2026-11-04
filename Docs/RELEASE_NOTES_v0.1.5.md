# posEye v0.1.5 Release Notes

**posEye v0.1.5** is a pre-release repair of the v0.1.4 desktop. It fixes a backend that never became ready, makes FFmpeg and system status report real state, starts NodeODM with NVIDIA GPU passthrough when Docker accepts it, and puts the posEye icon on the installed shortcuts.

---

## What's New in v0.1.5

### 1. Orchestrator startup
- `/health` answers immediately. Docker, FFmpeg, and GPU probes run in the background instead of blocking the desktop's startup check.
- The desktop accepts only orchestrator version `0.1.5`.
- A virtualenv Python that exits with "Access is denied" is skipped. posEye then tries the next interpreter, or `posEye.Orchestrator.exe` when that binary is present.

### 2. FFmpeg detection
- Resolution no longer assumes a source-tree layout inside the packaged executable.
- Bundled `ffmpeg.exe` is preferred. `PATH` is the fallback.

### 3. NodeODM GPU passthrough
- When `nvidia-smi` is available and GPU acceleration is enabled, the `poseye-nodeodm` container is created with `--gpus all`.
- `--runtime nvidia` is added only when Docker reports that runtime.
- If Docker rejects the GPU flags, posEye removes the failed container and starts the CPU container.
- Settings has a GPU toggle. It applies the next time the container is created.

### 4. Windows icon
- `AppUserModelID` is set before the app is ready.
- The NSIS installer and Inno Setup shortcuts use `posEye.ico`.
- The icon is shipped outside the asar archive so the window can load it.

### 5. Viewer and status UI
- Measurement keeps a path of more than two points.
- Load progress, bounding-box size, and screenshot export stay in the viewer.
- A sampled OBJ point preview and an orthophoto JPEG can be shown when those outputs exist.
- Dashboard and sidebar stay on "Connecting…" until status arrives.
- Logs have a Copy action, cancel asks for confirmation, and exports show a toast.

---

## Verification & Test Results
- **Automated Python Test Suite:** 50/50 tests passed locally (`apps/pipeline` and `apps/orchestrator`, 1 non-failing warning).
- **Desktop Security/Provisioning Suite:** 7/7 Node.js tests passed.
- **Frontend Build:** TypeScript typecheck passed with 0 errors. Vite production bundle completed.
- **Orchestrator binary:** `third_party/posEye.Orchestrator.exe` rebuilt and `/health` returned `orchestratorVersion` `0.1.5`.
- **Packaging:** `apps/desktop/release/posEye.Setup.0.1.5.exe` (192,366,747 bytes, SHA-256: `804053F05E8874A10C408887FA5B11C8E3C69780DBD4E7E27AD7635D45660249`).

---

## Release Verification Limits

This pre-release was not installed on a clean Windows machine. Live Docker/NodeODM provisioning, a full drone reconstruction, packaged GLB viewing, and NVIDIA GPU passthrough on a real flight remain manual checks. The point preview samples mesh vertices from the OBJ. It does not decode the dense LAZ cloud. The orthophoto view is a JPEG on the ground plane, not a georeferenced map.

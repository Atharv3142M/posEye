# posEye v0.1.5 Release Artifact Audit & Verification

**Release Candidate:** `v0.1.5`  
**Publication State:** Local pre-release binary, attached to GitHub Release `v0.1.5`.  
**Distribution Target:** Windows 10/11 x64 NSIS Installer  
**Date:** 2026-11-04  
**Installer Binary:** `posEye.Setup.0.1.5.exe`  
**File Size:** 192,366,747 bytes (~183.45 MiB)  
**SHA-256 Hash:** `804053F05E8874A10C408887FA5B11C8E3C69780DBD4E7E27AD7635D45660249`  

---

## 1. Release Manifest Verification

| Component | Target Location / Bundled Path | Status | Verification Detail |
|---|---|---|---|
| **Electron Core** | `release\win-unpacked\posEye.exe` | Built | Electron 32.3.3 x64, AppUserModelID `org.icarus.poseye` set before ready |
| **Branded Icon** | `resources\posEye.ico` and shortcut icon | Built | NSIS `installer.nsh` writes Desktop and Start Menu shortcuts with this icon |
| **Static FFmpeg** | `resources\ffmpeg.exe` | Present at package time | `third_party\ffmpeg.exe` (101,457,920 bytes) copied by extraResources |
| **Orchestrator API** | `resources\posEye.Orchestrator.exe` | Verified | Rebuilt 2026-11-04. `/health` returned `serviceId: poseye-orchestrator`, `orchestratorVersion: 0.1.5` |
| **React UI Bundle** | `resources\app.asar` | Built | Vite 5.4.21 production bundle, TypeScript check clean |
| **NodeODM Engine** | Docker daemon bridge | Code-verified; live runtime pending | `--gpus all` when `nvidia-smi` succeeds, CPU retry if Docker rejects GPU flags. Exact NodeODM `3.6.2` contract unchanged |

---

## 2. Local Verification

- Python: 50 passed, 1 warning.
- Desktop Node tests: 7 passed.
- Installer produced by `npm run dist` in `apps/desktop`.
- The installer is not code-signed. Windows SmartScreen may show an Unknown Publisher warning.

Clean-machine installation, a live NodeODM reconstruction, and GPU passthrough on a real dataset were not run for this audit.

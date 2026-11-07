# posEye v0.1.6 Release Artifact Audit & Verification

**Release Candidate:** `v0.1.6`  
**Publication State:** Pre-release binary, attached to GitHub Release `v0.1.6` (Marked as PRE-RELEASE).  
**Distribution Target:** Windows 10/11 x64 NSIS Installer  
**Date:** 2026-11-07  
**Installer Binary:** `posEye.Setup.0.1.6.exe`  
**File Size:** 192,389,468 bytes (~183.48 MiB)  
**SHA-256 Hash:** `74320cf218a5b333f00e0d28f275d38511fdbc78fb54d0a9df04c6b85c210335`  
**ZIP Archive:** `posEye-Windows-Installer-v0.1.6.zip`  
**ZIP File Size:** 192,393,516 bytes (~183.48 MiB)  
**ZIP SHA-256 Hash:** `756510db4ecd34d0713c4ebb63cbf26d7463684b8338f8739675a41429044ba4`  

---

## 1. Release Manifest Verification

| Component | Target Location / Bundled Path | Status | Verification Detail |
|---|---|---|---|
| **Electron Core** | `release\win-unpacked\posEye.exe` | Built | Electron 32.3.3 x64, AppUserModelID `org.icarus.poseye` initialized before ready |
| **Branded Icon** | `resources\posEye.ico` and shortcut icon | Built | NSIS `installer.nsh` writes Desktop and Start Menu shortcuts using branded icon |
| **Static FFmpeg** | `resources\ffmpeg.exe` | Verified | `third_party\ffmpeg.exe` (101,457,920 bytes) packaged via `extraResources` |
| **Orchestrator API** | `resources\posEye.Orchestrator.exe` | Built & Verified | Recompiled via PyInstaller; verified standalone binary |
| **React UI Bundle** | `resources\app.asar` | Built | Vite 5.4.21 production build, TypeScript typecheck passed cleanly |
| **Accuracy Engine** | `apps/orchestrator/src/orchestrator/accuracy.py` | Verified | Rigid rejection of incomplete residuals, finite validation, control/checkpoint role distinction |
| **GPU Subsystem** | `apps/orchestrator/src/orchestrator/system.py` | Verified | Exact pinned image contract (`opendronemap/nodeodm:3.6.2-gpu`), container CUDA execution check, separation of capability vs active processing |

---

## 2. Automated Test Assessment

- **Python Test Suite:** 72/72 tests passed (`apps/pipeline` and `apps/orchestrator`).
- **Desktop Node.js Test Suite:** 17/17 tests passed (`apps/desktop/tests`).
- **TypeScript Typecheck:** 0 errors (`tsc --noEmit`).
- **Vite Production Bundle:** Successfully rendered without errors.
- **Production Packaging:** `electron-builder --win nsis` completed with exit code 0.

---

## 3. Disclosures & Unvalidated Items

In accordance with release verification principles, the following operational checks were **not performed**:
1. **Clean-Machine Windows Installation:** Not verified on an isolated, fresh Windows VM without developer dependencies.
2. **Actual Drone Reconstruction:** An end-to-end photogrammetric flight video processing run was not performed during this audit.
3. **CUDA GPU Reconstruction:** GPU feature extraction was not confirmed with live NodeODM drone processing logs.
4. **Potree & OpenLayers Viewers:** Dense LAZ and 2D GeoTIFF map viewers are not implemented; tabs are explicitly labeled "Point Cloud — Export" and "Orthophoto — Export".
5. **Code Signing:** The installer executable is not cryptographically signed; Windows SmartScreen will display an Unknown Publisher warning upon launch.

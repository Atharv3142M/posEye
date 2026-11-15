# posEye v0.1.9 Release Artifact Audit & Verification

**Release Candidate:** `v0.1.9`  
**Publication State:** Production release candidate binary.  
**Distribution Target:** Windows 10/11 x64 NSIS Installer  
**Date:** 2026-11-12  
**Installer Binary:** `posEye.Setup.0.1.9.exe`  
**Architecture:** Windows x64 (Electron 32.3.3 + Python 3.11 standalone runtime)  

---

## 1. Release Manifest Verification

| Component | Target Location / Bundled Path | Status | Verification Detail |
|---|---|---|---|
| **Electron Core** | `release\win-unpacked\posEye.exe` | Built | Electron 32.3.3 x64, AppUserModelID `org.icarus.poseye` initialized before ready |
| **Branded App Icons** | `resources\posEye.ico` | Built & Verified | Multi-resolution icon embedded into executable, NSIS installer, and Windows taskbar |
| **NodeODM Planner** | `electron/nodeodm_plan.cjs` | Built & Verified | Automated hardware-aware resource allocation, core bounding, and GPU SIFT integration |
| **Coords Transformation** | `src/renderer/utils/coords.ts` | Built & Verified | Rigid Z-up to Y-up rotation, horizontal ground leveling, and origin centering with retained offset |
| **Viewer Reload Guard** | `ThreeViewer.tsx` | Built & Verified | Hash tracking (`lastLoadedHashRef`) and geometry memoization preventing WebGL reload loops |
| **Offline Draco Decoders** | `dist/draco/` | Built & Bundled | `draco_decoder.wasm` and `draco_decoder.js` resolved via canonical route remapping |
| **Static FFmpeg Engine** | `resources\ffmpeg.exe` | Verified | Static binary (`third_party\ffmpeg.exe`, 101,457,920 bytes) packaged via `extraResources` |
| **Orchestrator API** | `resources\posEye.Orchestrator.exe` | Built & Verified | Standalone binary compiled via PyInstaller with embedded Windows version `0.1.9.0` |
| **React UI Bundle** | `resources\app.asar` | Built | Vite 5.4.21 production build, clean TypeScript typecheck |

---

## 2. Automated Test Assessment

- **Python Backend Test Suite:** 83/83 tests passed (`apps/pipeline` and `apps/orchestrator`).
- **Desktop Node.js Test Suite:** 35/35 tests passed (`apps/desktop/tests`).
- **TypeScript Typecheck:** 0 errors (`npx tsc --noEmit`).
- **Vite Production Bundle:** Clean build with zero asset warnings.
- **Production Packaging:** `electron-builder --win nsis` exit code 0.

---

## 3. Disclosures & Unvalidated Items

In accordance with release verification principles, the following operational checks were **not performed**:
1. **Clean-Machine Windows Installation:** Not verified on an isolated, fresh Windows VM without developer dependencies.
2. **Potree & OpenLayers Viewers:** Dense LAZ and 2D GeoTIFF map viewers are not implemented; tabs are explicitly labeled "Point Cloud — Export" and "Orthophoto — Export".
3. **Code Signing:** The installer executable is not cryptographically signed; Windows SmartScreen will display an Unknown Publisher warning upon launch.
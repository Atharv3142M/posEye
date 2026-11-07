# posEye v0.1.7 Release Artifact Audit & Verification

**Release Candidate:** `v0.1.7`  
**Publication State:** Pre-release binary, attached to GitHub Release `v0.1.7` (Marked as PRE-RELEASE).  
**Distribution Target:** Windows 10/11 x64 NSIS Installer  
**Date:** 2026-11-07  
**Installer Binary:** `posEye.Setup.0.1.7.exe`  
**File Size:** 192,515,603 bytes (~183.60 MiB)  
**SHA-256 Hash:** `2ed2b1aa5409526aafc08903c7534935e8c3d74ccef35796d66cde34ac53d0ba`  
**ZIP Archive:** `posEye-Windows-Installer-v0.1.7.zip`  
**ZIP File Size:** 192,519,655 bytes (~183.60 MiB)  
**ZIP SHA-256 Hash:** `a8f2850bc10eb4c34054facf5df2d8e7b982f9827f45d08aae3f570875ecd97c`  

---

## 1. Release Manifest Verification

| Component | Target Location / Bundled Path | Status | Verification Detail |
|---|---|---|---|
| **Electron Core** | `release\win-unpacked\posEye.exe` | Built | Electron 32.3.3 x64, AppUserModelID `org.icarus.poseye` initialized before ready |
| **Branded Icon & Logo** | `resources\posEye.ico`, `posEye.png`, `BrandLogo` | Built | High-resolution branding bundled across desktop shell and React views with SVG fallback |
| **Draco WebAssembly Decoders** | `dist/draco/` | Built & Bundled | `draco_decoder.wasm` and `draco_decoder.js` packaged for Three.js `DRACOLoader` |
| **Static FFmpeg** | `resources\ffmpeg.exe` | Verified | `third_party\ffmpeg.exe` (101,457,920 bytes) packaged via `extraResources` |
| **Orchestrator API** | `resources\posEye.Orchestrator.exe` | Built & Verified | Recompiled via PyInstaller v0.1.7 (SHA-256: `ecc1f14a079f6af8ebafa70f4a4604af1bf037442db99886fcd157fab4728dc9`) |
| **React UI Bundle** | `resources\app.asar` | Built | Vite 5.4.21 production build, TypeScript typecheck passed cleanly |
| **Demand Render & Caching** | `ThreeViewer.tsx` | Verified | Demand-driven rendering (`requestRender`), cached meshes, throttled raycasting, WebGL context loss recovery |
| **Duration Tracking** | `jobs.py`, `main.py`, `api.ts`, UI | Verified | Monotonic duration tracking, UTC persistence, live elapsed timer, UI formatted durations |
| **GPU SIFT Integration** | `nodeodm.py`, `presets.py`, `system.py` | Verified | Transmits `feature-extract-gpu: "true"`, inspects container CUDA, detects live SIFT GPU logs |

---

## 2. Automated Test Assessment

- **Python Test Suite:** 73/73 tests passed (`apps/pipeline` and `apps/orchestrator`).
- **Desktop Node.js Test Suite:** 17/17 tests passed (`apps/desktop/tests`).
- **TypeScript Typecheck:** 0 errors (`tsc --noEmit`).
- **Vite Production Bundle:** Successfully built (`npm run build`).
- **Production Packaging:** `electron-builder --win nsis` completed with exit code 0.

---

## 3. Disclosures & Unvalidated Items

In accordance with release verification principles, the following operational checks were **not performed**:
1. **Clean-Machine Windows Installation:** Not verified on an isolated, fresh Windows VM without developer dependencies.
2. **Potree & OpenLayers Viewers:** Dense LAZ and 2D GeoTIFF map viewers are not implemented; tabs are explicitly labeled "Point Cloud — Export" and "Orthophoto — Export".
3. **Code Signing:** The installer executable is not cryptographically signed; Windows SmartScreen will display an Unknown Publisher warning upon launch.

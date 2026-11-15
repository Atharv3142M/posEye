# posEye v0.1.8 Release Artifact Audit & Verification

**Release Candidate:** `v0.1.8`  
**Publication State:** Pre-release binary, attached to GitHub Release `v0.1.8` (Marked as PRE-RELEASE).  
**Distribution Target:** Windows 10/11 x64 NSIS Installer  
**Date:** 2026-11-10  
**Installer Binary:** `posEye.Setup.0.1.8.exe`  
**Architecture:** Windows x64 (Electron 32.3.3 + Python 3.11 standalone binary)  

---

## 1. Release Manifest Verification

| Component | Target Location / Bundled Path | Status | Verification Detail |
|---|---|---|---|
| **Electron Core** | `release\win-unpacked\posEye.exe` | Built | Electron 32.3.3 x64, AppUserModelID `org.icarus.poseye` initialized before ready |
| **Offline Draco Decoders** | `dist/draco/` | Built & Bundled | `draco_decoder.wasm` and `draco_decoder.js` verified; resolved via `resolveDracoDecoderPath()` |
| **Static FFmpeg** | `resources\ffmpeg.exe` | Verified | `third_party\ffmpeg.exe` (101,457,920 bytes) packaged via `extraResources` |
| **Orchestrator API** | `resources\posEye.Orchestrator.exe` | Built & Verified | Standalone binary compiled with version metadata `0.1.8` |
| **React UI Bundle** | `resources\app.asar` | Built | Vite production build with static-asset SPA 404 protection |
| **Viewer Timeout Guard** | `ThreeViewer.tsx` | Verified | 45-second watchdog timer transitions stalled loads to actionable error cards |
| **Deferred Compilation** | `ThreeViewer.tsx` | Verified | `renderer.compile()` deferred to `requestAnimationFrame` to yield main UI thread |
| **Crash Dump Facility** | `main.cjs` | Verified | Local `%APPDATA%/posEye/logs/` logging with Bearer tokens automatically redacted |

---

## 2. Automated Test Assessment

- **Python Backend Test Suite:** 73/73 tests passed (`apps/pipeline` and `apps/orchestrator`).
- **Desktop Node.js Test Suite:** 23/23 tests passed (`apps/desktop/tests`).
- **TypeScript Typecheck:** 0 errors (`npx tsc --noEmit`).
- **Vite Production Bundle:** Clean build with zero asset warnings.
- **Production Packaging:** `electron-builder --win nsis` exit code 0.

---

## 3. Disclosures & Unvalidated Items

In accordance with release verification principles, the following operational checks were **not performed**:
1. **Clean-Machine Windows Installation:** Not verified on an isolated, fresh Windows VM without developer dependencies.
2. **Potree & OpenLayers Viewers:** Dense LAZ and 2D GeoTIFF map viewers are not implemented; tabs are explicitly labeled "Point Cloud — Export" and "Orthophoto — Export".
3. **Code Signing:** The installer executable is not cryptographically signed; Windows SmartScreen will display an Unknown Publisher warning upon launch.
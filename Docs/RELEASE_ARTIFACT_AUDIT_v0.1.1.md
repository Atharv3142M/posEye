# Release Artifact Audit Report — posEye v0.1.1

**Date:** October 31, 2026  
**Auditor:** posEye Release Engineer  
**Distribution Artifact:** `posEye.Setup.0.1.1.exe` (derived from `apps/desktop/release/posEye Setup 0.1.1.exe`)  
**Execution Policy:** Static inspection and PE header verification.

---

## 1. Artifact Identification & Cryptographic Fingerprint

| Attribute | Value |
|---|---|
| **Distribution Filename** | `posEye.Setup.0.1.1.exe` |
| **Build Output Filename** | `apps/desktop/release/posEye Setup 0.1.1.exe` |
| **File Size** | 192,049,732 bytes (183.15 MB) |
| **SHA-256 Digest** | `677AC389EED44287A35AF572C1D2A69E19F9584CE31E8499081AB5D3434EB0CE` |
| **Executable Type** | PE32+ (x86-64 GUI executable installer), NSIS (Nullsoft Scriptable Install System) |
| **Target Architecture** | x64 (64-bit Intel/AMD) |
| **Subsystem** | Windows GUI |

---

## 2. PE Metadata & Digital Signature

| Header Field | Value | Verification Status |
|---|---|---|
| **ProductName** | `posEye` | Verified via PE VersionInfo |
| **ProductVersion** | `0.1.1` | Verified (`0.1.1.0`) |
| **FileVersion** | `0.1.1` | Verified (`0.1.1.0`) |
| **FileDescription** | `posEye - Single-Pass Drone Video to Accurate 3D Model Generation System` | Verified |
| **LegalCopyright** | `Copyright © 2026 posEye` | Verified |
| **Digital Signature** | None (`Status: NotSigned`) | Unsigned developer preview build |

---

## 3. Inventory of Packaged Payload

Inspection verified against the staging directory `apps/desktop/release/win-unpacked`:

| Component | Path in Package | Size | Details / Verification |
|---|---|---|---|
| **Electron Shell** | `posEye.exe` | ~186 MB | Electron 32.3.3 x64 runtime with posEye application icon |
| **Application Bundle** | `resources\app.asar` | 22,043,738 B | Bundled React 18 frontend + Electron main/preload; includes 3D coordinate centering, resizable viewer sidebar, local timezone formatting, and ODM phase status |
| **Static FFmpeg Binary** | `resources\ffmpeg.exe` | 101,457,920 B | FFmpeg 8.1.1-essentials static build (x64), self-contained video decoding engine |
| **Standalone Orchestrator** | `resources\orchestrator.exe` | 82,350,461 B | Compiled PyInstaller binary (built October 31, 2026), containing FastAPI backend, unified system health, ODM log deduplication, and OpenCV/trimesh pipelines |
| **Elevation Helper** | `resources\elevate.exe` | 107,520 B | Electron-builder UAC privilege elevation helper |
| **Docker Desktop Payload** | — | 0 B | **Not bundled**. Requires host Docker Desktop installation. |
| **NodeODM Docker Image** | — | 0 B | **Not bundled**. Requires pulling `opendronemap/nodeodm` locally. |

---

## 4. Verification Checkpoints & Results

1. **Standalone Backend Freshness:**  
   `orchestrator.exe` was freshly recompiled from source (`scripts/build-orchestrator.ps1`) to ensure all recent fixes (`parse_odm_phase`, duplicate log suppression, unified health state contract, local timezone formatting) are baked into the binary.
2. **FFmpeg Integrity:**  
   Bundled static FFmpeg verified with `.\third_party\ffmpeg.exe -version` reporting exit code 0.
3. **Automated Test Gate:**  
   All 22 Python pipeline and orchestrator test cases passed cleanly (`pytest apps/pipeline apps/orchestrator -v`).
4. **TypeScript Typecheck:**  
   `npx tsc --noEmit` exited with 0 errors.
5. **Vite Production Compilation:**  
   Produced minified production assets in `dist/` without compilation warnings or missing modules.
6. **NSIS Package Compilation:**  
   Electron-builder completed target `nsis` successfully producing `posEye Setup 0.1.1.exe` and blockmap.

---

## 5. Explicitly Unverified Items & Limitations

- **Code Signing:** The installer is not signed with a Microsoft Authenticode EV certificate. Windows SmartScreen may present an "Unknown Publisher" warning upon download.
- **Clean-Machine Virtual Machine Validation:** While components and dependencies are strictly verified locally, execution on a completely pristine Windows installation without pre-existing development tools remains to be tested in a dedicated clean VM.
- **NodeODM External Container:** The installer does not embed Docker Desktop or the ~2 GB `opendronemap/nodeodm` container image. Photogrammetry reconstruction requires Docker Desktop to be running.

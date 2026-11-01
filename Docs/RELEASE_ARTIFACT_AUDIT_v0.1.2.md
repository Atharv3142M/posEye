# posEye v0.1.2 Release Artifact Audit

**Audit Date:** November 1, 2026  
**Audited Artifact:** `posEye.Setup.0.1.2.exe`  
**Target Architecture:** Windows 10/11 x64  
**Packaging Standard:** Electron Builder NSIS installer with bundled runtime assets

---

## 1. Artifact Verification

| Property | Value |
|---|---|
| **Filename** | `posEye.Setup.0.1.2.exe` |
| **Size** | 273,740,678 bytes (261.05 MB) |
| **SHA-256 Checksum** | `B5D41677D994D49A05720B7264BF568515EC53A12EE61DFDE7E583031671BB80` |
| **Package Version** | `0.1.2` |
| **Target Architecture** | x64 (AMD64) |
| **Installer Type** | NSIS (Nullsoft Scriptable Install System) |

---

## 2. Bundled Binary Payloads

| Payload | Path in Resources | Size | Status |
|---|---|---|---|
| **Static FFmpeg** | `resources/ffmpeg.exe` | 101,457,920 bytes | Verified static build |
| **posEye Orchestrator** | `resources/posEye.Orchestrator.exe` | 82,354,302 bytes | Verified standalone PyInstaller binary |
| **posEye Desktop UI** | `resources/app.asar` | Electron bundle | React 18 + Three.js 0.169.0 production bundle |

---

## 3. Verified Safety Controls

1. **Zip-Slip Protection:** Path normalization and prefix checking enforced via `path.resolve().relative_to(dest_dir.resolve())`.
2. **Decompression Limits:** Maximum 50,000 files and 10 GB uncompressed limit.
3. **HTTP 409 Conflict:** Deletion of active jobs rejected with HTTP 409.
4. **Terminal State Locking:** Once in `ready`, `error`, `cancelled`, or `interrupted`, a job's stage cannot be overwritten by background worker threads.
5. **Drawing Buffer Preservation:** WebGLRenderer configured with `preserveDrawingBuffer: true` for valid screenshot export.
6. **Resource Disposal:** Three.js scene geometries and textures cleanly disposed upon unmount to prevent GPU leaks.

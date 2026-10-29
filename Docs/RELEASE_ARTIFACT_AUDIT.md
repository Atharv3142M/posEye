# Release Artifact Audit Report

**Date:** 2026-10-29  
**Auditor:** posEye Lead Engineer  
**Artifact Inspected:** `apps/desktop/release/posEye Setup 0.1.0.exe`  
**Execution Policy:** Static inspection only (non-executing static analysis via PE header inspection and 7-Zip archive extraction check)

---

## 1. Artifact Identification & Cryptographic Fingerprint

| Attribute | Value |
|---|---|
| **File Path** | `apps/desktop/release/posEye Setup 0.1.0.exe` |
| **File Size** | 192,001,264 bytes (183.11 MB) |
| **SHA-256 Hash** | `A2FA62C4485EB2EBC3392E65C427ED63D6EF375C4DC9CAF013976CB1525BED55` |
| **Executable Type** | PE32+ (x86-64 GUI executable installer), NSIS (Nullsoft Scriptable Install System v3.0.4.1) |
| **Subsystem** | Windows GUI |
| **Architecture** | x64 (64-bit Intel/AMD) |

---

## 2. PE Metadata & Digital Signature

| Header Field | Value |
|---|---|
| **ProductName** | `posEye` |
| **ProductVersion** | `0.1.0` |
| **FileVersion** | `0.1.0.0` |
| **FileDescription** | `posEye - Single-Pass Drone Video to Accurate 3D Model Generation System` |
| **LegalCopyright** | `Copyright © 2026 posEye` |
| **Digital Signature** | None (`Status: NotSigned`, self-contained unpackaged code signing omitted in dev build) |

---

## 3. Inventory of Embedded Payload (Static Archive Analysis)

Analysis performed using static 7-Zip archive listing (`7za l`):
- **Total Compressed Size:** 191,408,960 bytes (182.54 MB)
- **Total Uncompressed Content:** 483,479,638 bytes (461.08 MB)
- **Total File Count:** 75 files, 2 directories

### Key Component Inventory:
| Payload Item | Size (Uncompressed) | Size (Compressed) | Verified Present | Notes |
|---|---|---|---|---|
| `posEye.exe` | 186,328,576 B | 55,839,101 B | ✅ Yes | Electron 32.3.3 main executable |
| `resources\app.asar` | 21,995,543 B | 3,306,887 B | ✅ Yes | Bundled React 18 UI, Three.js viewer, `main.cjs`, `preload.cjs` |
| `resources\ffmpeg.exe` | 101,457,920 B | 26,924,115 B | ✅ Yes | Static FFmpeg binary (101MB) |
| `resources\orchestrator.exe` | 82,343,553 B | 81,676,082 B | ✅ Yes | Standalone PyInstaller binary of Python FastAPI backend |
| `resources\elevate.exe` | 107,520 B | 49,095 B | ✅ Yes | Electron-builder UAC elevation helper |
| `resources.pak` | 5,630,755 B | 5,575,389 B | ✅ Yes | Chromium UI resource pack |
| `locales\*.pak` | ~15 MB | ~3 MB | ✅ Yes | Multi-language Chromium locale resources |
| `nodeodm.tar` | 0 B | 0 B | ❌ Missing | Docker NodeODM image NOT embedded in this NSIS package |
| `Docker Desktop Installer.exe` | 0 B | 0 B | ❌ Missing | Docker installer NOT embedded in this NSIS package |

---

## 4. Discrepancies & Packaging Architecture Observations

1. **Dual Installer Path Discrepancy**:
   - `apps/desktop/package.json` configures an **Electron Builder NSIS installer** (`posEye Setup 0.1.0.exe`). It bundles `posEye.exe`, `app.asar`, `ffmpeg.exe`, and `orchestrator.exe`.
   - `installer/posEye.iss` (and `DigitalTwin.iss`) configures an **Inno Setup wrapper** designed to package `win-unpacked`, `nodeodm.tar`, and `Docker Desktop Installer.exe`.
   - **Finding**: The supplied artifact `posEye Setup 0.1.0.exe` is the **Electron Builder NSIS installer**. It provides zero-dependency execution for the desktop shell, ffmpeg, and the orchestrator API, but relies on an existing or managed Docker Desktop instance for NodeODM.

2. **Offline Provisioning Boundary**:
   - NodeODM Docker image (`opendronemap/nodeodm:latest`) requires ~1.5 GB compressed (`nodeodm.tar`).
   - If `nodeodm.tar` is not in `third_party/`, the application expects Docker Desktop to be running and pulls or connects to local NodeODM container on `localhost:3000`.

3. **Code Signing**:
   - The executable is not code-signed. On fresh Windows 10/11 machines, Windows SmartScreen will display an "Unknown Publisher" warning unless signed or run via "More Info -> Run anyway".

---

## 5. Unverified Items from Static Inspection

- Dynamic runtime interaction with Docker daemon (requires live Docker engine).
- GPU acceleration detection in specific hardware sandbox environments.
- Metric scaling precision under real drone flight GPS telemetry (addressed in Phase 5).


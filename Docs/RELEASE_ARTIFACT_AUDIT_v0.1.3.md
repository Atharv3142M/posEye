# posEye v0.1.3 Release Artifact Audit

**Audit Date:** November 1, 2026  
**Audited Artifact:** `posEye.Setup.0.1.3.exe`  
**Target Architecture:** Windows 10/11 x64  
**Packaging Standard:** Electron Builder NSIS installer with bundled runtime assets

---

## 1. Artifact Verification

| Property | Value |
|---|---|
| **Filename** | `posEye.Setup.0.1.3.exe` |
| **Size** | 192,072,051 bytes (183.17 MB) |
| **SHA-256 Checksum** | `641B486B184AED820E27B4614A210141742A7CD4266A703A1B0E862D1C06033B` |
| **Package Version** | `0.1.3` |
| **Target Architecture** | x64 (AMD64) |
| **Installer Type** | NSIS (Nullsoft Scriptable Install System) |

---

## 2. Bundled Binary Payloads

| Payload | Path in Resources | Size | Status |
|---|---|---|---|
| **Static FFmpeg** | `resources/ffmpeg.exe` | 101,457,920 bytes | Verified static build |
| **posEye Orchestrator** | `resources/posEye.Orchestrator.exe` | 82,372,757 bytes | Verified standalone PyInstaller binary with Windows version resource `0.1.3.0` |
| **Legacy Duplicate Binary** | `resources/orchestrator.exe` | **0 bytes (Removed)** | Eliminated redundant 82MB payload, reducing installer size by ~81 MB |
| **posEye Desktop UI** | `resources/app.asar` | Electron bundle | React 18 + Three.js 0.169.0 production bundle with API token auth |

---

## 3. Verified Safety Controls & Architectural Hardening

1. **State Machine & Terminal Immutability:** Strict directed transition graph enforced with thread locks. Terminal states (`ready`, `cancelled`, `error`, `interrupted`) are permanently immutable.
2. **Worker Tracking & Cancellation Safety:** Cancellation initiates `cancellation_requested` and waits for worker threads to terminate. Active workers prevent workspace deletion (`HTTP 409 Conflict`).
3. **Subprocess Management:** Blocking `subprocess.run()` replaced with managed `subprocess.Popen` in frame extraction and shell calls, ensuring prompt termination, graceful shutdown (2s timeout), and force-kill fallback without orphaned processes.
4. **Local API Authentication & Security:** Dynamic per-session secret token (`DT_API_TOKEN`) required for all HTTP and WebSocket connections. Wildcard CORS removed.
5. **Geospatial & Telemetry Integrity:** Relative altitude is strictly separated and never promoted to absolute altitude. EXIF `GPSAltitudeRef` honors sea-level reference (0 = above, 1 = below). SRT telemetry parsing rejects coordinates out of physical bounds and enforces 1.5s time tolerance.
6. **Model Validation & Zip Slip Mitigation:** GLB models validated for binary headers, JSON chunks, and non-empty finite vertex bounds before being marked `ready`. Zip extraction guards reject directory traversal, drive letters, absolute/UNC paths, symlinks, encrypted archives, and excessive compression ratios.
7. **External Container Lifecycle:** Desktop application quit no longer halts external user Docker containers.
8. **Dependency Hardening:** Resolved critical vulnerabilities via package overrides (`tar`, `builder-util-runtime`), leaving 0 critical npm vulnerabilities.

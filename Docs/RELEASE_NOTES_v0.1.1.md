# posEye v0.1.1 — Viewer, Progress and Diagnostics Fixes

**Release Date:** October 31, 2026  
**Release Tag:** `v0.1.1`  
**Target Platform:** Windows 10 / 11 (64-bit, x64)  
**Distribution Artifact:** `posEye.Setup.0.1.1.exe`  
**Release Status:** **Pre-release / Developer Preview**

---

## 1. Executive Summary

**posEye v0.1.1** is a patch pre-release delivering critical production fixes, photogrammetry pipeline robustness improvements, and a WebODM-inspired user experience overhaul. This release addresses UI state discrepancies, 3D viewport coordinate precision, real-time reconstruction stage tracking, local timezone synchronization, and hardware diagnostics.

All improvements have been integrated into the bundled desktop frontend and newly recompiled standalone `orchestrator.exe` backend binary.

---

## 2. Key Improvements & Fixes in v0.1.1

### 2.1 Unified Service Health Contract & Honest Status Reporting
- **Issue:** The UI sidebar previously displayed ambiguous green status dots even when Docker or NodeODM were stopped or unreachable.
- **Resolution:** Established a unified service state contract across `/health`, `/system/status`, and desktop UI hooks. The sidebar now displays explicit text badges (`Running`, `Connected`, `Stopped`, `Offline`, `Missing`, `Checking`) with contextual color coding and actionable troubleshooting tooltips guiding users to launch Docker Desktop or start NodeODM.

### 2.2 Timezone-Aware Log Synchronization (5h30m Offset Fix)
- **Issue:** Frontend log panels previously sliced raw UTC strings (`e.ts.slice(11, 19)`), rendering timestamps 5 hours and 30 minutes behind local Indian Standard Time (IST).
- **Resolution:** Implemented centralized `formatLocalTime(isoStr)` and `formatLocalDateTime(isoStr)` in the UI layer. All live log streams and historical events now accurately display in the operator's local system timezone.

### 2.3 ODM Reconstruction Stage Tracking & Log Deduplication
- **Issue:** NodeODM polling previously flooded the live log and WebSocket event stream with repetitive `reconstructing Reconstructing` messages every 1.5 seconds.
- **Resolution:** Added `parse_odm_phase()` to parse and display genuine photogrammetry stages (OpenSfM camera alignment, feature extraction, feature matching, dense point cloud generation via OpenMVS, 3D surface meshing, texture mapping, and orthophoto generation). Suppressed duplicate consecutive heartbeat events across the orchestrator job store and persistence layers. Added a live elapsed timer (`MM:SS`) and expandable diagnostic console in the processing view.

### 2.4 3D Viewer Pipeline, Extreme Coordinate Centering & Robust State Handling
- **Issue:** Georeferenced models with large coordinate offsets (e.g. UTM coordinates) suffered from floating-point depth buffer jitter and camera clipping. In addition, load failures left metadata stuck on `Loading...`.
- **Resolution:**
  - `ThreeViewer.tsx` now computes original bounding boxes and centers geometry at `(0, 0, 0)` during scene ingestion, eliminating depth-fighting and jitter.
  - Retained `modelOffset` so cursor hover displays true geospatial coordinates.
  - Integrated explicit viewer lifecycle states (`idle`, `loading`, `ready`, `error`, `no_model`) with error messages and retry controls.
  - Direct vertex and face counts computed accurately from `BufferGeometry` attributes upon load.

### 2.5 Interactive Measurement Tool & Geospatial Transparency
- **Issue:** Distance measurement lacked surface cursor feedback and did not provide clear metric validation disclosures.
- **Resolution:** Enabled dedicated measuring mode with crosshair cursor, 3D surface hover ring marker, point-to-point sphere markers, connecting line, distance calculation, clear button, and `Esc` key shortcut. Measurements explicitly differentiate calibrated meters (`m (approx.)`) from unscaled relative models (`model units (uncalibrated)`).

### 2.6 Camera Reset & Resizable Viewer Layout
- **Issue:** The left inspector panel was hardcoded to a fixed width of 260px, causing text clipping on smaller displays, while camera reset was fragile across re-renders.
- **Resolution:** Implemented a draggable sidebar resizer (`min: 220px`, `max: 550px`), collapse/expand toolbar toggle, independent vertical scrolling, and a unified camera reset bound to both the toolbar button and the `R` keyboard shortcut.

### 2.7 Hardware & GPU Telemetry
- **Issue:** Missing `nvidia-smi` on machines with Intel/AMD GPUs caused errors or reported fake 0% GPU utilization.
- **Resolution:** Added fallback GPU detection via Windows CIM/WMI (`Get-CimInstance Win32_VideoController`), correctly identifying display adapters (e.g. Intel UHD Graphics, AMD Radeon) without fabricating 0% utilization, while clarifying that NodeODM executes in CPU mode unless a CUDA container is explicitly deployed.

---

## 3. Verification & Build Evidence

- **Git Commit:** `5308d2f7bc5f5b6b69dc7ffddf4d056fec837425`
- **Python Test Suite:** 22/22 passed in 9.21s (`pytest apps/pipeline apps/orchestrator -v`)
- **TypeScript Typecheck:** 0 errors (`npx tsc --noEmit`)
- **Frontend Build:** Vite production bundle compiled in 1.94s
- **Standalone Orchestrator:** Freshly compiled `third_party/orchestrator.exe` (82,350,461 bytes)
- **Static FFmpeg:** Bundled `third_party/ffmpeg.exe` (101,457,920 bytes) verified
- **NSIS Installer:** Built `posEye.Setup.0.1.1.exe` (192,049,732 bytes)

---

## 4. Verification Checksum

| File | SHA-256 Digest | Size (Bytes) |
|---|---|---|
| `posEye.Setup.0.1.1.exe` | `677AC389EED44287A35AF572C1D2A69E19F9584CE31E8499081AB5D3434EB0CE` | 192,049,732 |

Verify your downloaded installer via PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 ".\posEye.Setup.0.1.1.exe"
# Expected hash: 677AC389EED44287A35AF572C1D2A69E19F9584CE31E8499081AB5D3434EB0CE
```

---

## 5. System Requirements & Prerequisites

| Component | Requirement |
|---|---|
| **Operating System** | Windows 10 (Build 19041+) or Windows 11 (64-bit x64) |
| **Processor** | Intel Core i5/i7/i9 or AMD Ryzen (hardware virtualization enabled) |
| **Memory (RAM)** | 16 GB minimum (32 GB recommended for photogrammetry) |
| **Storage** | 10 GB free SSD disk space |
| **Docker Desktop** | Docker Desktop with WSL2 backend installed and running |
| **NodeODM Image** | `opendronemap/nodeodm` loaded locally (`docker pull opendronemap/nodeodm`) |

---

## 6. Known Limitations & Unverified Behaviors

1. **Pre-release Status:** posEye v0.1.1 is an active developer preview and should not be considered final production software until end-to-end flight tests and clean-machine verification are complete.
2. **Docker Desktop Dependency:** The installer packages `ffmpeg.exe` and `orchestrator.exe`, but does not bundle Docker Desktop or the ~2 GB `opendronemap/nodeodm` container image. Internet access may be required to download Docker and pull the image before first run.
3. **Geospatial Accuracy:** Distance measurements derived from drone video subtitle GPS streams are subject to consumer GNSS precision (typically 2–5m variance). Survey-grade millimeter accuracy requires Ground Control Points (GCPs).
4. **Code Signing:** The installer executable is not signed with a paid Microsoft EV certificate. Users may need to click "More info" $\rightarrow$ "Run anyway" in Windows SmartScreen.

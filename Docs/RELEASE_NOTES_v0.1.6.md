# posEye v0.1.6 Release Notes — Stabilization & Diagnostics (Pre-release)

**posEye v0.1.6** is an experimental pre-release focusing on engineering stabilization, security hardening, geospatial accuracy integrity, and diagnostics.

> **PRE-RELEASE NOTICE:** This release is explicitly marked as a pre-release candidate for validation and diagnostics. It has not been signed with an Authenticode certificate and contains known operational limits described below.

---

## Implemented in v0.1.6

### 1. Geospatial Accuracy & Residual Integrity (P0)
- **Rejection of Incomplete GCP Residual Records:** The accuracy parser now strictly rejects point records lacking complete $(dx, dy, dz)$ measurements, never substituting zero for missing data.
- **Finite Value Validation:** Enforces that residual coordinate values are finite numbers ($\text{NaN}$ and $\pm\infty$ rejected).
- **Control vs. Checkpoint Role Distinction:** Only points explicitly identified as checkpoints (`is_checkpoint: true` or `role: checkpoint`) are evaluated for checkpoint accuracy. Ambiguous or unknown roles are rejected rather than defaulted to control.
- **Preserved Parse Diagnostics:** Parser errors and malformed records are preserved and exposed in the accuracy dictionary and diagnostics rather than silently swallowed.
- **Missing Checkpoint Differentiation:** The report clearly distinguishes missing checkpoint validation (`checkpointValidation: "none_provided"`) from zero checkpoint error.

### 2. GPU Detection & Verification Hardening (P1)
- **Exact Pinned GPU Image Contract:** Strict image identification requiring exact match with `opendronemap/nodeodm:3.6.2-gpu` (or its repository digest), rejecting arbitrary substrings containing `"gpu"`.
- **Container CUDA Runtime Execution Check:** Docker container CUDA capability requires successful execution of `nvidia-smi -L` inside the container.
- **State Separation:** Discrete separation of:
  - `gpuHardwareDetected`: Host NVIDIA hardware present.
  - `gpuAvailable`: Host driver and SMI operational.
  - `gpuCapability`: Engine capable of launching GPU container.
  - `containerCudaCapable`: Running container with verified CUDA runtime.
  - `gpuProcessingActive`: Confirmed active GPU feature extraction during reconstruction.

### 3. Timestamp Provenance & Telemetry Alignment (P1)
- **Provenance Integrity:** Removed ambiguous `utc_datetime` field. Explicitly reports `report_generation_time`, `video_creation_time`, `srt_telemetry_time`, `capture_start`, and `capture_end`. Missing flight metadata is left as `None` without date fabrication.
- **SRT Pre-flight & Offset Protection:** Telemetry matching avoids arbitrary start-offset back-projections when videos contain pre-flight footage. Extracted frames outside telemetry coverage are rejected as out-of-coverage.

### 4. Process Termination & Network Security Hardening (P1)
- **Safe Stale Process Reclaiming:** Port 8765 reclaim logic inspects process identity via PowerShell/WMI. Only verified posEye orchestrator processes (`posEye.Orchestrator.exe` or `orchestrator.main`) can be terminated. Foreign processes are never killed.
- **Confined Authorization Interceptor:** Loopback authorization injection is strictly confined to `http://127.0.0.1:8765` and `http://localhost:8765` on recognized API path spaces (`/jobs`, `/system`, `/health`, `/docs`, `/openapi.json`). External domains, redirects, and non-loopback ports are excluded.
- **Standardized WebSocket Authentication:** Standardized on documented subprotocol authentication (`poseye-auth.<token>`), eliminating duplicate in-band token handshakes and query-string secrets.

### 5. UI Viewer Domain Clarification
- **Export-Focused Domain Tabs:** Point cloud and orthophoto panels are explicitly designated as "Point Cloud — Export" and "Orthophoto — Export".
- **Roadmap Disclaimer:** Explicitly notifies users that interactive Potree and OpenLayers rendering are unavailable in this version, providing download controls for inspection in external GIS tools.

---

## Automated Validation Summary

- **Python Tests:** 72 passed, 0 failed, 1 warning (deprecation).
- **Desktop Security & Contract Tests:** 17 passed, 0 failed.
- **TypeScript Typecheck:** Clean (0 errors).
- **Frontend Production Build:** Successful.
- **Electron NSIS Packaging:** Successfully produced `posEye.Setup.0.1.6.exe` (192,389,468 bytes).

---

## Not Validated

The following operational validations were **not performed** for this build:
- **Clean-Machine Installation:** The installer was not executed on a pristine Windows VM without development tools.
- **Full Drone Reconstruction:** End-to-end photogrammetric reconstruction from flight video was not run during this release cycle.
- **Live CUDA GPU Acceleration:** GPU feature extraction acceleration was not confirmed in live NodeODM log outputs.
- **Potree / OpenLayers In-App Rendering:** Dense point cloud and 2D orthophoto rendering engines are not implemented in the desktop shell.

---

## Known Limitations

- **Unsigned Windows Installer:** The installer is unsigned. Windows SmartScreen will display an Unknown Publisher prompt. Click "More info" -> "Run anyway" to install.
- **Docker & GPU Storage:** Running NodeODM with GPU support requires downloading `opendronemap/nodeodm:3.6.2-gpu` (~12 GB uncompressed).
- **Process Port Conflicts:** If port 8765 is occupied by an external application, posEye will refuse to terminate it and require freeing the port or setting `DT_PORT`.

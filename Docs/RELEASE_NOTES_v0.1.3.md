# posEye v0.1.3 — Corrective Engineering, Pipeline Reliability & Security Hardening

**Release Date:** November 1, 2026  
**Release Tag:** `v0.1.3`  
**Target Platform:** Windows 10 / 11 (64-bit, x64)  
**Distribution Artifact:** `posEye.Setup.0.1.3.exe`  
**Release Status:** **Pre-release / Hardened Release Candidate**

---

## 1. Executive Summary

**posEye v0.1.3** is a critical corrective engineering and security hardening release. It addresses defects, race conditions, geospatial inaccuracy risks, and unmanaged subprocess lifecycles identified across the pipeline, orchestrator, and desktop layers:

1. **Fixed Broken Desktop CI & Stale Typecheck References:** Repaired stale `georef` identifier in `Viewer.tsx`, restoring clean TypeScript compilation and automated desktop packaging in CI.
2. **Deterministic Job State Machine & Cancellation Safety:** Implemented a formal thread-safe state transition graph with strictly immutable terminal states (`ready`, `cancelled`, `error`, `interrupted`), active worker process tracking, monotonic progress enforcement, and race-free job deletion with HTTP 409 conflict checks.
3. **Subprocess Lifecycle & Responsive Cancellation:** Replaced blocking subprocesses with managed `subprocess.Popen` wrappers featuring cancellation callbacks, graceful termination windows, force-kill fallbacks, and workspace cleanup to prevent orphaned FFmpeg processes.
4. **Geospatial & Telemetry Accuracy:** Eliminated the critical relative-to-absolute altitude promotion fallback in SRT telemetry extraction. Configured proper EXIF `GPSAltitudeRef` flags, regex word boundary matching, and boundary validation.
5. **Payload Optimization & Branded Binary Packaging:** Removed the legacy duplicate 82MB `orchestrator.exe` binary from installer payloads, reducing installer size from ~273MB to ~192MB, and embedded official Windows version metadata (`0.1.3.0`) into `posEye.Orchestrator.exe`.
6. **Local API Security & Electron Hardening:** Bound orchestrator communication to a dynamic per-session bearer token (`DT_API_TOKEN`) across HTTP and WebSocket channels, removed wildcard CORS, restricted Electron protocol navigation, and eliminated external Docker container shutdown on quit.
7. **Comprehensive GLB Validation & Zip-Slip Protection:** Enforced deep GLB model inspection (magic header, JSON chunk parsing, finite bounds, mesh topology) and zip extraction hardening against traversal, drive letters, UNC paths, symlinks, encrypted entries, and zip bombs.
8. **Dependency Security:** Eliminated all critical npm vulnerabilities through explicit overrides (`tar: ^7.5.22`, `builder-util-runtime: ^9.7.0`).

---

## 2. Detailed Changes by Subsystem

### 2.1 State Machine & Process Management (`apps/orchestrator`)
- **Strict State Transitions:** Defined `VALID_TRANSITIONS` and `LIFECYCLE_ORDER`. Terminal states cannot be replaced by any other state. Duplicate events are silently discarded while preserving genuine errors.
- **Worker Registry & Cancellation:** Added thread-safe worker execution registry (`_workers`). When cancellation is requested on an active worker, state transitions to `cancellation_requested` until the worker gracefully exits and sets `cancelled`.
- **Atomic Job Persistence:** Added atomic metadata serialization (`job.json.tmp` -> `os.replace` to `job.json`) with georeferencing metadata, extraction stats, and model properties.
- **Atomic Progress Updates:** Enforced monotonic progression (`percent` never regresses).
- **Deletion Safety:** `DELETE /jobs/{job_id}` returns `HTTP 409 Conflict` if the job is active or in cancellation transit.

### 2.2 Pipeline & Geospatial Engineering (`apps/pipeline`)
- **SRT Telemetry Parsing:** Added word boundary anchors (`\b`) to regex patterns to prevent `[rel_alt: ...]` from matching absolute altitude patterns. Removed fallback promoting relative altitude into absolute altitude.
- **EXIF GPS Altitude:** Relative altitude is never written to EXIF `GPSAltitude`. EXIF `GPSAltitudeRef` correctly encodes 0 for above sea level and 1 for below sea level.
- **SRT Interpolation Safety:** Telemetry matching tracks match statistics (matched frames, coverage ratio, gaps) and strictly enforces maximum time delta tolerance (1.5s).
- **Subprocess Cancellation:** Replaced blocking `subprocess.run()` in `extract_frames()` with managed `subprocess.Popen`, regularly checking `should_stop()` callback, performing graceful termination and cleanup upon cancellation.

### 2.3 3D Model Validation & Output Processing (`apps/orchestrator`)
- **GLB Model Validation (`validate_glb`):** Verifies binary glTF magic header (`0x46546C67`), JSON chunk formatting, mesh presence, non-empty vertex buffers, finite bounding boxes, and detects missing textures.
- **Archive Extraction Hardening (`safe_extract_zip`):** Validates normalized path boundaries (`relative_to`), rejects drive letters, UNC paths, absolute paths, directory traversals, symlinks, encrypted entries, and zip bombs (>50k files, >10GB uncompressed, >100:1 compression ratio).

### 2.4 Desktop UI & Security (`apps/desktop`)
- **TypeScript Fix:** Replaced stale `georef` reference in `Viewer.tsx` with `isGeoreferenced`, fixing compilation failure in desktop CI.
- **Viewer Model Verification:** Viewer validates geometry bounds, non-empty vertices, and triangle counts before declaring models ready.
- **Local API Security:** Electron generates a secure session token passed via `DT_API_TOKEN` environment variable and client request headers/WebSockets.
- **External Docker Protection:** Electron quit lifecycle stops managed helper processes without killing external Docker containers.
- **Settings Version Update:** Updated Settings page about card to display `posEye 0.1.3`.

---

## 3. Verification & Build Evidence

| Verification Step | Result | Details |
|---|---|---|
| **Python Automated Tests** | **43 / 43 Passed** | `pytest apps/pipeline apps/orchestrator -v` (16.14s) |
| **TypeScript Typecheck** | **0 Errors** | `npx tsc --noEmit` in `apps/desktop` |
| **Vite Production Build** | **Built Cleanly** | `npm run build` in `apps/desktop` (1.94s) |
| **Orchestrator Standalone Build** | **Built & Verified** | `posEye.Orchestrator.exe` (82,372,757 bytes) with version resource `0.1.3.0` |
| **NSIS Production Installer** | **Built & Verified** | `posEye.Setup.0.1.3.exe` (192,072,051 bytes, SHA-256 verified) |
| **Duplicate Binary Check** | **Clean** | Legacy `orchestrator.exe` eliminated from package extraResources |
| **npm Security Audit** | **0 Critical** | Critical vulnerabilities resolved via package overrides |

---

## 4. Release Artifacts

- **Installer:** `apps/desktop/release/posEye.Setup.0.1.3.exe` (and repo root)
- **File Size:** 192,072,051 bytes (183.17 MB)
- **SHA-256 Checksum:** `641B486B184AED820E27B4614A210141742A7CD4266A703A1B0E862D1C06033B`

---

## 5. Security & Accuracy Disclosures

### 5.1 Local API Security Reconciliation
- **CORS Middleware:** Wildcard `*` origin has been completely removed. `allow_origins` is explicitly restricted to localhost development and desktop renderer origins (`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3001`, `http://127.0.0.1:3001`).
- **Token Authentication:** Orchestrator HTTP endpoints and WebSocket subscriptions require the session secret passed via `DT_API_TOKEN` (`Authorization: Bearer <token>` or `?token=<token>`).
- **Process Management:** Subprocess execution is managed with bounded termination windows and force-kill fallbacks.

### 5.2 Geospatial Accuracy & Verification Gates
- **Consumer GNSS Uncertainty:** Reconstructions relying on consumer drone GPS telemetry inherit the underlying GNSS positioning uncertainty (typically cited as $\approx \pm 2 - 5\text{ m}$ horizontal variance without differential corrections). This is an external sensor characteristic and not a measured posEye reconstruction benchmark.
- **Planned Ground Control Points (GCP):** Planned GCP text import enables improved georeferencing and accuracy validation; achieved accuracy must be established through independent surveyed checkpoints.
- **Release Verification Boundary:** Local build and unit/integration test suites (43 passed) verify implementation correctness, but do not replace independent clean-machine Windows VM installation verification or live flight reconstruction benchmarks.

# posEye — Testing & Quality Assurance Guide

This document details the automated test suites, manual verification workflows, and release gates for **posEye**.

---

## 1. Automated Test Suites

### 1.1 Python Backend & Pipeline Tests (Pytest)

The Python test suite covers:
- Frame extraction, synthetic video parsing, and OpenCV decoding.
- Laplacian variance blur scoring and 64-bit difference hashing (`dHash`) deduplication.
- Subtitle telemetry parsing (DJI/Autel format matching) and EXIF GPS metadata injection via Piexif.
- YOLOv8 moving-object masking with graceful degradation when optional models are missing.
- FastAPI REST endpoints (`/jobs`, `/probe/video`, `/health`, `/logs`).
- Trimesh OBJ-to-GLB conversion and glTF structure validation.
- NodeODM client multi-stage task lifecycle (`init`, `upload`, `commit`), fallback behavior, MIME detection, output line polling, and cancellation.

**Command:**
```powershell
.\.venv\Scripts\python.exe -m pytest apps\pipeline apps\orchestrator -v --durations=10
```

**Expected Outcome:**
- 22 passed tests in $<10$ seconds.
- Zero failures, zero skips.

### 1.2 Frontend TypeScript Typecheck

Validates strict TypeScript types across React components, Three.js 3D viewport, and Vite assets.

**Command:**
```powershell
cd apps\desktop
npx tsc --noEmit
```

**Expected Outcome:**
- Exit code 0 with zero type errors.

### 1.3 React / Vite Bundle Compilation

Validates bundle compilation, asset hashing, and minification.

**Command:**
```powershell
cd apps\desktop
npm run build
```

**Expected Outcome:**
- Output generated in `dist/` in $<3$ seconds.

### 1.4 Electron Packaging Verification

Verifies Electron Builder packaging and native module bindings (`win-unpacked` portable mode).

**Command:**
```powershell
cd apps\desktop
npx electron-builder --win --dir
```

**Expected Outcome:**
- Output generated in `apps\desktop\release\win-unpacked\posEye.exe`.

---

## 2. Test Fixtures & Synthetic Data

posEye uses deterministic, in-code test fixtures to ensure CI independence from external media assets:
- **`apps/pipeline/tests/fixtures/make_fixtures.py`**:
  - Dynamically synthesizes `test_flight.mp4` (a 3-second 640x360 video containing moving geometric figures and synthetic frame numbers) using OpenCV.
  - Dynamically synthesizes `test_flight.SRT` with time-correlated GPS coordinates (latitude 28.6139°N, longitude 77.2090°E, altitude 80-120m).
- **`apps/orchestrator/tests/test_nodeodm.py`**:
  - Employs an HTTP transport mock (`_MockTransport`) that intercepts `httpx.Client` calls to simulate NodeODM's complete REST lifecycle and live OpenDroneMap console output streams without requiring a running Docker daemon.

---

## 3. Continuous Integration (CI) Verification

All pull requests and pushes to `main` execute via GitHub Actions on Windows runners (`.github/workflows/ci.yml`):
- Provisions 64-bit static FFmpeg build via Chocolatey.
- Verifies `ffmpeg -version` in a preflight diagnostic step.
- Runs the 22-test Pytest suite.
- Runs `npm ci`, `tsc --noEmit`, `vite build`, and `electron-builder --win --dir`.

---

## 4. Release-Gate Verification Status

Prior to designating any build as a production-grade release, the following validation gates are evaluated:

| Gate | Status in v0.1.1 | Requirement for Production Release |
| :--- | :--- | :--- |
| **Automated Tests (22/22)** | **VERIFIED** | 100% pass on both local host and GitHub Actions Windows runners. |
| **Electron Packaging** | **VERIFIED** | Successfully generates NSIS installer and unpacked portable executable. |
| **Clean-Machine VM Validation** | **NOT VERIFIED** | Must be installed and launched on a pristine Windows 10/11 VM without Python, Node.js, or Git installed. |
| **End-to-End Drone Reconstruction** | **PARTIALLY VERIFIED** | Must be verified against a real 1080p/4K drone flight video and matching `.SRT` with multi-hour NodeODM processing. |
| **Geospatial Metric Accuracy** | **NOT VERIFIED** | Distance measurements in the 3D viewer must be ground-truthed against surveyed Ground Control Points (GCPs). |


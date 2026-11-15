# posEye — Testing & Quality Assurance Guide

This document details the automated test suites, manual verification workflows, test fixtures, and quality assurance gates for **posEye** (v0.1.9).

---

## 1. Automated Test Suites

### 1.1 Python Backend & Pipeline Tests (Pytest)

The Python test suite covers:
- **Frame Extraction & Probing:** Video stream demuxing, synthetic video parsing, OpenCV decoding, and duration calculation.
- **Image Quality Filtering:** Laplacian variance blur scoring and 64-bit difference hashing (`dHash`) deduplication.
- **Telemetry Parsing & Geotagging:** Subtitle telemetry parsing (DJI parenthesized, CSV, and key-value formats) and WGS 84 EXIF GPS metadata injection via Piexif.
- **Dynamic Masking:** YOLOv8 moving-object segmentation with graceful degradation when optional models are missing.
- **Accuracy Engine:** Strict parsing of OpenDroneMap residual statistics, finite coordinate validation, and separate evaluation of control points versus checkpoints.
- **FastAPI REST Endpoints:** Job lifecycle (`/jobs`), health check contracts (`/health`, `/system/status`), diagnostics (`/system/diagnostics`), and log retrieval (`/logs`).
- **3D Mesh Conversion:** Trimesh OBJ-to-GLB conversion, deep binary GLB structure validation, non-empty vertex buffer checks, and texture completeness.
- **State Machine Lifecycle:** Terminal immutability (`ready`, `error`, `cancelled`, `interrupted`), monotonic progress enforcement, and thread-safe cancellation.
- **Archive Security (Zip-Slip):** Canonical path validation preventing directory traversal, absolute paths, drive letters, UNC paths, and zip bombs.
- **GPU Hardware Subsystem:** NVIDIA SMI multi-path discovery, exact pinned image checking (`opendronemap/nodeodm:3.6.2-gpu`), container CUDA execution checks, and graceful CPU fallback.
- **Source Encoding Regression Gate (`test_source_encoding.py`):** Enforces that all Python files are clean UTF-8 without NUL bytes or UTF-16 BOMs.

**Command:**
```powershell
.\.venv\Scripts\python.exe -m pytest apps\pipeline apps\orchestrator -v --durations=10
```

**Expected Outcome:**
- **83 passed tests** in $< 25$ seconds.
- Zero failures, zero skips.

---

### 1.2 Desktop Electron & Security Tests (Node.js Test Runner)

The desktop test suite (`apps/desktop/tests/`) verifies IPC security, custom protocol sandboxing, offline Draco decoding, and container execution planning:

- **`auth_lifecycle.test.cjs`:** Synchronous preload token injection, process-verified port reclaiming, and WebSocket subprotocol authentication.
- **`draco_decoder.test.cjs`:** Offline WebAssembly decoder resolution, nested route path remapping, and real-world Draco-compressed binary glTF fixture (`box_draco.glb`) validation.
- **`gpu_detection.test.cjs`:** GPU hardware telemetry discovery, capability reporting, and truthful status contracts.
- **`ipc_security.test.cjs`:** Sender verification (main frame only, origin isolation) and strict filesystem path confinement.
- **`nodeodm_plan.test.cjs`:** Dynamic hardware-aware container resource sizing, CPU core bounding, memory limit calculations, and GPU SIFT parameter assignment.
- **`nodeodm_provision.test.cjs`:** Auto-pull image verification, container reuse, and concurrency locks.
- **`protocol_security.test.cjs`:** Privileged custom scheme (`poseye://app`) security, canonical path resolution, and static-asset SPA 404 guards.
- **`viewer_lifecycle.test.cjs`:** 7-stage loading lifecycle (`initializing` -> `fetching` -> `parsing` -> `uploading` -> `framing` -> `rendering` -> `loaded`), 45-second timeout guard, and reload loop elimination.

**Command:**
```powershell
cd apps\desktop
npm test
```

**Expected Outcome:**
- **35 passed tests** in $< 10$ seconds.
- Zero failures.

---

### 1.3 TypeScript Strict Typecheck

Validates strict TypeScript types across React components, Three.js 3D viewport, Zustand stores, and Vite assets.

**Command:**
```powershell
cd apps\desktop
npx tsc --noEmit
```

**Expected Outcome:**
- Exit code 0 with zero type errors.

---

### 1.4 Frontend Vite Production Build

Validates production bundle compilation, asset hashing, and minification.

**Command:**
```powershell
cd apps\desktop
npm run build
```

**Expected Outcome:**
- Output generated in `dist/` with clean WebAssembly asset copying (`dist/draco/`).

---

### 1.5 Desktop Application Packaging

Verifies Electron Builder packaging and NSIS installer generation.

**Command:**
```powershell
cd apps\desktop
npm run pack  # Unpacked directory distribution
npm run dist  # Packaged NSIS executable (posEye.Setup.0.1.9.exe)
```

---

## 2. Test Fixtures & Deterministic Mocks

posEye relies on deterministic, in-repo test fixtures to ensure CI independence from external media assets:
- **`apps/pipeline/tests/fixtures/make_fixtures.py`**:
  - Synthesizes `test_flight.mp4` (synthetic 640x360 video with moving geometries and frame counters) using OpenCV.
  - Synthesizes `test_flight.SRT` with time-correlated GPS coordinates (latitude 28.6139°N, longitude 77.2090°E, altitude 80-120m).
- **`apps/desktop/tests/fixtures/box_draco.glb`**:
  - Deterministic Draco-compressed glTF binary used to validate runtime decompression in automated tests.
- **`apps/orchestrator/tests/test_nodeodm.py`**:
  - Employs an HTTP transport mock (`_MockTransport`) that intercepts `httpx.Client` calls to simulate NodeODM's complete REST lifecycle and live OpenDroneMap console output streams without requiring a running Docker daemon.

---

## 3. Continuous Integration (CI) Matrix

Every pull request and commit to `main` executes on GitHub Actions (`.github/workflows/ci.yml`):
- Provisions 64-bit static FFmpeg build.
- Executes the full 83-test Python suite.
- Executes the full 35-test Desktop Node.js test suite.
- Runs `npx tsc --noEmit` to verify type safety.
- Runs `npm run build` and `electron-builder --win` to verify application packaging.

---

## 4. Release-Gate Verification Status

| Gate | Status in v0.1.9 | Requirement for Production Release |
| :--- | :---: | :--- |
| **Python Automated Tests (83/83)** | **VERIFIED** | 100% pass on local Windows host and CI runners. |
| **Desktop Automated Tests (35/35)** | **VERIFIED** | 100% pass on local Windows host and CI runners. |
| **TypeScript Strict Compilation** | **VERIFIED** | 0 errors (`npx tsc --noEmit`). |
| **Offline Draco Decompression** | **VERIFIED** | Validated with real-world compressed models and test fixtures. |
| **Container Resource Planning** | **VERIFIED** | Edge-case RAM limits and CPU core allocations bounded. |
| **Coordinate Transformation** | **VERIFIED** | Ground plane horizontally leveled; elevation aligned with $+Y$. |
| **NSIS Installer Packaging** | **VERIFIED** | `posEye.Setup.0.1.9.exe` produced with version metadata. |
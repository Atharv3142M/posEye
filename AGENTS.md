# posEye Project Reference & Architecture

## Project Purpose
posEye ("Single-Pass Drone Video to Accurate 3D Model Generation System") is a Windows desktop application that converts drone flight videos into georeferenced, interactive 3D models. The system automates the entire pipeline from video input to 3D model output with zero manual intermediate steps and no cloud dependencies. Theme: Drone/Robotics Photogrammetry.

## Official MVP Requirements
From [Docs/MVP_Spec.md](Docs/MVP_Spec.md):
1. **Fully automated pipeline**: video in → 3D model out, zero manual intermediate steps
2. **Zero manual dependency installation**: ffmpeg, Docker, NodeODM container lifecycle managed
3. **Georeferenced, metrically accurate output**: GPS telemetry from SRT parsed and injected into frame EXIF
4. **Interactive 3D viewer**: orbit/pan/zoom, camera reset, vertex/triangle stats, point-to-point measurement
5. **Stage-aware progress HUD**: live timeline reflecting 11 distinct pipeline stages
6. **Packaged Windows application**: Electron + NSIS installer + bundled static FFmpeg and standalone Orchestrator API
7. **Fully offline/local processing**: all imagery and computation stay local to the host machine

## Architecture Map

```
Drone Video + SRT telemetry
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 1 — Frame Extraction  (apps/pipeline)            │
│  ffmpeg extract → Laplacian blur filter → dHash dedup   │
│  → SRT parse → piexif EXIF GPS → optional YOLOv8n mask │
└─────────────────────────────┬───────────────────────────┘
                              │ geotagged JPEG folder
                              ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 2 — NodeODM (Docker container: opendronemap/     │
│  nodeodm on port 3000)                                  │
│  zip upload → POST /task/new → poll /task/{id}/info     │
│  → download all.zip                                     │
└─────────────────────────────┬───────────────────────────┘
                              │ all.zip (OBJ mesh + LAZ + GeoTIFF)
                              ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 3 — Post-processing  (apps/orchestrator)         │
│  trimesh OBJ/GLTF → model.glb; expose LAZ+GeoTIFF      │
└─────────────────────────────┬───────────────────────────┘
                              │ model.glb
                              ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 4 — Desktop UI  (apps/desktop)                   │
│  Electron shell → FastAPI spawn → React + Three.js      │
│  GLTFLoader viewer → orbit, distance measure, export    │
└─────────────────────────────────────────────────────────┘

Orchestrator (FastAPI on :8765)
  - POST /jobs, GET /jobs/{id}, WS /jobs/{id}/events
  - runs Stages 1→2→3 sequentially in thread pool
  - emits stage/percent/message events to WebSocket
```

### Component Map
| Component | Path | Technology |
|---|---|---|
| Frame extraction | `apps/pipeline/src/pipeline/` | Python 3.10+, ffmpeg, OpenCV, piexif |
| Orchestrator API | `apps/orchestrator/src/orchestrator/` | Python 3.10+, FastAPI, uvicorn |
| NodeODM client | `apps/orchestrator/src/orchestrator/nodeodm.py` | Python, httpx |
| Mesh converter | `apps/orchestrator/src/orchestrator/convert.py` | Python, trimesh, pygltflib |
| Electron main | `apps/desktop/electron/main.cjs` | Node.js / Electron 32 |
| React UI | `apps/desktop/src/renderer/` | React 18, TypeScript, Three.js |
| 3D viewer | `apps/desktop/src/renderer/components/ThreeViewer.tsx` | Three.js, GLTFLoader, OrbitControls |
| Installer | `installer/posEye.iss` & NSIS | Inno Setup 6 / electron-builder |
| Docker provisioning | `scripts/provision-docker.ps1` | PowerShell |

## Important Directories
- `apps/pipeline/src/pipeline/` — Stage 1: extract.py, filters.py, srt.py, exif.py, masks.py, ffmpeg.py, probe.py
- `apps/orchestrator/src/orchestrator/` — main.py (FastAPI), jobs.py (JobStore), nodeodm.py, convert.py, presets.py, system.py
- `apps/desktop/electron/` — main.cjs (Electron shell, spawns Python API, manages Docker)
- `apps/desktop/src/renderer/` — React pages: Dashboard, NewProject, Processing, ProjectsList, Logs, Settings, Viewer
- `installer/` — posEye.iss, DigitalTwin.iss, README.md
- `scripts/` — setup.ps1, fetch-ffmpeg.ps1, nodeodm-up.ps1, provision-docker.ps1, build-orchestrator.ps1
- `third_party/` — `ffmpeg.exe` (101MB static binary), `orchestrator.exe` (compiled API), `nodeodm.tar`
- `Docs/` — MVP_Spec.md (canonical), MVP-GAP-ANALYSIS.md, CURRENT_STATE.md, DEMO_FLOW.md

## Development & Verification Commands
```powershell
# Setup Python virtualenv and install packages
.\scripts\setup.ps1

# Provision static FFmpeg binary (copies from local environment to third_party/ffmpeg.exe)
.\scripts\fetch-ffmpeg.ps1

# Run Python unit and integration tests (17 passed)
.\.venv\Scripts\python.exe -m pytest apps\pipeline apps\orchestrator -v

# Build standalone orchestrator.exe (PyInstaller)
.\scripts\build-orchestrator.ps1

# Desktop UI build & verification
cd apps\desktop
npm install
npm run build
npm run pack       # Produces release\win-unpacked\posEye.exe and release\posEye Setup 0.1.0.exe

# Run in development mode
npm run dev:electron
```

## Definition of Done (Verified Status)
- [x] Application starts cleanly (Electron launches, loads bundled React app)
- [x] Frontend loads with posEye branding, logo, and responsive photogrammetry layout
- [x] Backend starts and connects to frontend via localhost:8765
- [x] Frontend/backend communication works (live health check for API, Docker, NodeODM, FFmpeg)
- [x] Video browse and drag-and-drop ingestion works
- [x] Video metadata probed (resolution, fps, duration, estimated frames)
- [x] Frame extraction with Laplacian sharpness filtering and dHash deduplication
- [x] SRT telemetry parsed and EXIF GPS tags injected
- [x] Reconstruction pipeline client communicates with NodeODM
- [x] Mesh converted to GLB format and exported
- [x] 3D viewer renders GLB with OrbitControls, DoubleSide materials, camera reset (R)
- [x] Distance measurement tool with georeference status disclaimer
- [x] Stage-aware progress HUD with 11 distinct pipeline stages
- [x] Circular in-memory and file logging accessible via UI (`/logs`)
- [x] Error handling for missing files, unreadable video, port conflicts, cancellation
- [x] Project state persisted to `job.json` and reloadable
- [x] Exports available for GLB, LAZ point clouds, and GeoTIFF orthophotos
- [x] All 17 Python test cases pass cleanly
- [x] Production build and NSIS installer generation succeed


# Ponytail, lazy senior dev mode

You are a lazy senior developer. The best code is the code never written. You solve the whole problem with the least new code. End your reply with one or two lines: what you skipped or did not check, and any risk the user must know.

## Before you write

Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.

## The smallest complete change

Take the first option that fully works:

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.
2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

- Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.
- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.
- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one that is correct on edge cases.
- Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.
- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.

Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.

(Yes, this file also applies to agents working on the ponytail repo itself. Especially to them.)
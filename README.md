# posEye

Windows desktop app: drone video in, georeferenced 3D model out. Processing stays on this machine (NodeODM in Docker). Spec: [Docs/MVP_Spec.md](Docs/MVP_Spec.md). Status: [Docs/IMPLEMENTATION_STATUS.md](Docs/IMPLEMENTATION_STATUS.md). Demo: [Docs/DEMO_FLOW.md](Docs/DEMO_FLOW.md).

## Layout

- `apps/pipeline` — Stage 1: bundled ffmpeg extract, blur/dedup, SRT → EXIF, optional YOLO masks
- `apps/orchestrator` — FastAPI jobs, NodeODM client, mesh → GLB
- `apps/desktop` — Electron + React + Three.js viewer
- `installer` — Inno Setup outer installer (Docker + image load)
- `third_party` — `ffmpeg.exe` and `nodeodm.tar` (gitignored)

## Dev setup

```powershell
scripts\setup.ps1
scripts\fetch-ffmpeg.ps1
scripts\nodeodm-up.ps1
.\.venv\Scripts\python.exe -m pytest apps\pipeline apps\orchestrator
cd apps\desktop
npm ci
npm run build
npm run dev
# or: npm run dev:electron
```

Orchestrator: `http://127.0.0.1:8765`  
NodeODM: `NODEODM_URL` (default `http://127.0.0.1:3000`)

```powershell
.\.venv\Scripts\python.exe -m orchestrator.main
```

CLI extraction without Docker:

```powershell
.\.venv\Scripts\python.exe -m pipeline --video C:\path\flight.mp4 --srt C:\path\flight.SRT --out .jobs\extract
```

Submit an existing still folder to NodeODM:

```powershell
.\.venv\Scripts\python.exe -m orchestrator.nodeodm --images .jobs\extract\frames --out .jobs\odm --preset medium
```

## Job API

- `POST /jobs` `{ "videoPath", "srtPath?", "preset?", "generateMasks?", "fps?", "blurThreshold?" }`
- `POST /probe/video` `{ "videoPath" }`
- `GET /jobs` list
- `GET /jobs/{id}`
- `GET /jobs/{id}/logs` · `/metadata` · `/diagnostics`
- `POST /jobs/{id}/cancel`
- `DELETE /jobs/{id}`
- `WS /jobs/{id}/events`
- `GET /jobs/{id}/assets/{model.glb|model.laz|orthophoto.tif|all.zip}`
- `GET /health` · `GET /system/status`

## Known limits

- Without SRT/EXIF GPS, the model is relative-scale only; distance is shown in model units.
- Area/volume tools are not implemented (need a DEM).
- Until a masked run is used, moving people/vehicles may ghost in the mesh. Enable **Mask moving objects** (YOLOv8n) or treat that as a documented limitation (spec §9).
- Docker WSL2 needs firmware virtualization; the installer can detect this but cannot flip BIOS.

## Clean-machine install

See [installer/README.md](installer/README.md). Hardware virtualization must be enabled in BIOS; the installer detects that case and cannot fix it silently.

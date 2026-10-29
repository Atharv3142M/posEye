# posEye — Implementation status

**Date:** 2026-09-28  
**Product:** posEye · Team ICARUS  
**Spec:** [MVP_Spec.md](MVP_Spec.md)  
**Audit snapshot:** [CURRENT_STATE.md](CURRENT_STATE.md)

## Done (honest)

| Area | Status |
| --- | --- |
| Bundled ffmpeg resolve (no imageio at runtime) | Yes. `pipeline.ffmpeg.resolve_ffmpeg`; `scripts/fetch-ffmpeg.ps1` copies a local `ffmpeg.exe` |
| Frame extract, Laplacian blur, dHash dedup | Yes |
| SRT parse + piexif GPS | Yes when an SRT is supplied |
| Optional YOLOv8n moving-object masks | Yes if `ultralytics` is installed; optional checkbox |
| FastAPI jobs + WebSocket + persist `job.json` | Yes |
| Stages: validating → extracting → filtering → geotagging → masking → uploading → reconstructing → postprocessing → converting → ready / error / cancelled | Pipeline emits the preprocess stages; NodeODM maps reconstructing |
| Probe duration/resolution/FPS | `POST /probe/video` |
| Logs / metadata / diagnostics | `GET /jobs/{id}/logs`, `/metadata`, `/diagnostics` |
| Health ffmpeg + Docker + NodeODM | `GET /health` |
| GPU via nvidia-smi or Unavailable | Never fake 0% when no GPU |
| NodeODM zip upload, poll, download, cancel | Yes |
| Mesh → GLB | trimesh |
| Electron spawn API + NodeODM container wait on `/info` | Yes (`poseye-nodeodm`) |
| Six React pages, HashRouter, ThemeProvider, posEye branding | Yes |
| New project video probe | Yes |
| Processing timeline + extract stats | Yes |
| Viewer: orbit, two-click distance, screenshot | Yes |
| Export GLB always when model exists; LAZ/GeoTIFF only if files exist | Yes |
| Settings FPS/blur sent on `POST /jobs` | Yes |

## Partial / not in MVP UI

| Item | Reality |
| --- | --- |
| Lat/lon readout in viewer | Model XYZ only; GPS is EXIF on frames, not a CRS HUD |
| Orthophoto / point cloud / DEM as 3D layers | Exports if NodeODM produced them; not overlaid in Three.js |
| Area / volume | Copy states not implemented |
| Pause | Not implemented (no fake pause control) |
| Comparison workflow | Not implemented |
| Persistent measurements | Not implemented |
| Packaged Electron + Python layout on a clean VM | Scripts exist; **not proven** on a clean machine |

## Out of scope (do not demo as working)

- Cloud processing
- Tailwind (CSS variables only)
- Runtime ffmpeg download via imageio-ffmpeg
- Volume/polygon tools
- Fake GPU utilization

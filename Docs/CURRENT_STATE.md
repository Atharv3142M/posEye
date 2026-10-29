# posEye — Current State

**Date:** 2026-09-28  
**Product name:** posEye  
**Source of truth:** [MVP_Spec.md](MVP_Spec.md)

## Implemented

- Stage 1: bundled ffmpeg, frame extract, Laplacian blur, dHash dedup, SRT → EXIF, optional YOLOv8n masks, min-frame fail-fast, `POST /probe/video`
- FastAPI: create/list/get/cancel/delete, WebSocket, logs/metadata/diagnostics, GLB/LAZ/GeoTIFF/all.zip (404 if missing), job.json persistence, fps/blur on create
- NodeODM client: zip upload, poll, download, cancel, `NODEODM_URL`
- Mesh → GLB (trimesh)
- Quality presets (fast/balanced/high/ultra)
- Electron: dialogs, spawn FastAPI, start/stop NodeODM (`poseye-nodeodm`), wait on `/info` and `/health`
- React six pages, HashRouter, ThemeProvider, posEye branding, light default
- Viewer: distance + screenshot; honest layer copy; export only existing assets
- pytest for pipeline + API; Vite production build

## Partial

- Viewer georef is a GPS-present flag, not lat/lon/CRS from the mesh
- Orthophoto/LAZ are file exports, not 3D layers
- Installer scripts exist; not verified on a clean VM
- Packaged Electron must still ship Python apps/ with the installer

## Missing (explicit)

- Area/volume measurement and DEM overlay
- Persistent measurements and comparison workflow
- Pause (correctly absent)
- Clean-machine installer proof

## Known limits

- GPU: nvidia-smi or Unavailable — never a fake 0%
- Distance is model units unless GPS EXIF was written
- Masking extra (`ultralytics`)
- Docker WSL2 virtualization cannot be flipped by the app

# posEye — Implementation Status

**Date:** 2026-11-07  
**Product:** posEye (v0.1.6 Pre-release)  
**Spec Reference:** [MVP_Spec.md](MVP_Spec.md)  
**Current Audit:** [CURRENT_STATE.md](CURRENT_STATE.md)

---

## Verified Capabilities (Tested in v0.1.6)

| Subsystem | Architectural Capability | Verified Status |
|---|---|:---:|
| **FFmpeg Extraction** | Static local binary resolution (`third_party/ffmpeg.exe`), subprocess-managed extraction, cancellation kill | **Verified** |
| **Quality Filtering** | OpenCV Laplacian variance sharpness thresholding, 64-bit `dHash` deduplication | **Verified** |
| **Telemetry Parsing** | Multi-format SRT parser (DJI parenthesized, CSV, key-value pairs) with pre-flight offset coverage rejection | **Verified** |
| **EXIF Ingestion** | WGS 84 DMS coordinates, AMSL altitude (`GPSAltitudeRef` 0/1), verified container/cue timestamps without date fabrication | **Verified** |
| **Accuracy Engine** | Rigorous parsing of ODM residuals, non-finite checks, strict rejection of missing measurements, distinct control vs checkpoint evaluation | **Verified** |
| **Dynamic Masking** | Optional YOLOv8n object segmentation generating `_mask.JPG` obstacle masks | **Verified** (when `ultralytics` installed) |
| **State Machine Engine** | Immutable terminal states (`ready`, `error`, `cancelled`, `interrupted`), monotonic progress | **Verified** |
| **Local API Security** | Loopback binding (`127.0.0.1`), session bearer token (`DT_API_TOKEN`), strict origin-isolated CORS, process-verified port reclaim | **Verified** |
| **Engine Orchestration** | Asynchronous NodeODM dispatch, incremental log streaming, photogrammetry phase parsing | **Verified** |
| **Archive Security** | Canonical path validation against directory traversal (Zip-Slip) and decompression bombs | **Verified** |
| **Format Conversion** | Trimesh OBJ to binary GLB (`model.glb`) with deep structural validation and bounding box checks | **Verified** |
| **3D WebGL Viewer** | Three.js viewport, OrbitControls, DoubleSide rendering, origin centering, camera reset (`R`), wireframe toggle | **Verified** |
| **Measurement Tool** | Two-click Euclidean distance tool with surface preview and relative vs metric scale disclosures | **Verified** |
| **Deliverable Exports** | Programmatic navigation-safe download for GLB, LAZ point clouds, GeoTIFF, and PDF quality reports | **Verified** |
| **GPU Detection** | Exact pinned image contract (`opendronemap/nodeodm:3.6.2-gpu`), container CUDA execution verification, honest state separation | **Verified** |
| **Diagnostics System** | First-launch diagnostics with whitelisted safe environment variables and secret redaction | **Verified** |
| **Desktop Packaging** | Standalone `posEye.Orchestrator.exe` with Windows version metadata, packaged NSIS installer (`posEye.Setup.0.1.6.exe`) | **Verified** |

---

## Current Engineering Disclosures & Boundaries

| Capability | Current Architectural Status | Notes |
|---|---|---|
| **Absolute Coordinates HUD** | Local model XYZ centered at origin; global coordinates displayed via stored offset | Full geographic CRS projection HUD planned for post-MVP. |
| **Point Cloud & Orthophoto Viewers** | LAZ and GeoTIFF rasters are available as direct exports from dedicated export panels | In-app interactive Potree and OpenLayers viewers are planned roadmap items, not implemented in this build. |
| **Surface Area & Volume** | Point-to-point Euclidean distance implemented | Volumetric calculations backed by DEM/DTM are slated for v0.2.0. |
| **Ground Control Points (GCP)** | Telemetry GPS bundle adjustment and ODM residual stats parsed with strict validation | Surveyed GCP text import file support planned for v0.2.0. |
| **Clean-Machine Verification** | Build and test suite verified (72/72 Python tests, 17/17 Desktop tests, Vite build, packaged NSIS installer) | Clean-machine Windows VM execution without developer tools remains an active verification gate. |

---

## Explicit Non-Goals (Out of Scope for MVP)

- Multi-drone flight data fusion or distributed cluster processing.
- Real-time video processing during drone flight.
- Remote cloud processing or external telemetry transmission.
- Simulated or fabricated hardware utilization metrics.
- In-place video editing or video color grading.

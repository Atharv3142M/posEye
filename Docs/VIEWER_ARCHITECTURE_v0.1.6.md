# posEye Multi-Viewer Architecture & WebODM Integration Roadmap

**Version:** 0.1.6  
**Status:** Architecture Defined & UI Foundation Laid  
**Reference Implementations:** [WebODM](https://github.com/WebODM/WebODM), [OpenDroneMap (NodeODM)](https://github.com/OpenDroneMap/NodeODM)

---

## 1. Architectural Principle: Domain-Specific Viewers

Modern aerial photogrammetry produces three fundamentally distinct output modalities:
1. **Textured 3D Surface Mesh (`model.glb`):** Continuous triangulated surface with diffuse texture atlas.
2. **Dense Point Cloud (`model.laz` / `model.las`):** Billions of discrete spatial points with RGB and classification attributes.
3. **2D Orthophoto and Digital Elevation Rasters (`orthophoto.tif`, `dsm.tif`, `dtm.tif`):** High-resolution georeferenced raster layers with CRS coordinates.

**Anti-Pattern Avoided:** Forcing all three modalities into a single monolithic Three.js scene causes WebGL memory exhaustion, poor point cloud rendering, projection distortion on map rasters, and instability.

**Solution:** posEye adopts WebODM's proven three-viewer separation:
```
                               ┌────────────────────────────────────────────────┐
                               │             posEye Project Context             │
                               │  (Job UUID, Bounding Box, CRS, Units, GNSS)   │
                               └──────────────────────┬─────────────────────────┘
                                                      │
         ┌────────────────────────────────────────────┼────────────────────────────────────────┐
         │                                            │                                        │
         ▼                                            ▼                                        ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐        ┌──────────────────────────────┐
│       1. Three.js Engine     │        │        2. Potree Engine      │        │      3. OpenLayers Engine    │
│  - Textured polygonal mesh   │        │  - Octree LOD point cloud    │        │  - True-scale GIS raster map │
│  - GLTF/GLB binary parser    │        │  - Native LAZ / LAS loader   │        │  - EPSG projection engine   │
│  - Camera orbit & framing    │        │  - Point budget & elevation  │        │  - GeoTIFF / XYZ tiles       │
│  - Mesh point measurement    │        │  - Volumetric measurements   │        │  - Distance & area on ground │
└──────────────────────────────┘        └──────────────────────────────┘        └──────────────────────────────┘
```

---

## 2. Shared Geospatial Context

All three viewers bind to a unified project-level geospatial model:
- **Project Metadata:** Extracted from `job.json` (`/jobs/{id}/metadata`).
- **Coordinate Reference System (CRS):** Extracted from `odm_georeferencing/proj.txt` (e.g., `UTM Zone 43N / WGS84`, EPSG code).
- **Coordinate Transformation Matrix:**
  $$\begin{bmatrix} X_{\text{world}} \\ Y_{\text{world}} \\ Z_{\text{world}} \end{bmatrix} = \mathbf{R} \cdot \begin{bmatrix} X_{\text{local}} \\ Y_{\text{local}} \\ Z_{\text{local}} \end{bmatrix} + \mathbf{T}$$
- **Metric Scale Status:**
  - `metric_scale`: `approximate_consumer_gps` | `rtk_calibrated` | `unreferenced`
  - Prevents misleading survey-grade claims when using consumer drone GNSS telemetry.

---

## 3. Viewer Component Specifications

### 3.1 Three.js 3D Mesh Viewer (Active in v0.1.6)
- **Component:** `apps/desktop/src/renderer/components/ThreeViewer.tsx`
- **Asset Route:** `GET /jobs/{id}/assets/model.glb`
- **Features:**
  - Authenticated `GLTFLoader` with `Authorization: Bearer <DT_API_TOKEN>`.
  - DoubleSide material enforcement to avoid backface culling holes.
  - Automatic centering and model bounding box normalization.
  - Multi-segment point-to-point measurement with metric status disclaimers.
  - Hardware fallback with WebGL 2 capability detection and error boundary.

### 3.2 Potree Point Cloud Viewer (Roadmap Integration)
- **Asset Route:** `GET /jobs/{id}/assets/model.laz`
- **WebODM Reference:** WebODM uses `Potree` (BSD-2-Clause license) with an octree converter (`PotreeConverter`).
- **Target Implementation:**
  - Embed Potree in an isolated renderer container within the "Point Cloud (LAZ)" tab.
  - Ingest octree LOD data from NodeODM task outputs.
  - Provide point size, point density budget, classification coloring, and elevation gradients.

### 3.3 OpenLayers 2D Map & Orthophoto Viewer (Roadmap Integration)
- **Asset Routes:** `GET /jobs/{id}/assets/orthophoto.tif`, `GET /jobs/{id}/assets/dsm.tif`
- **WebODM Reference:** WebODM uses `OpenLayers` (BSD-2-Clause license) to display Cloud-Optimized GeoTIFFs (COG) and XYZ orthomosaic tiles.
- **Target Implementation:**
  - Embed OpenLayers with `ol/source/GeoTIFF` in the "Orthophoto / Map" tab.
  - Coordinate re-projection (Proj4js) to display drone orthophoto over standard basemaps (OpenStreetMap, satellite).
  - Layer opacity slider, DSM false-color elevation shading, and contour line overlay.

---

## 4. Open-Source Licenses & Attribution
- **Three.js:** MIT License (Copyright © 2010-2026 Three.js Authors).
- **Potree:** BSD 2-Clause License (Copyright © 2011-2026 Markus Schütz).
- **OpenLayers:** BSD 2-Clause License (Copyright © OpenLayers Contributors).
- **OpenDroneMap / WebODM:** AGPLv3 License.

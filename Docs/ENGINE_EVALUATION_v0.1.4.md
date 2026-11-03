# posEye Engine Evaluation: NodeODM, OpenDroneMap, and ODX

## Context & Objectives

posEye v0.1.4 relies on a containerized NodeODM instance (`opendronemap/nodeodm:3.6.2`) executing locally via Docker Desktop on Windows. This document evaluates current performance, container vs native overhead, and examines ODX (OpenDroneMap Next Generation / native C++ / Rust pipeline) as a future architecture.

---

## 1. Engine Comparison Matrix

| Evaluation Dimension | NodeODM (Current posEye v0.1.4) | Native OpenDroneMap (ODM CLI) | ODX / Next-Gen Native Pipelines |
|---|---|---|---|
| **Host Integration** | Docker Desktop (Hyper-V / WSL2) | WSL2 Ubuntu environment | Native Windows x64 binaries |
| **First-Run Footprint** | ~1.8 GB compressed tar / ~4.2 GB container | ~3.8 GB WSL2 rootfs | ~350 MB static binaries + models |
| **GPU Acceleration** | Requires WSL2 NVIDIA Container Toolkit | Direct CUDA through WSL2 | Direct host CUDA / DirectML |
| **Startup Latency** | 30–60s Docker daemon + container start | 2–5s WSL2 launch | < 500ms process invocation |
| **I/O Throughput** | Windows ↔ WSL2 9P filesystem bridge overhead | Linux ext4 virtual disk | Native Windows NTFS fast I/O |
| **Failure Surface** | Hypervisor, Docker Desktop, WSL2 kernel, port conflicts | WSL2 distro availability, Linux permissions | Missing DLLs, VC++ runtimes |
| **Zero-Install User Story** | Requires Docker Desktop installed and running | Requires WSL2 feature enablement | Fully bundled with NSIS installer |

---

## 2. Docker Desktop on Windows: Verified Bottlenecks

1. **Volume I/O Overhead (The 9P Protocol):**
   When raw frames extracted on Windows (`C:\Users\...\AppData\Local\posEye\jobs\...`) are passed to a Docker container via volume bind mounts or zip uploads over port 3000, cross-boundary file transfers incur significant latency compared to native NTFS file access.
2. **GPU Passthrough Complexity:**
   On Windows 10/11 Home and Pro, Docker Desktop can pass through NVIDIA GPUs only when:
   - Modern Game Ready or Studio Drivers are installed on the Windows host.
   - WSL2 backend is selected (not Hyper-V).
   - `nvidia-container-toolkit` is configured inside the WSL2 Linux engine.
   Without these conditions, NodeODM silently falls back to CPU OpenSfM feature matching and Poisson meshing.
3. **RAM and Swap Allocation:**
   Default Docker Desktop configurations often limit memory to 4 GB or 8 GB unless `.wslconfig` is tuned. Complex photogrammetry datasets exceeding this allocation cause OpenSfM or ODM to crash with `Out of Memory (OOM)` during dense reconstruction.

---

## 3. The ODX Direction (Native Standalone Engine)

The OpenDroneMap project and community have initiated efforts toward modularizing core photogrammetry components into standalone libraries and native executables (often termed ODX or modular ODM):
- **Feature Extraction:** COLMAP or OpenSfM compiled as standalone native Windows CLI.
- **Dense Matching:** OpenMVS native binaries.
- **Meshing & Texturing:** MVS-Texturing native binaries.
- **Orthophoto Generation:** GDAL native pipelines.

### Recommendation for posEye v0.2.0

1. **Short-Term (v0.1.4 Baseline):** Maintain pinned `opendronemap/nodeodm:3.6.2` container lifecycle with automated daemon start and non-blocking desktop initialization.
2. **Medium-Term (v0.2.0):** Introduce a hybrid engine option:
   - For users with Docker Desktop: Continue utilizing standard NodeODM container.
   - For zero-dependency offline installations: Bundle lightweight native OpenSfM + OpenMVS Windows binaries to eliminate the Docker prerequisite completely.


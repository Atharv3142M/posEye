# posEye — Troubleshooting Guide

This guide addresses common setup, runtime, and reconstruction issues encountered when running posEye on Windows.

---

## 1. Virtualization & Docker Issues

### Symptom: "Enable Intel VT-x / AMD-V in BIOS/UEFI" Warning
- **Cause:** Docker Desktop and the WSL2 backend require CPU hardware virtualization.
- **Resolution:**
  1. Restart your PC and enter the UEFI/BIOS settings (usually `F2`, `F12`, `Del`, or `Esc` during boot).
  2. Locate **Intel Virtualization Technology (VT-x)** or **AMD-V / SVM Mode** and set it to **Enabled**.
  3. Save changes and reboot into Windows.
  4. Note: On Windows 11 with Hyper-V or WSL2 enabled, posEye automatically detects Hypervisor root partitions (`HypervisorPresent: true`) and will not issue false-negative warnings.

### Symptom: "Docker daemon is not running"
- **Cause:** Docker Desktop is installed but the background service has not completed initialization.
- **Resolution:**
  1. Start **Docker Desktop** from the Windows Start Menu.
  2. Wait until the Docker whale icon in the system tray turns steady (green).
  3. Verify from PowerShell:
     ```powershell
     docker info
     ```
  4. Once `docker info` returns system details, relaunch posEye.

### Symptom: "Offline NodeODM image not found"
- **Cause:** The `opendronemap/nodeodm` container image is not present in your local Docker engine and no offline `nodeodm.tar` archive was located in resources.
- **Resolution:**
  If you have an internet connection, pull the official image:
  ```powershell
  docker pull opendronemap/nodeodm:latest
  ```
  If you are running in a strictly offline environment, load the pre-exported image tarball:
  ```powershell
  docker load -i path\to\nodeodm.tar
  ```

---

## 2. Port Conflicts & Network Connectivity

### Symptom: "Port 8765 is already in use"
- **Cause:** Another instance of posEye or a lingering `orchestrator.exe` process is binding to port 8765.
- **Resolution:**
  1. Open PowerShell and check for processes listening on port 8765:
     ```powershell
     Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue | Select-Object OwningProcess
     ```
  2. Terminate the lingering process:
     ```powershell
     Stop-Process -Id <PID> -Force
     ```
  3. Alternatively, posEye automatically checks for an already-running Orchestrator and will reuse the instance if it responds to `/health`.

### Symptom: "Port 3000 is already in use by another process"
- **Cause:** An existing web server, Node.js development server, or Grafana instance is listening on port 3000.
- **Resolution:**
  1. Identify the process on port 3000:
     ```powershell
     Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
     ```
  2. Either stop the conflicting service, or run NodeODM on an alternative port (e.g., 3001) and launch posEye with the custom environment variable:
     ```powershell
     $env:NODEODM_URL = "http://127.0.0.1:3001"
     ```

---

## 3. Video Ingestion & Frame Extraction

### Symptom: "FFmpeg binary not found"
- **Cause:** In a development checkout, `fetch-ffmpeg.ps1` has not been run. (The packaged release installer bundles this automatically).
- **Resolution:**
  Run the automated fetch script from PowerShell:
  ```powershell
  .\scripts\fetch-ffmpeg.ps1
  ```
  Or specify a path manually:
  ```powershell
  $env:FFMPEG_PATH = "C:\path\to\ffmpeg.exe"
  ```

### Symptom: "ExtractError: Not enough usable frames retained"
- **Cause:** All or nearly all frames were discarded by the blur filter or deduplication threshold. Common causes include:
  - Very dark, blurry, or fast spinning video during drone takeoff/landing.
  - Frame sampling rate (`fps`) set too low on a very short video clip.
  - Blur threshold (`blur_threshold`) set too high.
- **Resolution:**
  1. In the **New Project** page, lower the **Blur threshold** from `40` to `15` or `10`.
  2. Increase the extraction rate from `3.0` to `4.0` or `5.0` fps.
  3. Ensure the video contains stable forward motion with sharp surface details.

### Symptom: "GPS Telemetry Not Associated"
- **Cause:** The drone video has no embedded subtitle track or the separate `.SRT` file was not provided.
- **Resolution:**
  - If your drone creates companion `.SRT` files (e.g. DJI Mavic, Phantom, Air, Mini, or Autel EVO), select the file in the **Telemetry (SRT)** input field.
  - Processing will still complete without an SRT file, but coordinates will not be georeferenced and measurements will display in uncalibrated "model units".

---

## 4. Photogrammetry Reconstruction Failures

### Symptom: NodeODM task fails with `MulterError: Unexpected field`
- **Cause:** An outdated version of the client sent multipart files with non-standard field names.
- **Resolution:**
  - posEye v0.1.0 uses the official multi-stage NodeODM REST API (`/task/new/init` $\rightarrow$ `/task/new/upload/{uuid}` $\rightarrow$ `/task/new/commit/{uuid}`) with the mandatory form field `"images"`. Ensure you are running v0.1.0 or later.

### Symptom: Docker Container Exits Out-of-Memory (OOM)
- **Cause:** OpenDroneMap requires substantial memory during the OpenMVS dense point cloud and meshing phases.
- **Resolution:**
  1. Open Docker Desktop Settings $\rightarrow$ **Resources** $\rightarrow$ **Advanced**.
  2. Increase memory allocation to at least 16 GB (or configure a larger WSL2 swap file in `%USERPROFILE%\.wslconfig`).
  3. In posEye, select the **Fast** or **Balanced** preset instead of **Ultra**.

### Symptom: Reconstruction Stalls or Times Out
- **Cause:** Large high-resolution image sets require extended processing time.
- **Resolution:**
  - Check the live terminal output in posEye (`/logs` or the processing progress screen).
  - OpenDroneMap periodically logs lines such as `Matching image pairs...` and `Computing depth maps...`. If progress continues to stream, the engine is actively computing.

---

## 5. 3D Viewer & Display

### Symptom: 3D Viewer shows a black or empty viewport
- **Cause:** Hardware acceleration is disabled in Electron, or WebGL context was lost.
- **Resolution:**
  1. Ensure your graphics drivers are up to date.
  2. Press `R` inside the viewer to reset the camera to the model's bounding sphere center.
  3. Verify that `model.glb` was generated in the project output directory (`%APPDATA%\posEye\jobs\<id>\assets\model.glb`).


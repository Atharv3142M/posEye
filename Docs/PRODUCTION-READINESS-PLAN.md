# posEye Production Hardening & Readiness Plan

**Date:** 2026-10-29  
**Status:** In Execution  
**Lead:** Windows Desktop, Photogrammetry & Geospatial QA Engineer  
**Objective:** Deliver a dependable, verified posEye Windows release candidate aligned with WebODM engineering standards, with honest geospatial disclosures, robust error handling, real-time responsive terminal streaming, and clean packaging.

---

## 1. Root Causes & Observed Defects

1. **NodeODM Upload Rejection (`Unexpected field`)**:
   - *Cause:* `apps/orchestrator/src/orchestrator/nodeodm.py` used multipart file field `"zip"` and extra field `"skipPostProcessing"` in `POST /task/new`. NodeODM's multer middleware only accepts `"images"`.
   - *Fix:* Use official standard NodeODM upload lifecycle: `/task/new/init` -> `/task/new/upload/{uuid}` (field `images`) -> `/task/new/commit/{uuid}`, with fallback to `/task/new` with field `images`.

2. **False "Virtualization Disabled" Warning**:
   - *Cause:* `main.cjs` checked only `(Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled`. When Hyper-V, WSL2, or Virtual Machine Platform is active, Windows runs in a hypervisor root partition where WMI reports `VirtualizationFirmwareEnabled: False` while `(Get-CimInstance Win32_ComputerSystem).HypervisorPresent` is `True`.
   - *Fix:* Check `HypervisorPresent || VirtualizationFirmwareEnabled || dockerDaemonRunning`.

3. **Terminal Unresponsive / App Looks Stuck**:
   - *Cause:*
     - Stage 1 ffmpeg frame extraction was executed with synchronous `subprocess.run(capture_output=True)` without streaming lines or progress updates.
     - Frame sharpness/deduplication scoring did not emit progressive batch updates.
     - NodeODM polling in `nodeodm.py:wait()` did not poll `GET /task/{uuid}/output?line={n}` to stream real OpenDroneMap console lines.
   - *Fix:*
     - Stream ffmpeg extraction progress.
     - Emit progressive updates during Laplacian blur and dHash scoring.
     - Implement incremental line-by-line polling of NodeODM's `/task/{uuid}/output` to stream live ODM logs directly to WebSocket/UI terminal.

4. **Dark Mode Broken**:
   - *Cause:* `useTheme.tsx` toggles `document.documentElement.dataset.theme = 'dark'`, but `globals.css` had no `[data-theme="dark"]` rules.
   - *Fix:* Implement complete, professional WebODM-style dark theme token palette and component styles.

5. **Desktop Logo / Icon Incomplete**:
   - *Cause:* Windows `.exe` and Inno Setup installers require genuine multi-resolution `.ico` binaries, whereas a raw `.png` was referenced in packaging configs.
   - *Fix:* Generated multi-resolution `posEye.ico` (16x16 to 256x256), configured `main.cjs`, `package.json`, and `installer/posEye.iss`.

6. **SIH / Outdated Branding Mentions**:
   - *Cause:* Outdated references to hackathons ("SIH") and "DigitalTwin" remain in documentation, README, Settings, and code comments.
   - *Fix:* Sanitize all documentation and UI to pure `posEye` product identity.

7. **Gitignore & Import Cleanliness**:
   - *Cause:* Ensure that cloning on another clean PC does not include local build artifacts (`.jobs`, PyInstaller `build/`, `dist/`, `.venv`, cache files), but preserves sample fixtures, reference documentation, and provisioning scripts.

---

## 2. Priority Implementation Order

- **P0: Fix NodeODM Task Creation & Real-Time Terminal Streaming**
  - Implement `/task/new/init`, `/task/new/upload/{uuid}`, `/task/new/commit/{uuid}` in `nodeodm.py`.
  - Add `/task/{uuid}/output` log streaming.
  - Stream ffmpeg and frame filtering progress.

- **P1: Fix Virtualization Detection & App Startup**
  - Update `main.cjs` to detect Hyper-V / WSL2 hypervisor correctly.
  - Validate Docker Desktop auto-start and container lifecycle.

- **P2: Fix Dark Mode & Polish WebODM-Style UI**
  - Add `[data-theme="dark"]` theme variables and component styles.
  - Ensure real-time terminal autoscrolls smoothly and displays ANSI/log levels.

- **P3: Correct Desktop Icons & Clean Packaging**
  - Use `posEye.ico` in Electron window, NSIS installer, and Inno Setup script.
  - Update `package.json` and build scripts.

- **P4: Clean Up Repository, README, and `.gitignore`**
  - Remove all SIH mentions.
  - Update `.gitignore` for portable clean checkouts.
  - Add GitHub Actions CI workflow and release documentation (`v1.0.0`).

- **P5: Test Suite & Verification**
  - Run full test suite, frontend builds, packaging, and generate WebODM comparison document.


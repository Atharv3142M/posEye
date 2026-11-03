# posEye — Windows Installer Architecture

This directory contains the packaging specifications and asset definitions for building Windows installers for posEye.

---

## Installer Types

posEye supports two installer distribution models:

### 1. Primary Release: Electron NSIS Installer (`electron-builder`)
The standard release artifact distributed on GitHub Releases is generated via `electron-builder`:
- **Output Artifact:** `apps/desktop/release/posEye.Setup.0.1.4.exe` (~183 MB)
- **Bundled Payloads:**
  - Electron 32 desktop runtime and bundled React 18 / Three.js frontend.
  - Bundled static FFmpeg engine (`third_party/ffmpeg.exe`).
  - Standalone compiled Python backend (`third_party/posEye.Orchestrator.exe`) with embedded Windows version resource headers (`0.1.4.0`).
- **Prerequisites Managed Separately:** Requires Docker Desktop with the WSL2 backend and the `opendronemap/nodeodm:3.6.2` container image available on the host.

#### Build Command:
```powershell
# 1. Compile backend standalone binary
.\scripts\build-orchestrator.ps1

# 2. Package NSIS installer
cd apps\desktop
npm ci
npm run dist
```

---

### 2. Full-Bundle Inno Setup Installer (`installer/posEye.iss`)
The Inno Setup script is designed for offline field provisioning where network access is unavailable, wrapping the Electron app with pre-exported container archives.

#### Build Payload Preparation:
1. Initialize Python environment:
   ```powershell
   .\scripts\setup.ps1
   ```
2. Provision static FFmpeg:
   ```powershell
   .\scripts\fetch-ffmpeg.ps1
   ```
3. Export the NodeODM container image to a local archive (multi-GB):
   ```powershell
   .\scripts\export-nodeodm.ps1
   ```
4. Build the Electron distribution:
   ```powershell
   cd apps\desktop
   npm ci
   npm run dist
   cd ..\..
   ```
5. Place the official Docker Desktop installer into:
   ```text
   installer/payload/Docker Desktop Installer.exe
   ```
6. Compile `installer/posEye.iss` using Inno Setup 6:
   ```powershell
   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer/posEye.iss
   ```

---

## Hardware Virtualization Gate

Docker Desktop's WSL2 backend requires hardware virtualization enabled in BIOS/UEFI (VT-x for Intel, AMD-V for AMD).

To detect virtualization status in PowerShell prior to deployment:
```powershell
.\scripts\detect-virtualization.ps1
```

If the script exits with code `2`, instruct the operator to access motherboard firmware settings, enable hardware virtualization, and reboot. No user-space Windows installer can modify firmware configuration.

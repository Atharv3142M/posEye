# Outer installer (Phase 8)

This Inno Setup script wraps the Electron app, bundled `ffmpeg.exe`, and a pre-exported NodeODM image.

## Build payload (on a machine with Docker)

1. `scripts\setup.ps1`
2. `scripts\fetch-ffmpeg.ps1`
3. `scripts\export-nodeodm.ps1`  (multi-GB)
4. `cd apps\desktop && npm ci && npm run dist`
5. Download [Docker Desktop Installer](https://www.docker.com/products/docker-desktop/) into `installer/payload/Docker Desktop Installer.exe`
6. Compile `installer/posEye.iss` with Inno Setup 6
7. Test the resulting `dist-installer\posEye-Setup-v0.1.0.exe` on a **clean Windows VM**, not the development workstation

## BIOS virtualization

If `scripts\detect-virtualization.ps1` exits 2, tell the operator to enable VT-x / AMD-V and reboot. The installer cannot flip firmware settings.

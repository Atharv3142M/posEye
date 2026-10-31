# posEye Release & Tagging Procedure

This document provides step-by-step instructions for producing, verifying, tagging, and publishing production release artifacts for **posEye**.

---

## 1. Release Architecture & Artifacts

| Component | Target Location | Description |
| :--- | :--- | :--- |
| **Installer** | `apps/desktop/release/posEye Setup <version>.exe` | NSIS single-executable Windows installer |
| **Unpacked Application** | `apps/desktop/release/win-unpacked/` | Portable standalone directory (`posEye.exe`) |
| **Bundled FFmpeg** | `third_party/ffmpeg.exe` (copied into package `resources/`) | Static 64-bit FFmpeg binary (101MB) |
| **Standalone Orchestrator** | `third_party/orchestrator.exe` (copied into `resources/`) | Standalone compiled FastAPI backend (PyInstaller) |
| **Application Icons** | `apps/desktop/electron/posEye.ico` | Multi-resolution icon (16x16 to 256x256) |

---

## 2. Pre-Release Build & Verification

Execute the following commands sequentially on a Windows build host:

### Step 1: Run Full Test Suite
```powershell
.\.venv\Scripts\python.exe -m pytest apps\pipeline apps\orchestrator -v
```
*Expected: 22 passed tests with zero failures.*

### Step 2: Compile Standalone Backend (PyInstaller)
If backend source files were modified, recompile the standalone orchestrator binary:
```powershell
.\scripts\build-orchestrator.ps1
```
*Output: `third_party/orchestrator.exe` (approx 82MB).*

### Step 3: Verify Bundled Binaries
Confirm that static binaries exist in `third_party/`:
```powershell
Test-Path third_party\ffmpeg.exe        # Must return True (approx 101 MB)
Test-Path third_party\orchestrator.exe  # Must return True (approx 82 MB)
```

### Step 4: Build Frontend & Package Windows Installer
```powershell
cd apps\desktop
npm ci
npx tsc --noEmit
npm run build
npm run pack   # Produces win-unpacked\posEye.exe
npm run dist   # Produces release\posEye Setup [version].exe
cd ..\..
```

---

## 3. Artifact Validation & Checksum Generation

Calculate the SHA-256 hash of the generated installer before distribution:

```powershell
Get-FileHash -Algorithm SHA256 "apps\desktop\release\posEye Setup *.exe" | Format-List
```

Record the hash and file size. Verify that the PE metadata displays:
- **Product Name:** `posEye`
- **Icon:** `posEye.ico` (multi-resolution)
- **Embedded Payloads:** `resources\ffmpeg.exe` and `resources\orchestrator.exe`

---

## 4. Git Tagging & Release Publishing

### Step 1: Commit Release Version Updates
Ensure version string consistency in `apps/desktop/package.json` and `installer/posEye.iss`:
```powershell
git add .
git commit -m "chore(release): prepare release v0.1.1"
```

### Step 2: Create Annotated Git Tag
```powershell
git tag -a v0.1.1 -m "posEye Production Release v0.1.1"
git push origin main
git push origin v0.1.1
```

### Step 3: Create GitHub Release
1. Navigate to `https://github.com/Atharv3142M/posEye/releases/new`.
2. Select tag `v0.1.1`.
3. Set title to: `posEye v0.1.1 — Automated Drone Video Photogrammetry`.
4. Attach `apps/desktop/release/posEye Setup 0.1.0.exe`.
5. Include SHA-256 checksum and release notes in the description.

---

## 5. Clean-Machine Validation Checklist

Before marking a release as finalized, test the installer on a pristine Windows 10/11 VM (without Python, Node.js, or Git installed):

- [ ] Installer runs without administrative elevation errors.
- [ ] Desktop shortcut and Start Menu shortcuts are created with `posEye.ico`.
- [ ] Application starts cleanly and backend initializes on `http://127.0.0.1:8765`.
- [ ] Settings page shows green status for FFmpeg (bundled).
- [ ] Virtualization detection correctly identifies Hyper-V / WSL2 status without false negatives.
- [ ] Drag-and-drop video ingestion successfully parses container metadata.
- [ ] Dark mode toggle preserves selection across app restarts.
- [ ] 3D viewer orbits smoothly and allows point-to-point measurement.
- [ ] Application uninstalls cleanly from Windows Settings / Add or Remove Programs.


# posEye Release & Tagging Procedure

This document provides step-by-step instructions for producing, verifying, tagging, and publishing production release artifacts for **posEye**.

---

## 1. Release Architecture & Artifacts

| Component | Target Location | Description |
| :--- | :--- | :--- |
| **Primary Installer** | `apps/desktop/release/posEye.Setup.<version>.exe` | NSIS single-executable Windows installer |
| **Unpacked Application** | `apps/desktop/release/win-unpacked/` | Portable standalone directory (`posEye.exe`) |
| **Bundled FFmpeg** | `third_party/ffmpeg.exe` (copied into package `resources/`) | Static 64-bit FFmpeg binary (~101 MB) |
| **Standalone Orchestrator** | `third_party/posEye.Orchestrator.exe` (copied into `resources/`) | Standalone compiled FastAPI backend (PyInstaller) with Windows version resource headers |
| **Offline Draco Decoders** | `dist/draco/` | Bundled WebAssembly decoders (`draco_decoder.wasm`, `draco_decoder.js`) |
| **Application Icons** | `resources/posEye.ico` | Multi-resolution icon (16x16 to 256x256) |

---

## 2. Pre-Release Build & Verification

Execute the following commands sequentially on a Windows build host:

### Step 1: Run Full Test Suites
```powershell
# Python unit and integration tests (83 tests)
.\.venv\Scripts\python.exe -m pytest apps\pipeline apps\orchestrator -v

# Desktop Node.js security and lifecycle tests (35 tests)
cd apps\desktop
npm test
cd ..\..
```
*Expected: 100% pass across all 118 test cases with zero failures.*

### Step 2: Compile Standalone Backend (PyInstaller)
If backend source files were modified, recompile the standalone orchestrator binary:
```powershell
.\scripts\build-orchestrator.ps1
```
*Output: `third_party/posEye.Orchestrator.exe` (approx 82 MB) with version metadata.*

### Step 3: Verify Bundled Binaries
Confirm that static binaries exist in `third_party/`:
```powershell
Test-Path third_party\ffmpeg.exe              # Must return True (approx 101 MB)
Test-Path third_party\posEye.Orchestrator.exe # Must return True (approx 82 MB)
```

### Step 4: Build Frontend & Package Windows Installer
```powershell
cd apps\desktop
npm ci
npx tsc --noEmit
npm run build
npm run pack   # Produces win-unpacked\posEye.exe
npm run dist   # Produces release\posEye.Setup.<version>.exe
cd ..\..
```

---

## 3. Artifact Validation & Checksum Generation

Calculate the SHA-256 hash of the generated installer before distribution:

```powershell
Get-FileHash -Algorithm SHA256 "apps\desktop\release\posEye.Setup.*.exe" | Format-List
```

Record the hash and file size in `Docs/RELEASE_ARTIFACT_AUDIT_v<version>.md`. Verify that the PE metadata displays:
- **Product Name:** `posEye`
- **Original Filename:** `posEye.exe`
- **File Version:** `<version>.0`
- **Icon:** `posEye.ico` (multi-resolution)
- **Embedded Payloads:** `resources\ffmpeg.exe` and `resources\posEye.Orchestrator.exe`

---

## 4. Git Tagging & Release Publishing

### Step 1: Commit Release Version Updates
Ensure version string consistency across `apps/desktop/package.json`, `apps/orchestrator/pyproject.toml`, `installer/posEye.iss`, and `scripts/version_info.txt`:
```powershell
git add .
git commit -m "chore(release): bump version to <version>"
```

### Step 2: Create Annotated Git Tag
```powershell
git tag -a v<version> -m "posEye Production Release v<version>"
git push origin main
git push origin v<version>
```

### Step 3: Create GitHub Release
1. Navigate to `https://github.com/Atharv3142M/posEye/releases/new`.
2. Select the annotated tag (e.g. `v0.1.9`).
3. Set title to: `posEye v<version> — Automated Drone Video Photogrammetry`.
4. Attach `apps/desktop/release/posEye.Setup.<version>.exe`.
5. Include the SHA-256 checksum and release notes from `Docs/RELEASE_NOTES_v<version>.md`.

---

## 5. Clean-Machine Validation Checklist

Before marking a release as finalized, test the installer on a clean Windows 10/11 VM (without Python, Node.js, or Git installed):

- [ ] Installer executes without administrative elevation errors.
- [ ] Shortcuts created on Desktop and Start Menu with high-resolution posEye branding.
- [ ] Application starts cleanly and background orchestrator connects on port 8765.
- [ ] Diagnostics screen confirms API, Docker, NodeODM, and FFmpeg detection.
- [ ] Drag-and-drop video probe correctly calculates duration and frame estimates.
- [ ] Complete pipeline run produces textured 3D mesh (`model.glb`).
- [ ] 3D viewer mounts mesh with offline Draco WebAssembly decompressor.
- [ ] Distance measurement tool operates with snap indicators.
- [ ] Uninstaller cleanly removes binaries and registry keys.
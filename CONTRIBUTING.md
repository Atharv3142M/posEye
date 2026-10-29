# Contributing to posEye

Thank you for your interest in contributing to posEye! This project is an open-source, offline-first photogrammetry system for processing drone video into 3D models.

---

## 1. Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## 2. Development Setup

### Prerequisites
- Windows 10 (Build 19041+) or Windows 11 (64-bit x64).
- Python 3.10+ (Python 3.11 recommended).
- Node.js 20+ and npm.
- Git.
- Docker Desktop with WSL2 backend.

### Setup Instructions
1. Fork and clone the repository:
   ```powershell
   git clone https://github.com/<your-username>/posEye.git
   cd posEye
   ```
2. Initialize the Python virtual environment and dependencies:
   ```powershell
   .\scripts\setup.ps1
   ```
3. Provision the static FFmpeg binary:
   ```powershell
   .\scripts\fetch-ffmpeg.ps1
   ```
4. Install desktop frontend dependencies:
   ```powershell
   cd apps\desktop
   npm ci
   cd ..\..
   ```
5. Start NodeODM container (optional for API development, required for reconstruction):
   ```powershell
   .\scripts\nodeodm-up.ps1
   ```

---

## 3. Development Workflow

### Running in Development Mode
To launch the Electron shell with live React Vite hot module replacement:
```powershell
cd apps\desktop
npm run dev:electron
```

To run the Python Orchestrator API directly:
```powershell
.\.venv\Scripts\python.exe -m orchestrator.main
```

---

## 4. Coding Standards

- **Python:**
  - Follow PEP 8 guidelines.
  - Use explicit type annotations where feasible.
  - Do not use broad exception handlers (`except Exception: pass`) that obscure underlying network or file errors.
- **TypeScript / React:**
  - Follow strict TypeScript type checking (`strict: true`).
  - Use functional components with hooks.
  - Maintain the existing CSS variable architecture (`[data-theme="dark"]`) in `globals.css`.
- **Geospatial Integrity:**
  - Never fabricate or guess geographic coordinates. If telemetry is unavailable, explicitly disclose that models are rendered in relative "model units".

---

## 5. Pre-Submission Checklist

Before creating a pull request, verify that all local checks pass:

```powershell
# 1. Run Python test suite
.\.venv\Scripts\python.exe -m pytest apps\pipeline apps\orchestrator -v

# 2. Frontend typecheck and build
cd apps\desktop
npx tsc --noEmit
npm run build

# 3. Verify Electron packaging
npx electron-builder --win --dir
```

---

## 6. Commit Message Guidelines

We use conventional commit messages:
- `feat:` A new user-facing feature.
- `fix:` A bug fix.
- `docs:` Documentation changes.
- `refactor:` Code improvements without functional changes.
- `test:` Adding or improving tests.
- `chore:` Build scripts, dependencies, or tool configuration.

Example:
```
feat(pipeline): support DJI Mavic 3 subtitle telemetry format
fix(viewer): preserve double-sided material rendering on camera reset
```

---

## 7. Submitting a Pull Request

1. Create a feature branch: `git checkout -b feat/my-improvement`.
2. Commit your changes with descriptive messages.
3. Push to your fork: `git push origin feat/my-improvement`.
4. Open a Pull Request against the `main` branch of `Atharv3142M/posEye`.
5. Ensure all GitHub Actions CI checks are green.

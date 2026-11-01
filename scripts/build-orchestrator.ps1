#requires -Version 5.1
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$py = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Error "Virtual environment not found at $py. Run .\scripts\setup.ps1 first."
    exit 1
}

Write-Host "Ensuring pyinstaller is installed..."
& $py -m pip install -q pyinstaller

$outDir = Join-Path $root "third_party"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$versionFile = Join-Path $root "scripts\version_info.txt"

Write-Host "Compiling posEye orchestrator to branded standalone executable..."
& $py -m PyInstaller `
    --onefile `
    --noconfirm `
    --clean `
    --name posEye.Orchestrator `
    --distpath $outDir `
    --version-file $versionFile `
    --paths "apps\pipeline\src" `
    --paths "apps\orchestrator\src" `
    --hidden-import "uvicorn.logging" `
    --hidden-import "uvicorn.loops" `
    --hidden-import "uvicorn.loops.auto" `
    --hidden-import "uvicorn.protocols" `
    --hidden-import "uvicorn.protocols.http" `
    --hidden-import "uvicorn.protocols.http.auto" `
    --hidden-import "uvicorn.protocols.websockets" `
    --hidden-import "uvicorn.protocols.websockets.auto" `
    --hidden-import "uvicorn.lifespans" `
    --hidden-import "uvicorn.lifespans.on" `
    --hidden-import "pipeline" `
    --hidden-import "orchestrator" `
    "apps\orchestrator\src\orchestrator\__main__.py"

$brandedExe = Join-Path $outDir "posEye.Orchestrator.exe"
$legacyExe = Join-Path $outDir "orchestrator.exe"

if (Test-Path $legacyExe) {
    Remove-Item -Path $legacyExe -Force -ErrorAction SilentlyContinue
    Write-Host "Cleaned legacy unbranded duplicate binary: $legacyExe"
}

if (Test-Path $brandedExe) {
    Write-Host "Successfully built verified branded binary: $brandedExe"
} else {
    Write-Error "posEye.Orchestrator.exe build failed."
}

#requires -Version 5.1
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Find-Python {
    $candidates = @(
        @("py", "-3.14"),
        @("py", "-3.13"),
        @("py", "-3.12"),
        @("py", "-3.11"),
        @("py", "-3"),
        @("python3"),
        @("python")
    )

    foreach ($cand in $candidates) {
        $exe = $cand[0]
        $args_ = if ($cand.Length -gt 1) { $cand[1..($cand.Length - 1)] } else { @() }
        try {
            $testArgs = @()
            if ($args_.Length -gt 0) { $testArgs += $args_ }
            $testArgs += "--version"
            $ver = & $exe @testArgs 2>&1
            if ($LASTEXITCODE -eq 0 -and $ver -match "Python 3\.(\d+)") {
                $minor = [int]$Matches[1]
                if ($minor -ge 10) {
                    Write-Host "Found $ver using $exe $args_"
                    return @{ Exe = $exe; Args = $args_ }
                }
            }
        } catch {
            # continue
        }
    }
    return $null
}

if (-not (Test-Path ".venv")) {
    $py = Find-Python
    if ($null -eq $py) {
        Write-Error "Python 3.10+ not found. Install Python 3.10 or newer and ensure it is on PATH."
        exit 1
    }
    $venvArgs = @()
    if ($py.Args.Length -gt 0) { $venvArgs += $py.Args }
    $venvArgs += @("-m", "venv", ".venv")
    Write-Host "Creating virtual environment .venv..."
    & $py.Exe @venvArgs
}

$pyExe = Join-Path $root ".venv\Scripts\python.exe"
Write-Host "Installing dependencies into .venv..."
& $pyExe -m pip install -U pip
& $pyExe -m pip install -e "apps\pipeline[dev]"
& $pyExe -m pip install -e "apps\orchestrator[dev]"

Write-Host "posEye Python environment ready."
Write-Host "To run tests: .\.venv\Scripts\python.exe -m pytest apps\pipeline apps\orchestrator -v"

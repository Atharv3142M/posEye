#requires -Version 5.1
# Copy a local ffmpeg.exe into third_party/. Does not download via imageio-ffmpeg.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dest = Join-Path $root "third_party\ffmpeg.exe"
New-Item -ItemType Directory -Force -Path (Join-Path $root "third_party") | Out-Null

$candidates = @(
  "C:\ProgramData\chocolatey\lib\ffmpeg\tools\ffmpeg\bin\ffmpeg.exe",
  "C:\Program Files\ffmpeg\bin\ffmpeg.exe",
  "C:\ffmpeg\bin\ffmpeg.exe"
)

foreach ($c in $candidates) {
  if (Test-Path $c) {
    Copy-Item -Force $c $dest
    Write-Host "Copied $c -> $dest"
    exit 0
  }
}

# Check if any ffmpeg.exe exists under chocolatey lib/ffmpeg
$chocoTools = "C:\ProgramData\chocolatey\lib\ffmpeg"
if (Test-Path $chocoTools) {
  $found = Get-ChildItem -Path $chocoTools -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "chocolatey\\bin" } | Select-Object -First 1
  if ($found -and (Test-Path $found.FullName)) {
    Copy-Item -Force $found.FullName $dest
    Write-Host "Copied $($found.FullName) -> $dest"
    exit 0
  }
}

$cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($cmd) {
  # If it's a choco shim, resolve target
  $src = $cmd.Source
  if ($src -like "*chocolatey\bin\ffmpeg.exe") {
    $real = "C:\ProgramData\chocolatey\lib\ffmpeg\tools\ffmpeg\bin\ffmpeg.exe"
    if (Test-Path $real) { $src = $real }
  }
  Copy-Item -Force $src $dest
  Write-Host "Copied $src -> $dest"
  exit 0
}

Write-Error @"
ffmpeg.exe not found.
Place a static Windows ffmpeg.exe at:
  $dest
Or add ffmpeg to PATH and re-run this script.
"@

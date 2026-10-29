#requires -Version 5.1
# Silent Docker Desktop provision used by the outer installer. Requires admin.
param(
  [Parameter(Mandatory = $true)][string]$InstallerExe,
  [Parameter(Mandatory = $true)][string]$NodeOdmTar
)

$ErrorActionPreference = "Stop"
& powershell.exe -NoProfile -File (Join-Path $PSScriptRoot "detect-virtualization.ps1")
if ($LASTEXITCODE -eq 2) { exit 2 }

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  Write-Host "Installing Docker Desktop (quiet)..."
  Start-Process -FilePath $InstallerExe -ArgumentList "install","--quiet","--accept-license" -Wait
}

$deadline = (Get-Date).AddMinutes(8)
while ((Get-Date) -lt $deadline) {
  try {
    docker info | Out-Null
    break
  } catch {
    Start-Sleep -Seconds 5
  }
}

docker load -i $NodeOdmTar
docker rm -f poseye-nodeodm digitaltwin-nodeodm 2>$null
docker run -d --name poseye-nodeodm -p 3000:3000 opendronemap/nodeodm

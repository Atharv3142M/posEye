from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import psutil

from orchestrator.nodeodm import NodeODMClient, nodeodm_url

logger = logging.getLogger(__name__)


def _gpu() -> dict[str, Any]:
    # 1. Try nvidia-smi first for NVIDIA GPU telemetry
    try:
        proc = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            first_line = proc.stdout.strip().splitlines()[0]
            parts = [p.strip() for p in first_line.split(",")]
            if len(parts) >= 5:
                name, util, mem_used, mem_total, temp = parts[:5]
                return {
                    "gpuAvailable": True,
                    "gpuName": name,
                    "nvidiaSmiAvailable": True,
                    "cudaAvailable": True,
                    "gpuUtilization": float(util),
                    "gpuMemoryUsed": float(mem_used),
                    "gpuMemoryTotal": float(mem_total),
                    "gpuTemperature": float(temp),
                    "nodeodmAcceleration": "CUDA GPU acceleration supported if CUDA container is deployed",
                    "message": f"{name} (NVIDIA)",
                }
    except Exception:
        pass

    # 2. On Windows, detect display adapter via CIM/WMI without fabricating 0% utilization
    if os.name == "nt":
        try:
            ps_cmd = "Get-CimInstance Win32_VideoController | Select-Object -Property Name, AdapterRAM | ConvertTo-Json"
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_cmd],
                capture_output=True,
                text=True,
                timeout=3,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                data = json.loads(proc.stdout)
                adapters = data if isinstance(data, list) else [data]
                # Filter out virtual display drivers if possible
                real_adapters = [
                    a for a in adapters
                    if a.get("Name") and "Virtual" not in a.get("Name", "") and "RDP" not in a.get("Name", "")
                ]
                chosen = real_adapters[0] if real_adapters else (adapters[0] if adapters else None)
                if chosen and chosen.get("Name"):
                    name = chosen["Name"]
                    ram_mb = round(chosen.get("AdapterRAM", 0) / (1024 * 1024)) if chosen.get("AdapterRAM") else None
                    return {
                        "gpuAvailable": True,
                        "gpuName": name,
                        "nvidiaSmiAvailable": False,
                        "cudaAvailable": False,
                        "gpuUtilization": None,
                        "gpuMemoryUsed": None,
                        "gpuMemoryTotal": ram_mb,
                        "gpuTemperature": None,
                        "nodeodmAcceleration": "CPU-only (standard NodeODM container)",
                        "message": f"{name} (Display Adapter, CPU processing)",
                    }
        except Exception:
            pass

    return {
        "gpuAvailable": False,
        "gpuName": None,
        "nvidiaSmiAvailable": False,
        "cudaAvailable": False,
        "gpuUtilization": None,
        "nodeodmAcceleration": "CPU-only",
        "message": "No discrete GPU detected. NodeODM will use CPU processing.",
    }


def _ffmpeg() -> dict[str, Any]:
    try:
        from pipeline.ffmpeg import resolve_ffmpeg
        from pipeline.probe import ffmpeg_version

        path = resolve_ffmpeg()
        ver = ffmpeg_version(path)
        return {
            "status": "detected",
            "detected": True,
            "path": path,
            "version": ver,
            "message": f"FFmpeg {ver or 'detected'}",
            "recovery": "",
        }
    except Exception as exc:
        return {
            "status": "missing",
            "detected": False,
            "path": None,
            "version": None,
            "message": "FFmpeg binary not found",
            "error": str(exc),
            "recovery": "Run scripts/fetch-ffmpeg.ps1 or place ffmpeg.exe into third_party/ or PATH.",
        }


def _docker() -> dict[str, Any]:
    docker_bin = shutil.which("docker")
    if not docker_bin:
        return {
            "status": "not_installed",
            "ok": False,
            "version": "",
            "message": "Docker CLI not found on system PATH",
            "recovery": "Install Docker Desktop for Windows to enable local photogrammetry reconstruction.",
        }

    try:
        proc = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            version = proc.stdout.strip()
            return {
                "status": "running",
                "ok": True,
                "version": version,
                "message": f"Docker {version} running",
                "recovery": "",
            }
        else:
            return {
                "status": "stopped",
                "ok": False,
                "version": "",
                "message": "Docker Desktop daemon is not running",
                "recovery": "Start Docker Desktop from the Start menu and wait for initialization.",
            }
    except subprocess.TimeoutExpired:
        return {
            "status": "stopped",
            "ok": False,
            "version": "",
            "message": "Docker daemon query timed out (daemon unresponsive)",
            "recovery": "Check Docker Desktop status or restart the service.",
        }
    except Exception as exc:
        return {
            "status": "error",
            "ok": False,
            "version": "",
            "message": f"Docker check failed: {exc}",
            "recovery": "Verify Docker Desktop is installed and running.",
        }


def _nodeodm(docker_status: dict[str, Any]) -> dict[str, Any]:
    url = nodeodm_url()
    try:
        client = NodeODMClient(timeout=2.0)
        info = client.info()
        ver = info.get("version") or info.get("taskmanager", {}).get("version") or "ready"
        return {
            "status": "connected",
            "ok": True,
            "url": url,
            "version": str(ver),
            "message": f"Connected to NodeODM ({ver})",
            "info": info,
            "recovery": "",
        }
    except Exception as exc:
        if not docker_status.get("ok"):
            return {
                "status": "unavailable",
                "ok": False,
                "url": url,
                "version": "",
                "message": "NodeODM container offline (Docker is not running)",
                "info": {"error": str(exc)},
                "recovery": "Start Docker Desktop first, then launch NodeODM on port 3000.",
            }
        return {
            "status": "unreachable",
            "ok": False,
            "url": url,
            "version": "",
            "message": f"Cannot connect to NodeODM at {url}",
            "info": {"error": str(exc)},
            "recovery": "Start the NodeODM container: docker run -d -p 3000:3000 opendronemap/nodeodm",
        }


def system_status() -> dict[str, Any]:
    vm = psutil.virtual_memory()
    disk = shutil.disk_usage(Path.cwd())

    docker = _docker()
    nodeodm = _nodeodm(docker)
    ffmpeg = _ffmpeg()
    cpu = psutil.cpu_percent(interval=0.1)
    gpu = _gpu()

    return {
        "cpuPercent": cpu,
        "ramUsedGb": round(vm.used / 1024**3, 2),
        "ramTotalGb": round(vm.total / 1024**3, 2),
        "ramPercent": vm.percent,
        "diskUsedGb": round(disk.used / 1024**3, 1),
        "diskFreeGb": round(disk.free / 1024**3, 1),
        "diskTotalGb": round(disk.total / 1024**3, 1),
        "docker": docker,
        "nodeodm": nodeodm,
        "ffmpeg": ffmpeg,
        **gpu,
    }

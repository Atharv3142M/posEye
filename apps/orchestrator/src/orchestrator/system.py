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


def _check_docker_gpu_passthrough() -> bool:
    """Check if Docker daemon supports nvidia runtime for GPU passthrough."""
    docker_bin = shutil.which("docker")
    if not docker_bin:
        return False
    try:
        proc = subprocess.run(
            ["docker", "info", "--format", "{{json .Runtimes}}"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if proc.returncode == 0 and "nvidia" in proc.stdout.lower():
            return True
    except Exception:
        pass
    return False


def _find_nvidia_smi() -> str | None:
    found = shutil.which("nvidia-smi")
    if found and Path(found).is_file():
        return str(found)
    candidates = [
        Path(r"C:\Windows\System32\nvidia-smi.exe"),
        Path(r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe"),
    ]
    for c in candidates:
        if c.is_file():
            return str(c)
    return None


def _gpu() -> dict[str, Any]:
    display_adapter_name: str | None = None
    display_adapter_detected = False
    adapter_ram_mb: float | None = None

    # 1. Query display adapter via CIM/WMI on Windows
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
                real_adapters = [
                    a for a in adapters
                    if a.get("Name") and "Virtual" not in a.get("Name", "") and "RDP" not in a.get("Name", "")
                ]
                chosen = real_adapters[0] if real_adapters else (adapters[0] if adapters else None)
                if chosen and chosen.get("Name"):
                    display_adapter_name = chosen["Name"]
                    display_adapter_detected = True
                    if chosen.get("AdapterRAM"):
                        adapter_ram_mb = round(chosen["AdapterRAM"] / (1024 * 1024), 1)
        except Exception:
            pass

    # 2. Check NVIDIA GPU & telemetry via nvidia-smi (checking PATH and standard install directories)
    smi_path = _find_nvidia_smi()
    nvidia_detected = False
    nvidia_driver_ok = False
    nvidia_smi_ok = False
    driver_version: str | None = None
    gpu_name: str | None = None
    gpu_util: float | None = None
    mem_used: float | None = None
    mem_total: float | None = None
    temp: float | None = None

    if smi_path:
        try:
            proc = subprocess.run(
                [
                    smi_path,
                    "--query-gpu=name,driver_version,utilization.gpu,memory.used,memory.total,temperature.gpu",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                first_line = proc.stdout.strip().splitlines()[0]
                parts = [p.strip() for p in first_line.split(",")]
                if len(parts) >= 6:
                    nvidia_detected = True
                    nvidia_driver_ok = True
                    nvidia_smi_ok = True
                    gpu_name = parts[0]
                    driver_version = parts[1]
                    try:
                        gpu_util = float(parts[2])
                        mem_used = float(parts[3])
                        mem_total = float(parts[4])
                        temp = float(parts[5])
                    except ValueError:
                        pass
        except Exception:
            pass

    # If nvidia-smi was not executable but WMI reported an NVIDIA GPU
    if not nvidia_detected and display_adapter_name and "nvidia" in display_adapter_name.lower():
        nvidia_detected = True
        gpu_name = display_adapter_name

    # 3. Check NVIDIA Container Toolkit
    has_container_toolkit = bool(shutil.which("nvidia-container-cli") or shutil.which("nvidia-ctk"))

    # 4. Check Docker GPU Passthrough
    docker_gpu_passthrough = _check_docker_gpu_passthrough() if nvidia_detected else False
    engine_gpu_capable = bool(docker_gpu_passthrough and has_container_toolkit)
    gpu_processing_active = False

    # 5. Determine acceleration state truthfully
    if engine_gpu_capable:
        accel = "CUDA GPU container acceleration active"
        message = f"{gpu_name or 'NVIDIA GPU'} (CUDA acceleration active)"
    elif nvidia_detected and nvidia_driver_ok:
        accel = "CPU processing (NVIDIA GPU detected; container runs on CPU)"
        message = f"{gpu_name or 'NVIDIA GPU'} (Driver {driver_version or 'OK'} · CPU processing)"
    elif display_adapter_detected:
        accel = "CPU processing (standard NodeODM container)"
        message = f"{display_adapter_name} (Display Adapter · CPU processing)"
    else:
        accel = "CPU processing"
        message = "No discrete GPU detected. NodeODM will use CPU processing."

    gpu_hardware_present = bool(nvidia_detected or display_adapter_detected)

    return {
        "gpuAvailable": gpu_hardware_present,
        "gpuHardware": gpu_hardware_present,
        "gpuName": gpu_name or display_adapter_name,
        "driverVersion": driver_version,
        "displayAdapterDetected": display_adapter_detected,
        "displayAdapterName": display_adapter_name,
        "nvidiaGpuDetected": nvidia_detected,
        "nvidiaDriver": nvidia_driver_ok,
        "nvidiaDriverAvailable": nvidia_driver_ok,
        "nvidiaSmi": nvidia_smi_ok,
        "nvidiaSmiAvailable": nvidia_smi_ok,
        "nvidiaContainerToolkitAvailable": has_container_toolkit,
        "dockerGpuAccess": docker_gpu_passthrough,
        "dockerGpuPassthrough": docker_gpu_passthrough,
        "engineGpuCapability": engine_gpu_capable,
        "gpuProcessingActive": gpu_processing_active,
        "containerCudaActive": engine_gpu_capable,
        "cudaAvailable": engine_gpu_capable,
        "cudaDriverAvailable": nvidia_driver_ok,
        "gpuUtilization": gpu_util,
        "gpuMemoryUsed": mem_used,
        "gpuMemoryTotal": mem_total if mem_total is not None else adapter_ram_mb,
        "gpuTemperature": temp,
        "nodeodmAcceleration": accel,
        "message": message,
    }


def _ffmpeg() -> dict[str, Any]:
    try:
        from pipeline.ffmpeg import resolve_ffmpeg
        from pipeline.probe import ffmpeg_version

        path = resolve_ffmpeg()
        ver = ffmpeg_version(path)
        return {
            "status": "detected",
            "ok": True,
            "detected": True,
            "path": path,
            "version": ver,
            "message": f"FFmpeg {ver or 'detected'}",
            "recovery": "",
        }
    except Exception as exc:
        return {
            "status": "missing",
            "ok": False,
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

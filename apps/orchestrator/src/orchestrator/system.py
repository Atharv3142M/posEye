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

PINNED_NODEODM_VERSION = "3.6.2"
PINNED_CPU_IMAGE = "opendronemap/nodeodm:3.6.2"
PINNED_GPU_IMAGE = "opendronemap/nodeodm:3.6.2-gpu"


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


def evaluate_gpu_state(
    host_hardware: dict[str, Any],
    driver: dict[str, Any],
    docker_passthrough: bool,
    container_toolkit: bool,
    gpu_image_available: bool,
    running_container_image: str | None = None,
    container_has_gpus_flag: bool = False,
    gpu_telemetry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Evaluate the 8-stage GPU verification and acceleration state.
    Strictly enforces that opendronemap/nodeodm:3.6.2 is NEVER reported as
    GPU accelerated merely because Docker accepts --gpus all.
    """
    nvidia_detected = bool(host_hardware.get("has_nvidia"))
    display_adapter_detected = bool(host_hardware.get("display_adapter_detected", nvidia_detected))
    gpu_name = host_hardware.get("name")
    adapter_ram_mb = host_hardware.get("adapter_ram_mb")

    driver_ok = bool(driver.get("driver_ok"))
    driver_version = driver.get("version")
    smi_ok = bool(driver.get("smi_ok"))

    # Pinned image contract verification
    is_gpu_image_running = bool(
        running_container_image
        and ("gpu" in running_container_image.lower() or running_container_image == PINNED_GPU_IMAGE)
    )

    # CUDA acceleration is active ONLY when full stack is present AND container is a validated GPU image
    cuda_active = bool(
        nvidia_detected
        and driver_ok
        and docker_passthrough
        and container_has_gpus_flag
        and is_gpu_image_running
    )
    gpu_processing_active = cuda_active
    cpu_fallback_active = not cuda_active

    if cuda_active:
        accel = f"CUDA GPU container acceleration active ({running_container_image})"
        message = f"{gpu_name or 'NVIDIA GPU'} (CUDA acceleration active)"
    elif nvidia_detected and driver_ok:
        accel = f"CPU processing (standard NodeODM container: {running_container_image or PINNED_CPU_IMAGE})"
        message = f"{gpu_name or 'NVIDIA GPU'} (Driver {driver_version or 'OK'} · CPU processing)"
    elif display_adapter_detected:
        accel = "CPU processing (standard NodeODM container)"
        message = f"{gpu_name or 'Display Adapter'} (Display Adapter · CPU processing)"
    else:
        accel = "CPU processing"
        message = "No discrete GPU detected. NodeODM will use CPU processing."

    tel = gpu_telemetry or {}

    return {
        "gpuAvailable": bool(nvidia_detected or display_adapter_detected),
        "gpuHardware": bool(nvidia_detected or display_adapter_detected),
        "gpuName": gpu_name,
        "driverVersion": driver_version,
        "displayAdapterDetected": display_adapter_detected,
        "displayAdapterName": gpu_name,
        "nvidiaGpuDetected": nvidia_detected,
        "nvidiaDriver": driver_ok,
        "nvidiaDriverAvailable": driver_ok,
        "nvidiaSmi": smi_ok,
        "nvidiaSmiAvailable": smi_ok,
        "nvidiaContainerToolkitAvailable": container_toolkit,
        "dockerGpuAccess": docker_passthrough,
        "dockerGpuPassthrough": docker_passthrough,
        "gpuImageAvailable": gpu_image_available,
        "engineGpuCapability": bool(docker_passthrough and container_toolkit and gpu_image_available),
        "gpuProcessingActive": gpu_processing_active,
        "containerCudaActive": cuda_active,
        "cudaAvailable": cuda_active,
        "cudaDriverAvailable": driver_ok,
        "cpuFallbackActive": cpu_fallback_active,
        "gpuUtilization": tel.get("utilization"),
        "gpuMemoryUsed": tel.get("memory_used"),
        "gpuMemoryTotal": tel.get("memory_total") if tel.get("memory_total") is not None else adapter_ram_mb,
        "gpuTemperature": tel.get("temperature"),
        "nodeodmAcceleration": accel,
        "message": message,
    }


def _inspect_running_nodeodm_container() -> tuple[str | None, bool]:
    """Inspect running poseye-nodeodm container for config image and GPU flags."""
    docker_bin = shutil.which("docker")
    if not docker_bin:
        return None, False
    try:
        proc = subprocess.run(
            ["docker", "inspect", "--format", "{{.Config.Image}}|{{json .HostConfig.DeviceRequests}}", "poseye-nodeodm"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            parts = proc.stdout.strip().split("|", 1)
            img = parts[0].strip() if parts else None
            dev_reqs = parts[1].strip() if len(parts) > 1 else ""
            has_gpus = "gpu" in dev_reqs.lower() or "nvidia" in dev_reqs.lower()
            return img, has_gpus
    except Exception:
        pass
    return None, False


def _check_gpu_image_available() -> bool:
    """Check if the pinned GPU image is pulled locally."""
    docker_bin = shutil.which("docker")
    if not docker_bin:
        return False
    try:
        proc = subprocess.run(
            ["docker", "images", "-q", PINNED_GPU_IMAGE],
            capture_output=True,
            text=True,
            timeout=2,
        )
        return proc.returncode == 0 and bool(proc.stdout.strip())
    except Exception:
        return False


def _gpu() -> dict[str, Any]:
    display_adapter_name: str | None = None
    display_adapter_detected = False
    adapter_ram_mb: float | None = None
    has_nvidia = False

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
                    if "nvidia" in display_adapter_name.lower():
                        has_nvidia = True
                    if chosen.get("AdapterRAM"):
                        adapter_ram_mb = round(chosen["AdapterRAM"] / (1024 * 1024), 1)
        except Exception:
            pass

    # 2. Check NVIDIA GPU & telemetry via nvidia-smi (checking PATH and standard install directories)
    smi_path = _find_nvidia_smi()
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
                    has_nvidia = True
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
    if not has_nvidia and display_adapter_name and "nvidia" in display_adapter_name.lower():
        has_nvidia = True
        gpu_name = display_adapter_name

    if not gpu_name:
        gpu_name = display_adapter_name

    has_container_toolkit = bool(shutil.which("nvidia-container-cli") or shutil.which("nvidia-ctk"))
    docker_gpu_passthrough = _check_docker_gpu_passthrough() if has_nvidia else False
    gpu_image_available = _check_gpu_image_available()
    running_image, container_gpus_flag = _inspect_running_nodeodm_container()

    host_hardware = {
        "has_nvidia": has_nvidia,
        "name": gpu_name,
        "display_adapter_detected": display_adapter_detected,
        "adapter_ram_mb": adapter_ram_mb,
    }
    driver_dict = {
        "driver_ok": nvidia_driver_ok,
        "version": driver_version,
        "smi_ok": nvidia_smi_ok,
    }
    telemetry = {
        "utilization": gpu_util,
        "memory_used": mem_used,
        "memory_total": mem_total,
        "temperature": temp,
    }

    return evaluate_gpu_state(
        host_hardware=host_hardware,
        driver=driver_dict,
        docker_passthrough=docker_gpu_passthrough,
        container_toolkit=has_container_toolkit,
        gpu_image_available=gpu_image_available,
        running_container_image=running_image,
        container_has_gpus_flag=container_gpus_flag,
        gpu_telemetry=telemetry,
    )


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
            "recovery": "Start the NodeODM container: docker run -d -p 3000:3000 opendronemap/nodeodm:3.6.2",
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


def system_diagnostics_report() -> dict[str, Any]:
    """Generate exportable diagnostic report with all secrets and tokens strictly redacted."""
    import platform
    import sys
    from datetime import datetime, timezone

    status = system_status()
    env_safe: dict[str, str] = {}
    for k, v in os.environ.items():
        if any(term in k.upper() for term in ["TOKEN", "SECRET", "KEY", "PASSWORD", "AUTH"]):
            env_safe[k] = "[REDACTED]"
        else:
            env_safe[k] = v

    return {
        "reportGeneratedAt": datetime.now(timezone.utc).isoformat(),
        "platform": {
            "os": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "pythonVersion": sys.version.split()[0],
        },
        "systemStatus": status,
        "pinnedImages": {
            "nodeodmVersion": PINNED_NODEODM_VERSION,
            "cpuImage": PINNED_CPU_IMAGE,
            "gpuImage": PINNED_GPU_IMAGE,
        },
        "environmentVariables": env_safe,
    }


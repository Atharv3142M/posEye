import pytest
from unittest.mock import patch, MagicMock

from orchestrator.system import (
    PINNED_NODEODM_VERSION,
    PINNED_CPU_IMAGE,
    PINNED_GPU_IMAGE,
    evaluate_gpu_state,
    is_exact_pinned_gpu_image,
)


def test_pinned_image_contracts():
    assert PINNED_NODEODM_VERSION == "3.6.2"
    assert PINNED_CPU_IMAGE == "opendronemap/nodeodm:3.6.2"
    assert PINNED_GPU_IMAGE == "opendronemap/nodeodm:3.6.2-gpu"


def test_is_exact_pinned_gpu_image():
    assert is_exact_pinned_gpu_image("opendronemap/nodeodm:3.6.2-gpu") is True
    assert is_exact_pinned_gpu_image("opendronemap/nodeodm:3.6.2-gpu@sha256:abc123def456") is True
    # Arbitrary substrings MUST be rejected
    assert is_exact_pinned_gpu_image("my-custom-image:gpu") is False
    assert is_exact_pinned_gpu_image("opendronemap/nodeodm:gpu-latest") is False
    assert is_exact_pinned_gpu_image("ubuntu:latest-gpu") is False
    assert is_exact_pinned_gpu_image(None) is False
    assert is_exact_pinned_gpu_image("") is False


def test_standard_nodeodm_never_described_as_gpu_accelerated():
    """
    CRITICAL REQUIREMENT:
    The current standard opendronemap/nodeodm:3.6.2 image must not be described as
    GPU accelerated merely because Docker accepts --gpus all.
    """
    state = evaluate_gpu_state(
        host_hardware={"has_nvidia": True, "name": "NVIDIA GeForce RTX 4070"},
        driver={"driver_ok": True, "version": "550.54", "smi_ok": True},
        docker_passthrough=True,
        container_toolkit=True,
        gpu_image_available=False,
        running_container_image=PINNED_CPU_IMAGE,  # standard CPU image!
        container_has_gpus_flag=True,  # Docker was given --gpus all
        container_cuda_verified=False,
    )

    # Must NOT claim CUDA acceleration active
    assert state["cudaAvailable"] is False
    assert state["gpuProcessingActive"] is False
    assert state["cpuFallbackActive"] is True
    assert "CPU processing" in state["nodeodmAcceleration"]
    assert "standard NodeODM" in state["nodeodmAcceleration"] or "CPU" in state["nodeodmAcceleration"]


def test_gpu_image_with_full_stack_and_active_processing():
    """
    When all 8 levels are satisfied (Hardware, Driver, Docker, Toolkit, GPU Image, CUDA runtime)
    AND ODM confirms active GPU processing, GPU processing is reported active.
    """
    state = evaluate_gpu_state(
        host_hardware={"has_nvidia": True, "name": "NVIDIA GeForce RTX 4070"},
        driver={"driver_ok": True, "version": "550.54", "smi_ok": True},
        docker_passthrough=True,
        container_toolkit=True,
        gpu_image_available=True,
        running_container_image=PINNED_GPU_IMAGE,  # validated exact GPU image
        container_has_gpus_flag=True,
        container_cuda_verified=True,
        odm_gpu_confirmed=True,
    )

    assert state["nvidiaGpuDetected"] is True
    assert state["nvidiaDriverAvailable"] is True
    assert state["dockerGpuPassthrough"] is True
    assert state["nvidiaContainerToolkitAvailable"] is True
    assert state["gpuImageAvailable"] is True
    assert state["containerCudaCapable"] is True
    assert state["cudaAvailable"] is True
    assert state["gpuProcessingActive"] is True
    assert state["cpuFallbackActive"] is False
    assert "CUDA" in state["nodeodmAcceleration"]
    assert "active" in state["nodeodmAcceleration"]


def test_gpu_container_standby_vs_processing_active():
    """
    Keep gpuProcessingActive separate from gpuHardwareDetected and container capability.
    When idle / standby (odm_gpu_confirmed=False), container is ready but processing is NOT active.
    """
    state = evaluate_gpu_state(
        host_hardware={"has_nvidia": True, "name": "NVIDIA GeForce RTX 4070"},
        driver={"driver_ok": True, "version": "550.54", "smi_ok": True},
        docker_passthrough=True,
        container_toolkit=True,
        gpu_image_available=True,
        running_container_image=PINNED_GPU_IMAGE,
        container_has_gpus_flag=True,
        container_cuda_verified=True,
        odm_gpu_confirmed=False,  # idle standby
    )

    assert state["containerCudaCapable"] is True
    assert state["cudaAvailable"] is True
    assert state["gpuProcessingActive"] is False  # NOT active yet!
    assert "standby" in state["nodeodmAcceleration"]


def test_gpu_container_cuda_failure_prevents_acceleration():
    """
    If container runs the GPU image but CUDA runtime fails inside the container,
    acceleration must NOT be claimed.
    """
    state = evaluate_gpu_state(
        host_hardware={"has_nvidia": True, "name": "NVIDIA GeForce RTX 4070"},
        driver={"driver_ok": True, "version": "550.54", "smi_ok": True},
        docker_passthrough=True,
        container_toolkit=True,
        gpu_image_available=True,
        running_container_image=PINNED_GPU_IMAGE,
        container_has_gpus_flag=True,
        container_cuda_verified=False,  # CUDA runtime failed inside container
        odm_gpu_confirmed=False,
    )

    assert state["containerCudaCapable"] is False
    assert state["cudaAvailable"] is False
    assert state["gpuProcessingActive"] is False
    assert state["cpuFallbackActive"] is True


def test_cpu_fallback_when_nvidia_hardware_missing():
    """
    Separate CPU and NVIDIA modes: CPU processing continues to work cleanly
    when NVIDIA hardware is unavailable.
    """
    state = evaluate_gpu_state(
        host_hardware={"has_nvidia": False, "name": "Intel Iris Xe"},
        driver={"driver_ok": False, "version": None, "smi_ok": False},
        docker_passthrough=False,
        container_toolkit=False,
        gpu_image_available=False,
        running_container_image=PINNED_CPU_IMAGE,
        container_has_gpus_flag=False,
        container_cuda_verified=False,
    )

    assert state["nvidiaGpuDetected"] is False
    assert state["cudaAvailable"] is False
    assert state["gpuProcessingActive"] is False
    assert state["cpuFallbackActive"] is True
    assert "CPU" in state["nodeodmAcceleration"]


def test_cpu_fallback_when_docker_lacks_toolkit():
    """
    NVIDIA GPU present, but Docker / Container Toolkit not configured:
    graceful CPU fallback.
    """
    state = evaluate_gpu_state(
        host_hardware={"has_nvidia": True, "name": "NVIDIA RTX 3060"},
        driver={"driver_ok": True, "version": "535.104", "smi_ok": True},
        docker_passthrough=False,
        container_toolkit=False,
        gpu_image_available=False,
        running_container_image=PINNED_CPU_IMAGE,
        container_has_gpus_flag=False,
        container_cuda_verified=False,
    )

    assert state["nvidiaGpuDetected"] is True
    assert state["nvidiaDriverAvailable"] is True
    assert state["dockerGpuPassthrough"] is False
    assert state["cudaAvailable"] is False
    assert state["cpuFallbackActive"] is True
    assert "CPU processing" in state["nodeodmAcceleration"]


def test_windows_docker_desktop_wsl2_gpu_detection(monkeypatch):
    import subprocess
    from orchestrator import system

    monkeypatch.setattr(system.os, "name", "nt")
    monkeypatch.setattr(system, "_find_nvidia_smi", lambda: r"C:\Windows\System32\nvidia-smi.exe")
    monkeypatch.setattr(
        system.shutil,
        "which",
        lambda name: r"C:\Program Files\Docker\Docker\resources\bin\docker.exe" if name == "docker" else None,
    )

    def fake_run(cmd, *args, **kwargs):
        if cmd[:2] == ["docker", "info"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout='{"io.containerd.runc.v2":{"path":"runc"},"runc":{"path":"runc"}}|linux|Docker Desktop\n',
                stderr="",
            )
        if "-L" in cmd:
            return subprocess.CompletedProcess(cmd, 0, stdout="GPU 0: NVIDIA GeForce RTX 4070\n", stderr="")
        if "--query-gpu=name,driver_version,utilization.gpu,memory.used,memory.total,temperature.gpu" in cmd:
            return subprocess.CompletedProcess(cmd, 0, stdout="NVIDIA GeForce RTX 4070, 550.54, 5, 512, 12288, 42\n", stderr="")
        if cmd[:2] == ["docker", "images"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="abc123\n", stderr="")
        if cmd[:2] == ["docker", "inspect"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout=f"{PINNED_GPU_IMAGE}|[{{\"Driver\":\"\",\"Count\":-1,\"Capabilities\":[[\"gpu\"]]}}]\n",
                stderr="",
            )
        if cmd[:2] == ["docker", "exec"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="GPU 0: NVIDIA GeForce RTX 4070\n", stderr="")
        if cmd[0] == "powershell":
            return subprocess.CompletedProcess(cmd, 0, stdout='{"Name":"NVIDIA GeForce RTX 4070","AdapterRAM":4293918720}', stderr="")
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="")

    monkeypatch.setattr(system.subprocess, "run", fake_run)

    assert system._check_docker_gpu_passthrough() is True
    gpu_state = system._gpu()
    assert gpu_state["dockerGpuPassthrough"] is True
    assert gpu_state["nvidiaContainerToolkitAvailable"] is True
    assert gpu_state["containerCudaCapable"] is True


def test_windows_docker_info_failure_disables_passthrough(monkeypatch):
    import subprocess
    from orchestrator import system

    monkeypatch.setattr(system.os, "name", "nt")
    monkeypatch.setattr(system, "_find_nvidia_smi", lambda: r"C:\Windows\System32\nvidia-smi.exe")
    monkeypatch.setattr(system.shutil, "which", lambda name: "docker.exe" if name == "docker" else None)

    def fake_run(cmd, *args, **kwargs):
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="Cannot connect to the Docker daemon")

    monkeypatch.setattr(system.subprocess, "run", fake_run)
    assert system._check_docker_gpu_passthrough() is False

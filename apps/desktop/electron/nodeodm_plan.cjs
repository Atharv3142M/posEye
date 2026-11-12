"use strict";

const DEFAULT_CONTAINER_NAME = "poseye-nodeodm";
const DEFAULT_CPU_IMAGE = "opendronemap/nodeodm:3.6.2";
const DEFAULT_GPU_IMAGE = "opendronemap/nodeodm:3.6.2-gpu";
const MANAGED_LABEL_KEY = "org.posEye.managed";
const MANAGED_LABEL_VALUE = "true";

function isPosEyeManaged(
  container,
  { cpuImage = DEFAULT_CPU_IMAGE, gpuImage = DEFAULT_GPU_IMAGE, containerName = DEFAULT_CONTAINER_NAME } = {},
) {
  if (!container || typeof container !== "object") return false;
  if (container.labels && container.labels[MANAGED_LABEL_KEY] === MANAGED_LABEL_VALUE) {
    return true;
  }
  const normalizedName = typeof container.name === "string" ? container.name.replace(/^\/+/, "") : "";
  const img = container.image || container.configImage || "";
  return normalizedName === containerName && (img === cpuImage || img === gpuImage);
}

function buildDockerRunArgs({
  containerName = DEFAULT_CONTAINER_NAME,
  image = DEFAULT_CPU_IMAGE,
  gpu = false,
  hasNvidiaRuntime = false,
  port = 3000,
} = {}) {
  const args = [
    "run",
    "-d",
    "--name", containerName,
    "--label", `${MANAGED_LABEL_KEY}=${MANAGED_LABEL_VALUE}`,
    "--restart", "unless-stopped",
    "-p", `${port}:3000`,
  ];
  if (gpu) {
    args.push(
      "--gpus", "all",
      "-e", "NVIDIA_VISIBLE_DEVICES=all",
      "-e", "NVIDIA_DRIVER_CAPABILITIES=compute,utility",
    );
    if (hasNvidiaRuntime) {
      args.push("--runtime", "nvidia");
    }
  }
  args.push(image);
  return args;
}

function isGpuLaunchError(err) {
  const msg = String(err && err.message ? err.message : err);
  return /gpu|nvidia|runtime|could not select device|device driver/i.test(msg);
}

function containerMatchesTarget(container, { targetImage, gpu }) {
  if (!container || container.status !== "running") return false;
  const img = container.image || container.configImage || "";
  if (img !== targetImage) return false;
  return gpu ? Boolean(container.hasGpu) : !container.hasGpu;
}

async function ensureImageAvailable(ops, image) {
  if (await ops.imageLocal(image)) return;
  if (ops.loadOfflineTar) {
    const loaded = await ops.loadOfflineTar(image);
    if (loaded && (await ops.imageLocal(image))) return;
  }
  await ops.pullImage(image);
}

async function planNodeOdm(ops, opts = {}) {
  const {
    gpuPreferred = true,
    cpuImage = DEFAULT_CPU_IMAGE,
    gpuImage = DEFAULT_GPU_IMAGE,
    containerName = DEFAULT_CONTAINER_NAME,
    port = 3000,
  } = opts;

  const log = typeof ops.log === "function" ? ops.log : () => {};

  const existing = await ops.inspectContainer(containerName);
  if (existing && !isPosEyeManaged(existing, { cpuImage, gpuImage, containerName })) {
    const existingImg = existing.image || existing.configImage || "unknown";
    throw new Error(
      `Container '${containerName}' exists and is not managed by posEye (image: '${existingImg}'). ` +
      `Refusing to remove an unmanaged container. Please stop or remove '${containerName}' manually.`,
    );
  }

  const gpuUsable = Boolean(gpuPreferred && (await ops.hostGpuUsable()));
  let targetImage = gpuUsable ? gpuImage : cpuImage;
  let useGpu = gpuUsable;
  let fallbackReason = null;

  if (containerMatchesTarget(existing, { targetImage, gpu: useGpu })) {
    log("info", `Reusing running ${useGpu ? "GPU" : "CPU"} NodeODM container (${targetImage})`);
    return { action: "reused", image: targetImage, gpu: useGpu, reason: null };
  }

  if (useGpu) {
    try {
      await ensureImageAvailable(ops, gpuImage);
    } catch (pullErr) {
      fallbackReason = `Failed to pull GPU image ${gpuImage}: ${pullErr && pullErr.message ? pullErr.message : pullErr}`;
      log("warn", `${fallbackReason}; falling back to CPU image ${cpuImage}`);
      useGpu = false;
      targetImage = cpuImage;

      if (containerMatchesTarget(existing, { targetImage: cpuImage, gpu: false })) {
        return { action: "fallback_cpu", image: cpuImage, gpu: false, reason: fallbackReason };
      }
    }
  }

  if (!useGpu) {
    await ensureImageAvailable(ops, cpuImage);
  }

  const wasUpgrade = Boolean(existing && existing.status === "running");
  if (existing) {
    const existingImg = existing.image || existing.configImage || "unknown";
    log("info", `Removing existing managed NodeODM container '${containerName}' (${existingImg}, status: ${existing.status || "unknown"})`);
    await ops.removeContainer(containerName);
  }

  const launchContainer = async (image, gpu) => {
    const hasNvidiaRuntime = gpu && ops.hasNvidiaRuntime ? Boolean(await ops.hasNvidiaRuntime()) : false;
    const args = buildDockerRunArgs({ containerName, image, gpu, hasNvidiaRuntime, port });
    await ops.createContainer({ containerName, image, gpu, args });
  };

  try {
    await launchContainer(targetImage, useGpu);
    if (fallbackReason) {
      return { action: "fallback_cpu", image: targetImage, gpu: false, reason: fallbackReason };
    }
    return {
      action: wasUpgrade ? "upgraded" : "created",
      image: targetImage,
      gpu: useGpu,
      reason: null,
    };
  } catch (err) {
    if (useGpu && isGpuLaunchError(err)) {
      const startFallbackReason = `GPU container launch failed (${err && err.message ? err.message : err}); falling back to CPU image ${cpuImage}`;
      log("warn", startFallbackReason);
      await ops.removeContainer(containerName).catch(() => {});
      await ensureImageAvailable(ops, cpuImage);
      await launchContainer(cpuImage, false);
      return { action: "fallback_cpu", image: cpuImage, gpu: false, reason: startFallbackReason };
    }
    throw err;
  }
}

module.exports = {
  DEFAULT_CONTAINER_NAME,
  DEFAULT_CPU_IMAGE,
  DEFAULT_GPU_IMAGE,
  MANAGED_LABEL_KEY,
  MANAGED_LABEL_VALUE,
  isPosEyeManaged,
  buildDockerRunArgs,
  isGpuLaunchError,
  planNodeOdm,
};

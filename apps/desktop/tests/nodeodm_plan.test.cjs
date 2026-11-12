const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_CPU_IMAGE,
  DEFAULT_GPU_IMAGE,
  isPosEyeManaged,
  planNodeOdm,
} = require("../electron/nodeodm_plan.cjs");

function makeOps(overrides = {}) {
  const calls = {
    pulled: [],
    removed: [],
    created: [],
    logs: [],
  };
  const ops = {
    calls,
    log: (level, msg) => calls.logs.push({ level, msg }),
    hostGpuUsable: async () => true,
    inspectContainer: async () => null,
    imageLocal: async () => false,
    loadOfflineTar: async () => false,
    pullImage: async (image) => {
      calls.pulled.push(image);
    },
    removeContainer: async (name) => {
      calls.removed.push(name);
    },
    hasNvidiaRuntime: async () => false,
    createContainer: async (spec) => {
      calls.created.push(spec);
    },
    ...overrides,
  };
  return ops;
}

test("isPosEyeManaged - Ownership verification via label or pinned image on poseye-nodeodm", () => {
  assert.equal(isPosEyeManaged(null), false);
  assert.equal(isPosEyeManaged(undefined), false);
  assert.equal(
    isPosEyeManaged({ name: "poseye-nodeodm", image: "nginx:alpine", labels: {} }),
    false,
  );
  assert.equal(
    isPosEyeManaged({ name: "other-container", image: DEFAULT_CPU_IMAGE, labels: {} }),
    false,
  );
  assert.equal(
    isPosEyeManaged({
      name: "poseye-nodeodm",
      image: "custom:tag",
      labels: { "org.posEye.managed": "true" },
    }),
    true,
  );
  assert.equal(
    isPosEyeManaged({ name: "poseye-nodeodm", image: DEFAULT_CPU_IMAGE, labels: {} }),
    true,
  );
  assert.equal(
    isPosEyeManaged({ name: "/poseye-nodeodm", configImage: DEFAULT_GPU_IMAGE }),
    true,
  );
});

test("planNodeOdm - GPU preferred + GPU usable + GPU image not cached pulls 3.6.2-gpu and launches with GPU", async () => {
  const ops = makeOps({
    hostGpuUsable: async () => true,
    imageLocal: async () => false,
  });

  const plan = await planNodeOdm(ops, { gpuPreferred: true });

  assert.equal(plan.action, "created");
  assert.equal(plan.image, DEFAULT_GPU_IMAGE);
  assert.equal(plan.gpu, true);
  assert.equal(plan.reason, null);
  assert.deepEqual(ops.calls.pulled, [DEFAULT_GPU_IMAGE]);
  assert.equal(ops.calls.created.length, 1);

  const args = ops.calls.created[0].args;
  assert.ok(args.includes("--label"));
  assert.ok(args.includes("org.posEye.managed=true"));
  assert.ok(args.includes("--gpus"));
  assert.ok(args.includes("all"));
  assert.ok(args.includes("NVIDIA_VISIBLE_DEVICES=all"));
  assert.ok(args.includes("NVIDIA_DRIVER_CAPABILITIES=compute,utility"));
  assert.equal(args[args.length - 1], DEFAULT_GPU_IMAGE);
});

test("planNodeOdm - GPU pull fails falls back to 3.6.2 CPU with reason populated", async () => {
  const ops = makeOps({
    hostGpuUsable: async () => true,
    imageLocal: async (img) => img === DEFAULT_CPU_IMAGE,
    pullImage: async (img) => {
      ops.calls.pulled.push(img);
      if (img === DEFAULT_GPU_IMAGE) {
        throw new Error("registry pull timeout");
      }
    },
  });

  const plan = await planNodeOdm(ops, { gpuPreferred: true });

  assert.equal(plan.action, "fallback_cpu");
  assert.equal(plan.image, DEFAULT_CPU_IMAGE);
  assert.equal(plan.gpu, false);
  assert.ok(plan.reason && /registry pull timeout/i.test(plan.reason));
  assert.deepEqual(ops.calls.pulled, [DEFAULT_GPU_IMAGE]);
  assert.equal(ops.calls.created.length, 1);
  assert.equal(ops.calls.created[0].gpu, false);
  assert.equal(ops.calls.created[0].image, DEFAULT_CPU_IMAGE);
  assert.ok(!ops.calls.created[0].args.includes("--gpus"));
});

test("planNodeOdm - GPU container start fails cleans up and falls back to 3.6.2 CPU", async () => {
  const ops = makeOps({
    hostGpuUsable: async () => true,
    imageLocal: async () => true,
    createContainer: async (spec) => {
      ops.calls.created.push(spec);
      if (spec.gpu) {
        throw new Error('docker: Error response from daemon: could not select device driver "" with capabilities: [[gpu]].');
      }
    },
  });

  const plan = await planNodeOdm(ops, { gpuPreferred: true });

  assert.equal(plan.action, "fallback_cpu");
  assert.equal(plan.image, DEFAULT_CPU_IMAGE);
  assert.equal(plan.gpu, false);
  assert.ok(plan.reason && /could not select device driver/i.test(plan.reason));
  assert.deepEqual(ops.calls.removed, ["poseye-nodeodm"]);
  assert.equal(ops.calls.created.length, 2);
  assert.equal(ops.calls.created[0].gpu, true);
  assert.equal(ops.calls.created[1].gpu, false);
  assert.equal(ops.calls.created[1].image, DEFAULT_CPU_IMAGE);
});

test("planNodeOdm - Existing running CPU poseye-nodeodm on GPU-capable host removes managed CPU container and starts 3.6.2-gpu", async () => {
  const ops = makeOps({
    hostGpuUsable: async () => true,
    imageLocal: async () => false,
    inspectContainer: async () => ({
      name: "poseye-nodeodm",
      status: "running",
      image: DEFAULT_CPU_IMAGE,
      labels: { "org.posEye.managed": "true" },
      hasGpu: false,
    }),
  });

  const plan = await planNodeOdm(ops, { gpuPreferred: true });

  assert.equal(plan.action, "upgraded");
  assert.equal(plan.image, DEFAULT_GPU_IMAGE);
  assert.equal(plan.gpu, true);
  assert.deepEqual(ops.calls.pulled, [DEFAULT_GPU_IMAGE]);
  assert.deepEqual(ops.calls.removed, ["poseye-nodeodm"]);
  assert.equal(ops.calls.created.length, 1);
  assert.equal(ops.calls.created[0].image, DEFAULT_GPU_IMAGE);
  assert.equal(ops.calls.created[0].gpu, true);
});

test("planNodeOdm - Unmanaged container named poseye-nodeodm refuses docker rm and throws", async () => {
  const ops = makeOps({
    hostGpuUsable: async () => true,
    inspectContainer: async () => ({
      name: "poseye-nodeodm",
      status: "running",
      image: "nginx:alpine",
      labels: {},
      hasGpu: false,
    }),
  });

  await assert.rejects(
    async () => planNodeOdm(ops, { gpuPreferred: true }),
    /not managed by posEye/i,
  );

  assert.deepEqual(ops.calls.removed, []);
  assert.deepEqual(ops.calls.pulled, []);
  assert.deepEqual(ops.calls.created, []);
});

test("planNodeOdm - Reuses running GPU container when already matching target variant", async () => {
  const ops = makeOps({
    hostGpuUsable: async () => true,
    inspectContainer: async () => ({
      name: "poseye-nodeodm",
      status: "running",
      image: DEFAULT_GPU_IMAGE,
      labels: { "org.posEye.managed": "true" },
      hasGpu: true,
    }),
  });

  const plan = await planNodeOdm(ops, { gpuPreferred: true });

  assert.equal(plan.action, "reused");
  assert.equal(plan.image, DEFAULT_GPU_IMAGE);
  assert.equal(plan.gpu, true);
  assert.deepEqual(ops.calls.pulled, []);
  assert.deepEqual(ops.calls.removed, []);
  assert.deepEqual(ops.calls.created, []);
});

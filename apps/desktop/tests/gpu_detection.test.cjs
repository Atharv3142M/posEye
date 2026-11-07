const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PINNED_NODEODM_VERSION,
  PINNED_CPU_IMAGE,
  PINNED_GPU_IMAGE,
  PINNED_IMAGE,
  verifyNodeOdmInfo,
  evaluateContainerCompatibility,
} = require("../electron/main.cjs");

test("GPU Contract - Exact pinned image tags", () => {
  assert.equal(PINNED_NODEODM_VERSION, "3.6.2");
  assert.equal(PINNED_CPU_IMAGE, "opendronemap/nodeodm:3.6.2");
  assert.equal(PINNED_GPU_IMAGE, "opendronemap/nodeodm:3.6.2-gpu");
  assert.equal(PINNED_IMAGE, "opendronemap/nodeodm:3.6.2");
});

test("GPU Contract - Standard image is never assumed to be GPU accelerated", () => {
  // Verifies that standard CPU tag and GPU tag are distinct
  assert.notEqual(PINNED_CPU_IMAGE, PINNED_GPU_IMAGE);
  assert.equal(PINNED_CPU_IMAGE.endsWith("-gpu"), false);
  assert.equal(PINNED_GPU_IMAGE.endsWith("-gpu"), true);
});

test("Container Compatibility - Accepts pinned CPU and GPU images", () => {
  const cpuContainer = {
    name: "poseye-nodeodm",
    status: "running",
    configImage: "opendronemap/nodeodm:3.6.2",
  };
  const resCpu = evaluateContainerCompatibility(cpuContainer);
  assert.equal(resCpu.canReuse, true);

  const gpuContainer = {
    name: "poseye-nodeodm",
    status: "running",
    configImage: "opendronemap/nodeodm:3.6.2-gpu",
  };
  const resGpu = evaluateContainerCompatibility(gpuContainer);
  assert.equal(resGpu.canReuse, true);

  const untaggedContainer = {
    name: "poseye-nodeodm",
    status: "running",
    configImage: "opendronemap/nodeodm:latest",
  };
  const resUntagged = evaluateContainerCompatibility(untaggedContainer);
  assert.equal(resUntagged.canReuse, false);
  assert.equal(resUntagged.reason, "incompatible_image");
});

test("verifyNodeOdmInfo - Validates exact version 3.6.2", () => {
  assert.equal(verifyNodeOdmInfo({ version: "3.6.2" }), true);
  assert.equal(verifyNodeOdmInfo({ version: "3.6.1" }), false);
  assert.equal(verifyNodeOdmInfo({ version: "latest" }), false);
  assert.equal(verifyNodeOdmInfo(null), false);
  assert.equal(verifyNodeOdmInfo("3.6.2"), false);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyNodeOdmInfo, pullDockerImage } = require("../electron/main.cjs");

test("verifyNodeOdmInfo - Version Contract", () => {
  // Valid NodeODM info responses
  assert.equal(verifyNodeOdmInfo({ version: "3.6.2", taskQueueCount: 0 }), true);
  assert.equal(verifyNodeOdmInfo({ version: "3.6.0" }), true);
  assert.equal(verifyNodeOdmInfo({ version: "3.5.1" }), true);

  // Incompatible or missing version
  assert.equal(verifyNodeOdmInfo({ version: "" }), false);
  assert.equal(verifyNodeOdmInfo({ version: "   " }), false);
  assert.equal(verifyNodeOdmInfo({ status: "running" }), false);
  assert.equal(verifyNodeOdmInfo({}), false);
  assert.equal(verifyNodeOdmInfo(null), false);
  assert.equal(verifyNodeOdmInfo(undefined), false);
  assert.equal(verifyNodeOdmInfo("3.6.2"), false);
});

test("pullDockerImage - Timeout and Termination Handling", async () => {
  // Test that pullDockerImage enforces timeout and kills child process
  const start = Date.now();
  await assert.rejects(
    async () => {
      // Use an unreachable domain or non-routable image with a 100ms timeout
      await pullDockerImage("192.0.2.1/dummy/nodeodm:3.6.2", () => {}, { timeoutMs: 100 });
    },
    /timed out/i,
    "Should reject with timeout error"
  );
  const elapsed = Date.now() - start;
  // Should have terminated well before standard network timeout (e.g. within 3 seconds)
  assert.ok(elapsed < 4000, `Process should be terminated on timeout, took ${elapsed}ms`);
});

test("NodeODM Container Image Identity & Reuse Rules", () => {
  const PINNED_IMAGE = "opendronemap/nodeodm:3.6.2";

  function evaluateContainerCompatibility(container, pinnedImage) {
    if (!container) return { canReuse: false, reason: "missing" };
    if (container.configImage === pinnedImage) {
      return { canReuse: true, reason: "pinned_image_match" };
    }
    return { canReuse: false, reason: "incompatible_image", image: container.configImage };
  }

  // 1. Compatible pinned container
  const compatible = { name: "poseye-nodeodm", status: "running", configImage: PINNED_IMAGE };
  const res1 = evaluateContainerCompatibility(compatible, PINNED_IMAGE);
  assert.equal(res1.canReuse, true);
  assert.equal(res1.reason, "pinned_image_match");

  // 2. Incompatible container (older version)
  const older = { name: "poseye-nodeodm", status: "running", configImage: "opendronemap/nodeodm:2.8.0" };
  const res2 = evaluateContainerCompatibility(older, PINNED_IMAGE);
  assert.equal(res2.canReuse, false);
  assert.equal(res2.reason, "incompatible_image");

  // 3. Incompatible container (untagged or arbitrary image)
  const untagged = { name: "poseye-nodeodm", status: "running", configImage: "opendronemap/nodeodm" };
  const res3 = evaluateContainerCompatibility(untagged, PINNED_IMAGE);
  assert.equal(res3.canReuse, false);
  assert.equal(res3.reason, "incompatible_image");

  // 4. Missing container
  const res4 = evaluateContainerCompatibility(null, PINNED_IMAGE);
  assert.equal(res4.canReuse, false);
  assert.equal(res4.reason, "missing");
});

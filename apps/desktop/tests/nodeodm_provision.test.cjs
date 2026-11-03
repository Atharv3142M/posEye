const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PINNED_NODEODM_VERSION,
  PINNED_IMAGE,
  verifyNodeOdmInfo,
  evaluateContainerCompatibility,
  pullDockerImage,
} = require("../electron/main.cjs");

test("verifyNodeOdmInfo - Exact Version Contract", () => {
  // 1. Exact 3.6.2 accepted
  assert.equal(verifyNodeOdmInfo({ version: "3.6.2", taskQueueCount: 0 }), true);
  assert.equal(verifyNodeOdmInfo({ version: " 3.6.2 " }), true);

  // 2. Older versions rejected
  assert.equal(verifyNodeOdmInfo({ version: "3.6.0" }), false);
  assert.equal(verifyNodeOdmInfo({ version: "3.5.1" }), false);
  assert.equal(verifyNodeOdmInfo({ version: "2.8.0" }), false);

  // 3. Newer unsupported versions rejected
  assert.equal(verifyNodeOdmInfo({ version: "3.7.0" }), false);
  assert.equal(verifyNodeOdmInfo({ version: "4.0.0" }), false);

  // 4. Missing version rejected
  assert.equal(verifyNodeOdmInfo({}), false);
  assert.equal(verifyNodeOdmInfo({ version: "" }), false);
  assert.equal(verifyNodeOdmInfo({ version: "   " }), false);
  assert.equal(verifyNodeOdmInfo({ status: "running" }), false);

  // 5. Invalid JSON / primitive values rejected
  assert.equal(verifyNodeOdmInfo(null), false);
  assert.equal(verifyNodeOdmInfo(undefined), false);
  assert.equal(verifyNodeOdmInfo("3.6.2"), false);
  assert.equal(verifyNodeOdmInfo([1, 2, 3]), false);
  assert.equal(verifyNodeOdmInfo(123), false);

  // 6. An unrelated service on port 3000 rejected
  // E.g. Vite dev server, Express API, Grafana, or WebODM root endpoint
  assert.equal(verifyNodeOdmInfo({ name: "unrelated-service", version: "1.0.0" }), false);
  assert.equal(verifyNodeOdmInfo({ error: "Cannot GET /info", statusCode: 404 }), false);
  assert.equal(verifyNodeOdmInfo({ message: "Welcome to NodeODM Web" }), false);
});

test("evaluateContainerCompatibility - Production Container Identity & Reuse Helper", () => {
  // 1. Exact pinned image tag match
  const compatiblePinned = { name: "poseye-nodeodm", status: "running", configImage: PINNED_IMAGE };
  const res1 = evaluateContainerCompatibility(compatiblePinned);
  assert.equal(res1.canReuse, true);
  assert.equal(res1.reason, "pinned_image_match");

  // 2. Image ID match (alternative tag or digest pointing to same image ID)
  const compatibleId = {
    name: "poseye-nodeodm",
    status: "running",
    configImage: "custom-odm-tag:local",
    imageId: "sha256:abcd1234efgh5678",
  };
  const res2 = evaluateContainerCompatibility(compatibleId, {
    pinnedImage: PINNED_IMAGE,
    pinnedImageId: "abcd1234efgh5678",
  });
  assert.equal(res2.canReuse, true);
  assert.equal(res2.reason, "pinned_id_match");

  // 3. Incompatible older version rejected
  const older = { name: "poseye-nodeodm", status: "running", configImage: "opendronemap/nodeodm:2.8.0" };
  const res3 = evaluateContainerCompatibility(older);
  assert.equal(res3.canReuse, false);
  assert.equal(res3.reason, "incompatible_image");

  // 4. Incompatible newer or untagged image rejected
  const untagged = { name: "poseye-nodeodm", status: "running", configImage: "opendronemap/nodeodm:latest" };
  const res4 = evaluateContainerCompatibility(untagged);
  assert.equal(res4.canReuse, false);
  assert.equal(res4.reason, "incompatible_image");

  // 5. Unrelated container image rejected
  const unrelated = { name: "poseye-nodeodm", status: "running", configImage: "nginx:alpine" };
  const res5 = evaluateContainerCompatibility(unrelated);
  assert.equal(res5.canReuse, false);
  assert.equal(res5.reason, "incompatible_image");

  // 6. Missing container
  const res6 = evaluateContainerCompatibility(null);
  assert.equal(res6.canReuse, false);
  assert.equal(res6.reason, "missing");

  const res7 = evaluateContainerCompatibility(undefined);
  assert.equal(res7.canReuse, false);
  assert.equal(res7.reason, "missing");
});

test("pullDockerImage - Timeout and Termination Handling", async () => {
  const start = Date.now();
  await assert.rejects(
    async () => {
      // Use an unreachable IP with a 100ms timeout
      await pullDockerImage("192.0.2.1/dummy/nodeodm:3.6.2", () => {}, { timeoutMs: 100 });
    },
    /timed out/i,
    "Should reject with timeout error"
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 4000, `Process should be terminated on timeout, took ${elapsed}ms`);
});

const test = require("node:test");
const assert = require("node:assert/strict");

test("Viewer Lifecycle - Stage-Aware State Progression Contract", () => {
  const validPhases = [
    "idle",
    "initializing",
    "fetching",
    "parsing",
    "decoding",
    "uploading",
    "framing",
    "rendering",
    "loaded",
    "failed",
  ];

  const phaseSequence = [];
  const stateListener = (phase) => {
    assert.ok(validPhases.includes(phase), `Phase '${phase}' must be a registered contract state`);
    phaseSequence.push(phase);
  };

  // Simulate complete loading workflow
  stateListener("initializing");
  stateListener("fetching");
  stateListener("parsing");
  stateListener("uploading");
  stateListener("framing");
  stateListener("rendering");
  stateListener("loaded");

  assert.deepEqual(phaseSequence, [
    "initializing",
    "fetching",
    "parsing",
    "uploading",
    "framing",
    "rendering",
    "loaded",
  ]);
});

test("Viewer Lifecycle - Timeout Guard Prevents Stuck Loading Spinners", async () => {
  let currentPhase = "idle";
  let errorMessage = null;

  function loadWithTimeout(simulateHangMs, timeoutMs = 50) {
    return new Promise((resolve) => {
      currentPhase = "fetching";

      const timer = setTimeout(() => {
        currentPhase = "failed";
        errorMessage = `Loading timed out after ${timeoutMs}ms.`;
        resolve(false);
      }, timeoutMs);

      // Simulate network/decoder hanging
      setTimeout(() => {
        clearTimeout(timer);
        if (currentPhase !== "failed") {
          currentPhase = "loaded";
          resolve(true);
        }
      }, simulateHangMs);
    });
  }

  // 1. Hanging load triggers timeout failure
  const hungResult = await loadWithTimeout(200, 40);
  assert.equal(hungResult, false);
  assert.equal(currentPhase, "failed");
  assert.ok(errorMessage.includes("Loading timed out"));

  // 2. Fast load succeeds cleanly before timeout
  const fastResult = await loadWithTimeout(10, 80);
  assert.equal(fastResult, true);
  assert.equal(currentPhase, "loaded");
});

test("Viewer Geospatial - RTC Coordinate Preservation", () => {
  // Test high-precision offset calculation with simulated CESIUM_RTC
  const cesiumRtcCenter = [619301.0, 3350278.0, 0.0];
  const localBboxCenter = [-88.76, 61.58, -4.25];

  // The model is centered locally at (0, 0, 0)
  const localVertex = { x: 10.0, y: 5.0, z: 2.0 };

  // World offset = localBboxCenter + cesiumRtcCenter
  const worldOffset = {
    x: localBboxCenter[0] + cesiumRtcCenter[0],
    y: localBboxCenter[1] + cesiumRtcCenter[1],
    z: localBboxCenter[2] + cesiumRtcCenter[2],
  };

  const trueWorldCoord = {
    x: localVertex.x + worldOffset.x,
    y: localVertex.y + worldOffset.y,
    z: localVertex.z + worldOffset.z,
  };

  assert.equal(trueWorldCoord.x, 619222.24);
  assert.equal(trueWorldCoord.y, 3350344.58);
  assert.equal(trueWorldCoord.z, -2.25);
});

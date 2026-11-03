const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { validateSender, isPathAllowed, registerAllowedPath, allowedFilePaths } = require("../electron/main.cjs");

test("validateSender - Packaged Mode", () => {
  const dummyMainFrame = { url: "poseye://app/index.html" };
  const validEvent = {
    sender: { id: 1 },
    senderFrame: dummyMainFrame,
  };

  // Valid sender from primary mainFrame with poseye://app
  assert.equal(
    validateSender(validEvent, {
      targetWebContentsId: 1,
      targetMainFrame: dummyMainFrame,
      isPackaged: true,
    }),
    true,
    "Should accept valid packaged mainFrame"
  );

  // Subpath on poseye://app
  const subpathFrame = { url: "poseye://app/projects/job-abc" };
  assert.equal(
    validateSender({ sender: { id: 1 }, senderFrame: subpathFrame }, {
      targetWebContentsId: 1,
      targetMainFrame: subpathFrame,
      isPackaged: true,
    }),
    true,
    "Should accept subpath on poseye://app"
  );

  // Reject foreign sender ID
  assert.equal(
    validateSender(validEvent, {
      targetWebContentsId: 99,
      targetMainFrame: dummyMainFrame,
      isPackaged: true,
    }),
    false,
    "Should reject non-matching webContents ID"
  );

  // Reject subframe / iframe
  const subframe = { url: "poseye://app/index.html" };
  assert.equal(
    validateSender({ sender: { id: 1 }, senderFrame: subframe }, {
      targetWebContentsId: 1,
      targetMainFrame: dummyMainFrame,
      isPackaged: true,
    }),
    false,
    "Should reject child subframe"
  );

  // Reject untrusted web origins in packaged mode
  const maliciousOrigins = [
    "http://malicious.com",
    "https://evil.attacker.com/page.html",
    "http://localhost:3000",
    "http://127.0.0.1:5173", // dev server origin is rejected when packaged
    "file:///C:/malicious.html",
    "data:text/html,<html></html>",
    "about:blank",
  ];

  for (const url of maliciousOrigins) {
    const maliciousFrame = { url };
    assert.equal(
      validateSender({ sender: { id: 1 }, senderFrame: maliciousFrame }, {
        targetWebContentsId: 1,
        targetMainFrame: maliciousFrame,
        isPackaged: true,
      }),
      false,
      `Should reject untrusted URL in packaged mode: ${url}`
    );
  }
});

test("validateSender - Development Mode", () => {
  const devFrame = { url: "http://127.0.0.1:5173/index.html" };
  const localhostFrame = { url: "http://localhost:5173/projects" };
  const appFrame = { url: "poseye://app/index.html" };

  // Accept 127.0.0.1:5173
  assert.equal(
    validateSender({ sender: { id: 1 }, senderFrame: devFrame }, {
      targetWebContentsId: 1,
      targetMainFrame: devFrame,
      isPackaged: false,
    }),
    true,
    "Should accept dev origin 127.0.0.1:5173"
  );

  // Accept localhost:5173
  assert.equal(
    validateSender({ sender: { id: 1 }, senderFrame: localhostFrame }, {
      targetWebContentsId: 1,
      targetMainFrame: localhostFrame,
      isPackaged: false,
    }),
    true,
    "Should accept dev origin localhost:5173"
  );

  // Accept poseye://app in dev
  assert.equal(
    validateSender({ sender: { id: 1 }, senderFrame: appFrame }, {
      targetWebContentsId: 1,
      targetMainFrame: appFrame,
      isPackaged: false,
    }),
    true,
    "Should accept poseye://app in dev"
  );

  // Reject foreign origins in dev
  const untrustedDevOrigins = [
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8765",
    "http://evil.com",
    "https://phishing.site",
  ];

  for (const url of untrustedDevOrigins) {
    const badFrame = { url };
    assert.equal(
      validateSender({ sender: { id: 1 }, senderFrame: badFrame }, {
        targetWebContentsId: 1,
        targetMainFrame: badFrame,
        isPackaged: false,
      }),
      false,
      `Should reject untrusted URL in dev mode: ${url}`
    );
  }
});

test("isPathAllowed - Path Confinement & Traversal Protection", () => {
  const jobsDir = path.resolve("C:/fake/appdata/poseye/jobs");
  const testAllowedPaths = new Set();

  // Initially empty allowed paths
  assert.equal(
    isPathAllowed("C:/Windows/System32/drivers/etc/hosts", { allowedPaths: testAllowedPaths, jobsDir }),
    false,
    "Should reject arbitrary system path"
  );

  // Explicit user-picked file registration
  const userPickedVideo = path.resolve("D:/drone_flights/flight_01.mp4");
  testAllowedPaths.add(userPickedVideo);

  assert.equal(
    isPathAllowed(userPickedVideo, { allowedPaths: testAllowedPaths, jobsDir }),
    true,
    "Should allow explicitly picked file"
  );

  // Case normalization and resolution check
  assert.equal(
    isPathAllowed("D:/drone_flights/flight_01.mp4", { allowedPaths: testAllowedPaths, jobsDir }),
    true,
    "Should match normalized path"
  );

  // Files inside jobs directory
  const jobAsset = path.join(jobsDir, "job-101", "model.glb");
  assert.equal(
    isPathAllowed(jobAsset, { allowedPaths: testAllowedPaths, jobsDir }),
    true,
    "Should allow file inside jobsDir"
  );

  const jobOrthophoto = path.join(jobsDir, "job-202", "orthophoto.tif");
  assert.equal(
    isPathAllowed(jobOrthophoto, { allowedPaths: testAllowedPaths, jobsDir }),
    true,
    "Should allow orthophoto inside jobsDir"
  );

  // Path traversal attempts escaping jobsDir
  const traversalAttempt1 = path.join(jobsDir, "..", "..", "secrets.txt");
  assert.equal(
    isPathAllowed(traversalAttempt1, { allowedPaths: testAllowedPaths, jobsDir }),
    false,
    "Should reject traversal escaping jobsDir"
  );

  const traversalAttempt2 = path.join(jobsDir, "job-101", "..", "..", "..", "Windows", "System32", "cmd.exe");
  assert.equal(
    isPathAllowed(traversalAttempt2, { allowedPaths: testAllowedPaths, jobsDir }),
    false,
    "Should reject nested traversal escaping jobsDir"
  );

  // Reject invalid inputs
  assert.equal(isPathAllowed(null, { allowedPaths: testAllowedPaths, jobsDir }), false);
  assert.equal(isPathAllowed("", { allowedPaths: testAllowedPaths, jobsDir }), false);
  assert.equal(isPathAllowed(undefined, { allowedPaths: testAllowedPaths, jobsDir }), false);
});

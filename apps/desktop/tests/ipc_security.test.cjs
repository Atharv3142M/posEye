const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
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

test("isPathAllowed - Path Confinement, Traversal Protection & Symlink Escape Prevention", () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "poseye-ipc-test-"));
  const jobsDir = path.join(tmpBase, "jobs");
  fs.mkdirSync(jobsDir, { recursive: true });

  const outsideSecret = path.join(tmpBase, "system_secret.key");
  fs.writeFileSync(outsideSecret, "TOP_SECRET_CREDENTIALS");

  const testAllowedPaths = new Set();

  try {
    // 1. Arbitrary system files without explicit registration are rejected
    assert.equal(
      isPathAllowed("C:/Windows/System32/drivers/etc/hosts", { allowedPaths: testAllowedPaths, jobsDir }),
      false,
      "Should reject arbitrary system path"
    );
    assert.equal(
      isPathAllowed(outsideSecret, { allowedPaths: testAllowedPaths, jobsDir }),
      false,
      "Should reject unauthorized file outside jobsDir"
    );

    // 2. Explicitly allowed path (registered via native OS dialog) is accepted
    testAllowedPaths.add(path.resolve(outsideSecret));
    assert.equal(
      isPathAllowed(outsideSecret, { allowedPaths: testAllowedPaths, jobsDir }),
      true,
      "Should allow explicitly authorized file"
    );
    testAllowedPaths.clear();

    // 3. Legitimate file inside jobsDir is accepted
    const jobFolder = path.join(jobsDir, "job-101");
    fs.mkdirSync(jobFolder, { recursive: true });
    const jobModel = path.join(jobFolder, "model.glb");
    fs.writeFileSync(jobModel, "GLB_BINARY_DATA");

    assert.equal(
      isPathAllowed(jobModel, { allowedPaths: testAllowedPaths, jobsDir }),
      true,
      "Should allow legitimate file inside jobsDir"
    );

    // 4. Directory traversal attempting to escape jobsDir is rejected
    const traversalAttempt1 = path.join(jobsDir, "..", "system_secret.key");
    assert.equal(
      isPathAllowed(traversalAttempt1, { allowedPaths: testAllowedPaths, jobsDir }),
      false,
      "Should reject traversal escaping jobsDir"
    );

    const traversalAttempt2 = path.join(jobFolder, "..", "..", "system_secret.key");
    assert.equal(
      isPathAllowed(traversalAttempt2, { allowedPaths: testAllowedPaths, jobsDir }),
      false,
      "Should reject nested traversal escaping jobsDir"
    );

    // 5. Sibling directory sharing jobsDir prefix is rejected (e.g. jobs-backup)
    const siblingDir = path.join(tmpBase, "jobs-backup");
    fs.mkdirSync(siblingDir, { recursive: true });
    const siblingFile = path.join(siblingDir, "leaked.glb");
    fs.writeFileSync(siblingFile, "DATA");

    assert.equal(
      isPathAllowed(siblingFile, { allowedPaths: testAllowedPaths, jobsDir }),
      false,
      "Should reject sibling directory sharing jobsDir name prefix"
    );

    // 6. Symlink escaping jobsDir is rejected
    const symlinkPath = path.join(jobFolder, "symlink_secret.key");
    try {
      fs.symlinkSync(outsideSecret, symlinkPath, "file");
      assert.equal(
        isPathAllowed(symlinkPath, { allowedPaths: testAllowedPaths, jobsDir }),
        false,
        "Should reject symlink escaping jobsDir"
      );
    } catch (symlinkErr) {
      // On Windows non-elevated developer mode may disallow symlink creation; skip if OS restricts
      if (symlinkErr.code !== "EPERM") throw symlinkErr;
    }

    // 7. Invalid inputs
    assert.equal(isPathAllowed(null, { allowedPaths: testAllowedPaths, jobsDir }), false);
    assert.equal(isPathAllowed("", { allowedPaths: testAllowedPaths, jobsDir }), false);
    assert.equal(isPathAllowed(undefined, { allowedPaths: testAllowedPaths, jobsDir }), false);
  } finally {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { resolveAppAssetPath } = require("../electron/main.cjs");

test("resolveAppAssetPath - Application Protocol Traversal & Containment", () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "poseye-proto-test-"));
  const distDir = path.join(tmpBase, "dist");
  const assetsDir = path.join(distDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });

  // Create valid app files
  const indexHtml = path.join(distDir, "index.html");
  fs.writeFileSync(indexHtml, "<!DOCTYPE html><html><body>posEye App</body></html>");
  const appJs = path.join(assetsDir, "app.js");
  fs.writeFileSync(appJs, "console.log('posEye');");

  // Create sensitive file outside dist
  const outsideSecret = path.join(tmpBase, "secret.env");
  fs.writeFileSync(outsideSecret, "DATABASE_SECRET=xyz");

  // Create sibling directory sharing 'dist' prefix
  const siblingDir = path.join(tmpBase, "dist-backup");
  fs.mkdirSync(siblingDir, { recursive: true });
  const siblingSecret = path.join(siblingDir, "stolen.txt");
  fs.writeFileSync(siblingSecret, "SECRET_BACKUP");

  try {
    // 1. Valid application assets
    const validIndex = resolveAppAssetPath("poseye://app/index.html", distDir);
    assert.equal(validIndex.error, undefined);
    assert.equal(path.resolve(validIndex.filePath), path.resolve(indexHtml));
    assert.equal(validIndex.isSpaFallback, false);

    const validAsset = resolveAppAssetPath("poseye://app/assets/app.js", distDir);
    assert.equal(validAsset.error, undefined);
    assert.equal(path.resolve(validAsset.filePath), path.resolve(appJs));
    assert.equal(validAsset.isSpaFallback, false);

    // Root path defaults to index.html
    const rootPath = resolveAppAssetPath("poseye://app/", distDir);
    assert.equal(rootPath.error, undefined);
    assert.equal(path.resolve(rootPath.filePath), path.resolve(indexHtml));

    // 2. SPA client-side routes fallback to index.html
    const spaRoute = resolveAppAssetPath("poseye://app/projects/job-456", distDir);
    assert.equal(spaRoute.error, undefined);
    assert.equal(path.resolve(spaRoute.filePath), path.resolve(indexHtml));
    assert.equal(spaRoute.isSpaFallback, true);

    const spaViewer = resolveAppAssetPath("poseye://app/viewer", distDir);
    assert.equal(spaViewer.error, undefined);
    assert.equal(path.resolve(spaViewer.filePath), path.resolve(indexHtml));
    assert.equal(spaViewer.isSpaFallback, true);

    // 3. Reject non-poseye scheme
    const badScheme = resolveAppAssetPath("http://app/index.html", distDir);
    assert.equal(badScheme.status, 403);
    assert.ok(badScheme.error);

    // 4. Reject non-app hostname
    const badHost = resolveAppAssetPath("poseye://malicious/index.html", distDir);
    assert.equal(badHost.status, 403);
    assert.ok(badHost.error);

    const badHost2 = resolveAppAssetPath("poseye://localhost/index.html", distDir);
    assert.equal(badHost2.status, 403);
    assert.ok(badHost2.error);

    // 5. Reject relative path traversal (../)
    const traversal1 = resolveAppAssetPath("poseye://app/../secret.env", distDir);
    assert.equal(traversal1.status, 403);
    assert.ok(traversal1.error);

    const traversal2 = resolveAppAssetPath("poseye://app/assets/../../secret.env", distDir);
    assert.equal(traversal2.status, 403);
    assert.ok(traversal2.error);

    // 6. Reject encoded traversal (%2e%2e%2f)
    const encodedTraversal1 = resolveAppAssetPath("poseye://app/%2e%2e%2fsecret.env", distDir);
    assert.equal(encodedTraversal1.status, 403);
    assert.ok(encodedTraversal1.error);

    const encodedTraversal2 = resolveAppAssetPath("poseye://app/assets/%2e%2e/%2e%2e/secret.env", distDir);
    assert.equal(encodedTraversal2.status, 403);
    assert.ok(encodedTraversal2.error);

    // 7. Reject Windows backslash traversal
    const backslash1 = resolveAppAssetPath("poseye://app/..\\secret.env", distDir);
    assert.equal(backslash1.status, 403);
    assert.ok(backslash1.error);

    const backslash2 = resolveAppAssetPath("poseye://app/assets\\app.js", distDir);
    assert.equal(backslash2.status, 403);
    assert.ok(backslash2.error);

    // 8. Reject sibling directory sharing 'dist' prefix (dist-backup)
    const siblingAttempt = resolveAppAssetPath("poseye://app/../dist-backup/stolen.txt", distDir);
    assert.equal(siblingAttempt.status, 403);
    assert.ok(siblingAttempt.error);

    // 9. Reject symlink escaping distDir
    const symlinkPath = path.join(assetsDir, "symlink_secret.txt");
    try {
      fs.symlinkSync(outsideSecret, symlinkPath, "file");
      const symlinkAttempt = resolveAppAssetPath("poseye://app/assets/symlink_secret.txt", distDir);
      assert.equal(symlinkAttempt.status, 403);
      assert.ok(symlinkAttempt.error);
    } catch (symlinkErr) {
      if (symlinkErr.code !== "EPERM") throw symlinkErr;
    }
  } finally {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
});

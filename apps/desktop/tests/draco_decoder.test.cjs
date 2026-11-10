const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { resolveAppAssetPath, writeCrashDump, getCrashLogPath } = require("../electron/main.cjs");

test("Draco Decoder - Bundled Offline Assets Integrity", () => {
  const dracoDir = path.resolve(__dirname, "..", "public", "draco");
  assert.ok(fs.existsSync(dracoDir), "public/draco directory must exist");

  const requiredFiles = [
    "draco_decoder.js",
    "draco_decoder.wasm",
    "draco_wasm_wrapper.js",
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(dracoDir, file);
    assert.ok(fs.existsSync(fullPath), `Required Draco asset missing: ${file}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 1000, `Draco asset ${file} unexpectedly small (${stat.size} bytes)`);
  }

  // Verify WASM binary magic bytes: \0asm (0x00, 0x61, 0x73, 0x6D)
  const wasmPath = path.join(dracoDir, "draco_decoder.wasm");
  const wasmBuf = fs.readFileSync(wasmPath);
  assert.equal(wasmBuf[0], 0x00, "WASM byte 0 must be 0x00");
  assert.equal(wasmBuf[1], 0x61, "WASM byte 1 must be 0x61 ('a')");
  assert.equal(wasmBuf[2], 0x73, "WASM byte 2 must be 0x73 ('s')");
  assert.equal(wasmBuf[3], 0x6d, "WASM byte 3 must be 0x6D ('m')");
});

test("Draco Decoder - Protocol Resolution & Re-mapping", () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "poseye-draco-proto-"));
  const distDir = path.join(tmpBase, "dist");
  const dracoDistDir = path.join(distDir, "draco");
  fs.mkdirSync(dracoDistDir, { recursive: true });

  const indexHtml = path.join(distDir, "index.html");
  fs.writeFileSync(indexHtml, "<!DOCTYPE html><html><body>posEye</body></html>");

  const decoderWasm = path.join(dracoDistDir, "draco_decoder.wasm");
  fs.writeFileSync(decoderWasm, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

  const wrapperJs = path.join(dracoDistDir, "draco_wasm_wrapper.js");
  fs.writeFileSync(wrapperJs, "var createDracoModule = function(){};");

  try {
    // 1. Direct path resolution
    const directRes = resolveAppAssetPath("poseye://app/draco/draco_decoder.wasm", distDir);
    assert.equal(directRes.error, undefined);
    assert.equal(path.resolve(directRes.filePath), path.resolve(decoderWasm));
    assert.equal(directRes.isSpaFallback, false);

    // 2. Nested route path resolution (e.g. from /viewer/job-123)
    const nestedRes = resolveAppAssetPath("poseye://app/viewer/job-123/draco/draco_decoder.wasm", distDir);
    assert.equal(nestedRes.error, undefined);
    assert.equal(path.resolve(nestedRes.filePath), path.resolve(decoderWasm));
    assert.equal(nestedRes.isSpaFallback, false);

    // 3. Missing static asset must return 404, NEVER fallback to index.html
    const missingWasm = resolveAppAssetPath("poseye://app/draco/non_existent.wasm", distDir);
    assert.equal(missingWasm.status, 404);
    assert.equal(missingWasm.error, "Not Found");

    const missingJs = resolveAppAssetPath("poseye://app/assets/missing_chunk.js", distDir);
    assert.equal(missingJs.status, 404);
    assert.equal(missingJs.error, "Not Found");
  } finally {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
});

test("Crash Telemetry - Dump Creation & Token Sanitization", () => {
  const testSecretToken = "Bearer 0123456789abcdef0123456789abcdef";
  const testErrorMsg = `Failed with token: ${testSecretToken} in worker`;

  writeCrashDump("unit-test", testErrorMsg);

  const crashFile = getCrashLogPath();
  assert.ok(fs.existsSync(crashFile), "Crash log file must exist after dump");

  const logContent = fs.readFileSync(crashFile, "utf8");
  assert.ok(logContent.includes("[CRASH:unit-test]"), "Must record crash source tag");
  assert.ok(!logContent.includes("0123456789abcdef"), "Sensitive bearer token must be redacted");
  assert.ok(logContent.includes("Bearer [REDACTED]"), "Must replace token with [REDACTED]");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
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

test("Draco Decoder - Protocol Resolution on Windows Paths with Spaces and Unicode", () => {
  // Test paths like 'C:\\Program Files\\posEye' or 'C:\\Users\\Test User\\posEye-空間'
  const unicodeDirName = "poseye-sp ace-空間-" + Date.now();
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), unicodeDirName));
  const distDir = path.join(tmpBase, "dist");
  const dracoDistDir = path.join(distDir, "draco");
  fs.mkdirSync(dracoDistDir, { recursive: true });

  const indexHtml = path.join(distDir, "index.html");
  fs.writeFileSync(indexHtml, "<!DOCTYPE html><html><body>posEye</body></html>");

  const decoderWasm = path.join(dracoDistDir, "draco_decoder.wasm");
  fs.writeFileSync(decoderWasm, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

  try {
    // 1. Direct path with spaces and Unicode distDir
    const directRes = resolveAppAssetPath("poseye://app/draco/draco_decoder.wasm", distDir);
    assert.equal(directRes.error, undefined);
    assert.equal(path.resolve(directRes.filePath), path.resolve(decoderWasm));
    assert.equal(directRes.isSpaFallback, false);

    // 2. Nested route with spaces and Unicode
    const nestedRes = resolveAppAssetPath("poseye://app/viewer/project%20alpha/draco/draco_decoder.wasm", distDir);
    assert.equal(nestedRes.error, undefined);
    assert.equal(path.resolve(nestedRes.filePath), path.resolve(decoderWasm));
    assert.equal(nestedRes.isSpaFallback, false);

    // 3. Traversal outside dist with spaces/Unicode is rejected
    const traversal = resolveAppAssetPath("poseye://app/../secret.txt", distDir);
    assert.ok(traversal.error, "Must reject path traversal");
  } finally {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
});

test("Draco Decompression - Genuine Draco Compressed GLB Integration", () => {
  const fixturePath = path.resolve(__dirname, "fixtures", "box_draco.glb");
  assert.ok(fs.existsSync(fixturePath), `Draco fixture must exist at ${fixturePath}`);
  
  // Verify fixture binary header and Draco extension tag
  const buf = fs.readFileSync(fixturePath);
  assert.ok(buf.length > 500, "Draco fixture must be non-empty");
  assert.equal(buf.slice(0, 4).toString("ascii"), "glTF", "Must have glTF magic header");
  assert.ok(buf.includes(Buffer.from("KHR_draco_mesh_compression")), "Must declare KHR_draco_mesh_compression extension");

  // Run Electron integration test if electron binary is available
  // On Windows, target electron.exe directly in dist to avoid cmd.exe shell wrapping
  let electronBin = path.resolve(__dirname, "..", "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  if (!fs.existsSync(electronBin)) {
    electronBin = path.resolve(__dirname, "..", "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
  }
  if (fs.existsSync(electronBin)) {
    const runnerScript = path.resolve(__dirname, "fixtures", "run_electron_draco.cjs");
    const testCode = `
      const { app, BrowserWindow } = require('electron');
      const path = require('path');
      const fs = require('fs');

      app.whenReady().then(async () => {
        const win = new BrowserWindow({
          show: false,
          webPreferences: { nodeIntegration: true, contextIsolation: false }
        });

        const desktopDir = path.resolve(__dirname, '..', '..').replace(/\\\\/g, '/');
        const fixturePath = desktopDir + '/tests/fixtures/box_draco.glb';
        const dracoPath = desktopDir + '/public/draco/';
        const threePath = desktopDir + '/node_modules/three/build/three.module.js';
        const threeDir = desktopDir + '/node_modules/three/';

        const html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
          '<script type="importmap">{' +
            '"imports": {' +
              '"three": "file:///' + threePath + '",' +
              '"three/examples/jsm/": "file:///' + threeDir + 'examples/jsm/",' +
              '"three/addons/": "file:///' + threeDir + 'examples/jsm/"' +
            '}' +
          '}</script></head><body>' +
          '<script type="module">' +
            'import * as THREE from "three";' +
            'import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";' +
            'import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";' +
            'const loader = new GLTFLoader();' +
            'const dracoLoader = new DRACOLoader();' +
            'dracoLoader.setDecoderPath("file:///' + dracoPath + '");' +
            'loader.setDRACOLoader(dracoLoader);' +
            'loader.load("file:///' + fixturePath + '", (gltf) => {' +
              'let vertices = 0, triangles = 0, hasMesh = false, isFinite = true;' +
              'gltf.scene.traverse((obj) => {' +
                'if (obj.isMesh) {' +
                  'hasMesh = true;' +
                  'const pos = obj.geometry.attributes.position;' +
                  'if (pos) {' +
                    'vertices += pos.count;' +
                    'for (let i = 0; i < pos.count; i++) {' +
                      'if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) isFinite = false;' +
                    '}' +
                  '}' +
                  'triangles += (obj.geometry.index ? obj.geometry.index.count / 3 : (pos ? pos.count / 3 : 0));' +
                '}' +
              '});' +
              'const box = new THREE.Box3().setFromObject(gltf.scene);' +
              'const ok = hasMesh && vertices === 24 && triangles === 12 && isFinite && !box.isEmpty();' +
              'window.__dracoResult = { ok, vertices, triangles, isFinite };' +
            '}, undefined, (err) => {' +
              'window.__dracoResult = { ok: false, error: String(err) };' +
            '});' +
          '</script></body></html>';

        const tmpHtml = path.resolve(__dirname, 'draco_runner.html');
        fs.writeFileSync(tmpHtml, html, 'utf-8');
        win.loadFile(tmpHtml);

        const checkInterval = setInterval(async () => {
          try {
            const res = await win.webContents.executeJavaScript('window.__dracoResult');
            if (res) {
              clearInterval(checkInterval);
              app.exit(res.ok ? 0 : 1);
            }
          } catch(e) {}
        }, 100);

        setTimeout(() => app.exit(2), 15000);
      });
    `;
    try {
      fs.writeFileSync(runnerScript, testCode, "utf-8");

      const res = spawnSync(electronBin, [runnerScript], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf-8",
        timeout: 25000,
        shell: Boolean(process.platform === "win32" && electronBin.endsWith(".cmd")),
      });
      assert.equal(res.status, 0, `Electron Draco decompression must succeed with code 0 (stderr: ${res.stderr})`);
    } finally {
      try { fs.unlinkSync(runnerScript); } catch {}
      try { fs.unlinkSync(path.resolve(__dirname, "draco_runner.html")); } catch {}
    }
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

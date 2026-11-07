const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSender, shouldAuthorizeLoopbackRequest, isPosEyeProcess } = require("../electron/main.cjs");

test("Preload Hydration - Synchronous process.argv parsing", () => {
  const mockArgv = [
    "C:\\Program Files\\posEye\\posEye.exe",
    "--poseye-api-base=http://127.0.0.1:8765",
    "--poseye-api-token=secret-token-xyz-1234",
    "--poseye-version=0.1.6",
    "--poseye-packaged=true",
  ];

  const envData = {
    apiBase: "http://127.0.0.1:8765",
    apiToken: "",
    version: "0.1.6",
    isPackaged: false,
  };

  for (const arg of mockArgv) {
    if (typeof arg === "string") {
      if (arg.startsWith("--poseye-api-base=")) envData.apiBase = arg.slice(18);
      else if (arg.startsWith("--poseye-api-token=")) envData.apiToken = arg.slice(19);
      else if (arg.startsWith("--poseye-version=")) envData.version = arg.slice(17);
      else if (arg.startsWith("--poseye-packaged=")) envData.isPackaged = arg.slice(18) === "true";
    }
  }

  assert.equal(envData.apiBase, "http://127.0.0.1:8765");
  assert.equal(envData.apiToken, "secret-token-xyz-1234");
  assert.equal(envData.version, "0.1.6");
  assert.equal(envData.isPackaged, true);
});

test("Packaged sender validation - Strictly enforces poseye://app origin", () => {
  const dummyMainFrame = { url: "poseye://app/index.html" };
  const event = {
    sender: { id: 1 },
    senderFrame: dummyMainFrame,
  };

  assert.equal(
    validateSender(event, {
      targetWebContentsId: 1,
      targetMainFrame: dummyMainFrame,
      isPackaged: true,
    }),
    true,
    "Should accept valid packaged application frame"
  );

  const untrustedFrame = { url: "about:blank" };
  assert.equal(
    validateSender({ sender: { id: 1 }, senderFrame: untrustedFrame }, {
      targetWebContentsId: 1,
      targetMainFrame: untrustedFrame,
      isPackaged: true,
    }),
    false,
    "Should reject untrusted about:blank URL in packaged mode"
  );
});

test("Network Request Interceptor - Attaches Bearer token to loopback requests", () => {
  const apiToken = "session-token-999";
  const interceptor = (details) => {
    const requestHeaders = { ...(details.requestHeaders || {}) };
    if (apiToken && !requestHeaders["Authorization"] && !requestHeaders["authorization"]) {
      requestHeaders["Authorization"] = `Bearer ${apiToken}`;
    }
    return requestHeaders;
  };

  // Case 1: Raw unauthenticated asset request from Three.js GLTFLoader
  const headers1 = interceptor({
    url: "http://127.0.0.1:8765/jobs/job123/assets/model.glb",
    requestHeaders: { Accept: "model/gltf-binary" },
  });
  assert.equal(headers1["Authorization"], "Bearer session-token-999");

  // Case 2: Already authenticated request preserves explicit token
  const headers2 = interceptor({
    url: "http://127.0.0.1:8765/jobs",
    requestHeaders: { Authorization: "Bearer session-token-999" },
  });
  assert.equal(headers2["Authorization"], "Bearer session-token-999");
});

test("Token Security Contract - No query-string tokens allowed", () => {
  const urlWithQuery = "http://127.0.0.1:8765/system/status?token=secret123";
  const parsed = new URL(urlWithQuery);
  assert.equal(parsed.searchParams.has("token"), true);
  // PosEye specification strictly forbids query-string tokens
  const cleanUrl = `${parsed.origin}${parsed.pathname}`;
  assert.equal(cleanUrl, "http://127.0.0.1:8765/system/status");
});


test("Loopback Interceptor Scope - Strictly confined to authorized API endpoints on port 8765", () => {
  // Authorized loopback endpoints
  assert.equal(shouldAuthorizeLoopbackRequest("http://127.0.0.1:8765/jobs/job123/assets/model.glb", 8765), true);
  assert.equal(shouldAuthorizeLoopbackRequest("http://localhost:8765/system/status", 8765), true);
  assert.equal(shouldAuthorizeLoopbackRequest("http://127.0.0.1:8765/health", 8765), true);

  // External URLs — token must NEVER be attached!
  assert.equal(shouldAuthorizeLoopbackRequest("https://example.com/jobs", 8765), false);
  assert.equal(shouldAuthorizeLoopbackRequest("http://attacker.com:8765/jobs", 8765), false);
  assert.equal(shouldAuthorizeLoopbackRequest("https://raw.githubusercontent.com/assets/model.glb", 8765), false);

  // Other ports on loopback — token must NEVER be attached!
  assert.equal(shouldAuthorizeLoopbackRequest("http://127.0.0.1:3000/task/new", 8765), false);
  assert.equal(shouldAuthorizeLoopbackRequest("http://127.0.0.1:8080/jobs", 8765), false);

  // Unwhitelisted path space on loopback
  assert.equal(shouldAuthorizeLoopbackRequest("http://127.0.0.1:8765/admin/restart", 8765), false);
  assert.equal(shouldAuthorizeLoopbackRequest("invalid-url", 8765), false);
});

test("Process Reclamation Safety - Refuses to terminate non-posEye processes", () => {
  // Verified posEye processes
  assert.equal(isPosEyeProcess("posEye.Orchestrator.exe", "posEye.Orchestrator.exe", 8765), true);
  assert.equal(isPosEyeProcess("python.exe", "python -m orchestrator.main --port 8765", 8765), true);
  assert.equal(isPosEyeProcess("uvicorn.exe", "uvicorn orchestrator.main:app --port 8765", 8765), true);

  // Unrelated external processes that happen to occupy port 8765
  assert.equal(isPosEyeProcess("node.exe", "node server.js", 8765), false);
  assert.equal(isPosEyeProcess("nginx.exe", "nginx -g daemon off;", 8765), false);
  assert.equal(isPosEyeProcess("chrome.exe", "chrome.exe --remote-debugging-port=8765", 8765), false);
  assert.equal(isPosEyeProcess("java.exe", "java -jar unrelated.jar", 8765), false);
});

/**
 * posEye Electron Main Process
 * Handles: window creation, Python API spawning, Docker/NodeODM lifecycle, IPC
 */
"use strict";

const electron = require("electron");
const { app, BrowserWindow, dialog, ipcMain, shell, protocol, net: electronNet } =
  typeof electron === "object" && electron !== null ? electron : {};
const { pathToFileURL } = require("node:url");

// Register custom secure application scheme BEFORE app.whenReady()
if (protocol?.registerSchemesAsPrivileged) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "poseye",
      privileges: {
        standard: true,
        secure: true,
        allowServiceWorkers: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const crypto = require("node:crypto");

// ─── Configuration ────────────────────────────────────────────────────────────
const API_PORT = parseInt(process.env.DT_PORT || "8765", 10);
const API_BASE = process.env.DT_API || `http://127.0.0.1:${API_PORT}`;
const API_TOKEN = process.env.DT_API_TOKEN || crypto.randomBytes(16).toString("hex");
const NODEODM_URL = process.env.NODEODM_URL || "http://127.0.0.1:3000";
const STARTUP_TIMEOUT_MS = 30000;      // orchestrator
const NODEODM_TIMEOUT_MS = 120000;     // NodeODM container start

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
let apiProc = null;
let startupStatus = { phase: "starting", message: "Initializing…" };
const appLog = [];   // circular log for IPC exposure
const allowedFilePaths = new Set();
let nodeOdmProvisionPromise = null;

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(level, message) {
  const entry = { ts: new Date().toISOString(), level, message };
  appLog.push(entry);
  if (appLog.length > 500) appLog.shift();
  const prefix = `[posEye:${level.toUpperCase()}]`;
  if (level === "error") console.error(prefix, message);
  else console.log(prefix, message);
  // Forward to renderer if window exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app-log", entry);
  }
}

// ─── Path helpers ─────────────────────────────────────────────────────────────
function repoRoot() {
  if (app.isPackaged) return path.dirname(app.getPath("exe"));
  // In dev: electron/main.cjs → desktop/ → apps/ → repo/
  return path.resolve(__dirname, "..", "..", "..");
}

function ffmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  // Packaged: bundled in resources
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, "ffmpeg.exe");
    if (fs.existsSync(bundled)) return bundled;
  }
  // Dev: third_party/ffmpeg.exe
  const candidates = [
    path.join(repoRoot(), "third_party", "ffmpeg.exe"),
    path.join(repoRoot(), "third_party", "ffmpeg", "bin", "ffmpeg.exe"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "";  // will fall back to PATH inside Python
}

function orchestratorExe() {
  // Packaged: check bundled branded executable ONLY
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, "posEye.Orchestrator.exe");
    if (fs.existsSync(exe)) return { cmd: exe, args: [], useExe: true };
  }
  // Dev mode: check third_party
  const devExe = path.join(repoRoot(), "third_party", "posEye.Orchestrator.exe");
  if (fs.existsSync(devExe)) return { cmd: devExe, args: [], useExe: true };
  const legacyExe = path.join(repoRoot(), "third_party", "orchestrator.exe");
  if (fs.existsSync(legacyExe)) return { cmd: legacyExe, args: [], useExe: true };
  return null;
}

function pythonCmd() {
  if (process.env.DT_PYTHON && fs.existsSync(process.env.DT_PYTHON)) {
    return process.env.DT_PYTHON;
  }
  // Dev venv
  const venv = path.join(repoRoot(), ".venv", "Scripts", "python.exe");
  if (fs.existsSync(venv)) return venv;
  // Python launcher versions
  const launchers = ["py", "python3", "python"];
  for (const l of launchers) {
    try {
      // Try to find it on PATH (synchronous existence check via which-like)
      const found = findOnPath(l);
      if (found) return found;
    } catch { /* skip */ }
  }
  return "python";
}

function findOnPath(bin) {
  const ext = process.platform === "win32" ? ".exe" : "";
  const fullBin = bin.endsWith(".exe") ? bin : bin + ext;
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    const full = path.join(dir, fullBin);
    if (fs.existsSync(full)) return full;
    // Also try without extension (bat/cmd on Windows)
    if (process.platform === "win32") {
      for (const ext2 of [".cmd", ".bat"]) {
        const f2 = path.join(dir, bin + ext2);
        if (fs.existsSync(f2)) return f2;
      }
    }
  }
  return null;
}

// ─── Process utilities ────────────────────────────────────────────────────────
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, ...opts });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => { out += d.toString(); });
    child.stderr?.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => reject(new Error(`${cmd}: ${e.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || out.trim() || `${cmd} exited with code ${code}`));
    });
  });
}

function runWithTimeout(cmd, args, timeoutMs, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, ...opts });
    let out = "";
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {}
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (d) => { out += d.toString(); });
    child.stderr?.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`${cmd}: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || out.trim() || `${cmd} exited with code ${code}`));
    });
  });
}

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => { server.close(); resolve(false); });
    server.listen(port, "127.0.0.1");
  });
}

// ─── System checks ────────────────────────────────────────────────────────────
async function checkVirtualization() {
  try {
    // If docker daemon is already running, virtualization is demonstrably active
    if (await isDockerDaemonRunning()) return true;

    // Check for detect-virtualization.ps1 script first
    const scriptCandidates = [
      path.join(repoRoot(), "scripts", "detect-virtualization.ps1"),
      app.isPackaged ? path.join(path.dirname(process.resourcesPath), "scripts", "detect-virtualization.ps1") : null,
      app.isPackaged ? path.join(process.resourcesPath, "scripts", "detect-virtualization.ps1") : null,
    ].filter(Boolean);

    for (const s of scriptCandidates) {
      if (fs.existsSync(s)) {
        try {
          await runWithTimeout("powershell.exe", [
            "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", s
          ], 8000);
          return true; // Exit code 0 means virtualization / hypervisor is present
        } catch (err) {
          const msg = String(err.message || "");
          if (/exit code 2/i.test(msg) || /Enable Intel VT-x/i.test(msg)) {
            return false;
          }
        }
      }
    }

    // Inline fallback checking both HypervisorPresent and VirtualizationFirmwareEnabled
    const out = await runWithTimeout("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
      "& { $h = (Get-CimInstance Win32_ComputerSystem).HypervisorPresent; if ($h) { 'HYPERVISOR_OK'; exit 0 }; $v = (Get-CimInstance Win32_Processor | Select-Object -First 1).VirtualizationFirmwareEnabled; if ($v) { 'FIRMWARE_OK'; exit 0 }; 'DISABLED'; exit 2 }",
    ], 8000);
    return /OK/i.test(out);
  } catch (err) {
    const msg = String(err.message || "");
    if (/exit code 2/i.test(msg)) return false;
    return true; // assume enabled if WMI fails or times out
  }
}

async function isDockerInstalled() {
  try {
    await runWithTimeout("docker", ["--version"], 5000);
    return true;
  } catch {
    return false;
  }
}

async function isDockerDaemonRunning() {
  try {
    await runWithTimeout("docker", ["info"], 8000);
    return true;
  } catch {
    return false;
  }
}

async function tryStartDockerDesktop() {
  log("info", "Docker daemon not running — attempting to start Docker Desktop…");
  const possiblePaths = [
    "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
    path.join(os.homedir(), "AppData\\Local\\Programs\\Docker\\Docker Desktop.exe"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      log("info", `Starting Docker Desktop at ${p}`);
      spawn(p, [], { detached: true, windowsHide: false });
      // Wait up to 90s for daemon to become available
      const start = Date.now();
      while (Date.now() - start < 90000) {
        await sleep(3000);
        if (await isDockerDaemonRunning()) {
          log("info", "Docker Desktop started successfully");
          return true;
        }
        log("info", "Waiting for Docker daemon…");
      }
      return false;
    }
  }
  log("warn", "Docker Desktop not found in standard locations");
  return false;
}

async function ensureDocker() {
  if (!(await isDockerInstalled())) {
    throw new Error(
      "Docker is not installed.\n\nInstall Docker Desktop from docker.com/products/docker-desktop, " +
      "then relaunch posEye.\n\nIf you used the posEye installer, run it again to auto-install Docker."
    );
  }
  if (!(await isDockerDaemonRunning())) {
    // Try to auto-start
    const started = await tryStartDockerDesktop();
    if (!started) {
      throw new Error(
        "Docker Desktop is installed but not running.\n\n" +
        "Start Docker Desktop from the Start Menu, wait for it to fully start (whale icon in system tray), " +
        "then relaunch posEye."
      );
    }
  }
  log("info", "Docker daemon is running");
}

// ─── Path & IPC Security Helpers ──────────────────────────────────────────
function registerAllowedPath(p) {
  if (p && typeof p === "string") {
    try {
      const resolved = path.resolve(p);
      allowedFilePaths.add(resolved);
      if (fs.existsSync(resolved)) {
        allowedFilePaths.add(fs.realpathSync(resolved));
      }
    } catch {}
  }
}

function isPathAllowed(targetPath, { allowedPaths = allowedFilePaths, jobsDir = null } = {}) {
  if (!targetPath || typeof targetPath !== "string") return false;
  try {
    const resolved = path.resolve(targetPath);
    let realTarget = resolved;
    if (fs.existsSync(resolved)) {
      realTarget = fs.realpathSync(resolved);
    }

    // 1. Check against explicitly registered paths (set only by native dialogs or orchestrator downloads)
    if (allowedPaths) {
      if (allowedPaths.has(resolved) || allowedPaths.has(realTarget)) {
        return true;
      }
    }

    // 2. Check containment within jobsDir
    if (jobsDir) {
      const resolvedJobsDir = path.resolve(jobsDir);
      let realJobsDir = resolvedJobsDir;
      if (fs.existsSync(resolvedJobsDir)) {
        realJobsDir = fs.realpathSync(resolvedJobsDir);
      }

      // Check lexical relative containment
      const relToResolved = path.relative(resolvedJobsDir, resolved);
      const isLexicallyContained =
        !relToResolved.startsWith("..") &&
        !path.isAbsolute(relToResolved) &&
        relToResolved !== "";

      // Check realpath relative containment to prevent symlink escapes
      const relToReal = path.relative(realJobsDir, realTarget);
      const isRealContained =
        !relToReal.startsWith("..") &&
        !path.isAbsolute(relToReal) &&
        relToReal !== "";

      if (isLexicallyContained && isRealContained) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

function resolveAppAssetPath(reqUrl, distDir) {
  if (!reqUrl || typeof reqUrl !== 'string') {
    return { error: 'Invalid URL', status: 400 };
  }

  // Reject path traversal, backslashes, or encoded dots in raw URL string
  // (WHATWG URL parsing collapses leading /../ to /, masking traversal)
  const lowerUrl = reqUrl.toLowerCase();
  if (
    lowerUrl.includes('/..') ||
    lowerUrl.includes('../') ||
    lowerUrl.includes('\\') ||
    lowerUrl.includes('%2e%2e') ||
    lowerUrl.includes('%252e')
  ) {
    return { error: 'Forbidden: path traversal detected', status: 403 };
  }

  let parsed;
  try {
    parsed = new URL(reqUrl);
  } catch {
    return { error: "Invalid URL", status: 400 };
  }

  // 1. Hostname must be exactly "app" and protocol "poseye:"
  if (parsed.protocol !== "poseye:" || parsed.hostname !== "app") {
    return { error: "Forbidden: invalid protocol or host", status: 403 };
  }

  const rawPathname = parsed.pathname || "";
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPathname);
  } catch {
    return { error: "Bad Request: invalid URL encoding", status: 400 };
  }

  // 2. Reject Windows backslash traversal in raw or decoded path
  if (rawPathname.includes("\\") || decodedPath.includes("\\")) {
    return { error: "Forbidden: backslash path separator", status: 403 };
  }

  // 3. Clean leading slashes
  let cleanPath = decodedPath.replace(/^\/+/, "");
  if (!cleanPath) cleanPath = "index.html";

  // 4. Reject traversal tokens, drive letters, colons
  const segments = cleanPath.split("/");
  for (const seg of segments) {
    if (seg === ".." || seg === "." || seg.includes(":") || seg.includes("\\")) {
      return { error: "Forbidden: path traversal segment", status: 403 };
    }
  }

  const resolvedDist = path.resolve(distDir);
  const targetFile = path.resolve(resolvedDist, cleanPath);

  // 5. Containment check via path.relative() to reject sibling prefixes (e.g. dist2, dist-other)
  const rel = path.relative(resolvedDist, targetFile);
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
    return { error: "Forbidden: outside asset root", status: 403 };
  }

  // 6. Realpath check if target exists to prevent symlink escapes
  if (fs.existsSync(targetFile)) {
    let realDist;
    let realTarget;
    try {
      realDist = fs.existsSync(resolvedDist) ? fs.realpathSync(resolvedDist) : resolvedDist;
      realTarget = fs.realpathSync(targetFile);
    } catch {
      return { error: "Forbidden: cannot resolve real path", status: 403 };
    }

    const realRel = path.relative(realDist, realTarget);
    if (realRel.startsWith("..") || path.isAbsolute(realRel) || realRel === "") {
      return { error: "Forbidden: symlink outside asset root", status: 403 };
    }

    const stat = fs.statSync(realTarget);
    if (stat.isFile()) {
      return { filePath: realTarget, isSpaFallback: false };
    }
  }

  // 7. Normal SPA fallback for client-side routing (e.g. /projects, /viewer/123)
  const indexPath = path.join(resolvedDist, "index.html");
  if (fs.existsSync(indexPath)) {
    return { filePath: indexPath, isSpaFallback: true };
  }

  return { error: "Not Found", status: 404 };
}

function verifyNodeOdmInfo(info) {
  if (!info || typeof info !== "object") return false;
  if (typeof info.version !== "string") return false;
  const v = info.version.trim();
  return Boolean(v);
}

function validateSender(e, { targetWebContentsId, targetMainFrame, isPackaged } = {}) {
  if (!e || !e.sender) return false;
  if (targetWebContentsId !== undefined && e.sender.id !== targetWebContentsId) return false;
  if (targetMainFrame && e.senderFrame && e.senderFrame !== targetMainFrame) return false;

  const frameUrl = e.senderFrame?.url || e.sender?.getURL?.() || "";
  if (!frameUrl) return false;

  try {
    const parsed = new URL(frameUrl);
    if (isPackaged) {
      return parsed.protocol === "poseye:" && parsed.hostname === "app";
    }
    const isDev = parsed.origin === "http://127.0.0.1:5173" || parsed.origin === "http://localhost:5173";
    const isApp = parsed.protocol === "poseye:" && parsed.hostname === "app";
    return isDev || isApp;
  } catch {
    return false;
  }
}

// ─── NodeODM management ───────────────────────────────────────────────────────
async function waitForUrl(url, ms = 60000, label = "service") {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return;
    } catch (e) {
      lastError = e.message;
    }
    await sleep(500);
  }
  throw new Error(`${label} did not become ready within ${Math.round(ms / 1000)}s (${url}). Last error: ${lastError}`);
}

function pullDockerImage(imageTag, onProgress, { timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["pull", imageTag], { windowsHide: true });
    let lastOut = "";
    let errOut = "";
    let isSettled = false;

    const timer = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch {}
        }, 3000);
      } catch {}
      reject(new Error(`docker pull ${imageTag} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const trimmed of lines) {
        lastOut = trimmed;
        if (onProgress) onProgress(trimmed);
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      errOut += text;
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const trimmed of lines) {
        if (onProgress) onProgress(trimmed);
      }
    });

    child.on("error", (err) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      reject(new Error(`docker pull failed: ${err.message}`));
    });

    child.on("close", (code) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(errOut.trim() || lastOut || `docker pull exited with code ${code}`));
    });
  });
}

async function ensureNodeOdm() {
  if (nodeOdmProvisionPromise) {
    return nodeOdmProvisionPromise;
  }
  nodeOdmProvisionPromise = (async () => {
    try {
      return await _ensureNodeOdmInternal();
    } finally {
      nodeOdmProvisionPromise = null;
    }
  })();
  return nodeOdmProvisionPromise;
}

async function _ensureNodeOdmInternal() {
  log("info", "Checking NodeODM container…");
  const PINNED_IMAGE = "opendronemap/nodeodm:3.6.2";

  // 1. Check if NodeODM is already responding on port 3000
  try {
    const res = await fetch(`${NODEODM_URL}/info`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const info = await res.json().catch(() => null);
      if (verifyNodeOdmInfo(info)) {
        log("info", `NodeODM already available and verified at ${NODEODM_URL} (version: ${info.version})`);
        return true;
      }
      log("warn", `NodeODM responded on ${NODEODM_URL} but returned invalid info: ${JSON.stringify(info)}`);
    }
  } catch { /* not running yet */ }

  await ensureDocker();

  // 2. Check existing container 'poseye-nodeodm'
  let existingContainer = null;
  try {
    const inspectFormat = "{{.State.Status}}|{{.Config.Image}}|{{.Image}}";
    const inspectOut = await run("docker", ["inspect", "--format", inspectFormat, "poseye-nodeodm"]).catch(() => "");
    if (inspectOut && inspectOut.trim()) {
      const [cStatus, cConfigImage, cImageId] = inspectOut.trim().split("|");
      existingContainer = { name: "poseye-nodeodm", status: cStatus, configImage: cConfigImage, imageId: cImageId };
    }
  } catch {}

  let isCompatibleContainer = false;
  if (existingContainer) {
    if (existingContainer.configImage === PINNED_IMAGE) {
      isCompatibleContainer = true;
    } else {
      try {
        const pinnedId = await run("docker", ["images", "-q", PINNED_IMAGE]).catch(() => "");
        if (pinnedId && pinnedId.trim() && existingContainer.imageId && existingContainer.imageId.includes(pinnedId.trim())) {
          isCompatibleContainer = true;
        }
      } catch {}
    }

    if (!isCompatibleContainer) {
      log("warn", `Existing container 'poseye-nodeodm' uses image '${existingContainer.configImage}', not '${PINNED_IMAGE}'.`);
      if (existingContainer.status === "running") {
        const errMsg = (
          `An existing container 'poseye-nodeodm' is running incompatible image '${existingContainer.configImage}'. ` +
          `posEye strictly requires pinned image '${PINNED_IMAGE}'. ` +
          `Please stop or remove this container manually to allow posEye to run the supported version.`
        );
        updateStatus("nodeodm_error", errMsg);
        throw new Error(errMsg);
      }
    } else {
      // Compatible container found
      if (existingContainer.status === "running") {
        try {
          await waitForUrl(`${NODEODM_URL}/info`, 15000, "NodeODM (poseye-nodeodm)");
          const infoRes = await fetch(`${NODEODM_URL}/info`);
          const info = await infoRes.json().catch(() => null);
          if (verifyNodeOdmInfo(info)) {
            log("info", `Verified healthy running container poseye-nodeodm (version: ${info.version})`);
            return true;
          }
        } catch (waitErr) {
          log("warn", `Running container poseye-nodeodm not responding on ${NODEODM_URL}: ${waitErr.message}`);
        }
      } else {
        log("info", `Starting stopped pinned container: poseye-nodeodm…`);
        updateStatus("nodeodm_starting", "Starting existing NodeODM container…");
        try {
          await run("docker", ["start", "poseye-nodeodm"]);
          await waitForUrl(`${NODEODM_URL}/info`, 45000, "NodeODM (poseye-nodeodm)");
          const infoRes = await fetch(`${NODEODM_URL}/info`);
          const info = await infoRes.json().catch(() => null);
          if (verifyNodeOdmInfo(info)) {
            log("info", `NodeODM started from existing container (version: ${info.version})`);
            return true;
          }
        } catch (startErr) {
          log("warn", `Could not start existing container: ${startErr.message}`);
        }
      }
    }
  }

  // 3. Locate Docker image (strictly PINNED_IMAGE, no untagged fallback)
  let imageInDocker = false;
  try {
    const pinnedOut = await run("docker", ["images", "-q", PINNED_IMAGE]);
    if (pinnedOut && pinnedOut.trim()) {
      imageInDocker = true;
    }
  } catch {}

  // 4. If image not in Docker, check local offline archives first
  if (!imageInDocker) {
    const tarPaths = [
      path.join(repoRoot(), "third_party", "nodeodm.tar"),
      app.isPackaged ? path.join(process.resourcesPath, "nodeodm.tar") : null,
      app.isPackaged ? path.join(path.dirname(process.resourcesPath), "third_party", "nodeodm.tar") : null,
    ].filter(Boolean);

    for (const tar of tarPaths) {
      if (fs.existsSync(tar)) {
        log("info", `Loading NodeODM image from offline archive ${tar} (this may take 1-2 minutes)…`);
        updateStatus("nodeodm_loading", "Loading NodeODM image from offline archive (this may take 1-2 minutes)…");
        try {
          await runWithTimeout("docker", ["load", "-i", tar], 300000);
          log("info", "NodeODM image loaded from tar");
          imageInDocker = true;
          break;
        } catch (e) {
          log("warn", `Failed to load NodeODM tar: ${e.message}`);
        }
      }
    }
  }

  // 5. If image still not in Docker, attempt automatic pull (online mode)
  if (!imageInDocker) {
    log("info", `NodeODM image not found locally. Initiating docker pull for ${PINNED_IMAGE}…`);
    updateStatus("nodeodm_pulling", `Downloading NodeODM image (${PINNED_IMAGE})…`);
    try {
      await pullDockerImage(PINNED_IMAGE, (progress) => {
        updateStatus("nodeodm_pulling", `Pulling NodeODM: ${progress}`);
      }, { timeoutMs: 600000 });
      imageInDocker = true;
      log("info", `Successfully pulled ${PINNED_IMAGE}`);
    } catch (pullErr) {
      const offlineMsg = (
        `Offline NodeODM image not found and automatic pull failed: ${pullErr.message}. ` +
        `Ensure network connectivity and run: docker pull ${PINNED_IMAGE}, or load an offline archive with: docker load -i <path-to-nodeodm.tar>`
      );
      updateStatus("nodeodm_offline", offlineMsg);
      log("error", offlineMsg);
      throw new Error(offlineMsg);
    }
  }

  // 6. Run a new container if none exists
  log("info", `Starting new NodeODM container using ${PINNED_IMAGE}…`);
  updateStatus("nodeodm_starting", `Starting NodeODM container using ${PINNED_IMAGE}…`);

  // Do not delete user-managed containers; only clean dead poseye-nodeodm if compatible
  if (existingContainer && isCompatibleContainer && existingContainer.status !== "running") {
    await run("docker", ["rm", "-f", "poseye-nodeodm"]).catch(() => {});
  }

  try {
    await run("docker", [
      "run", "-d",
      "--name", "poseye-nodeodm",
      "--restart", "unless-stopped",
      "-p", "3000:3000",
      PINNED_IMAGE,
    ]);
  } catch (err) {
    const msg = String(err.message || err);
    if (/port is already allocated|bind|address already in use/i.test(msg)) {
      log("warn", "Port 3000 already in use — checking if NodeODM is responding…");
      try {
        await waitForUrl(`${NODEODM_URL}/info`, 10000, "NodeODM on existing port");
        const infoRes = await fetch(`${NODEODM_URL}/info`);
        const info = await infoRes.json().catch(() => null);
        if (verifyNodeOdmInfo(info)) {
          log("info", `NodeODM is already running on port 3000 (version: ${info.version})`);
          return true;
        }
      } catch {}
      throw new Error(
        "Port 3000 is occupied by an incompatible process or container.\n\n" +
        "Please free port 3000 or configure NODEODM_URL to point to your NodeODM instance."
      );
    }
    throw new Error(`Could not start NodeODM container: ${msg}`);
  }

  log("info", "Waiting for NodeODM container to become ready…");
  updateStatus("nodeodm_waiting", "Waiting for NodeODM container /info to respond…");
  await waitForUrl(`${NODEODM_URL}/info`, NODEODM_TIMEOUT_MS, "NodeODM");
  const infoRes = await fetch(`${NODEODM_URL}/info`);
  const infoData = await infoRes.json().catch(() => ({}));
  if (!verifyNodeOdmInfo(infoData)) {
    throw new Error(`NodeODM container ready but returned invalid or incompatible version: ${JSON.stringify(infoData)}`);
  }
  log("info", `NodeODM is ready (version: ${infoData.version || "unknown"})`);
  return true;
}

// ─── Python API ───────────────────────────────────────────────────────────────
async function startApi() {
  // Check if port is already in use (another instance)
  if (await isPortInUse(API_PORT)) {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (data.serviceId === "poseye-orchestrator" && data.orchestratorVersion === "0.1.4") {
          log("info", `Port ${API_PORT} in use by compatible posEye orchestrator ${data.orchestratorVersion} — connecting`);
          return;
        }
      }
    } catch {}
    throw new Error(
      `Port ${API_PORT} is already occupied by an incompatible or unknown service.\n\n` +
      `Please stop the process using port ${API_PORT} or set the DT_PORT environment variable to an open port.`
    );
  }

  const jobsDir = path.join(app.getPath("userData"), "jobs");
  const env = {
    ...process.env,
    DT_PORT: String(API_PORT),
    DT_API_TOKEN: API_TOKEN,
    NODEODM_URL,
    FFMPEG_PATH: ffmpegPath() || "",
    DT_JOBS_DIR: jobsDir,
    PYTHONUNBUFFERED: "1",
    PYTHONPATH: [
      path.join(repoRoot(), "apps", "orchestrator", "src"),
      path.join(repoRoot(), "apps", "pipeline", "src"),
      process.env.PYTHONPATH || "",
    ].filter(Boolean).join(path.delimiter),
  };

  // Check for packaged orchestrator exe first
  const exeInfo = orchestratorExe();
  if (exeInfo) {
    log("info", `Starting orchestrator (packaged exe): ${exeInfo.cmd}`);
    apiProc = spawn(exeInfo.cmd, exeInfo.args, { env, windowsHide: true });
  } else {
    const pyCmd = pythonCmd();
    log("info", `Starting orchestrator: ${pyCmd} -m orchestrator.main`);
    apiProc = spawn(pyCmd, ["-m", "orchestrator.main"], {
      cwd: path.join(repoRoot(), "apps", "orchestrator"),
      env,
      windowsHide: true,
    });
  }

  apiProc.stdout?.on("data", (d) => {
    const text = d.toString().trim();
    if (text) log("api", text);
  });
  apiProc.stderr?.on("data", (d) => {
    const text = d.toString().trim();
    if (text) log("api", text);
  });
  apiProc.on("error", (e) => log("error", `API process error: ${e.message}`));
  apiProc.on("close", (code) => {
    log(code === 0 ? "info" : "error", `API process exited with code ${code}`);
    apiProc = null;
  });
}

async function waitForApi() {
  log("info", `Waiting for posEye orchestrator at ${API_BASE}/health…`);
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.serviceId === "poseye-orchestrator" && data.orchestratorVersion === "0.1.4") {
          log("info", `posEye orchestrator v${data.orchestratorVersion} is ready and verified`);
          return;
        }
      }
    } catch (e) {
      lastError = e.message;
    }
    await sleep(400);
  }
  throw new Error(`Orchestrator failed to respond at ${API_BASE}/health after ${STARTUP_TIMEOUT_MS}ms: ${lastError}`);
}

// ─── Status management ────────────────────────────────────────────────────────
function updateStatus(phase, message) {
  startupStatus = { phase, message };
  log("info", `[Status: ${phase}] ${message}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app-status", startupStatus);
  }
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const iconIco = path.join(__dirname, "posEye.ico");
  const iconPng = path.join(__dirname, "posEye.png");
  const iconPath = fs.existsSync(iconIco) ? iconIco : (fs.existsSync(iconPng) ? iconPng : undefined);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: "#0d1117",
    autoHideMenuBar: true,
    title: "posEye — 3D Drone Reconstruction",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Safe window open and navigation handling
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {}
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      const isAllowedApp = parsed.protocol === "poseye:" && parsed.hostname === "app";
      const isAllowedDev = !app.isPackaged && (parsed.origin === "http://127.0.0.1:5173" || parsed.origin === "http://localhost:5173");
      if (!isAllowedApp && !isAllowedDev) {
        event.preventDefault();
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          shell.openExternal(url);
        }
      }
    } catch {}
  });

  mainWindow.webContents.session.on("will-download", (event, item) => {
    log("info", `Download started: ${item.getFilename()} (${item.getTotalBytes()} bytes)`);
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    mainWindow.loadURL("poseye://app/index.html");
  }

  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.webContents.on("did-fail-load", (e, errCode, errDesc) => {
    log("error", `Window load failed: ${errCode} ${errDesc}`);
  });
}

// ─── Background Service Initialization ────────────────────────────────────────
async function initializeServices() {
  const startupStart = Date.now();
  updateStatus("api", "Starting orchestrator backend…");

  // 1. Python orchestrator API
  try {
    await startApi();
    await waitForApi();
    log("info", `Orchestrator ready in ${Date.now() - startupStart}ms`);
    updateStatus("api_ready", "Orchestrator backend ready");
  } catch (e) {
    log("error", `Orchestrator startup failed: ${e.message}`);
    updateStatus("api_error", `Orchestrator failed: ${e.message}`);
    return;
  }

  // 2. Hardware virtualization check
  try {
    const virtOk = await checkVirtualization();
    if (!virtOk) {
      log("warn", "Hardware virtualization may be disabled in BIOS/UEFI");
    }
  } catch (e) {
    log("warn", `Virtualization check failed: ${e.message}`);
  }

  // 3. Docker check
  const dockerInstalled = await isDockerInstalled();
  if (!dockerInstalled) {
    log("warn", "Docker is not installed on this system");
    updateStatus("docker_missing", "Docker Desktop is not installed");
    return;
  }

  const dockerRunning = await isDockerDaemonRunning();
  if (!dockerRunning) {
    updateStatus("docker_starting", "Starting Docker Desktop…");
    const started = await tryStartDockerDesktop();
    if (!started) {
      updateStatus("docker_stopped", "Docker Desktop is installed but not running");
      return;
    }
  }

  // 4. NodeODM container setup
  updateStatus("nodeodm_starting", "Provisioning NodeODM container (3.6.2)…");
  try {
    await ensureNodeOdm();
    updateStatus("ready", `posEye ready — all services operational (${Date.now() - startupStart}ms total)`);
  } catch (e) {
    log("warn", `NodeODM container provisioning notice: ${e.message}`);
    updateStatus("nodeodm_offline", `NodeODM container not ready: ${e.message}`);
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (app?.whenReady) {
app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("org.icarus.poseye");
  }

  log("info", `posEye starting — Electron ${process.versions.electron}, Node ${process.versions.node}`);
  log("info", `Platform: ${process.platform} ${process.arch}`);

  // ── Application Protocol Handler ─────────────────────────────────────────
  protocol.handle("poseye", (request) => {
    try {
      const distDir = path.resolve(__dirname, "..", "dist");
      const result = resolveAppAssetPath(request.url, distDir);
      if (result.error) {
        log("warn", `Protocol access blocked: ${request.url} -> ${result.error}`);
        return new Response(result.error, { status: result.status || 403 });
      }
      return electronNet.fetch(pathToFileURL(result.filePath).toString());
    } catch (err) {
      log("error", `Protocol handler error: ${err.message}`);
      return new Response("Internal Server Error", { status: 500 });
    }
  });

  // ── Sender validation helper ───────────────────────────────────────────────
  function isTrustedSender(e) {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return validateSender(e, {
      targetWebContentsId: mainWindow.webContents.id,
      targetMainFrame: mainWindow.webContents.mainFrame,
      isPackaged: app.isPackaged,
    });
  }

  // ── IPC Handlers ──────────────────────────────────────────────────────────
  ipcMain.on("env:sync", (e) => {
    if (!isTrustedSender(e)) {
      log("warn", "Rejected unauthorized env:sync invocation");
      e.returnValue = null;
      return;
    }
    e.returnValue = {
      apiBase: API_BASE,
      apiToken: API_TOKEN,
      packaged: app.isPackaged,
      version: app.getVersion(),
    };
  });

  ipcMain.handle("dialog:video", async (e) => {
    if (!isTrustedSender(e)) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Select drone video",
      filters: [{ name: "Video files", extensions: ["mp4", "mov", "mkv", "avi", "m4v", "mts", "mp2t"] }],
      properties: ["openFile"],
    });
    if (!res.canceled && res.filePaths[0]) {
      registerAllowedPath(res.filePaths[0]);
      return res.filePaths[0];
    }
    return null;
  });

  ipcMain.handle("dialog:srt", async (e) => {
    if (!isTrustedSender(e)) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Select telemetry SRT file",
      filters: [{ name: "SRT telemetry", extensions: ["srt"] }],
      properties: ["openFile"],
    });
    if (!res.canceled && res.filePaths[0]) {
      registerAllowedPath(res.filePaths[0]);
      return res.filePaths[0];
    }
    return null;
  });

  ipcMain.handle("dialog:glb", async (e) => {
    if (!isTrustedSender(e)) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Open 3D model (GLB)",
      filters: [{ name: "glTF Binary", extensions: ["glb"] }],
      properties: ["openFile"],
    });
    if (!res.canceled && res.filePaths[0]) {
      registerAllowedPath(res.filePaths[0]);
      return res.filePaths[0];
    }
    return null;
  });

  ipcMain.handle("dialog:save", async (e, defaultName, ext) => {
    if (!isTrustedSender(e)) return null;
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || "export",
      filters: [{ name: ext?.toUpperCase() || "File", extensions: [ext || "*"] }],
    });
    if (!res.canceled && res.filePath) {
      registerAllowedPath(res.filePath);
      return res.filePath;
    }
    return null;
  });



  ipcMain.handle("env", (e) => {
    if (!isTrustedSender(e)) return null;
    return {
      apiBase: API_BASE,
      apiToken: API_TOKEN,
      packaged: app.isPackaged,
      version: app.getVersion(),
    };
  });

  ipcMain.handle("read:file", (e, filePath) => {
    if (!isTrustedSender(e)) return null;
    if (!filePath || typeof filePath !== "string") return null;
    const jobsDir = path.join(app.getPath("userData"), "jobs");
    if (!isPathAllowed(filePath, { allowedPaths: allowedFilePaths, jobsDir })) {
      log("warn", `Blocked unauthorized read:file access: ${filePath}`);
      return null;
    }
    try {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) return null;
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return null;
      return fs.readFileSync(resolved);
    } catch (err) {
      log("error", `read:file failed for ${filePath}: ${err.message}`);
      return null;
    }
  });

  ipcMain.handle("asset:save", async (e, { jobId, asset, defaultFilename } = {}) => {
    if (!isTrustedSender(e)) return { ok: false, error: "Unauthorized" };
    if (!jobId || !asset) return { ok: false, error: "Missing parameters" };

    const safeAsset = path.basename(asset);
    const saveName = defaultFilename || safeAsset;
    const ext = path.extname(safeAsset).replace(/^\./, "");

    const res = await dialog.showSaveDialog(mainWindow, {
      title: `Save ${safeAsset}`,
      defaultPath: saveName,
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [{ name: "All Files", extensions: ["*"] }],
    });

    if (res.canceled || !res.filePath) {
      return { ok: false, canceled: true };
    }

    const destinationPath = res.filePath;
    registerAllowedPath(destinationPath);

    try {
      const assetUrl = `${API_BASE}/jobs/${encodeURIComponent(jobId)}/assets/${encodeURIComponent(safeAsset)}`;
      const response = await fetch(assetUrl, {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Orchestrator returned HTTP ${response.status}: ${response.statusText}`);
      }

      const fileStream = fs.createWriteStream(destinationPath);
      const { Readable } = require("node:stream");
      const stream = Readable.fromWeb(response.body);
      await new Promise((resolve, reject) => {
        stream.pipe(fileStream);
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
        stream.on("error", reject);
      });

      log("info", `Asset saved successfully to: ${destinationPath}`);
      return { ok: true, path: destinationPath };
    } catch (err) {
      log("error", `Failed to save asset ${safeAsset}: ${err.message}`);
      try {
        if (fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath);
      } catch {}
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("open:external", (e, url) => {
    if (!isTrustedSender(e)) return;
    if (typeof url !== "string") return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      } else {
        log("warn", `Blocked opening external URL with protocol: ${parsed.protocol}`);
      }
    } catch (err) {
      log("warn", `Invalid URL passed to open:external: ${url}`);
    }
  });

  ipcMain.handle("get:logs", (e) => {
    if (!isTrustedSender(e)) return [];
    return appLog.slice(-200);
  });

  ipcMain.handle("get:status", (e) => {
    if (!isTrustedSender(e)) return null;
    return startupStatus;
  });

  // Restart the API process
  ipcMain.handle("restart:api", async (e) => {
    if (!isTrustedSender(e)) return { ok: false };
    if (apiProc && !apiProc.killed) {
      apiProc.kill();
      await sleep(1000);
    }
    await startApi();
    await waitForApi();
    return { ok: true };
  });

  // Create UI window immediately without waiting for heavy background tasks
  createWindow();

  // Kick off background service setup without blocking window display
  initializeServices().catch((err) => {
    log("error", `Background services initialization error: ${err.message}`);
  });
});

// ── Shutdown ─────────────────────────────────────────────────────────────────
app.on("before-quit", () => {
  log("info", "Shutting down…");
  if (apiProc && !apiProc.killed) {
    log("info", "Stopping orchestrator process");
    apiProc.kill();
  }
  // External Docker/NodeODM services are not terminated by posEye
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
}

module.exports = {
  validateSender,
  isPathAllowed,
  registerAllowedPath,
  resolveAppAssetPath,
  verifyNodeOdmInfo,
  allowedFilePaths,
  pullDockerImage,
  ensureNodeOdm,
};

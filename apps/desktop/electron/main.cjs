/**
 * posEye Electron Main Process
 * Handles: window creation, Python API spawning, Docker/NodeODM lifecycle, IPC
 */
"use strict";

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");

// ─── Configuration ────────────────────────────────────────────────────────────
const API_PORT = parseInt(process.env.DT_PORT || "8765", 10);
const API_BASE = process.env.DT_API || `http://127.0.0.1:${API_PORT}`;
const NODEODM_URL = process.env.NODEODM_URL || "http://127.0.0.1:3000";
const STARTUP_TIMEOUT_MS = 30000;      // orchestrator
const NODEODM_TIMEOUT_MS = 120000;     // NodeODM container start

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
let apiProc = null;
let startupStatus = { phase: "starting", message: "Initializing…" };
const appLog = [];   // circular log for IPC exposure

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
  // Packaged: compiled orchestrator exe
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, "orchestrator.exe");
    if (fs.existsSync(exe)) return { cmd: exe, args: [], useExe: true };
  }
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
    const timer = setTimeout(() => reject(new Error(`${cmd} timed out after ${timeoutMs}ms`)), timeoutMs);
    run(cmd, args, opts)
      .then((out) => { clearTimeout(timer); resolve(out); })
      .catch((err) => { clearTimeout(timer); reject(err); });
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

    // Check both HypervisorPresent (systems running Hyper-V / WSL2 root) and VirtualizationFirmwareEnabled
    const out = await runWithTimeout("powershell.exe", [
      "-NoProfile", "-Command",
      "$cs = Get-CimInstance Win32_ComputerSystem; if ($cs.HypervisorPresent) { 'HYPERVISOR_OK' } else { $p = Get-CimInstance Win32_Processor; if ($p.VirtualizationFirmwareEnabled -contains $true -or $p.VirtualizationFirmwareEnabled -eq $true) { 'FIRMWARE_OK' } else { 'DISABLED' } }",
    ], 8000);
    return /OK/i.test(out);
  } catch {
    return true; // assume enabled if check fails
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

async function ensureNodeOdm() {
  log("info", "Checking NodeODM container…");
  const containerNames = ["poseye-nodeodm", "digitaltwin-nodeodm"];

  // Check if NodeODM is already responding (e.g., started by docker-compose or externally)
  try {
    const res = await fetch(`${NODEODM_URL}/info`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      log("info", `NodeODM already available at ${NODEODM_URL}`);
      return;
    }
  } catch { /* not running yet */ }

  await ensureDocker();

  // Try starting an existing stopped container
  for (const name of containerNames) {
    try {
      log("info", `Attempting to start container: ${name}`);
      await run("docker", ["start", name]);
      await waitForUrl(`${NODEODM_URL}/info`, 60000, `NodeODM (${name})`);
      log("info", `NodeODM started from existing container: ${name}`);
      return;
    } catch (e) {
      log("info", `Container ${name} not startable: ${e.message}`);
    }
  }

  // Try loading from bundled tar
  const tarPaths = [
    path.join(repoRoot(), "third_party", "nodeodm.tar"),
    app.isPackaged ? path.join(process.resourcesPath, "nodeodm.tar") : null,
  ].filter(Boolean);

  for (const tar of tarPaths) {
    if (fs.existsSync(tar)) {
      log("info", `Loading NodeODM image from ${tar} (this may take 1-2 minutes)…`);
      try {
        await runWithTimeout("docker", ["load", "-i", tar], 180000);
        log("info", "NodeODM image loaded from tar");
      } catch (e) {
        log("warn", `Failed to load NodeODM tar: ${e.message}`);
      }
      break;
    }
  }

  // Run a new container
  log("info", "Starting new NodeODM container…");
  try {
    // Remove any dead container with same name first
    await run("docker", ["rm", "-f", "poseye-nodeodm"]).catch(() => {});
    await run("docker", [
      "run", "-d",
      "--name", "poseye-nodeodm",
      "--restart", "unless-stopped",
      "-p", "3000:3000",
      "opendronemap/nodeodm",
    ]);
  } catch (err) {
    const msg = String(err.message || err);
    if (/port is already allocated|bind|address already in use/i.test(msg)) {
      // Port 3000 in use but NodeODM might still be there from earlier check
      log("warn", `Port 3000 already in use — checking if NodeODM is responding…`);
      try {
        await waitForUrl(`${NODEODM_URL}/info`, 10000, "NodeODM on existing port");
        log("info", "NodeODM is already running on port 3000");
        return;
      } catch {
        throw new Error(
          "Port 3000 is already in use by another process.\n\n" +
          "Either stop that process, or set NODEODM_URL environment variable to point to your NodeODM instance."
        );
      }
    }
    if (/unable to find image|no such image/i.test(msg)) {
      throw new Error(
        "NodeODM Docker image not found.\n\n" +
        "Run this command to download it:\n  docker pull opendronemap/nodeodm\n\n" +
        "Or run the posEye installer which bundles the image."
      );
    }
    throw new Error(`Could not start NodeODM container: ${msg}`);
  }

  log("info", "Waiting for NodeODM to become ready…");
  await waitForUrl(`${NODEODM_URL}/info`, NODEODM_TIMEOUT_MS, "NodeODM");
  log("info", "NodeODM is ready");
}

// ─── Python API ───────────────────────────────────────────────────────────────
async function startApi() {
  // Check if port is already in use (another instance)
  if (await isPortInUse(API_PORT)) {
    log("warn", `Port ${API_PORT} already in use — skipping API spawn, connecting to existing`);
    return;
  }

  const jobsDir = path.join(app.getPath("userData"), "jobs");
  const env = {
    ...process.env,
    DT_PORT: String(API_PORT),
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
  log("info", `Waiting for orchestrator at ${API_BASE}/health…`);
  await waitForUrl(`${API_BASE}/health`, STARTUP_TIMEOUT_MS, "posEye orchestrator");
  log("info", "Orchestrator is ready");
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
    backgroundColor: "#1a1f24",
    autoHideMenuBar: true,
    title: "posEye — 3D Drone Reconstruction",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://127.0.0.1:5173");
    // Uncomment to open DevTools automatically in dev:
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.webContents.on("did-fail-load", (e, errCode, errDesc) => {
    log("error", `Window load failed: ${errCode} ${errDesc}`);
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

app.whenReady().then(async () => {
  log("info", `posEye starting — Electron ${process.versions.electron}, Node ${process.versions.node}`);
  log("info", `Platform: ${process.platform} ${process.arch}`);

  // ── IPC Handlers ──────────────────────────────────────────────────────────
  ipcMain.handle("dialog:video", async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Select drone video",
      filters: [{ name: "Video files", extensions: ["mp4", "mov", "mkv", "avi", "m4v", "mts", "mp2t"] }],
      properties: ["openFile"],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle("dialog:srt", async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Select telemetry SRT file",
      filters: [{ name: "SRT telemetry", extensions: ["srt"] }],
      properties: ["openFile"],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle("dialog:glb", async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Open 3D model (GLB)",
      filters: [{ name: "glTF Binary", extensions: ["glb"] }],
      properties: ["openFile"],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle("dialog:save", async (_, defaultName, ext) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || "export",
      filters: [{ name: ext?.toUpperCase() || "File", extensions: [ext || "*"] }],
    });
    return res.canceled ? null : res.filePath;
  });

  ipcMain.handle("env", () => ({
    apiBase: API_BASE,
    packaged: app.isPackaged,
    version: app.getVersion(),
    repoRoot: repoRoot(),
  }));

  ipcMain.handle("read:file", (_e, filePath) => {
    if (!filePath || typeof filePath !== "string") return null;
    try {
      return fs.readFileSync(filePath);
    } catch (e) {
      log("error", `read:file failed for ${filePath}: ${e.message}`);
      return null;
    }
  });

  ipcMain.handle("open:external", (_e, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle("get:logs", () => appLog.slice(-200));

  ipcMain.handle("get:status", () => startupStatus);

  // Restart the API process
  ipcMain.handle("restart:api", async () => {
    if (apiProc && !apiProc.killed) {
      apiProc.kill();
      await sleep(1000);
    }
    await startApi();
    await waitForApi();
    return { ok: true };
  });

  // ── Startup sequence ───────────────────────────────────────────────────────
  let startupErrors = [];

  // 1. Virtualization check (non-blocking warning)
  startupStatus = { phase: "checking", message: "Checking system…" };
  try {
    const virtOk = await checkVirtualization();
    if (!virtOk) {
      log("warn", "Hardware virtualization may be disabled in BIOS/UEFI");
      startupErrors.push(
        "⚠ Hardware virtualization appears disabled in BIOS/UEFI.\n\n" +
        "Docker requires Intel VT-x or AMD-V to be enabled.\n" +
        "Enable it in your BIOS settings and reboot, then relaunch posEye."
      );
    }
  } catch (e) {
    log("warn", `Virtualization check failed: ${e.message}`);
  }

  // 2. NodeODM (Docker-based reconstruction engine)
  startupStatus = { phase: "nodeodm", message: "Starting NodeODM…" };
  try {
    await ensureNodeOdm();
  } catch (e) {
    log("error", `NodeODM startup failed: ${e.message}`);
    startupErrors.push(`NodeODM: ${e.message}`);
    // Non-fatal — app can still work without NodeODM if user brings their own
  }

  // 3. Python orchestrator API
  startupStatus = { phase: "api", message: "Starting orchestrator…" };
  try {
    await startApi();
    await waitForApi();
  } catch (e) {
    log("error", `Orchestrator startup failed: ${e.message}`);
    startupErrors.push(
      `Orchestrator API failed to start:\n${e.message}\n\n` +
      "Check that Python 3.11+ is installed and setup.ps1 has been run."
    );
  }

  // Show startup errors (if any) as a single dialog
  if (startupErrors.length > 0) {
    const msg = startupErrors.join("\n\n──────────────────────\n\n");
    await dialog.showMessageBox({
      type: "warning",
      title: "posEye — Startup Warnings",
      message: "posEye started with warnings:",
      detail: msg,
      buttons: ["Continue Anyway"],
    });
  }

  startupStatus = { phase: "ready", message: "Ready" };
  log("info", "Startup complete — creating window");
  createWindow();
});

// ── Shutdown ─────────────────────────────────────────────────────────────────
app.on("before-quit", () => {
  log("info", "Shutting down…");
  if (apiProc && !apiProc.killed) {
    log("info", "Stopping orchestrator process");
    apiProc.kill();
  }
  // Stop NodeODM containers gracefully (fire-and-forget)
  spawn("docker", ["stop", "poseye-nodeodm", "digitaltwin-nodeodm"], {
    windowsHide: true,
    detached: true,
  }).unref();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

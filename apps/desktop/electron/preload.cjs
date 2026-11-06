const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Synchronously hydrate environment from process.argv injected by Electron main process
const envData = {
  apiBase: "http://127.0.0.1:8765",
  apiToken: "",
  version: "0.1.6",
  isPackaged: false,
};

if (Array.isArray(process.argv)) {
  for (const arg of process.argv) {
    if (typeof arg === "string") {
      if (arg.startsWith("--poseye-api-base=")) envData.apiBase = arg.slice(18);
      else if (arg.startsWith("--poseye-api-token=")) envData.apiToken = arg.slice(19);
      else if (arg.startsWith("--poseye-version=")) envData.version = arg.slice(17);
      else if (arg.startsWith("--poseye-packaged=")) envData.isPackaged = arg.slice(18) === "true";
    }
  }
}

contextBridge.exposeInMainWorld("dt", {
  // File dialogs
  pickVideo:    () => ipcRenderer.invoke("dialog:video"),
  pickSrt:      () => ipcRenderer.invoke("dialog:srt"),
  pickGlb:      () => ipcRenderer.invoke("dialog:glb"),
  saveFile:     (defaultName, ext) => ipcRenderer.invoke("dialog:save", defaultName, ext),

  // Environment / config - instant synchronous access with zero race conditions
  env:          () => Promise.resolve(envData),
  envSync:      () => envData,

  // File utilities
  readFile:     (filePath) => ipcRenderer.invoke("read:file", filePath),
  saveAsset:    (opts) => ipcRenderer.invoke("asset:save", opts),
  pathForFile:  (file) => webUtils.getPathForFile(file),

  // Shell
  openExternal: (url) => ipcRenderer.invoke("open:external", url),

  // Backend control
  getLogs:      () => ipcRenderer.invoke("get:logs"),
  getStatus:    () => ipcRenderer.invoke("get:status"),
  restartApi:   () => ipcRenderer.invoke("restart:api"),
  getPrefs:     () => ipcRenderer.invoke("prefs:get"),
  setPrefs:     (partial) => ipcRenderer.invoke("prefs:set", partial),

  // Electron → renderer push events
  // Usage: window.dt.onAppLog(entry => { ... })
  onAppLog:     (callback) => {
    const handler = (_event, entry) => callback(entry);
    ipcRenderer.on("app-log", handler);
    return () => ipcRenderer.removeListener("app-log", handler);
  },
  onAppStatus:  (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("app-status", handler);
    return () => ipcRenderer.removeListener("app-status", handler);
  },
});

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("dt", {
  // File dialogs
  pickVideo:    () => ipcRenderer.invoke("dialog:video"),
  pickSrt:      () => ipcRenderer.invoke("dialog:srt"),
  pickGlb:      () => ipcRenderer.invoke("dialog:glb"),
  saveFile:     (defaultName, ext) => ipcRenderer.invoke("dialog:save", defaultName, ext),

  // Environment / config
  env:          () => ipcRenderer.invoke("env"),

  // File utilities
  readFile:     (filePath) => ipcRenderer.invoke("read:file", filePath),
  pathForFile:  (file) => webUtils.getPathForFile(file),

  // Shell
  openExternal: (url) => ipcRenderer.invoke("open:external", url),

  // Backend control
  getLogs:      () => ipcRenderer.invoke("get:logs"),
  getStatus:    () => ipcRenderer.invoke("get:status"),
  restartApi:   () => ipcRenderer.invoke("restart:api"),

  // Electron → renderer push events
  // Usage: window.dt.onAppLog(entry => { ... })
  onAppLog:     (callback) => {
    const handler = (_event, entry) => callback(entry);
    ipcRenderer.on("app-log", handler);
    // Return unsubscribe function
    return () => ipcRenderer.removeListener("app-log", handler);
  },
});

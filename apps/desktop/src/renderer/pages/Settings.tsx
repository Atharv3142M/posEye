import { useEffect, useState } from "react";
import { fetchJson, type SystemStatus } from "../api";
import Button from "../components/Button";
import BrandLogo from "../components/BrandLogo";
import Card from "../components/Card";
import DiagnosticsModal from "../components/DiagnosticsModal";
import { useTheme, type Theme } from "../hooks/useTheme";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [preset, setPreset] = useState(localStorage.getItem("dt-preset") || "balanced");
  const [fps, setFps] = useState(localStorage.getItem("dt-fps") || "3");
  const [blur, setBlur] = useState(localStorage.getItem("dt-blur") || "40");
  const [sys, setSys] = useState<SystemStatus | null>(null);
  const [gpuOn, setGpuOn] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const appVersion = window.dt?.envSync()?.version || "0.1.6";

  useEffect(() => {
    localStorage.setItem("dt-preset", preset);
    localStorage.setItem("dt-fps", fps);
    localStorage.setItem("dt-blur", blur);
  }, [preset, fps, blur]);

  useEffect(() => {
    void fetchJson<SystemStatus>("/system/status").then(setSys).catch(() => setSys(null));
    void window.dt?.getPrefs?.().then((prefs) => {
      if (prefs && typeof prefs.gpu === "boolean") setGpuOn(prefs.gpu);
    });
  }, []);

  function setGpu(next: boolean) {
    setGpuOn(next);
    void window.dt?.setPrefs?.({ gpu: next });
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <BrandLogo size={26} showWordmark={false} />
          <h1 style={{ margin: 0 }}>Settings</h1>
        </div>

        <Card>
          <h2>Appearance</h2>
          <div className="stack" style={{ gap: 6 }}>
            {(["light", "dark", "auto"] as Theme[]).map((t) => (
              <label key={t} className="radio">
                <input type="radio" checked={theme === t} onChange={() => setTheme(t)} /> {t}
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <h2>Processing defaults</h2>
          <p className="muted" style={{ marginTop: 0 }}>These defaults are applied when creating a new project.</p>
          <div className="stack">
            <div>
              <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>Quality preset</div>
              <div className="stack" style={{ gap: 4 }}>
                {["fast", "balanced", "high", "ultra"].map((p) => (
                  <label key={p} className="radio">
                    <input type="radio" checked={preset === p} onChange={() => setPreset(p)} /> {p}
                  </label>
                ))}
              </div>
            </div>
            <label className="field">
              Frame extraction FPS
              <input type="number" step="0.5" min="0.5" max="5" value={fps} onChange={(e) => setFps(e.target.value)} />
              <span className="muted" style={{ fontSize: 11 }}>Frames extracted per second of video. Default: 3.</span>
            </label>
            <label className="field">
              Blur threshold (Laplacian variance)
              <input type="number" value={blur} onChange={(e) => setBlur(e.target.value)} />
              <span className="muted" style={{ fontSize: 11 }}>Frames below this score are discarded as blurry. Default: 40.</span>
            </label>
          </div>
        </Card>

        <Card>
          <h2>GPU acceleration</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            When an NVIDIA GPU is present, the next NodeODM container is started with <code>--gpus all</code>.
            If Docker rejects GPU passthrough, posEye starts the CPU container instead.
          </p>
          <label className="check">
            <input type="checkbox" checked={gpuOn} onChange={(e) => setGpu(e.target.checked)} />
            Use NVIDIA GPU for reconstruction
          </label>
          <p className="muted" style={{ fontSize: 11 }}>
            {sys?.cudaAvailable
              ? "Docker can see the NVIDIA runtime."
              : sys?.gpuAvailable
              ? "GPU hardware is visible. Passthrough applies when the poseye-nodeodm container is created."
              : "No discrete GPU reported yet."}
            {" "}Restart posEye after changing this if a container is already running.
          </p>
        </Card>

        <Card>
          <h2>System Environment</h2>
          <div className="stat-row">
            <span className="stat-label">FFmpeg</span>
            <span className="stat-value" style={{ color: sys?.ffmpeg?.detected ? "var(--text-success)" : "var(--text-danger)" }}>
              {sys?.ffmpeg?.detected ? (sys.ffmpeg.version ?? sys.ffmpeg.path ?? "Detected") : (sys?.ffmpeg?.message ?? "Not found")}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Docker Engine</span>
            <span className="stat-value" style={{ color: sys?.docker?.ok ? "var(--text-success)" : "var(--text-danger)" }}>
              {sys?.docker?.ok ? `Running (${sys.docker.version || "ok"})` : (sys?.docker?.message || "Not running")}
            </span>
          </div>
          {!sys?.docker?.ok && sys?.docker?.recovery && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "2px 0 6px 0" }}>
              💡 {sys.docker.recovery}
            </div>
          )}
          <div className="stat-row">
            <span className="stat-label">NodeODM Reconstruction</span>
            <span className="stat-value" style={{ color: sys?.nodeodm?.ok ? "var(--text-success)" : "var(--text-danger)" }}>
              {sys?.nodeodm?.ok ? `Connected (${sys.nodeodm.url})` : (sys?.nodeodm?.message || "Offline")}
            </span>
          </div>
          {!sys?.nodeodm?.ok && sys?.nodeodm?.recovery && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "2px 0 6px 0" }}>
              💡 {sys.nodeodm.recovery}
            </div>
          )}
          <div className="stat-row">
            <span className="stat-label">Graphics / Acceleration</span>
            <span className="stat-value" style={{ fontSize: 12 }}>
              {sys?.gpuAvailable
                ? `${sys.gpuName ?? "GPU"} (${sys.nodeodmAcceleration || "Display Adapter"})`
                : "CPU-only (No discrete GPU)"}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Disk Storage</span>
            <span className="stat-value">{sys ? `${sys.diskUsedGb.toFixed(1)} / ${sys.diskTotalGb.toFixed(1)} GB (${sys.diskFreeGb ? `${sys.diskFreeGb.toFixed(1)} GB free` : ""})` : "—"}</span>
          </div>
        </Card>

        <Card>
          <h2>About</h2>
          <p className="muted">posEye {appVersion} — Single-Pass Drone Video to 3D Model</p>
          <p className="muted">Local processing only. Imagery never leaves this machine.</p>
          <div className="actions" style={{ marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setShowDiagnostics(true)}>
              🔍 Open Diagnostics
            </Button>
            <Button onClick={() => void window.dt?.openExternal("https://docs.opendronemap.org")}>
              OpenDroneMap docs
            </Button>
          </div>
        </Card>

        <DiagnosticsModal isOpen={showDiagnostics} onClose={() => setShowDiagnostics(false)} />
      </div>
    </main>
  );
}

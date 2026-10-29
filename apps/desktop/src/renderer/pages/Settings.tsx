import { useEffect, useState } from "react";
import { fetchJson, type SystemStatus } from "../api";
import Button from "../components/Button";
import Card from "../components/Card";
import { useTheme, type Theme } from "../hooks/useTheme";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [preset, setPreset] = useState(localStorage.getItem("dt-preset") || "balanced");
  const [fps, setFps] = useState(localStorage.getItem("dt-fps") || "3");
  const [blur, setBlur] = useState(localStorage.getItem("dt-blur") || "40");
  const [sys, setSys] = useState<SystemStatus | null>(null);

  useEffect(() => {
    localStorage.setItem("dt-preset", preset);
    localStorage.setItem("dt-fps", fps);
    localStorage.setItem("dt-blur", blur);
  }, [preset, fps, blur]);

  useEffect(() => {
    void fetchJson<SystemStatus>("/system/status").then(setSys).catch(() => setSys(null));
  }, []);

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 760 }}>
        <h1>Settings</h1>

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
          <h2>System</h2>
          <div className="stat-row"><span className="stat-label">FFmpeg</span><span className="stat-value" style={{ color: sys?.ffmpeg?.detected ? "var(--text-success)" : "var(--text-danger)" }}>{sys?.ffmpeg?.detected ? (sys.ffmpeg.version ?? sys.ffmpeg.path ?? "detected") : "Not found"}</span></div>
          <div className="stat-row"><span className="stat-label">Docker</span><span className="stat-value" style={{ color: sys?.docker.ok ? "var(--text-success)" : "var(--text-danger)" }}>{sys?.docker.ok ? `Running (${sys.docker.version || "ok"})` : "Not running"}</span></div>
          <div className="stat-row"><span className="stat-label">NodeODM</span><span className="stat-value" style={{ color: sys?.nodeodm.ok ? "var(--text-success)" : "var(--text-danger)" }}>{sys?.nodeodm.ok ? sys.nodeodm.url : "Disconnected"}</span></div>
          <div className="stat-row"><span className="stat-label">GPU</span><span className="stat-value">{sys?.gpuAvailable ? (sys.gpuName ?? "detected") : "Unavailable"}</span></div>
          <div className="stat-row"><span className="stat-label">Disk</span><span className="stat-value">{sys ? `${sys.diskUsedGb.toFixed(1)} / ${sys.diskTotalGb.toFixed(1)} GB` : "—"}</span></div>
        </Card>

        <Card>
          <h2>About</h2>
          <p className="muted">posEye 0.1.0 — Single-Pass Drone Video to 3D Model</p>
          <p className="muted">Local processing only. Imagery never leaves this machine.</p>
          <div className="actions" style={{ marginTop: 8 }}>
            <Button onClick={() => void window.dt?.openExternal("https://docs.opendronemap.org")}>
              OpenDroneMap docs
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}

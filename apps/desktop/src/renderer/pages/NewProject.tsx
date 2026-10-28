import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson, type Job } from "../api";
import Button from "../components/Button";
import Card from "../components/Card";

const PRESETS = [
  {
    id: "fast",
    label: "Fast",
    hint: "5–8 min",
    quality: "Lower point density, suitable for quick inspection",
    params: "min-num-features: 4000, pc-quality: low",
  },
  {
    id: "balanced",
    label: "Balanced",
    hint: "8–12 min",
    quality: "Good quality, recommended for most use cases",
    params: "min-num-features: 8000, pc-quality: medium",
  },
  {
    id: "high",
    label: "High",
    hint: "15–30 min",
    quality: "High point density, metrically accurate with GPS EXIF",
    params: "min-num-features: 12000, pc-quality: high",
  },
  {
    id: "ultra",
    label: "Ultra",
    hint: "30+ min",
    quality: "Maximum detail — requires ≥16 GB RAM",
    params: "min-num-features: 16000, pc-quality: ultra",
  },
];

type ProbeResult = {
  durationS?: number;
  width?: number;
  height?: number;
  fps?: number;
  sizeBytes?: number;
  name?: string;
  codec?: string;
};

export default function NewProject() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [videoPath, setVideoPath] = useState("");
  const [srtPath, setSrtPath] = useState("");
  const [preset, setPreset] = useState(localStorage.getItem("dt-preset") || "balanced");
  const [masks, setMasks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fps, setFps] = useState(localStorage.getItem("dt-fps") || "3");
  const [blur, setBlur] = useState(localStorage.getItem("dt-blur") || "40");
  const dropRef = useRef<HTMLDivElement>(null);

  async function applyVideo(p: string) {
    setVideoPath(p);
    setProbe(null);
    setProbeError(null);
    try {
      const result = await fetchJson<ProbeResult>("/probe/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoPath: p }),
      });
      setProbe(result);
    } catch (err) {
      setProbeError(String(err));
    }
  }

  async function pickVideo() {
    if (window.dt) {
      const p = await window.dt.pickVideo();
      if (p) await applyVideo(p);
    }
  }

  async function pickSrt() {
    if (window.dt) {
      const p = await window.dt.pickSrt();
      if (p) setSrtPath(p);
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["mp4", "mov", "mkv", "avi"].includes(ext)) {
      setProbeError("Unsupported file type. Use .mp4, .mov, .mkv, or .avi");
      return;
    }
    // In Electron, use pathForFile to get the real path
    const p = window.dt?.pathForFile(file) ?? file.name;
    await applyVideo(p);
  }

  function estimatedFrames(): string {
    if (!probe?.durationS || !probe?.fps) return "—";
    const effectiveFps = Math.min(Number(fps), probe.fps);
    return String(Math.round(probe.durationS * effectiveFps));
  }

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const job = await fetchJson<Job>("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          description: description || undefined,
          videoPath,
          srtPath: srtPath || null,
          preset,
          generateMasks: masks,
          fps: Number(fps),
          blurThreshold: Number(blur),
        }),
      });
      nav(`/processing/${job.id}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 800 }}>
        <h1>New Project</h1>

        {/* Project Details */}
        <Card>
          <h2>Project Details</h2>
          <div className="stack">
            <label className="field">
              Project name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Flight_Inspection_Site_A"
              />
            </label>
            <label className="field">
              Description (optional)
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Inspection flight over construction site…"
              />
            </label>
          </div>
        </Card>

        {/* Video drop zone */}
        <Card>
          <h2>Video File <span style={{ color: "var(--text-danger)", fontWeight: 400 }}>*</span></h2>
          <div
            ref={dropRef}
            className={`drop-zone${isDragOver ? " drag-over" : ""}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={(e) => void onDrop(e)}
            onClick={() => void pickVideo()}
          >
            <div className="drop-zone-icon">🎬</div>
            <div className="drop-zone-label">
              {videoPath ? <strong>{videoPath.split(/[\\/]/).pop()}</strong> : "Drag & drop video here, or click to browse"}
            </div>
            <div className="drop-zone-hint">Supported: .mp4 · .mov · .mkv · .avi</div>
          </div>

          {/* Manual path input */}
          <div style={{ marginTop: 10 }}>
            <label className="field">
              Or enter path manually
              <div className="row">
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={videoPath}
                  onChange={(e) => setVideoPath(e.target.value)}
                  onBlur={() => videoPath && void applyVideo(videoPath)}
                  placeholder="C:\path\to\flight.mp4"
                />
                <Button onClick={() => void pickVideo()}>Browse</Button>
              </div>
            </label>
          </div>

          {/* Probe results */}
          {probe && (
            <div className="card" style={{ marginTop: 10, marginBottom: 0, background: "var(--bg-panel-header)" }}>
              <div className="grid-2" style={{ marginBottom: 0 }}>
                <div>
                  <div className="stat-row"><span className="stat-label">Codec</span><span className="stat-value">{probe.codec ?? "—"}</span></div>
                  <div className="stat-row"><span className="stat-label">Resolution</span><span className="stat-value">{probe.width && probe.height ? `${probe.width}×${probe.height}` : "—"}</span></div>
                  <div className="stat-row"><span className="stat-label">Frame rate</span><span className="stat-value">{probe.fps?.toFixed(2) ?? "—"} fps</span></div>
                </div>
                <div>
                  <div className="stat-row"><span className="stat-label">Duration</span><span className="stat-value">{probe.durationS != null ? `${probe.durationS.toFixed(1)} s` : "—"}</span></div>
                  <div className="stat-row"><span className="stat-label">File size</span><span className="stat-value">{probe.sizeBytes != null ? `${(probe.sizeBytes / 1e6).toFixed(1)} MB` : "—"}</span></div>
                  <div className="stat-row"><span className="stat-label">Est. frames @ {fps} fps</span><span className="stat-value">{estimatedFrames()}</span></div>
                </div>
              </div>
            </div>
          )}
          {probeError && <p style={{ color: "var(--text-danger)", fontSize: 12, marginTop: 8 }}>{probeError}</p>}
        </Card>

        {/* SRT telemetry */}
        <Card>
          <h2>Telemetry SRT <span className="muted" style={{ fontSize: 11, textTransform: "none", fontWeight: 400 }}>optional</span></h2>
          <label className="field">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <input
                type="text"
                style={{ flex: 1 }}
                value={srtPath}
                onChange={(e) => setSrtPath(e.target.value)}
                placeholder="C:\path\to\flight.SRT"
              />
              <Button onClick={() => void pickSrt()}>Browse</Button>
            </div>
            <span style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>
              ℹ SRT provides GPS coordinates for georeferencing. Without it, distances are in model units only (not meters).
            </span>
          </label>
        </Card>

        {/* Quality preset */}
        <Card>
          <h2>Quality Preset</h2>
          <div className="stack" style={{ gap: 6 }}>
            {PRESETS.map((p) => (
              <label
                key={p.id}
                className="radio"
                style={{
                  padding: "10px 12px",
                  border: `1px solid ${preset === p.id ? "var(--color-primary)" : "var(--border-light)"}`,
                  borderRadius: "var(--radius)",
                  background: preset === p.id ? "var(--color-primary-light)" : "transparent",
                  cursor: "pointer",
                  alignItems: "flex-start",
                }}
              >
                <input type="radio" name="preset" checked={preset === p.id} onChange={() => setPreset(p.id)} style={{ marginTop: 2 }} />
                <div>
                  <div><strong>{p.label}</strong> <span className="muted">({p.hint})</span></div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{p.quality}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1, fontFamily: "var(--font-mono)" }}>{p.params}</div>
                </div>
              </label>
            ))}
          </div>
        </Card>

        {/* Advanced options */}
        <Card>
          <details onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}>
            <summary style={{ fontWeight: 600, fontSize: 13 }}>
              Advanced Options {showAdvanced ? "▲" : "▼"}
            </summary>
            <div className="stack" style={{ marginTop: 14 }}>
              <label className="field">
                Frame extraction FPS
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="5"
                  value={fps}
                  onChange={(e) => { setFps(e.target.value); localStorage.setItem("dt-fps", e.target.value); }}
                />
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  Frames extracted per second of video. Higher = more frames = slower reconstruction but better coverage. Default: 3.
                </span>
              </label>
              <label className="field">
                Blur threshold (Laplacian variance)
                <input
                  type="number"
                  value={blur}
                  onChange={(e) => { setBlur(e.target.value); localStorage.setItem("dt-blur", e.target.value); }}
                />
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  Frames with variance below this value are discarded as blurry. Lower = keep more frames. Default: 40.
                </span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={masks}
                  onChange={(e) => setMasks(e.target.checked)}
                />
                Mask moving objects (YOLOv8n)
                <span className="muted" style={{ fontSize: 11 }}>— requires ultralytics package</span>
              </label>
            </div>
          </details>
        </Card>

        {error && <p style={{ color: "var(--text-danger)", marginTop: 8 }}>{error}</p>}

        <div className="actions">
          <Button onClick={() => nav("/dashboard")}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!videoPath || busy}
            onClick={() => void start()}
          >
            {busy ? "Starting…" : "Start Processing"}
          </Button>
          {!videoPath && <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>Select a video file to continue</span>}
        </div>
      </div>
    </main>
  );
}

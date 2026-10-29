import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchJson, formatLocalTime } from "../api";
import Button from "../components/Button";
import Card from "../components/Card";
import ProgressBar from "../components/ProgressBar";
import { useProject } from "../hooks/useProject";
import { useJobEvents } from "../hooks/useWebSocket";

const PIPELINE = [
  { id: "queued", label: "Input validation & queuing", desc: "Verifying input files" },
  { id: "validating", label: "Video integrity check", desc: "Checking codec, container & streams" },
  { id: "extracting", label: "Frame extraction", desc: "Decoding video into high-resolution frames" },
  { id: "filtering", label: "Quality & blur filtering", desc: "Removing motion-blurred and duplicate frames" },
  { id: "geotagging", label: "SRT & GPS geotagging", desc: "Interpolating camera telemetry into EXIF" },
  { id: "masking", label: "Dynamic masking", desc: "Optional AI masking of moving objects" },
  { id: "uploading", label: "NodeODM task initialization", desc: "Packaging dataset and initializing task" },
  { id: "reconstructing", label: "Photogrammetry reconstruction", desc: "SfM, Dense Point Cloud, Mesh & Texture" },
  { id: "postprocessing", label: "Output processing", desc: "Extracting OBJ, LAZ and GeoTIFF assets" },
  { id: "converting", label: "GLB 3D conversion", desc: "Optimizing 3D mesh for web/desktop viewer" },
  { id: "ready", label: "3D model ready", desc: "Reconstruction complete and interactive" },
];

const ORDER = PIPELINE.map((s) => s.id);

function stageIndex(stage: string): number {
  if (stage === "error" || stage === "cancelled") return -1;
  const i = ORDER.indexOf(stage);
  return i >= 0 ? i : 0;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function Processing() {
  const { id } = useParams();
  const nav = useNavigate();
  const { job, refresh } = useProject(id);
  const { events, latest } = useJobEvents(id);
  const logRef = useRef<HTMLDivElement>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const stage = latest?.stage ?? job?.stage ?? "queued";
  const percent = latest?.percent ?? job?.percent ?? 0;
  const message = latest?.message ?? job?.message ?? "Waiting";
  const extract = job?.extract;
  const idx = stageIndex(stage);

  // Track elapsed time
  useEffect(() => {
    if (!job?.createdAt) return;
    const startTime = new Date(job.createdAt).getTime();

    const updateTimer = () => {
      const isTerminal = stage === "ready" || stage === "error" || stage === "cancelled";
      if (isTerminal && job?.updatedAt) {
        const endTime = new Date(job.updatedAt).getTime();
        setElapsed(Math.max(0, Math.round((endTime - startTime) / 1000)));
      } else {
        const now = Date.now();
        setElapsed(Math.max(0, Math.round((now - startTime) / 1000)));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [job?.createdAt, job?.updatedAt, stage]);

  // Auto-scroll log
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [events, showConsole]);

  // Auto-navigate to viewer when complete
  useEffect(() => {
    if (stage === "ready" && id && job?.hasModel) {
      const timer = setTimeout(() => {
        nav(`/viewer/${id}`, { replace: true });
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [stage, id, nav, job?.hasModel]);

  async function cancel() {
    if (!id) return;
    await fetchJson(`/jobs/${id}/cancel`, { method: "POST" });
    await refresh();
  }

  const currentStageInfo = useMemo(() => {
    return PIPELINE.find((p) => p.id === stage) ?? { label: stage, desc: message };
  }, [stage, message]);

  return (
    <main className="page">
      <div className="container">
        {/* Top Header */}
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ marginBottom: 2 }}>Processing Reconstruction</h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>{job?.name || id}</span>
              <span className="badge badge-active" style={{ fontSize: 11 }}>
                ⏱ {formatDuration(elapsed)} elapsed
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                Preset: <strong>{job?.preset || "default"}</strong>
              </span>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {stage !== "error" && stage !== "cancelled" && stage !== "ready" && (
              <Button variant="danger" onClick={() => void cancel()}>Cancel Job</Button>
            )}
            {stage === "ready" && (
              <Button variant="primary" onClick={() => nav(`/viewer/${id}`)}>Open 3D Viewer →</Button>
            )}
            <Button onClick={() => nav("/projects")}>Projects List</Button>
          </div>
        </div>

        {/* Primary Progress Status Card */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "baseline" }}>
            <div>
              <strong style={{ fontSize: 15, color: "var(--text-primary)" }}>
                {currentStageInfo.label}
              </strong>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {message || currentStageInfo.desc}
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-primary)", fontFamily: "var(--font-mono)" }}>
              {Math.round(percent)}%
            </div>
          </div>

          <ProgressBar percent={percent} label="" />

          {(stage === "error" || stage === "cancelled") && (
            <div style={{
              background: "rgba(231, 76, 60, 0.1)",
              border: "1px solid rgba(231, 76, 60, 0.3)",
              borderRadius: "var(--radius)",
              padding: 12,
              marginTop: 12,
            }}>
              <p style={{ color: "var(--text-danger)", margin: 0, fontSize: 13 }}>
                {job?.errorCode ? <strong>{job.errorCode}: </strong> : null}
                {latest?.message || job?.error || "Processing halted."}
              </p>
              {stage === "error" && (
                <div style={{ marginTop: 10 }}>
                  <Button onClick={() => nav("/projects/new")}>Retry in New Project</Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 2-Column Details Layout */}
        <div className="grid-2">
          {/* Stage Timeline */}
          <Card>
            <h2>Pipeline Stages</h2>
            <ul className="timeline">
              {PIPELINE.map((s, i) => {
                let cls = "";
                let mark = "○";
                if (idx < 0) {
                  cls = "";
                  mark = stage === "error" && i === Math.max(0, Math.abs(idx)) ? "✗" : "○";
                } else if (i < idx || stage === "ready") {
                  cls = "done";
                  mark = "✓";
                } else if (i === idx) {
                  cls = "current";
                  mark = "◉";
                }
                return (
                  <li key={s.id} className={cls} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0" }}>
                    <span style={{ fontFamily: "var(--font-mono)", width: 18, display: "inline-block", textAlign: "center" }}>
                      {mark}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: i === idx ? 600 : 400 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.desc}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Extract Stats and Real-time Console */}
          <div>
            <Card>
              <h2>Extraction & Photogrammetry Stats</h2>
              <div className="stat-row">
                <span className="stat-label">Video duration</span>
                <span className="stat-value">{extract?.duration != null ? `${extract.duration.toFixed(1)} s` : "—"}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Resolution</span>
                <span className="stat-value">{extract?.resolution ?? "—"}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Raw decoded frames</span>
                <span className="stat-value">{extract?.rawFrames ?? "—"}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Sharp retained frames</span>
                <span className="stat-value" style={{ fontWeight: 600 }}>{extract?.retainedFrames ?? job?.frameCount ?? "—"}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Filtered for blur</span>
                <span className="stat-value">{extract?.droppedBlur ?? "—"}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Filtered duplicates</span>
                <span className="stat-value">{extract?.droppedDuplicates ?? "—"}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">GPS telemetry tagged</span>
                <span className="stat-value" style={{ color: (extract?.geotaggedFrames ?? job?.geotagged ?? 0) > 0 ? "var(--color-primary)" : "inherit" }}>
                  {extract?.geotaggedFrames ?? job?.geotagged ?? 0} / {extract?.retainedFrames ?? job?.frameCount ?? "—"}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Dynamic masking</span>
                <span className="stat-value">{extract?.masksGenerated ? `${extract.masksGenerated} masks applied` : "Disabled"}</span>
              </div>
            </Card>

            {/* Live Log / Diagnostic Console */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h2 style={{ margin: 0 }}>Activity Log</h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: "3px 8px" }}
                  onClick={() => setShowConsole(!showConsole)}
                >
                  {showConsole ? "Collapse Diagnostic Log" : "Expand Diagnostic Log"}
                </button>
              </div>

              <div
                className="log-panel"
                ref={logRef}
                style={{
                  height: showConsole ? 380 : 190,
                  transition: "height 0.2s ease-in-out",
                }}
              >
                {events.length === 0 && (
                  <span style={{ color: "var(--text-muted)" }}>Waiting for pipeline events…</span>
                )}
                {events.map((e, i) => (
                  <div key={i} style={{ padding: "1px 0" }}>
                    <span className="log-ts">{formatLocalTime(e.ts)}</span>
                    <span className="log-stage">{e.stage}</span>
                    <span style={{ color: "var(--text-muted)", marginRight: 6, fontSize: 11 }}>
                      {Math.round(e.percent)}%
                    </span>
                    <span>{e.message}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchJson } from "../api";
import Button from "../components/Button";
import Card from "../components/Card";
import ProgressBar from "../components/ProgressBar";
import { useProject } from "../hooks/useProject";
import { useJobEvents } from "../hooks/useWebSocket";

const PIPELINE = [
  { id: "queued", label: "Input" },
  { id: "validating", label: "Validate video" },
  { id: "extracting", label: "Frame extraction" },
  { id: "filtering", label: "Filtering" },
  { id: "geotagging", label: "Geotagging" },
  { id: "masking", label: "Masking" },
  { id: "uploading", label: "Upload to NodeODM" },
  { id: "reconstructing", label: "Reconstruction" },
  { id: "postprocessing", label: "Post-processing" },
  { id: "converting", label: "Convert to GLB" },
  { id: "ready", label: "Model ready" },
];

const ORDER = PIPELINE.map((s) => s.id);

function stageIndex(stage: string): number {
  if (stage === "error" || stage === "cancelled") return -1;
  const i = ORDER.indexOf(stage);
  return i >= 0 ? i : 0;
}

export default function Processing() {
  const { id } = useParams();
  const nav = useNavigate();
  const { job, refresh } = useProject(id);
  const { events, latest } = useJobEvents(id);
  const logRef = useRef<HTMLDivElement>(null);

  const stage = latest?.stage ?? job?.stage ?? "queued";
  const percent = latest?.percent ?? job?.percent ?? 0;
  const message = latest?.message ?? job?.message ?? "Waiting";
  const extract = job?.extract;
  const idx = stageIndex(stage);

  // Auto-scroll log
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [events]);

  // Auto-navigate to viewer when complete
  useEffect(() => {
    if (stage === "ready" && id && job?.hasModel) nav(`/viewer/${id}`, { replace: true });
  }, [stage, id, nav, job?.hasModel]);

  async function cancel() {
    if (!id) return;
    await fetchJson(`/jobs/${id}/cancel`, { method: "POST" });
    await refresh();
  }

  return (
    <main className="page">
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ marginBottom: 2 }}>Processing</h1>
            <span className="muted" style={{ fontSize: 12 }}>{job?.name || id}</span>
          </div>
          <div className="row">
            {stage !== "error" && stage !== "cancelled" && stage !== "ready" && (
              <Button variant="danger" onClick={() => void cancel()}>Cancel</Button>
            )}
            <Button onClick={() => nav("/projects")}>Projects</Button>
          </div>
        </div>

        {/* Progress */}
        <Card>
          <ProgressBar percent={percent} label={message} />
          {(stage === "error" || stage === "cancelled") && (
            <p style={{ color: "var(--error)", marginTop: 8 }}>
              {job?.errorCode ? <strong>{job.errorCode}: </strong> : null}
              {latest?.message || job?.error}
            </p>
          )}
          {stage === "error" && (
            <div className="actions" style={{ marginTop: 8 }}>
              <Button onClick={() => nav("/projects/new")}>Retry from new project</Button>
            </div>
          )}
        </Card>

        <div className="grid-2">
          {/* Stage timeline */}
          <Card>
            <h2>Pipeline stages</h2>
            <ul className="timeline">
              {PIPELINE.map((s, i) => {
                let cls = "";
                let mark = "○";
                if (idx < 0) {
                  cls = "";
                  mark = stage === "error" && i === Math.max(0, Math.abs(idx)) ? "✗" : "○";
                } else if (i < idx) {
                  cls = "done";
                  mark = "✓";
                } else if (i === idx) {
                  cls = "current";
                  mark = "◉";
                }
                return (
                  <li key={s.id} className={cls}>
                    <span style={{ fontFamily: "var(--font-mono)", width: 16, display: "inline-block" }}>{mark}</span>
                    <span>{s.label}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Stats */}
          <div>
            <Card>
              <h2>Extract stats</h2>
              <div className="stat-row"><span className="stat-label">Duration</span><span className="stat-value">{extract?.duration != null ? `${extract.duration.toFixed(1)} s` : "—"}</span></div>
              <div className="stat-row"><span className="stat-label">Resolution</span><span className="stat-value">{extract?.resolution ?? "—"}</span></div>
              <div className="stat-row"><span className="stat-label">Raw frames</span><span className="stat-value">{extract?.rawFrames ?? "—"}</span></div>
              <div className="stat-row"><span className="stat-label">Retained</span><span className="stat-value">{extract?.retainedFrames ?? job?.frameCount ?? "—"}</span></div>
              <div className="stat-row"><span className="stat-label">Blur dropped</span><span className="stat-value">{extract?.droppedBlur ?? "—"}</span></div>
              <div className="stat-row"><span className="stat-label">Dupes dropped</span><span className="stat-value">{extract?.droppedDuplicates ?? "—"}</span></div>
              <div className="stat-row"><span className="stat-label">GPS matched</span><span className="stat-value">{extract?.geotaggedFrames ?? job?.geotagged ?? 0} / {extract?.retainedFrames ?? job?.frameCount ?? "—"}</span></div>
              <div className="stat-row"><span className="stat-label">Masks</span><span className="stat-value">{extract?.masksGenerated ? `${extract.masksGenerated}` : "off"}</span></div>
            </Card>

            {/* Live log */}
            <Card>
              <h2>Live log</h2>
              <div className="log-panel" ref={logRef} style={{ height: 200 }}>
                {events.length === 0 && <span style={{ color: "var(--text-muted)" }}>Waiting for events…</span>}
                {events.map((e, i) => (
                  <div key={i}>
                    <span className="log-ts">{e.ts.slice(11, 19)}</span>
                    <span className="log-stage">{e.stage}</span>
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

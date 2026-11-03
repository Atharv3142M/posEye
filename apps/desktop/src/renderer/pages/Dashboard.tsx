import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson, type SystemStatus } from "../api";
import Button from "../components/Button";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { useProjects } from "../hooks/useProject";

export default function Dashboard() {
  const nav = useNavigate();
  const { jobs } = useProjects();
  const [sys, setSys] = useState<SystemStatus | null>(null);
  const [appStatus, setAppStatus] = useState<{ phase: string; message: string } | null>(null);

  useEffect(() => {
    void fetchJson<SystemStatus>("/system/status").then(setSys).catch(() => setSys(null));
    const id = setInterval(() => void fetchJson<SystemStatus>("/system/status").then(setSys).catch(() => {}), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (window.dt?.onAppStatus) {
      const unsub = window.dt.onAppStatus((st) => setAppStatus(st));
      return unsub;
    }
  }, []);

  const recent = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);

  return (
    <main className="page">
      <div className="container">
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ marginBottom: 2 }}>posEye</h1>
          <p className="muted" style={{ margin: 0 }}>Drone Video → 3D Model Pipeline · local processing · no cloud</p>
        </div>

        {/* Engine Provisioning / Prerequisite Notice */}
        {appStatus && appStatus.phase !== "ready" && appStatus.phase !== "api_ready" && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              background: "var(--bg-panel)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                {appStatus.phase === "docker_missing"
                  ? "Docker Desktop Not Detected"
                  : appStatus.phase === "docker_starting"
                  ? "Starting Docker Desktop…"
                  : appStatus.phase === "nodeodm_starting"
                  ? "Provisioning NodeODM Engine (3.6.2)…"
                  : "Engine Provisioning"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {appStatus.message}
              </div>
            </div>
            {appStatus.phase === "docker_missing" && (
              <Button
                variant="secondary"
                onClick={() => {
                  window.dt?.openExternal?.("https://www.docker.com/products/docker-desktop");
                }}
              >
                Download Docker Desktop ↗
              </Button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="actions" style={{ marginTop: 0, marginBottom: 24 }}>
          <Button variant="primary" onClick={() => nav("/projects/new")}>＋ New Project</Button>
          <Button onClick={() => nav("/projects")}>View all projects</Button>
        </div>

        {/* Recent Projects */}
        <Card>
          <h2>Recent Projects</h2>
          {recent.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", padding: "24px 0" }}>
              No projects yet. Start a new project to get going.
            </p>
          ) : (
            <table className="table-view">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Preset</th>
                  <th>Frames</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((j) => (
                  <tr
                    key={j.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => nav(j.stage === "ready" ? `/viewer/${j.id}` : `/processing/${j.id}`)}
                  >
                    <td><strong>{j.name || j.id.slice(0, 8)}</strong></td>
                    <td><StatusBadge stage={j.stage} /></td>
                    <td className="muted">{j.preset}</td>
                    <td className="muted">{j.frameCount || "—"}</td>
                    <td className="muted">{fmtDate(j.createdAt)}</td>
                    <td className="col-actions">
                      <span style={{ color: "var(--text-primary)", fontSize: 12 }}>→</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* System Status */}
        <Card>
          <h2>System Status</h2>
          <div className="grid-3" style={{ marginBottom: 0 }}>
            <div>
              <SysMeter label="CPU" pct={sys?.cpuPercent ?? 0} text={`${Math.round(sys?.cpuPercent ?? 0)}%`} />
              <SysMeter label="RAM" pct={sys?.ramPercent ?? 0} text={sys ? `${sys.ramUsedGb.toFixed(1)} / ${sys.ramTotalGb.toFixed(1)} GB` : "—"} />
              <SysMeter label="Disk" pct={sys ? (sys.diskUsedGb / sys.diskTotalGb) * 100 : 0} text={sys ? `${sys.diskUsedGb.toFixed(1)} GB used` : "—"} />
            </div>
            <div>
              <div className="stat-row">
                <span className="stat-label">ffmpeg</span>
                <span className="stat-value" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {sys?.ffmpeg?.detected ? sys.ffmpeg.version ?? "detected" : "Not detected"}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Docker</span>
                <span className="stat-value" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {sys?.docker.ok ? `Running ${sys.docker.version || ""}`.trim() : "Offline"}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">NodeODM</span>
                <span className="stat-value" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {sys?.nodeodm.ok ? "Connected" : "Offline"}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">GPU</span>
                <span className="stat-value" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {sys?.gpuAvailable
                    ? sys.nvidiaSmiAvailable && sys.gpuUtilization != null
                      ? `${sys.gpuName ?? "NVIDIA"} · ${Math.round(sys.gpuUtilization)}% · ${sys.gpuMemoryUsed}/${sys.gpuMemoryTotal} MiB`
                      : `${sys.gpuName ?? "GPU"} (Display Adapter · CPU Processing)`
                    : "CPU-only (No discrete GPU)"}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}

function SysMeter({ label, pct, text }: { label: string; pct: number; text: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted">{label}</span>
        <span style={{ fontSize: 12 }}>{text}</span>
      </div>
      <div className="resource-bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(0, 10);
  }
}

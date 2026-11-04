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
  const [sysLoading, setSysLoading] = useState(true);
  const [sysError, setSysError] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<{ phase: string; message: string } | null>(null);

  async function loadSys() {
    setSysLoading(true);
    try {
      const data = await fetchJson<SystemStatus>("/system/status");
      setSys(data);
      setSysError(null);
    } catch (err) {
      setSys(null);
      setSysError(err instanceof Error ? err.message : "Backend not available");
    } finally {
      setSysLoading(false);
    }
  }

  useEffect(() => {
    void loadSys();
    const id = setInterval(() => void loadSys(), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (window.dt?.onAppStatus) {
      const unsub = window.dt.onAppStatus((st) => setAppStatus(st));
      return unsub;
    }
  }, []);

  const recent = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const activeJobs = jobs.filter((j) => !["ready", "error", "cancelled", "interrupted"].includes(j.stage));

  return (
    <main className="page">
      <div className="container">
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <h1 style={{ marginBottom: 0 }}>posEye</h1>
            <span className="badge" style={{ fontSize: 11 }}>v0.1.5</span>
            {activeJobs.length > 0 && (
              <span className="badge badge-active" style={{ fontSize: 11 }}>
                {activeJobs.length} job{activeJobs.length > 1 ? "s" : ""} running
              </span>
            )}
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Drone Video → 3D Model Pipeline · local processing · no cloud
          </p>
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
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <span className="status-dot checking" style={{ animation: "pulse 1.5s infinite" }} />
                {appStatus.phase === "docker_missing"
                  ? "Docker Desktop Not Detected"
                  : appStatus.phase === "docker_starting"
                  ? "Starting Docker Desktop…"
                  : appStatus.phase === "nodeodm_starting"
                  ? "Provisioning NodeODM Engine (3.6.2)…"
                  : appStatus.phase === "nodeodm_pulling"
                  ? "Downloading NodeODM container image…"
                  : appStatus.phase === "api_error"
                  ? "Backend Error"
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>System Status</h2>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => void loadSys()}
              disabled={sysLoading}
            >
              {sysLoading ? "Refreshing…" : "⟳ Refresh"}
            </button>
          </div>
          <div className="grid-3" style={{ marginBottom: 0 }}>
            <div>
              <SysMeter label="CPU" pct={sys?.cpuPercent ?? 0} text={sys ? `${Math.round(sys.cpuPercent)}%` : (sysLoading ? "…" : "—")} />
              <SysMeter label="RAM" pct={sys?.ramPercent ?? 0} text={sys ? `${sys.ramUsedGb.toFixed(1)} / ${sys.ramTotalGb.toFixed(1)} GB` : (sysLoading ? "…" : "—")} />
              <SysMeter label="Disk" pct={sys ? (sys.diskUsedGb / sys.diskTotalGb) * 100 : 0} text={sys ? `${sys.diskUsedGb.toFixed(1)} GB used` : (sysLoading ? "…" : "—")} />
            </div>
            <div>
              {sysError && !sys && (
                <p className="muted" style={{ marginTop: 0 }}>{sysError}</p>
              )}
              <ServiceStatusRow
                label="FFmpeg"
                tone={meterTone(Boolean(sys?.ffmpeg?.detected), sysLoading, Boolean(sys))}
                text={sys?.ffmpeg?.detected ? (sys.ffmpeg!.version ?? "detected") : (sys ? "Not detected" : "Connecting…")}
                tooltip={sys?.ffmpeg?.detected ? `Path: ${sys.ffmpeg?.path ?? "on PATH"}` : (sys?.ffmpeg?.recovery ?? "Install FFmpeg")}
              />
              <ServiceStatusRow
                label="Docker"
                tone={meterTone(Boolean(sys?.docker?.ok), sysLoading, Boolean(sys))}
                text={sys?.docker?.ok ? `Running ${sys.docker.version || ""}`.trim() : (sys ? (sys.docker?.status === "stopped" ? "Stopped" : sys.docker?.message || "Offline") : "Connecting…")}
                tooltip={sys?.docker?.message ?? ""}
              />
              <ServiceStatusRow
                label="NodeODM"
                tone={meterTone(Boolean(sys?.nodeodm?.ok), sysLoading, Boolean(sys))}
                text={sys?.nodeodm?.ok ? `Connected v${sys.nodeodm.version || ""}` : (sys ? "Offline" : "Connecting…")}
                tooltip={sys?.nodeodm?.message ?? ""}
              />
              <ServiceStatusRow
                label="GPU"
                tone={meterTone(Boolean(sys?.gpuAvailable), sysLoading, Boolean(sys))}
                text={
                  sys?.gpuAvailable
                    ? sys.nvidiaSmiAvailable && sys.gpuUtilization != null
                      ? `${sys.gpuName ?? "NVIDIA"} · ${Math.round(sys.gpuUtilization)}% · ${sys.gpuMemoryUsed}/${sys.gpuMemoryTotal} MiB`
                      : `${sys.gpuName ?? "GPU"} (Display Adapter)`
                    : (sys ? "CPU-only" : "Connecting…")
                }
                tooltip={
                  sys?.gpuAvailable
                    ? (sys.cudaAvailable ? "CUDA GPU acceleration active" : "GPU detected, CPU processing mode")
                    : "No discrete GPU detected"
                }
              />
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
      <div className="resource-bar"><i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>
    </div>
  );
}

function meterTone(ok: boolean, loading: boolean, hasData: boolean): "ok" | "bad" | "wait" {
  if (!hasData && loading) return "wait";
  if (!hasData) return "bad";
  return ok ? "ok" : "bad";
}

function ServiceStatusRow({ label, tone, text, tooltip }: { label: string; tone: "ok" | "bad" | "wait"; text: string; tooltip?: string }) {
  const dot = tone === "ok" ? "ok" : tone === "wait" ? "checking" : "err";
  return (
    <div className="stat-row" title={tooltip}>
      <span className="stat-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className={`status-dot ${dot}`} />
        {label}
      </span>
      <span className="stat-value" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
        {text}
      </span>
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

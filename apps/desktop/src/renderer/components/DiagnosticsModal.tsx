import { useEffect, useState } from "react";
import { fetchJson } from "../api";
import Button from "./Button";

export type DiagnosticsData = {
  reportGeneratedAt: string;
  platform: {
    os: string;
    release: string;
    version: string;
    machine: string;
    pythonVersion: string;
  };
  systemStatus: {
    cpuPercent: number;
    ramUsedGb: number;
    ramTotalGb: number;
    ramPercent: number;
    diskUsedGb: number;
    diskFreeGb?: number;
    diskTotalGb: number;
    docker: {
      ok: boolean;
      status: string;
      version?: string;
      message?: string;
      recovery?: string;
    };
    nodeodm: {
      ok: boolean;
      status: string;
      url?: string;
      version?: string;
      message?: string;
      recovery?: string;
    };
    ffmpeg?: {
      ok: boolean;
      status: string;
      detected?: boolean;
      path?: string | null;
      version?: string;
      message?: string;
    };
    gpuAvailable?: boolean;
    gpuName?: string | null;
    nvidiaSmiAvailable?: boolean;
    cudaAvailable?: boolean;
    nodeodmAcceleration?: string;
    message?: string;
  };
  pinnedImages: {
    nodeodmVersion: string;
    cpuImage: string;
    gpuImage: string;
  };
  environmentVariables: Record<string, string>;
};

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DiagnosticsModal({ isOpen, onClose }: DiagnosticsModalProps) {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetchJson<DiagnosticsData>("/system/diagnostics")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load diagnostics");
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `posEye-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius)",
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>posEye System Diagnostics</h2>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              Environment, hardware detection, Docker provisioning, and pinned version contracts
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 16, padding: "4px 8px" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1, fontSize: 13 }}>
          {loading && <p className="muted">Gathering system diagnostics…</p>}
          {error && <p style={{ color: "var(--text-danger)" }}>⚠ {error}</p>}
          {data && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Host Platform */}
              <section>
                <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)", textTransform: "uppercase", fontSize: 11 }}>
                  Host Platform & Architecture
                </div>
                <div style={{ background: "var(--bg-panel-header)", padding: 12, borderRadius: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><span className="muted">OS:</span> {data.platform.os} {data.platform.release} ({data.platform.machine})</div>
                  <div><span className="muted">Python Runtime:</span> {data.platform.pythonVersion}</div>
                  <div><span className="muted">Report Timestamp:</span> {data.reportGeneratedAt.slice(0, 19).replace("T", " ")} UTC</div>
                </div>
              </section>

              {/* Service Health */}
              <section>
                <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)", textTransform: "uppercase", fontSize: 11 }}>
                  Engine & Service Readiness
                </div>
                <div style={{ background: "var(--bg-panel-header)", padding: 12, borderRadius: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span><strong>Docker Desktop:</strong> {data.systemStatus.docker?.status} ({data.systemStatus.docker?.version || "unknown"})</span>
                    <span style={{ color: data.systemStatus.docker?.ok ? "var(--text-success)" : "var(--text-danger)" }}>
                      {data.systemStatus.docker?.ok ? "✓ Operational" : "✗ Offline"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span><strong>NodeODM Container:</strong> {data.systemStatus.nodeodm?.status} ({data.systemStatus.nodeodm?.version || "pinned 3.6.2"})</span>
                    <span style={{ color: data.systemStatus.nodeodm?.ok ? "var(--text-success)" : "var(--text-danger)" }}>
                      {data.systemStatus.nodeodm?.ok ? "✓ Connected" : "✗ Offline"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span><strong>FFmpeg Binary:</strong> {data.systemStatus.ffmpeg?.path || "bundled"}</span>
                    <span style={{ color: data.systemStatus.ffmpeg?.detected ? "var(--text-success)" : "var(--text-danger)" }}>
                      {data.systemStatus.ffmpeg?.detected ? "✓ Detected" : "✗ Missing"}
                    </span>
                  </div>
                </div>
              </section>

              {/* GPU Hardware & Acceleration */}
              <section>
                <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)", textTransform: "uppercase", fontSize: 11 }}>
                  GPU Hardware & Acceleration Stack
                </div>
                <div style={{ background: "var(--bg-panel-header)", padding: 12, borderRadius: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div><strong>GPU Hardware:</strong> {data.systemStatus.gpuAvailable ? (data.systemStatus.gpuName || "Discrete GPU") : "CPU-only"}</div>
                  <div><strong>NVIDIA SMI:</strong> {data.systemStatus.nvidiaSmiAvailable ? "Available" : "Not detected"}</div>
                  <div><strong>CUDA Capability:</strong> {data.systemStatus.cudaAvailable ? "Detected and available" : "No CUDA runtime / CPU fallback"}</div>
                  <div><strong>Reconstruction Mode:</strong> {data.systemStatus.nodeodmAcceleration || "CPU Standard"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    Note: Pinned standard CPU image <code>opendronemap/nodeodm:3.6.2</code> runs in CPU mode. GPU acceleration requires the validated GPU image tag and NVIDIA Container Toolkit.
                  </div>
                </div>
              </section>

              {/* Pinned Image Contracts */}
              <section>
                <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)", textTransform: "uppercase", fontSize: 11 }}>
                  Pinned Image Compatibility Contract
                </div>
                <div style={{ background: "var(--bg-panel-header)", padding: 12, borderRadius: 6, display: "flex", flexDirection: "column", gap: 4, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <div>NodeODM Version: {data.pinnedImages.nodeodmVersion}</div>
                  <div>Standard CPU Image: {data.pinnedImages.cpuImage}</div>
                  <div>NVIDIA GPU Image: {data.pinnedImages.gpuImage}</div>
                </div>
              </section>

              {/* Redacted Environment */}
              <section>
                <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)", textTransform: "uppercase", fontSize: 11 }}>
                  Environment Security (Secrets Redacted)
                </div>
                <div style={{ background: "var(--bg-panel-header)", padding: 10, borderRadius: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                  All authentication tokens (including <code>DT_API_TOKEN</code>) and credentials are automatically sanitized as <code>[REDACTED]</code> prior to export.
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button variant="secondary" onClick={handleExport} disabled={!data}>
            ↓ Export Diagnostics Report (.json)
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

import { NavLink } from "react-router-dom";
import { type ServiceState, useHealth } from "../api";
import BrandLogo from "./BrandLogo";

type NavIconName = "dashboard" | "projects" | "new" | "logs" | "settings";

const NAV_LINKS: Array<{ to: string; label: string; icon: NavIconName }> = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/projects", label: "Projects", icon: "projects" },
  { to: "/projects/new", label: "New Project", icon: "new" },
  { to: "/logs", label: "Logs", icon: "logs" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

function NavIcon({ name }: { name: NavIconName }) {
  const props = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "dashboard":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      );
    case "projects":
      return (
        <svg {...props}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </svg>
      );
    case "new":
      return (
        <svg {...props}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case "logs":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

export default function Sidebar() {
  const health = useHealth(5_000);

  return (
    <nav className="sidebar">
      {/* Brand Header with Logo */}
      <div className="sidebar-logo">
        <BrandLogo size={28} showWordmark={true} />
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        <div className="sidebar-section">Navigation</div>
        {NAV_LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <i className="sidebar-link-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <NavIcon name={l.icon} />
            </i>
            {l.label}
          </NavLink>
        ))}
      </div>

      {/* System status footer */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-title">System Status</div>
        <StatusRow label="Backend API" isApiOk={health.ok} />
        <StatusRow label="Docker Engine" service={health.docker} />
        <StatusRow label="NodeODM" service={health.nodeodm} />
        <StatusRow label="FFmpeg" service={health.ffmpeg} />
        <StatusRow
          label="GPU"
          service={{
            ok: Boolean(health.gpu?.available),
            status: health.message === "Connecting…" ? "checking" : health.gpu?.available ? "running" : "stopped",
            message: health.gpu?.message || health.gpu?.acceleration || "",
          }}
        />
      </div>
    </nav>
  );
}

function StatusRow({
  label,
  service,
  isApiOk,
}: {
  label: string;
  service?: ServiceState;
  isApiOk?: boolean;
}) {
  let cls = "checking";
  let statusText = "Checking…";
  let tooltip = "";

  if (isApiOk !== undefined) {
    cls = isApiOk ? "ok" : "err";
    statusText = isApiOk ? "Running" : "Offline";
    tooltip = isApiOk ? "FastAPI backend active on port 8765" : "Backend orchestrator is not reachable";
  } else if (service) {
    if (service.status === "checking") {
      cls = "checking";
      statusText = "Checking…";
      tooltip = service.message || "Waiting for the backend";
    } else if (service.ok) {
      cls = "ok";
      if (service.status === "running") statusText = "Running";
      else if (service.status === "connected") statusText = "Connected";
      else statusText = "Ready";
      tooltip = service.message || `${label} is operational`;
    } else {
      if (service.status === "stopped") {
        cls = "warn";
        statusText = "Stopped";
      } else if (service.status === "missing" || service.status === "not_installed") {
        cls = "err";
        statusText = "Missing";
      } else {
        cls = "err";
        statusText = "Offline";
      }
      tooltip = service.recovery
        ? `${service.message || label} — ${service.recovery}`
        : (service.message || `${label} unavailable`);
    }
  }

  return (
    <div className="status-row" title={tooltip}>
      <span className={`status-dot ${cls}`} />
      <span className="status-label">{label}</span>
      <span className={`status-badge ${cls}`}>{statusText}</span>
    </div>
  );
}

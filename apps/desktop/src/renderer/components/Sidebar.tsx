import { NavLink } from "react-router-dom";
import { type ServiceState, useHealth } from "../api";
import logoUrl from "../assets/posEye.png";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "⬛" },
  { to: "/projects", label: "Projects", icon: "☰" },
  { to: "/projects/new", label: "New Project", icon: "＋" },
  { to: "/logs", label: "Logs", icon: "▤" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar() {
  const health = useHealth(10_000);

  return (
    <nav className="sidebar">
      {/* Brand Header with Logo */}
      <div className="sidebar-logo">
        <img
          src={logoUrl}
          alt="posEye Logo"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            objectFit: "contain",
            background: "rgba(255, 255, 255, 0.08)",
            padding: 2,
          }}
        />
        <span className="sidebar-logo-text">posEye</span>
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
            <i className="sidebar-link-icon">{l.icon}</i>
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
    if (service.ok) {
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

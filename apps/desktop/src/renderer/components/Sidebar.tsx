import { NavLink } from "react-router-dom";
import { useHealth } from "../api";
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
        <StatusRow label="Backend API" ok={health.ok} />
        <StatusRow label="Docker Engine" ok={health.docker} />
        <StatusRow label="NodeODM" ok={health.nodeodm} />
        <StatusRow label="FFmpeg" ok={health.ffmpeg} />
      </div>
    </nav>
  );
}

function StatusRow({ label, ok }: { label: string; ok?: boolean }) {
  const cls = ok === undefined ? "unknown" : ok ? "ok" : "err";
  return (
    <div className="status-row">
      <span className={`status-dot ${cls}`} />
      <span>{label}</span>
    </div>
  );
}

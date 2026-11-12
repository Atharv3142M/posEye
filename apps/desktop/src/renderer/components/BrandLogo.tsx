import { useState } from "react";
import logoUrl from "../assets/posEye.png";

interface BrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function BrandLogo({
  size = 28,
  showWordmark = true,
  className = "",
  style = {},
}: BrandLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div
      className={`brand-header ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        userSelect: "none",
        ...style,
      }}
    >
      {!imageFailed ? (
        <img
          src={logoUrl}
          alt="posEye Logo"
          onError={() => setImageFailed(true)}
          style={{
            width: size,
            height: size,
            borderRadius: Math.max(4, Math.round(size * 0.2)),
            objectFit: "contain",
            background: "rgba(255, 255, 255, 0.08)",
            padding: 2,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: Math.max(4, Math.round(size * 0.2)),
            background: "linear-gradient(135deg, #18bc9c 0%, #0e6251 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 800,
            fontSize: Math.round(size * 0.5),
            flexShrink: 0,
            boxShadow: "0 2px 6px rgba(24, 188, 156, 0.35)",
          }}
          title="posEye"
        >
          <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <polygon points="12 3 21 12 12 21 3 12 12 3" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          </svg>
        </div>
      )}
      {showWordmark && (
        <span
          className="sidebar-logo-text"
          style={{
            fontWeight: 700,
            fontSize: Math.max(13, Math.round(size * 0.55)),
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            lineHeight: 1,
          }}
        >
          posEye
        </span>
      )}
    </div>
  );
}

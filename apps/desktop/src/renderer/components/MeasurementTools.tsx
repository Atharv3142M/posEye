import Button from "./Button";

type Tool = "orbit" | "distance" | "screenshot";

export default function MeasurementTools({
  tool,
  onTool,
  onClearMeasure,
  hasActiveMeasure,
  layers,
  onLayer,
  coords,
  info,
  assets,
  modelStatus,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
  onClearMeasure?: () => void;
  hasActiveMeasure?: boolean;
  layers: { mesh: boolean; ortho: boolean; cloud: boolean; dem: boolean };
  onLayer: (key: keyof typeof layers, value: boolean) => void;
  coords: string;
  info: { verts?: string; faces?: string; georef?: string };
  assets?: { glb?: boolean; laz?: boolean; orthophoto?: boolean };
  modelStatus: "idle" | "loading" | "ready" | "error" | "no_model";
}) {
  return (
    <aside className="stack" style={{ width: "100%" }}>
      {/* Tools Section */}
      <div className="sidebar-section" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
        INTERACTIVE TOOLS
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          variant={tool === "distance" ? "primary" : "secondary"}
          onClick={() => onTool(tool === "distance" ? "orbit" : "distance")}
          style={{ flex: 1, minWidth: 100 }}
        >
          {tool === "distance" ? "📏 Measuring" : "📏 Distance"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onTool("screenshot")}
          style={{ flex: 1, minWidth: 100 }}
        >
          📷 Capture
        </Button>
      </div>

      {tool === "distance" && (
        <div style={{
          background: "rgba(24, 188, 156, 0.12)",
          border: "1px solid rgba(24, 188, 156, 0.3)",
          borderRadius: "var(--radius)",
          padding: "8px 10px",
          fontSize: 11,
          color: "var(--text-primary)",
        }}>
          <strong>Point-to-Point Measurement:</strong>
          <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
            Click Point A on the 3D surface, then click Point B to calculate distance.
          </div>
          {hasActiveMeasure && onClearMeasure && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={onClearMeasure}
              >
                Clear Measurements (Esc)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Layers Section */}
      <div className="sidebar-section" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginTop: 12 }}>
        RECONSTRUCTION LAYERS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label className="check" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={layers.mesh}
            onChange={(e) => onLayer("mesh", e.target.checked)}
          />
          <span style={{ fontWeight: 600 }}>3D Mesh (GLB)</span>
          <span className="badge badge-ready" style={{ marginLeft: "auto", fontSize: 9 }}>
            {layers.mesh ? "Visible" : "Hidden"}
          </span>
        </label>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0" }}>
          <span className="muted">Point Cloud (LAZ)</span>
          <span className={`badge ${assets?.laz ? "badge-active" : "badge-queued"}`} style={{ fontSize: 9 }}>
            {assets?.laz ? "Available" : "Not generated"}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0" }}>
          <span className="muted">Orthophoto (GeoTIFF)</span>
          <span className={`badge ${assets?.orthophoto ? "badge-active" : "badge-queued"}`} style={{ fontSize: 9 }}>
            {assets?.orthophoto ? "Available" : "Not generated"}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0" }}>
          <span className="muted">DEM / Elevation</span>
          <span className="badge badge-queued" style={{ fontSize: 9 }}>
            Disabled
          </span>
        </div>
      </div>

      {/* Model Info Section */}
      <div className="sidebar-section" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginTop: 12 }}>
        SURFACE METRICS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
        <div className="stat-row">
          <span className="stat-label">Model status</span>
          <span className="stat-value" style={{ textTransform: "capitalize" }}>
            {modelStatus === "ready" ? (
              <span style={{ color: "#27ae60", fontWeight: 600 }}>Loaded</span>
            ) : modelStatus === "loading" ? (
              <span style={{ color: "#3498db" }}>Loading…</span>
            ) : modelStatus === "error" ? (
              <span style={{ color: "#e74c3c" }}>Load error</span>
            ) : (
              <span className="muted">No model file</span>
            )}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Vertices</span>
          <span className="stat-value" style={{ fontFamily: "var(--font-mono)" }}>
            {info.verts ?? "—"}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Triangles</span>
          <span className="stat-value" style={{ fontFamily: "var(--font-mono)" }}>
            {info.faces ?? "—"}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Georeference</span>
          <span className="stat-value" style={{ fontSize: 11 }}>
            {info.georef ?? "—"}
          </span>
        </div>
      </div>

      {/* Live Cursor Coordinates */}
      <div className="sidebar-section" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginTop: 12 }}>
        SURFACE COORDINATES
      </div>
      <div style={{
        background: "rgba(0, 0, 0, 0.2)",
        padding: "6px 8px",
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text-primary)",
      }}>
        {coords}
      </div>
    </aside>
  );
}

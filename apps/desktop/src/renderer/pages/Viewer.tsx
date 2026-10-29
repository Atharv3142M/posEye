import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiBaseSync } from "../api";
import Button from "../components/Button";
import MeasurementTools from "../components/MeasurementTools";
import ThreeViewer, { type MeasureResult, type ModelStats, type ThreeViewerHandle } from "../components/ThreeViewer";
import { useProject } from "../hooks/useProject";

export default function Viewer() {
  const { id } = useParams();
  const nav = useNavigate();
  const { job, refresh } = useProject(id);
  const [tool, setTool] = useState<"orbit" | "distance" | "screenshot">("orbit");
  const [layers, setLayers] = useState({ mesh: true, ortho: false, cloud: false, dem: false });
  const [coords, setCoords] = useState("—");
  const [measure, setMeasure] = useState<MeasureResult>(null);
  const [stats, setStats] = useState<ModelStats | null>(null);

  // Model loading state machine
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error" | "no_model">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isDraggingRef = useRef(false);

  const viewerRef = useRef<ThreeViewerHandle>(null);

  const modelUrl = useMemo(() => {
    if (!id || !job?.hasModel) return null;
    return `${apiBaseSync()}/jobs/${id}/assets/model.glb`;
  }, [id, job?.hasModel]);

  // Sync initial model status
  useEffect(() => {
    if (job && !job.hasModel) {
      setModelStatus("no_model");
    }
  }, [job]);

  const onCoords = useCallback((t: string) => setCoords(t), []);
  const onMeasure = useCallback((r: MeasureResult) => setMeasure(r), []);

  const resetCamera = () => {
    viewerRef.current?.resetCamera();
  };

  const clearMeasurements = () => {
    viewerRef.current?.clearMeasurements();
    setMeasure(null);
  };

  function screenshot() {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${job?.name || "model"}-view.png`;
    a.click();
  }

  // Sidebar drag resizing handlers
  const onMouseDownResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newWidth = Math.max(220, Math.min(550, moveEvent.clientX));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const georef = job && job.geotagged > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top Toolbar */}
      <div className="toolbar">
        <Button onClick={() => nav("/projects")}>← Projects</Button>
        <div className="toolbar-sep" />
        <Button
          variant="ghost"
          style={{ padding: "4px 8px", fontSize: 12 }}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? "☰ Show Panel" : "◀ Hide Panel"}
        </Button>
        <div className="toolbar-sep" />
        <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>{job?.name || id}</strong>
        <div style={{ flex: 1 }} />

        <Button onClick={resetCamera}>Reset Camera (R)</Button>

        {id && job?.hasModel && (
          <>
            <a className="btn btn-secondary" href={`${apiBaseSync()}/jobs/${id}/assets/model.glb`} download>
              Export GLB
            </a>
            {job.assets?.laz && (
              <a className="btn btn-secondary" href={`${apiBaseSync()}/jobs/${id}/assets/model.laz`} download>
                Export LAZ
              </a>
            )}
            {job.assets?.orthophoto && (
              <a className="btn btn-secondary" href={`${apiBaseSync()}/jobs/${id}/assets/orthophoto.tif`} download>
                Export GeoTIFF
              </a>
            )}
          </>
        )}
        <Button onClick={screenshot}>Screenshot</Button>
      </div>

      {/* Main 3D Viewport Layout */}
      <div className="viewer-layout">
        {/* Left Resizable Sidebar */}
        {!isCollapsed && (
          <>
            <div
              className="viewer-sidebar"
              style={{
                width: sidebarWidth,
                padding: 16,
              }}
            >
              <MeasurementTools
                tool={tool}
                onTool={(t) => {
                  if (t === "screenshot") screenshot();
                  else setTool(t);
                }}
                onClearMeasure={clearMeasurements}
                hasActiveMeasure={Boolean(measure)}
                layers={layers}
                onLayer={(k, v) => setLayers((prev) => ({ ...prev, [k]: v }))}
                coords={coords}
                modelStatus={modelStatus}
                info={{
                  verts: stats ? stats.vertices.toLocaleString() : modelStatus === "loading" ? "Loading…" : "—",
                  faces: stats ? stats.triangles.toLocaleString() : modelStatus === "loading" ? "Loading…" : "—",
                  georef: georef
                    ? `GPS EXIF present · ${job.geotagged} frames`
                    : "Relative / unreferenced model",
                }}
                assets={job?.assets}
              />

              {/* Georeference Notice Card */}
              <div
                style={{
                  marginTop: 16,
                  padding: "10px 12px",
                  background: georef ? "rgba(39, 174, 96, 0.12)" : "rgba(243, 156, 18, 0.12)",
                  border: `1px solid ${georef ? "rgba(39, 174, 96, 0.3)" : "rgba(243, 156, 18, 0.3)"}`,
                  borderRadius: "var(--radius)",
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: "var(--text-primary)",
                }}
              >
                {georef ? (
                  <>
                    <strong style={{ color: "#27ae60" }}>✓ Georeferenced Dataset</strong>
                    <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                      Derived from {job.geotagged} GPS geotagged frames. Distance measurements reflect metric scale (approx. 2–5m GPS variance).
                    </div>
                  </>
                ) : (
                  <>
                    <strong style={{ color: "#e67e22" }}>⚠ Relative Coordinate Space</strong>
                    <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                      No GPS telemetry detected in flight SRT/EXIF. Distance measurements are in dimensionless model units.
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Draggable Divider Handle */}
            <div
              className="viewer-resizer"
              onMouseDown={onMouseDownResizer}
              title="Drag to resize panel"
            />
          </>
        )}

        {/* 3D Canvas Area */}
        <div className="viewer-canvas-wrap">
          <ThreeViewer
            ref={viewerRef}
            modelUrl={modelUrl}
            meshVisible={layers.mesh}
            measuring={tool === "distance"}
            onCoords={onCoords}
            onMeasure={onMeasure}
            onStats={setStats}
            onLoadStart={() => {
              setModelStatus("loading");
              setLoadError(null);
            }}
            onLoadSuccess={() => {
              setModelStatus("ready");
              setLoadError(null);
            }}
            onLoadError={(err) => {
              setModelStatus("error");
              setLoadError(err);
            }}
          />

          {/* Model Loading / Error Overlay */}
          {modelStatus === "loading" && (
            <div style={{
              position: "absolute",
              top: 20,
              left: 20,
              background: "rgba(30, 39, 46, 0.9)",
              border: "1px solid var(--border-light)",
              padding: "8px 16px",
              borderRadius: "var(--radius)",
              color: "#fff",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "var(--shadow-md)",
            }}>
              <span className="status-dot checking" />
              Loading 3D mesh model…
            </div>
          )}

          {modelStatus === "error" && (
            <div style={{
              position: "absolute",
              top: 20,
              left: 20,
              background: "rgba(192, 57, 43, 0.95)",
              border: "1px solid #c0392b",
              padding: "10px 16px",
              borderRadius: "var(--radius)",
              color: "#fff",
              fontSize: 12,
              boxShadow: "var(--shadow-md)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <span>⚠ {loadError || "Could not load 3D model."}</span>
              <Button
                variant="secondary"
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => void refresh()}
              >
                Retry
              </Button>
            </div>
          )}

          {modelStatus === "no_model" && (
            <div style={{
              position: "absolute",
              top: "40%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(30, 39, 46, 0.92)",
              border: "1px solid var(--border-light)",
              padding: "20px 28px",
              borderRadius: "var(--radius)",
              color: "#fff",
              textAlign: "center",
              boxShadow: "var(--shadow-md)",
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📐</div>
              <h3 style={{ margin: "0 0 6px 0" }}>No 3D Model Generated</h3>
              <p style={{ color: "var(--text-muted)", fontSize: 12, maxWidth: 320, margin: "0 0 16px 0" }}>
                This project has not completed photogrammetry reconstruction or the GLB asset was not created.
              </p>
              <Button variant="primary" onClick={() => nav(`/processing/${id}`)}>
                Check Pipeline Progress
              </Button>
            </div>
          )}

          {/* Coordinate HUD */}
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              background: "rgba(0, 0, 0, 0.75)",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              pointerEvents: "none",
            }}
          >
            {coords}
          </div>

          {/* Measurement Distance HUD */}
          {measure && (
            <div
              style={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(24, 188, 156, 0.95)",
                color: "#1e272e",
                padding: "8px 18px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 12,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
              }}
            >
              <span>
                Distance: {measure.distance.toFixed(2)} {georef ? "m (approx.)" : "model units"}
              </span>
              <button
                type="button"
                onClick={clearMeasurements}
                style={{
                  background: "rgba(0, 0, 0, 0.15)",
                  border: "none",
                  borderRadius: 4,
                  padding: "2px 6px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                }}
                title="Clear current measurement"
              >
                ✕ Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

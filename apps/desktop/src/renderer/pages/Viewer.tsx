import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiBaseSync, downloadAsset } from "../api";
import { toast } from "../components/Toast";
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
  const [wireframe, setWireframe] = useState(false);
  const [coords, setCoords] = useState("—");
  const [measure, setMeasure] = useState<MeasureResult>(null);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);

  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error" | "no_model">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isDraggingRef = useRef(false);

  const viewerRef = useRef<ThreeViewerHandle>(null);

  const assetUrl = useCallback(
    (asset: string) => `${apiBaseSync()}/jobs/${id}/assets/${asset}`,
    [id]
  );

  const modelUrl = useMemo(() => {
    if (!id || !job?.hasModel) return null;
    return assetUrl("model.glb");
  }, [id, job?.hasModel, assetUrl]);

  useEffect(() => {
    if (job && !job.hasModel) {
      setModelStatus("no_model");
    }
  }, [job]);

  const onCoords = useCallback((t: string) => setCoords(t), []);
  const onMeasure = useCallback((r: MeasureResult) => setMeasure(r), []);

  const resetCamera = () => viewerRef.current?.resetCamera();
  const clearMeasurements = () => {
    viewerRef.current?.clearMeasurements();
    setMeasure(null);
  };

  function screenshot() {
    // Try ThreeViewer's direct canvas capture first (preserveDrawingBuffer=true)
    const dataUrl = viewerRef.current?.takeScreenshot?.();
    if (dataUrl) {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${job?.name || "model"}-view.png`;
      a.click();
      return;
    }
    // Fallback: grab canvas from DOM
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${job?.name || "model"}-view.png`;
    a.click();
  }

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

  const handleExport = (asset: string, defaultFilename: string) => {
    if (!id) return;
    void downloadAsset(id, asset, defaultFilename).then((ok) => {
      toast(ok ? `Saved ${defaultFilename}` : "Export canceled", ok ? "ok" : "err");
    }).catch((err) => toast(err instanceof Error ? err.message : "Export failed", "err"));
  };

  const isGeoreferenced = Boolean(job?.isGeoreferenced);
  const hasGpsTelemetry = Boolean(job && job.geotagged > 0);

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

        {/* Viewer tool controls */}
        <Button
          variant={wireframe ? "primary" : "ghost"}
          style={{ padding: "4px 8px", fontSize: 12 }}
          onClick={() => setWireframe(!wireframe)}
          title="Toggle wireframe (W)"
        >
          ⬡ Wire
        </Button>
        <div className="toolbar-sep" />

        <Button onClick={resetCamera} title="Reset camera (R)">Reset View (R)</Button>

        {id && job?.hasModel && (
          <>
            <Button variant="secondary" onClick={() => handleExport("model.glb", `${job?.name || "model"}.glb`)}>
              ↓ GLB
            </Button>
            {job.assets?.laz && (
              <Button variant="secondary" onClick={() => handleExport("model.laz", `${job?.name || "model"}.laz`)}>
                ↓ LAZ
              </Button>
            )}
            {job.assets?.orthophoto && (
              <Button variant="secondary" onClick={() => handleExport("orthophoto.tif", `${job?.name || "model"}_orthophoto.tif`)}>
                ↓ GeoTIFF
              </Button>
            )}
            {job.assets?.dsm && (
              <Button variant="secondary" onClick={() => handleExport("dsm.tif", `${job?.name || "model"}_dsm.tif`)}>
                ↓ DSM
              </Button>
            )}
            {job.assets?.dtm && (
              <Button variant="secondary" onClick={() => handleExport("dtm.tif", `${job?.name || "model"}_dtm.tif`)}>
                ↓ DTM
              </Button>
            )}
            {job.assets?.report && (
              <Button variant="secondary" onClick={() => handleExport("report.pdf", `${job?.name || "model"}_report.pdf`)}>
                ↓ Report
              </Button>
            )}
          </>
        )}
        <Button onClick={screenshot} title="Save screenshot">📷 Screenshot</Button>
      </div>

      {/* Main 3D Viewport Layout */}
      <div className="viewer-layout">
        {/* Left Resizable Sidebar */}
        {!isCollapsed && (
          <>
            <div
              className="viewer-sidebar"
              style={{ width: sidebarWidth, padding: 16 }}
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
                  georef: isGeoreferenced
                    ? `Metric (Consumer GNSS) · ${job?.geotagged ?? 0} geotags`
                    : hasGpsTelemetry
                    ? `Relative · ${job?.geotagged ?? 0} GPS frames`
                    : "Dimensionless / Relative",
                }}
                assets={job?.assets}
              />

              {/* Bounding box dimensions */}
              {stats?.bbox && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    background: "var(--bg-panel-header)",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius)",
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Bounding Box
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)" }}>W:</span>
                    <span>{stats.bbox.size.x.toFixed(2)} {isGeoreferenced ? "m" : "u"}</span>
                    <span style={{ color: "var(--text-muted)" }}>D:</span>
                    <span>{stats.bbox.size.z.toFixed(2)} {isGeoreferenced ? "m" : "u"}</span>
                    <span style={{ color: "var(--text-muted)" }}>H:</span>
                    <span>{stats.bbox.size.y.toFixed(2)} {isGeoreferenced ? "m" : "u"}</span>
                  </div>
                </div>
              )}

              {/* Keyboard shortcuts hint */}
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  background: "var(--bg-panel-header)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Shortcuts</div>
                <div><kbd style={{ background: "var(--bg-tertiary)", padding: "0 3px", borderRadius: 2, fontSize: 10 }}>R</kbd> Reset camera</div>
                <div><kbd style={{ background: "var(--bg-tertiary)", padding: "0 3px", borderRadius: 2, fontSize: 10 }}>Esc</kbd> Clear measurement</div>
                <div><kbd style={{ background: "var(--bg-tertiary)", padding: "0 3px", borderRadius: 2, fontSize: 10 }}>Scroll</kbd> Zoom</div>
                <div><kbd style={{ background: "var(--bg-tertiary)", padding: "0 3px", borderRadius: 2, fontSize: 10 }}>Right-drag</kbd> Pan</div>
              </div>

              {/* Georeference Notice Card */}
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  background: "var(--bg-panel-header)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius)",
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: "var(--text-primary)",
                }}
              >
                {isGeoreferenced ? (
                  <>
                    <strong style={{ color: "var(--text-primary)" }}>[METRIC SCALE] Consumer GNSS</strong>
                    <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                      Reconstructed with {job?.geotagged} geotagged frames. Subject to standalone drone GNSS variance (±2–5m horizontal).
                    </div>
                  </>
                ) : hasGpsTelemetry ? (
                  <>
                    <strong style={{ color: "var(--text-primary)" }}>[RELATIVE GEOMETRY] Uncalibrated Scale</strong>
                    <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                      {job?.geotagged} frames carry GPS EXIF, but bundle adjustment produced a relative coordinate model.
                    </div>
                  </>
                ) : (
                  <>
                    <strong style={{ color: "var(--text-primary)" }}>[ARBITRARY UNITS] Dimensionless Mesh</strong>
                    <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                      No GPS telemetry detected. Measurements are in arbitrary dimensionless units.
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
            wireframe={wireframe}
            showCloud={layers.cloud}
            cloudUrl={layers.cloud && job?.assets?.laz ? assetUrl("cloud.json") : null}
            showOrtho={layers.ortho}
            orthoUrl={layers.ortho && job?.assets?.orthophoto ? assetUrl("orthophoto.jpg") : null}
            modelReady={modelStatus === "ready"}
            onCoords={onCoords}
            onMeasure={onMeasure}
            onStats={setStats}
            onLoadStart={() => {
              setModelStatus("loading");
              setLoadError(null);
              setLoadProgress(0);
            }}
            onLoadProgress={(pct) => setLoadProgress(pct)}
            onLoadSuccess={() => {
              setModelStatus("ready");
              setLoadError(null);
              setLoadProgress(null);
            }}
            onLoadError={(err) => {
              setModelStatus("error");
              setLoadError(err);
              setLoadProgress(null);
            }}
          />

          {/* Model Loading Overlay */}
          {modelStatus === "loading" && (
            <div style={{
              position: "absolute",
              top: 20,
              left: 20,
              background: "rgba(30, 39, 46, 0.92)",
              border: "1px solid var(--border-light)",
              padding: "10px 16px",
              borderRadius: "var(--radius)",
              color: "#fff",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "var(--shadow-md)",
              minWidth: 200,
            }}>
              <span className="status-dot checking" style={{ animation: "pulse 1s infinite" }} />
              <div style={{ flex: 1 }}>
                <div>Loading 3D mesh…</div>
                {loadProgress !== null && loadProgress > 0 && (
                  <div style={{ marginTop: 6, height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${loadProgress}%`, background: "#18bc9c", borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                )}
              </div>
              {loadProgress !== null && loadProgress > 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{loadProgress}%</span>
              )}
            </div>
          )}

          {/* Error Overlay */}
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

          {/* Measurement HUD */}
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
                Total: {measure.distance.toFixed(2)} {isGeoreferenced ? "m (approx.)" : "model units"}
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
                title="Clear measurements (Esc)"
              >
                ✕ Clear
              </button>
            </div>
          )}

          {/* Wireframe badge */}
          {wireframe && (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                right: 10,
                background: "rgba(240, 246, 252, 0.15)",
                border: "1px solid rgba(240, 246, 252, 0.3)",
                color: "#fff",
                padding: "3px 8px",
                borderRadius: 3,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                pointerEvents: "none",
              }}
            >
              WIREFRAME
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

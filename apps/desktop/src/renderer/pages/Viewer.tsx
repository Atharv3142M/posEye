import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiBaseSync } from "../api";
import Button from "../components/Button";
import MeasurementTools from "../components/MeasurementTools";
import ThreeViewer, { type MeasureResult } from "../components/ThreeViewer";
import { useProject } from "../hooks/useProject";

export default function Viewer() {
  const { id } = useParams();
  const nav = useNavigate();
  const { job } = useProject(id);
  const [tool, setTool] = useState<"orbit" | "distance" | "screenshot">("orbit");
  const [layers, setLayers] = useState({ mesh: true, ortho: false, cloud: false, dem: false });
  const [coords, setCoords] = useState("—");
  const [measure, setMeasure] = useState<MeasureResult>(null);
  const [stats, setStats] = useState<{ vertices: number; triangles: number } | null>(null);

  const modelUrl = useMemo(() => {
    if (!id || !job?.hasModel) return null;
    return `${apiBaseSync()}/jobs/${id}/assets/model.glb`;
  }, [id, job?.hasModel]);

  const onCoords = useCallback((t: string) => setCoords(t), []);
  const onMeasure = useCallback((r: MeasureResult) => setMeasure(r), []);

  function resetCamera() {
    const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __frame?: () => void }) | null;
    canvas?.__frame?.();
  }

  function screenshot() {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${job?.name || "model"}-view.png`;
    a.click();
  }

  const georef = job && job.geotagged > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Toolbar */}
      <div className="toolbar">
        <Button onClick={() => nav("/projects")}>← Projects</Button>
        <div className="toolbar-sep" />
        <strong style={{ fontSize: 13 }}>{job?.name || id}</strong>
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

      {/* Main viewer area */}
      <div
        className="viewer-layout"
        style={{ display: "grid", gridTemplateColumns: "260px 1fr", flex: 1, overflow: "hidden" }}
      >
        {/* Left panel */}
        <div style={{
          padding: 16,
          borderRight: "1px solid var(--border-light)",
          overflow: "auto",
          background: "var(--bg-panel)",
        }}>
          <MeasurementTools
            tool={tool}
            onTool={(t) => {
              if (t === "screenshot") screenshot();
              else setTool(t);
            }}
            layers={layers}
            onLayer={(k, v) => setLayers((prev) => ({ ...prev, [k]: v }))}
            coords={coords}
            info={{
              verts: stats ? stats.vertices.toLocaleString() : "Loading…",
              faces: stats ? stats.triangles.toLocaleString() : "Loading…",
              georef: georef
                ? `GPS EXIF present · ${job.geotagged} frames`
                : "Relative / unreferenced model",
            }}
            assets={job?.assets}
          />

          {/* Georef notice */}
          <div style={{
            marginTop: 12,
            padding: "8px 10px",
            background: georef ? "#e8f5f1" : "#fff8e1",
            border: `1px solid ${georef ? "#a3d9c8" : "#ffe0b2"}`,
            borderRadius: "var(--radius)",
            fontSize: 11,
            color: georef ? "var(--color-primary)" : "#e65100",
          }}>
            {georef
              ? `✓ Georeferenced — ${job.geotagged} GPS frames. Distances approximate (2–5 m typical error).`
              : "⚠ No GPS EXIF. Distances are in model units, not meters."}
          </div>
        </div>

        {/* 3D canvas */}
        <div style={{ position: "relative", background: "#1e272e", overflow: "hidden" }}>
          <ThreeViewer
            modelUrl={modelUrl}
            meshVisible={layers.mesh}
            measuring={tool === "distance"}
            onCoords={onCoords}
            onMeasure={onMeasure}
            onStats={setStats}
          />

          {/* Coord HUD */}
          <div style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            background: "rgba(0,0,0,0.65)",
            color: "#fff",
            padding: "4px 10px",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            pointerEvents: "none",
          }}>
            {coords}
          </div>

          {/* Measure result HUD */}
          {measure && (
            <div style={{
              position: "absolute",
              top: 8,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(24, 188, 156, 0.95)",
              color: "#1e272e",
              padding: "6px 16px",
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 700,
              pointerEvents: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}>
              Distance: {measure.distance.toFixed(2)} {georef ? "m (approx.)" : "model units"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

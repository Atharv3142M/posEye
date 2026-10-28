import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBaseSync, fetchJson } from "../api";
import Button from "../components/Button";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { useProjects } from "../hooks/useProject";

export default function ProjectsList() {
  const nav = useNavigate();
  const { jobs, refresh } = useProjects();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(20);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (filter === "ready" && j.stage !== "ready") return false;
      if (filter === "error" && j.stage !== "error") return false;
      if (q && !(`${j.name} ${j.id}`).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [jobs, q, filter]);

  async function remove(id: string) {
    if (!confirm("Delete this project and all its data?")) return;
    await fetchJson(`/jobs/${id}`, { method: "DELETE" });
    await refresh();
  }

  function download(id: string, asset: string) {
    window.open(`${apiBaseSync()}/jobs/${id}/assets/${asset}`, "_blank");
  }

  return (
    <main className="page">
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ marginBottom: 0 }}>Projects</h1>
          <Button variant="primary" onClick={() => nav("/projects/new")}>＋ New project</Button>
        </div>

        <div className="row" style={{ marginBottom: 16 }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or ID…"
            style={{ minWidth: 240 }}
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="ready">Completed</option>
            <option value="error">Failed</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <p className="muted" style={{ textAlign: "center", padding: "24px 0" }}>
              {jobs.length === 0
                ? "No projects yet. Create a new project to get started."
                : "No projects match the current filter."}
            </p>
          </Card>
        ) : (
          <Card>
            <table className="table-view">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Preset</th>
                  <th>Frames</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map((j) => (
                  <tr key={j.id}>
                    <td>
                      <strong
                        style={{ cursor: "pointer", color: "var(--color-primary)" }}
                        onClick={() => nav(j.stage === "ready" ? `/viewer/${j.id}` : `/processing/${j.id}`)}
                      >
                        {j.name || j.id.slice(0, 8)}
                      </strong>
                      <div className="muted" style={{ fontSize: 11 }}>{j.id}</div>
                    </td>
                    <td><StatusBadge stage={j.stage} /></td>
                    <td className="muted">{j.preset}</td>
                    <td className="muted">{j.frameCount || "—"}</td>
                    <td className="muted">{fmtDate(j.createdAt)}</td>
                    <td className="col-actions">
                      <div className="row" style={{ gap: 6 }}>
                        <Button
                          variant="primary"
                          onClick={() => nav(j.stage === "ready" ? `/viewer/${j.id}` : `/processing/${j.id}`)}
                        >
                          {j.stage === "ready" ? "View 3D" : "Monitor"}
                        </Button>
                        {j.hasModel && (
                          <Button onClick={() => download(j.id, "model.glb")}>GLB</Button>
                        )}
                        {j.assets?.laz && (
                          <Button onClick={() => download(j.id, "model.laz")}>LAZ</Button>
                        )}
                        {j.assets?.orthophoto && (
                          <Button onClick={() => download(j.id, "orthophoto.tif")}>GeoTIFF</Button>
                        )}
                        <Button variant="danger" onClick={() => void remove(j.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown < filtered.length && (
              <div className="actions">
                <Button onClick={() => setShown((n) => n + 20)}>Load more</Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

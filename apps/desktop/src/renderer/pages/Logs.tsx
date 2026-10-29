import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchJson, formatLocalTime } from "../api";
import Button from "../components/Button";
import Card from "../components/Card";

type LogEntry = { ts: string; level: string; message: string };
type EventEntry = { ts: string; stage: string; percent: number; message: string };

export default function Logs() {
  const { id } = useParams<{ id?: string }>();
  const [appLogs, setAppLogs] = useState<LogEntry[]>([]);
  const [jobEvents, setJobEvents] = useState<EventEntry[]>([]);
  const [tab, setTab] = useState<"app" | "job">(id ? "job" : "app");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobBoxRef = useRef<HTMLDivElement>(null);
  const appBoxRef = useRef<HTMLDivElement>(null);

  async function loadAppLogs() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<LogEntry[]>("/logs/app");
      setAppLogs(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadJobLogs(jobId: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ id: string; events: EventEntry[] }>(`/jobs/${jobId}/logs`);
      setJobEvents(data.events ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "app") {
      void loadAppLogs();
    } else if (id) {
      void loadJobLogs(id);
    }
  }, [tab, id]);

  // Auto-scroll log boxes to bottom
  useEffect(() => {
    jobBoxRef.current?.scrollTo(0, jobBoxRef.current.scrollHeight);
  }, [jobEvents]);
  useEffect(() => {
    appBoxRef.current?.scrollTo(0, appBoxRef.current.scrollHeight);
  }, [appLogs]);

  function levelColor(level: string): string {
    switch (level?.toUpperCase()) {
      case "ERROR": return "var(--text-danger)";
      case "WARNING": return "var(--text-warning)";
      case "INFO": return "var(--color-accent)";
      default: return "inherit";
    }
  }

  return (
    <main className="page">
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ marginBottom: 0 }}>Logs</h1>
          <Button onClick={() => tab === "app" ? void loadAppLogs() : id && void loadJobLogs(id)}>
            ↻ Refresh
          </Button>
        </div>

        {/* Tab bar */}
        <div className="row" style={{ marginBottom: 12, gap: 4 }}>
          {id && (
            <button
              className={`btn ${tab === "job" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTab("job")}
            >
              Job events {id.slice(0, 8)}
            </button>
          )}
          <button
            className={`btn ${tab === "app" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTab("app")}
          >
            Orchestrator log
          </button>
        </div>

        {loading && <p className="muted">Loading…</p>}
        {error && <p style={{ color: "var(--text-danger)" }}>{error}</p>}

        {tab === "job" && id && (
          <Card>
            <h2>Job pipeline events — {id}</h2>
            <div className="log-panel" ref={jobBoxRef} style={{ height: 480 }}>
              {jobEvents.length === 0 && !loading && (
                <span style={{ color: "var(--text-muted)" }}>No events recorded.</span>
              )}
              {jobEvents.map((e, i) => (
                <div key={i}>
                  <span className="log-ts">{formatLocalTime(e.ts)}</span>
                  <span className="log-stage">{e.stage}</span>
                  <span style={{ color: "var(--text-muted)", marginRight: 6 }}>{Math.round(e.percent)}%</span>
                  <span>{e.message}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "app" && (
          <Card>
            <h2>Orchestrator log</h2>
            <div className="log-panel" ref={appBoxRef} style={{ height: 480 }}>
              {appLogs.length === 0 && !loading && (
                <span style={{ color: "var(--text-muted)" }}>No log entries yet. Start the backend to see output.</span>
              )}
              {appLogs.map((e, i) => (
                <div key={i}>
                  <span className="log-ts">{formatLocalTime(e.ts)}</span>
                  <span style={{ color: levelColor(e.level), marginRight: 6, fontWeight: 600, fontSize: 10 }}>
                    {e.level}
                  </span>
                  <span>{e.message}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Logs are in-memory only and reset when the orchestrator restarts.
          For persistent log files, check the job work directory.
        </p>
      </div>
    </main>
  );
}


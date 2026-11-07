import { useEffect, useRef, useState } from "react";
import { apiBase, apiTokenSync } from "../api";

export type WsEvent = { stage: string; percent: number; message: string; ts: string };

export function useJobEvents(jobId: string | undefined) {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [latest, setLatest] = useState<WsEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let closed = false;
    void (async () => {
      const base = (await apiBase()).replace(/^http/, "ws");
      const token = apiTokenSync();
      if (closed) return;
      const wsUrl = `${base}/jobs/${jobId}/events`;
      // Documented standard WebSocket authentication via subprotocol
      const subprotocols = token ? [`poseye-auth.${token}`] : undefined;
      const ws = new WebSocket(wsUrl, subprotocols);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const data = JSON.parse(ev.data) as WsEvent;
        setLatest(data);
        setEvents((prev) => [...prev.slice(-80), data]);
      };
    })();
    return () => {
      closed = true;
      wsRef.current?.close();
    };
  }, [jobId]);

  return { events, latest };
}

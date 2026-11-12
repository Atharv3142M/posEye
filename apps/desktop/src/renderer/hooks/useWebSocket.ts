import { useEffect, useRef, useState } from "react";
import { apiBase, apiTokenSync } from "../api";

export type WsEvent = { stage: string; percent: number; message: string; ts: string };

const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export function useJobEvents(jobId: string | undefined) {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [latest, setLatest] = useState<WsEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setEvents([]);
    setLatest(null);
    if (!jobId) return;

    let closed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      const base = (await apiBase()).replace(/^http/, "ws");
      const token = apiTokenSync();
      if (closed) return;

      const wsUrl = `${base}/jobs/${jobId}/events`;
      // Documented standard WebSocket authentication via subprotocol
      const subprotocols = token ? [`poseye-auth.${token}`] : undefined;
      const ws = new WebSocket(wsUrl, subprotocols);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as WsEvent;
          setLatest(data);
          setEvents((prev) => [...prev.slice(-80), data]);
        } catch {
          // Ignore malformed frames
        }
      };

      ws.onclose = (ev) => {
        if (wsRef.current === ws) wsRef.current = null;
        if (closed || ev.wasClean || ev.code === 1000 || attempt >= MAX_RECONNECT_ATTEMPTS) {
          return;
        }
        const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * Math.pow(2, attempt));
        attempt += 1;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!closed) void connect();
        }, delay);
      };
    };

    void connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [jobId]);

  return { events, latest };
}

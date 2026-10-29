import { useEffect, useState } from "react";

export type Job = {
  id: string;
  name: string;
  description: string;
  stage: string;
  percent: number;
  message: string;
  error: string | null;
  errorCode?: string | null;
  geotagged: number;
  frameCount: number;
  preset: string;
  hasModel: boolean;
  createdAt: string;
  updatedAt?: string;
  videoPath: string;
  extract?: {
    rawFrames?: number;
    retainedFrames?: number;
    droppedBlur?: number;
    droppedDuplicates?: number;
    geotaggedFrames?: number;
    masksGenerated?: number;
    duration?: number | null;
    fps?: number | null;
    resolution?: string | null;
  };
  assets?: { glb?: boolean; laz?: boolean; orthophoto?: boolean };
};

export type ServiceState = {
  ok: boolean;
  status: string; // "running" | "stopped" | "connected" | "unreachable" | "unavailable" | "detected" | "missing" | "not_installed" | "error"
  message?: string;
  recovery?: string;
  version?: string;
  url?: string;
  path?: string | null;
  info?: Record<string, any>;
};

export type SystemStatus = {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramPercent: number;
  diskUsedGb: number;
  diskFreeGb?: number;
  diskTotalGb: number;
  docker: ServiceState;
  nodeodm: ServiceState;
  ffmpeg?: ServiceState & { detected?: boolean };
  gpuAvailable?: boolean;
  gpuName?: string | null;
  nvidiaSmiAvailable?: boolean;
  cudaAvailable?: boolean;
  nodeodmAcceleration?: string;
  gpuUtilization?: number | null;
  gpuMemoryUsed?: number | null;
  gpuMemoryTotal?: number | null;
  gpuTemperature?: number | null;
};

export type HealthStatus = {
  ok: boolean;
  message: string;
  docker?: ServiceState;
  nodeodm?: ServiceState;
  ffmpeg?: ServiceState & { detected?: boolean };
  gpu?: {
    available?: boolean;
    name?: string | null;
    nvidiaSmi?: boolean;
    cuda?: boolean;
    acceleration?: string;
    message?: string;
  };
};

/** Formats an ISO 8601 UTC timestamp string into local HH:MM:SS in user's timezone */
export function formatLocalTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "--:--:--";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) {
      return isoStr.length >= 19 ? isoStr.slice(11, 19) : isoStr;
    }
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return String(isoStr);
  }
}

/** Formats an ISO 8601 UTC timestamp string into local Date + HH:MM:SS */
export function formatLocalDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}`;
  } catch {
    return String(isoStr);
  }
}

declare global {
  interface Window {
    dt?: {
      // File dialogs
      pickVideo:    () => Promise<string | null>;
      pickSrt:      () => Promise<string | null>;
      pickGlb:      () => Promise<string | null>;
      saveFile:     (defaultName: string, ext: string) => Promise<string | null>;
      // Environment
      env:          () => Promise<{ apiBase: string; packaged: boolean }>;
      // File utilities
      readFile:     (filePath: string) => Promise<string | null>;
      pathForFile:  (file: File) => string;
      // Shell
      openExternal: (url: string) => Promise<void>;
      // Backend control
      getLogs:      () => Promise<Array<{ ts: string; level: string; message: string }>>;
      getStatus:    () => Promise<{ phase: string; message: string }>;
      restartApi:   () => Promise<{ ok: boolean }>;
      // Events (returns unsubscribe fn)
      onAppLog:     (callback: (entry: { ts: string; level: string; message: string }) => void) => () => void;
    };
  }
}

/** Custom API error with HTTP status code */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

let cachedBase = "http://127.0.0.1:8765";

export async function apiBase(): Promise<string> {
  if (window.dt?.env) {
    const env = await window.dt.env();
    cachedBase = env.apiBase;
  }
  return cachedBase;
}

export function apiBaseSync(): string {
  return cachedBase;
}

/** Wraps a fetch promise with a 30-second timeout */
function withTimeout<T>(promise: Promise<T>, ms = 30_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ApiError(0, "Request timed out — is the backend running?"));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await apiBase();
  let res: Response;
  try {
    res = await withTimeout(fetch(`${base}${path}`, init));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, "Backend not available. Check that the orchestrator is running.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Poll /health every `intervalMs` ms and return connectivity status */
export function useHealth(intervalMs = 10_000): HealthStatus {
  const [status, setStatus] = useState<HealthStatus>({ ok: false, message: "Connecting…" });

  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const data = await fetchJson<{
          ok: boolean;
          docker?: ServiceState;
          nodeodm?: ServiceState;
          ffmpeg?: ServiceState & { detected?: boolean };
          gpu?: any;
        }>("/health");
        if (!mounted) return;
        setStatus({
          ok: data.ok ?? true,
          message: data.ok ? "Backend connected" : "Backend degraded",
          docker: data.docker,
          nodeodm: data.nodeodm,
          ffmpeg: data.ffmpeg,
          gpu: data.gpu,
        });
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof ApiError ? err.message : "Backend not available.";
        setStatus({
          ok: false,
          message: msg,
          docker: { ok: false, status: "unavailable", message: "Backend offline" },
          nodeodm: { ok: false, status: "unavailable", message: "Backend offline" },
          ffmpeg: { ok: false, status: "unavailable", message: "Backend offline" },
        });
      }
    }
    void check();
    const id = setInterval(() => void check(), intervalMs);
    return () => { mounted = false; clearInterval(id); };
  }, [intervalMs]);

  return status;
}

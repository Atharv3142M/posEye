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

export type SystemStatus = {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramPercent: number;
  diskUsedGb: number;
  diskFreeGb?: number;
  diskTotalGb: number;
  docker: { ok: boolean; version: string };
  nodeodm: { ok: boolean; url: string };
  ffmpeg?: { detected: boolean; path: string | null; version: string | null };
  gpuAvailable?: boolean;
  gpuName?: string;
  gpuUtilization?: number;
  gpuMemoryUsed?: number;
  gpuMemoryTotal?: number;
};

export type HealthStatus = {
  ok: boolean;
  message: string;
  docker?: boolean;
  nodeodm?: boolean;
  ffmpeg?: boolean;
};

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
export function useHealth(intervalMs = 15_000): HealthStatus {
  const [status, setStatus] = useState<HealthStatus>({ ok: false, message: "Connecting…" });

  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const data = await fetchJson<{ status: string; docker?: { ok: boolean }; nodeodm?: { ok: boolean }; ffmpeg?: { detected: boolean } }>("/health");
        if (!mounted) return;
        setStatus({
          ok: true,
          message: "Backend connected",
          docker: data.docker?.ok ?? false,
          nodeodm: data.nodeodm?.ok ?? false,
          ffmpeg: data.ffmpeg?.detected ?? false,
        });
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof ApiError ? err.message : "Backend not available.";
        setStatus({ ok: false, message: msg, docker: false, nodeodm: false, ffmpeg: false });
      }
    }
    void check();
    const id = setInterval(() => void check(), intervalMs);
    return () => { mounted = false; clearInterval(id); };
  }, [intervalMs]);

  return status;
}

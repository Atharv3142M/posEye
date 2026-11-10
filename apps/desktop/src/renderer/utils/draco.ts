/**
 * posEye Offline Draco Decoder Resolver & Diagnostics
 * Resolves local bundled Draco assets deterministically across:
 * - Packaged Electron application (poseye://app/draco/)
 * - Vite Development server (http://127.0.0.1:5173/draco/)
 * - File protocol and nested application routes
 */

export interface DracoDiagnostics {
  ok: boolean;
  decoderUrl: string;
  hasWebAssembly: boolean;
  jsAvailable: boolean;
  wasmAvailable: boolean;
  jsBytes: number;
  wasmBytes: number;
  error?: string;
  durationMs?: number;
}

/**
 * Returns a fully qualified, deterministic decoder URL with trailing slash.
 * Avoids relative path ambiguities under nested routes and prevents accidental requests to backend API.
 */
export function resolveDracoDecoderPath(): string {
  if (typeof window === "undefined" || !window.location) {
    return "draco/";
  }

  const { protocol, host, pathname } = window.location;

  // 1. Packaged Electron custom scheme
  if (protocol === "poseye:") {
    return "poseye://app/draco/";
  }

  // 2. Direct file URL execution (e.g. tests or standalone builds)
  if (protocol === "file:") {
    const dir = pathname.substring(0, pathname.lastIndexOf("/") + 1);
    return `${protocol}//${dir}draco/`;
  }

  // 3. Vite development server (http://127.0.0.1:5173 or http://localhost:5173)
  if (protocol.startsWith("http")) {
    return `${protocol}//${host}/draco/`;
  }

  // Fallback to relative
  return "draco/";
}

/**
 * Verifies that the local Draco decoder assets are accessible and valid.
 * Surfaces actionable diagnostic errors before GLTFLoader attempts decoding.
 */
export async function verifyDracoDecoder(decoderPath?: string): Promise<DracoDiagnostics> {
  const path = decoderPath || resolveDracoDecoderPath();
  const startTime = performance.now();
  const hasWasm = typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";

  const diag: DracoDiagnostics = {
    ok: false,
    decoderUrl: path,
    hasWebAssembly: hasWasm,
    jsAvailable: false,
    wasmAvailable: false,
    jsBytes: 0,
    wasmBytes: 0,
  };

  if (!hasWasm) {
    diag.error = "WebAssembly is not supported in this runtime environment.";
    diag.durationMs = Math.round(performance.now() - startTime);
    console.error("[posEye:Draco] Verification failed:", diag.error);
    return diag;
  }

  try {
    // 1. Probe JS wrapper
    const jsUrl = `${path}draco_wasm_wrapper.js`;
    const jsRes = await fetch(jsUrl);
    if (!jsRes.ok) {
      throw new Error(`Draco JS wrapper unreachable at ${jsUrl} (HTTP ${jsRes.status} ${jsRes.statusText})`);
    }
    const jsText = await jsRes.text();
    diag.jsBytes = jsText.length;
    diag.jsAvailable = jsText.length > 1000 && !jsText.trim().startsWith("<!DOCTYPE");

    if (!diag.jsAvailable) {
      throw new Error(`Draco JS wrapper returned invalid content (received ${diag.jsBytes} bytes, possibly HTML fallback).`);
    }

    // 2. Probe WASM binary
    const wasmUrl = `${path}draco_decoder.wasm`;
    const wasmRes = await fetch(wasmUrl);
    if (!wasmRes.ok) {
      throw new Error(`Draco WASM binary unreachable at ${wasmUrl} (HTTP ${wasmRes.status} ${wasmRes.statusText})`);
    }
    const wasmBuf = await wasmRes.arrayBuffer();
    diag.wasmBytes = wasmBuf.byteLength;

    // Validate WASM magic bytes: \0asm (0x00, 0x61, 0x73, 0x6D)
    if (diag.wasmBytes >= 4) {
      const bytes = new Uint8Array(wasmBuf.slice(0, 4));
      const isWasmMagic = bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
      diag.wasmAvailable = isWasmMagic;
      if (!isWasmMagic) {
        throw new Error("Draco WASM binary invalid header (magic bytes mismatch).");
      }
    } else {
      throw new Error(`Draco WASM binary too small (${diag.wasmBytes} bytes).`);
    }

    diag.ok = true;
    diag.durationMs = Math.round(performance.now() - startTime);
    console.log(
      `[posEye:Draco] Decoder verified in ${diag.durationMs}ms: ${path} (JS: ${Math.round(diag.jsBytes / 1024)}KB, WASM: ${Math.round(diag.wasmBytes / 1024)}KB)`
    );
  } catch (err: any) {
    diag.ok = false;
    diag.error = err?.message || String(err);
    diag.durationMs = Math.round(performance.now() - startTime);
    console.warn(`[posEye:Draco] Decoder verification warning: ${diag.error}`);
  }

  return diag;
}

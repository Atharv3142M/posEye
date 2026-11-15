# posEye v0.1.8 Release Notes — Offline Draco Decoder, SPA Guard & UI Performance

**posEye v0.1.8** is a major stabilization release focusing on offline 3D viewer recovery, nested-route asset resolution, custom protocol SPA route protection, timeout resilience, WebGL shader compilation performance, and crash dump telemetry sanitization.

> **RELEASE NOTICE:** This release candidate provides full offline mesh decompression for Draco-compressed aerial photogrammetry models and eliminates client thread lockup during WebGL scene mounting.

---

## Key Fixes & Enhancements in v0.1.8

### 1. Offline Draco Decoder Path Resolution (`resolveDracoDecoderPath`)
- **Dynamic Route-Aware Path Computation:** Replaced fragile hardcoded `'draco/'` loader paths with `resolveDracoDecoderPath()`. Under nested Electron routes (e.g. `/viewer/:jobId`), relative asset queries previously resolved to invalid nested paths (e.g. `poseye://app/viewer/draco/draco_decoder.wasm`), preventing the WebAssembly binary from loading.
- **Canonical Asset Anchoring:** Decoders now resolve directly to the canonical application root `poseye://app/dist/draco/`, ensuring that both `draco_decoder.wasm` and `draco_decoder.js` load reliably regardless of UI routing depth.

### 2. Static-Asset SPA Guard for Custom Protocol (`poseye://app`)
- **Prevention of Silent HTML-as-WASM Parsing:** Under standard Single Page Application (SPA) routing, requests for non-existent routes fall back to serving `index.html`. In earlier builds, missing or misrouted WebAssembly assets returned HTML with status 200, causing `WebAssembly.instantiate` to throw unrecoverable syntax errors (`magic header not found`).
- **Strict 404 Guard for Static Extensions:** The custom protocol interceptor now strictly intercepts requests ending in `.wasm`, `.js`, `.css`, `.png`, `.jpg`, and `.glb`. If an asset does not exist on disk, it immediately returns HTTP 404 rather than falling back to `index.html`, allowing loaders to execute proper fallback routines.

### 3. Automated Draco Nested-Route Remapping
- **Path Rewriting in Custom Scheme Handler:** Injected canonical path normalization into `resolveAppAssetPath()` (step 6b). Any sub-path containing `draco/` is automatically normalized and remapped to the canonical `dist/draco/` directory in the application package, guaranteeing resolution across all operating environments.

### 4. 45-Second Viewer Timeout Guard
- **Watchdog Timer on Mesh Parsing:** Introduced an explicit 45-second timeout watchdog in `ThreeViewer.tsx`. If asset retrieval, Draco decompression, or GPU buffer allocation stalls, the viewer terminates the loading state machine.
- **Actionable Diagnostic Retry Card:** Instead of hanging indefinitely on an unresponsive loading spinner, the UI presents an actionable error diagnostic card detailing the failure reason and providing a one-click Retry button.

### 5. Deferred Shader Compilation via `requestAnimationFrame`
- **Main Thread Yielding:** Synchronous calls to `renderer.compile(scene, camera)` on large photogrammetric meshes (>300,000 triangles) previously caused perceptible UI stutter and frozen cursor states.
- **Microtask Deferral:** Deferred shader compilation to `requestAnimationFrame()`, allowing the browser thread to update the layout and render intermediate progress frames prior to compiling GPU programs.

### 6. Explicit `framing` Phase in Loading Lifecycle
- **Refined State Machine Lifecycle:** Expanded the viewer loading state machine: `initializing` -> `fetching` -> `parsing` -> `uploading` -> `framing` -> `rendering` -> `loaded` (or `failed`).
- **Smooth Viewport Fit:** During the `framing` phase, the viewport camera automatically computes the bounding sphere and aligns near/far clipping planes without visual jumps.

### 7. Sanitized Crash Dump Telemetry
- **Local Crash Logging (`writeCrashDump`):** Implemented automated crash dump logging to `%APPDATA%/posEye/logs/crash-<timestamp>.log` upon unhandled renderer exceptions or WebGL context failures.
- **Bearer Token & Credential Sanitization:** All logged URLs, headers, and request arguments are scrubbed for sensitive tokens (`DT_API_TOKEN`, `Authorization: Bearer`), replacing credentials with `[REDACTED]`.

---

## Automated Test Assessment

- **Desktop Node.js Test Suite:** 23/23 tests passed (`apps/desktop/tests`).
- **Python Backend Test Suite:** 73/73 tests passed (`apps/pipeline` and `apps/orchestrator`).
- **TypeScript Strict Compilation:** Clean pass (`tsc --noEmit`).
- **Bundle Production Packaging:** Clean Vite and Electron packaging build.

---

## Upgrade & Operational Guidance

1. **Existing Projects:** Models processed in earlier versions remain 100% compatible.
2. **Draco WebAssembly Decoders:** The required decoder files (`draco_decoder.wasm` and `draco_decoder.js`) are pre-bundled in `dist/draco/`; no internet connection is required for decompression.
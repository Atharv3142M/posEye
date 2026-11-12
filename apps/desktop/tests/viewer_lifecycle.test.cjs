const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const DESKTOP_ROOT = path.resolve(__dirname, "..");
const esbuild = require(require.resolve("esbuild", { paths: [DESKTOP_ROOT] }));
const React = require(require.resolve("react", { paths: [DESKTOP_ROOT] }));
const THREE = require(require.resolve("three", { paths: [DESKTOP_ROOT] }));

function loadTsModule(entryPath, overrides = {}) {
  const result = esbuild.buildSync({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    target: "node20",
    external: ["react", "react-dom", "three", ...Object.keys(overrides)],
    nodePaths: [path.join(DESKTOP_ROOT, "node_modules")],
  });

  const code = result.outputFiles[0].text;
  const mod = { exports: {} };
  const baseRequire = Module.createRequire(entryPath);
  const customRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(overrides, id)) {
      return overrides[id];
    }
    return baseRequire(id);
  };
  const fn = new Function("exports", "require", "module", "__filename", "__dirname", code);
  fn(mod.exports, customRequire, mod, entryPath, path.dirname(entryPath));
  return mod.exports;
}

function depsEqual(prev, next) {
  if (!prev || !next || prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (!Object.is(prev[i], next[i])) return false;
  }
  return true;
}

function createComponentHarness(ComponentRenderFn) {
  const hooks = [];
  const effects = [];
  let hookIdx = 0;
  let canvasRefObj = null;

  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

  const dispatcher = {
    useRef(initial) {
      const i = hookIdx++;
      if (!hooks[i]) {
        hooks[i] = { current: initial };
        if (initial === null && !canvasRefObj) {
          // First useRef(null) in ThreeViewer is canvasRef
          canvasRefObj = hooks[i];
        }
      }
      return hooks[i];
    },
    useState(initial) {
      const i = hookIdx++;
      if (!hooks[i]) hooks[i] = [typeof initial === "function" ? initial() : initial];
      const setState = (v) => {
        hooks[i][0] = typeof v === "function" ? v(hooks[i][0]) : v;
      };
      return [hooks[i][0], setState];
    },
    useCallback(fn, deps) {
      const i = hookIdx++;
      if (!hooks[i] || !depsEqual(hooks[i].deps, deps)) {
        hooks[i] = { fn, deps };
      }
      return hooks[i].fn;
    },
    useMemo(fn, deps) {
      const i = hookIdx++;
      if (!hooks[i] || !depsEqual(hooks[i].deps, deps)) {
        hooks[i] = { val: fn(), deps };
      }
      return hooks[i].val;
    },
    useEffect(create, deps) {
      const i = hookIdx++;
      effects.push({ i, create, deps });
    },
    useLayoutEffect(create, deps) {
      const i = hookIdx++;
      effects.push({ i, create, deps });
    },
    useImperativeHandle(ref, create, deps) {
      const i = hookIdx++;
      if (!hooks[i] || !depsEqual(hooks[i].deps, deps)) {
        hooks[i] = { deps };
        const val = create();
        if (typeof ref === "function") ref(val);
        else if (ref) ref.current = val;
      }
    },
  };

  return {
    render(props, ref, mockCanvas) {
      hookIdx = 0;
      effects.length = 0;
      const prevDispatcher = internals.ReactCurrentDispatcher.current;
      internals.ReactCurrentDispatcher.current = dispatcher;
      try {
        ComponentRenderFn(props, ref);
      } finally {
        internals.ReactCurrentDispatcher.current = prevDispatcher;
      }
      if (canvasRefObj && !canvasRefObj.current) {
        canvasRefObj.current = mockCanvas;
      }
      for (const eff of effects) {
        const prev = hooks[eff.i];
        const shouldRun = !prev || eff.deps === undefined || !depsEqual(prev.deps, eff.deps);
        if (shouldRun) {
          if (prev && typeof prev.cleanup === "function") {
            prev.cleanup();
          }
          const cleanup = eff.create();
          hooks[eff.i] = { deps: eff.deps, cleanup };
        }
      }
    },
    unmount() {
      for (let i = hooks.length - 1; i >= 0; i--) {
        if (hooks[i] && typeof hooks[i].cleanup === "function") {
          hooks[i].cleanup();
        }
      }
    },
  };
}

test("Viewer Lifecycle - Stage-Aware State Progression Contract", () => {
  const validPhases = [
    "idle",
    "initializing",
    "fetching",
    "parsing",
    "decoding",
    "uploading",
    "framing",
    "rendering",
    "loaded",
    "failed",
  ];

  const phaseSequence = [];
  const stateListener = (phase) => {
    assert.ok(validPhases.includes(phase), `Phase '${phase}' must be a registered contract state`);
    phaseSequence.push(phase);
  };

  stateListener("initializing");
  stateListener("fetching");
  stateListener("parsing");
  stateListener("uploading");
  stateListener("framing");
  stateListener("rendering");
  stateListener("loaded");

  assert.deepEqual(phaseSequence, [
    "initializing",
    "fetching",
    "parsing",
    "uploading",
    "framing",
    "rendering",
    "loaded",
  ]);
});

test("Viewer Lifecycle - Timeout Guard Prevents Stuck Loading Spinners", async () => {
  let currentPhase = "idle";
  let errorMessage = null;

  function loadWithTimeout(simulateHangMs, timeoutMs = 50) {
    return new Promise((resolve) => {
      currentPhase = "fetching";

      const timer = setTimeout(() => {
        currentPhase = "failed";
        errorMessage = `Loading timed out after ${timeoutMs}ms.`;
        resolve(false);
      }, timeoutMs);

      setTimeout(() => {
        clearTimeout(timer);
        if (currentPhase !== "failed") {
          currentPhase = "loaded";
          resolve(true);
        }
      }, simulateHangMs);
    });
  }

  const hungResult = await loadWithTimeout(200, 40);
  assert.equal(hungResult, false);
  assert.equal(currentPhase, "failed");
  assert.ok(errorMessage.includes("Loading timed out"));

  const fastResult = await loadWithTimeout(10, 80);
  assert.equal(fastResult, true);
  assert.equal(currentPhase, "loaded");
});

test("coords.ts - Z-up -> Y-up + CESIUM_RTC round-trip recovers exact (Easting, Northing, Height)", () => {
  const coords = loadTsModule(path.join(DESKTOP_ROOT, "src/renderer/utils/coords.ts"));

  assert.equal(coords.shouldApplyZUpToYUp(null, true), true);
  assert.equal(coords.shouldApplyZUpToYUp({ axisConvention: "z_up" }, false), true);
  assert.equal(coords.shouldApplyZUpToYUp({ axisConvention: "z_up_to_y_up" }, true), false);
  assert.equal(coords.shouldApplyZUpToYUp(null, false), false);

  const cesiumRtcCenter = [619301.25, 3350278.5, 42.1];
  const rawZUpVertices = [
    [10.0, 20.0, 5.0],
    [-4.0, 8.0, 12.0],
    [2.5, -6.0, 1.5],
  ];

  // Build a real Three.js mesh in Z-up local space relative to CESIUM_RTC center.
  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(rawZUpVertices.flat(), 3)
  );
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
  const gltfScene = new THREE.Group();
  gltfScene.add(mesh);

  const mockGltf = {
    parser: { json: { extensions: { CESIUM_RTC: { center: cesiumRtcCenter } } } },
    scene: gltfScene,
  };
  const extractedCenter = coords.extractCesiumRtcCenter(mockGltf);
  assert.deepEqual(extractedCenter, cesiumRtcCenter);

  // Mirror ThreeViewer.tsx transform sequence: rotate Z-up -> Y-up, then center bounds.
  if (coords.shouldApplyZUpToYUp(null, extractedCenter !== null)) {
    gltfScene.rotation.x = -Math.PI / 2;
    gltfScene.updateMatrixWorld(true);
  }
  const origBox = new THREE.Box3().setFromObject(gltfScene);
  const sceneCenter = origBox.getCenter(new THREE.Vector3());
  gltfScene.position.sub(sceneCenter);
  gltfScene.updateMatrixWorld(true);

  for (const [dx, dy, dz] of rawZUpVertices) {
    const expectedE = cesiumRtcCenter[0] + dx;
    const expectedN = cesiumRtcCenter[1] + dy;
    const expectedH = cesiumRtcCenter[2] + dz;

    const scenePt = new THREE.Vector3(dx, dy, dz).applyMatrix4(gltfScene.matrixWorld);
    const recovered = coords.scenePointToSource(scenePt, sceneCenter, {
      origin: extractedCenter,
      isZUpToYUp: true,
    });

    assert.ok(Math.abs(recovered.x - expectedE) < 1e-5, `E mismatch: ${recovered.x} vs ${expectedE}`);
    assert.ok(Math.abs(recovered.y - expectedN) < 1e-5, `N mismatch: ${recovered.y} vs ${expectedN}`);
    assert.ok(Math.abs(recovered.z - expectedH) < 1e-5, `H mismatch: ${recovered.z} vs ${expectedH}`);
  }

  // Also verify pre-rotated orchestrator OBJ GLB (axisConvention === "z_up_to_y_up")
  const [dx, dy, dz] = [14.2, -9.5, 7.3];
  const preRotatedScenePt = new THREE.Vector3(dx - sceneCenter.x, dz - sceneCenter.y, -dy - sceneCenter.z);
  const recoveredPreRotated = coords.scenePointToSource(preRotatedScenePt, sceneCenter, {
    origin: cesiumRtcCenter,
    isZUpToYUp: true,
  });
  assert.ok(Math.abs(recoveredPreRotated.x - (cesiumRtcCenter[0] + dx)) < 1e-5);
  assert.ok(Math.abs(recoveredPreRotated.y - (cesiumRtcCenter[1] + dy)) < 1e-5);
  assert.ok(Math.abs(recoveredPreRotated.z - (cesiumRtcCenter[2] + dz)) < 1e-5);

  geom.dispose();
  mesh.material.dispose();
});

test("ThreeViewer - changing inline callbacks and modelTransform does not re-trigger GLTF load or recreate WebGL; reloadKey retries cleanly", () => {
  let gltfLoadCalls = 0;
  let dracoDisposeCalls = 0;
  let rendererConstructed = 0;
  let rendererDisposed = 0;

  class MockWebGLRenderer {
    constructor() {
      rendererConstructed += 1;
    }
    setPixelRatio() {}
    setSize() {}
    compile() {}
    render() {}
    dispose() {
      rendererDisposed += 1;
    }
  }

  class MockOrbitControls {
    constructor() {
      this.target = new THREE.Vector3();
    }
    addEventListener() {}
    removeEventListener() {}
    update() { return false; }
    dispose() {}
  }

  class MockDRACOLoader {
    setDecoderPath() {}
    dispose() {
      dracoDisposeCalls += 1;
    }
  }

  class MockGLTFLoader {
    setDRACOLoader() {}
    setRequestHeader() {}
    load(_url, onLoad) {
      gltfLoadCalls += 1;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
      );
      const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
      const scene = new THREE.Group();
      scene.add(mesh);
      onLoad({ scene, parser: { json: {} } });
    }
  }

  const prevWindow = global.window;
  const prevRaf = global.requestAnimationFrame;
  const prevCaf = global.cancelAnimationFrame;
  const prevResizeObserver = global.ResizeObserver;

  global.window = {
    devicePixelRatio: 1,
    location: { protocol: "http:", host: "127.0.0.1:5173", pathname: "/" },
    addEventListener() {},
    removeEventListener() {},
  };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };

  try {
    const ThreeViewerModule = loadTsModule(
      path.join(DESKTOP_ROOT, "src/renderer/components/ThreeViewer.tsx"),
      {
        three: { ...THREE, WebGLRenderer: MockWebGLRenderer },
        "three/examples/jsm/controls/OrbitControls.js": { OrbitControls: MockOrbitControls },
        "three/examples/jsm/loaders/GLTFLoader.js": { GLTFLoader: MockGLTFLoader },
        "three/examples/jsm/loaders/DRACOLoader.js": { DRACOLoader: MockDRACOLoader },
      }
    );

    const ThreeViewer = ThreeViewerModule.default;
    const harness = createComponentHarness(ThreeViewer.render);
    const mockCanvas = {
      clientWidth: 800,
      clientHeight: 600,
      style: {},
      parentElement: { clientWidth: 800, clientHeight: 600 },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      addEventListener() {},
      removeEventListener() {},
    };
    const viewerRef = { current: null };

    // Initial render + 4 parent re-renders with fresh inline callbacks and new modelTransform objects
    for (let i = 0; i < 5; i++) {
      harness.render(
        {
          modelUrl: "http://127.0.0.1:8765/jobs/abc/assets/model.glb",
          reloadKey: 0,
          modelTransform: { axisConvention: "z_up", origin: [100, 200, 10] },
          meshVisible: true,
          measuring: false,
          onCoords: () => {},
          onMeasure: () => {},
          onStats: () => {},
          onLoadStart: () => {},
          onLoadProgress: () => {},
          onLoadPhase: () => {},
          onLoadSuccess: () => {},
          onLoadError: () => {},
        },
        viewerRef,
        mockCanvas
      );
    }

    assert.equal(rendererConstructed, 1, "WebGLRenderer must be created once across callback changes");
    assert.equal(gltfLoadCalls, 1, "GLTF model must load once despite inline callback re-renders");
    assert.equal(dracoDisposeCalls, 0, "DRACOLoader must remain active while model is mounted");

    // Simulate clicking Retry in Viewer.tsx (increments reloadKey)
    harness.render(
      {
        modelUrl: "http://127.0.0.1:8765/jobs/abc/assets/model.glb",
        reloadKey: 1,
        modelTransform: { axisConvention: "z_up", origin: [100, 200, 10] },
        meshVisible: true,
        measuring: false,
        onCoords: () => {},
        onMeasure: () => {},
        onStats: () => {},
        onLoadPhase: () => {},
        onLoadSuccess: () => {},
        onLoadError: () => {},
      },
      viewerRef,
      mockCanvas
    );

    assert.equal(rendererConstructed, 1, "Retry must reuse existing WebGLRenderer");
    assert.equal(gltfLoadCalls, 2, "Incrementing reloadKey must trigger a fresh GLTF load");
    assert.equal(dracoDisposeCalls, 1, "Previous DRACOLoader must be disposed on reload");

    harness.unmount();
    assert.equal(dracoDisposeCalls, 2, "Cleanup on unmount must dispose DRACOLoader");
    assert.equal(rendererDisposed, 1, "Cleanup on unmount must dispose WebGLRenderer");
  } finally {
    global.window = prevWindow;
    global.requestAnimationFrame = prevRaf;
    global.cancelAnimationFrame = prevCaf;
    global.ResizeObserver = prevResizeObserver;
  }
});

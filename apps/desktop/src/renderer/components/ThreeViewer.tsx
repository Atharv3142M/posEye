import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { apiTokenSync } from "../api";

export type MeasureResult = {
  distance: number;
  a: Vector3;
  b: Vector3;
  worldA?: Vector3;
  worldB?: Vector3;
} | null;

export type ModelStats = {
  vertices: number;
  triangles: number;
  bbox?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
  };
};

export type ModelLoadPhase =
  | "idle"
  | "initializing"
  | "fetching"
  | "parsing"
  | "uploading"
  | "rendering"
  | "loaded"
  | "failed";

export interface ThreeViewerHandle {
  resetCamera: () => void;
  clearMeasurements: () => void;
  takeScreenshot: () => string | null;
  requestRender: () => void;
}

interface ThreeViewerProps {
  modelUrl: string | null;
  meshVisible: boolean;
  measuring: boolean;
  wireframe?: boolean;
  showOrtho?: boolean;
  orthoUrl?: string | null;
  modelReady?: boolean;
  onCoords: (text: string) => void;
  onMeasure: (result: MeasureResult) => void;
  onStats?: (stats: ModelStats) => void;
  onLoadStart?: () => void;
  onLoadProgress?: (pct: number) => void;
  onLoadSuccess?: () => void;
  onLoadError?: (error: string) => void;
  onLoadPhase?: (phase: ModelLoadPhase, detail?: { progress?: number; message?: string }) => void;
}

const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(function ThreeViewer(
  {
    modelUrl,
    meshVisible,
    measuring,
    wireframe = false,
    showOrtho = false,
    orthoUrl = null,
    modelReady = false,
    onCoords,
    onMeasure,
    onStats,
    onLoadStart,
    onLoadProgress,
    onLoadSuccess,
    onLoadError,
    onLoadPhase,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const rootRef = useRef<Group | null>(null);
  const measuresRef = useRef<Group | null>(null);
  const hoverMarkerRef = useRef<Mesh | null>(null);
  const modelOffsetRef = useRef<Vector3>(new Vector3(0, 0, 0));
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const orthoGroupRef = useRef<Group | null>(null);
  const cachedMeshesRef = useRef<Mesh[]>([]);
  const requestRenderRef = useRef<() => void>(() => {});
  const dracoLoaderRef = useRef<DRACOLoader | null>(null);

  const measuringRef = useRef(measuring);
  measuringRef.current = measuring;

  const meshVisibleRef = useRef(meshVisible);
  meshVisibleRef.current = meshVisible;

  // Multi-segment measurement: accumulate picks
  const picksRef = useRef<Vector3[]>([]);
  const totalDistRef = useRef(0);
  const loadIdRef = useRef<number>(0);

  const disposeObjectTree = (obj: any) => {
    if (!obj) return;
    obj.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m: any) => {
            m.map?.dispose();
            m.dispose();
          });
        } else {
          child.material.map?.dispose();
          child.material.dispose();
        }
      }
    });
  };

  const updateCachedMeshes = () => {
    const root = rootRef.current;
    if (!root) {
      cachedMeshesRef.current = [];
      return;
    }
    const meshes: Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof Mesh && o.visible) {
        meshes.push(o);
      }
    });
    cachedMeshesRef.current = meshes;
    requestRenderRef.current();
  };

  const doResetCamera = () => {
    const root = rootRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!root || !camera || !controls) return;

    const box = new Box3().setFromObject(root);
    if (box.isEmpty()) {
      camera.position.set(40, 30, 40);
      controls.target.set(0, 0, 0);
      controls.update();
      requestRenderRef.current();
      return;
    }

    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 5);

    controls.target.copy(center);
    camera.position.copy(center).add(new Vector3(maxDim * 0.85, maxDim * 0.7, maxDim * 0.85));
    camera.near = Math.max(0.01, maxDim / 1000);
    camera.far = Math.max(2000, maxDim * 50);
    camera.updateProjectionMatrix();
    controls.update();
    requestRenderRef.current();
  };

  const doClearMeasurements = () => {
    if (measuresRef.current) {
      disposeObjectTree(measuresRef.current);
      measuresRef.current.clear();
    }
    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.visible = false;
    }
    picksRef.current = [];
    totalDistRef.current = 0;
    onMeasure(null);
    requestRenderRef.current();
  };

  useImperativeHandle(ref, () => ({
    resetCamera: doResetCamera,
    clearMeasurements: doClearMeasurements,
    requestRender: () => requestRenderRef.current(),
    takeScreenshot: () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      if (!renderer || !scene || !camera || !canvas) return null;
      // Force an immediate render into framebuffer right before capture
      renderer.render(scene, camera);
      try {
        return canvas.toDataURL("image/png");
      } catch {
        return null;
      }
    },
  }));

  // Setup WebGL Scene and Demand-Driven Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
    } catch (e: any) {
      const msg = `WebGL initialization failed: ${e?.message || "WebGL hardware acceleration unavailable"}`;
      onLoadPhase?.("failed", { message: msg });
      onLoadError?.(msg);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    const scene = new Scene();
    scene.background = new Color("#1e272e");
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(50, 1, 0.1, 100000);
    camera.position.set(40, 30, 40);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    // Lighting
    const mainLight = new DirectionalLight(0xffffff, 1.3);
    mainLight.position.set(80, 120, 50);
    scene.add(mainLight);

    const fillLight = new DirectionalLight(0x90caf9, 0.7);
    fillLight.position.set(-80, -40, -50);
    scene.add(fillLight);

    scene.add(new AmbientLight(0xffffff, 0.65));

    // Ground reference grid
    const grid = new GridHelper(200, 40, 0x4a5568, 0x2d3748);
    scene.add(grid);

    // Groups
    const root = new Group();
    const measures = new Group();
    const orthoGroup = new Group();
    rootRef.current = root;
    measuresRef.current = measures;
    orthoGroupRef.current = orthoGroup;
    scene.add(root, measures, orthoGroup);

    // Hover marker for measuring
    const hoverMarker = new Mesh(
      new RingGeometry(0.08, 0.22, 24),
      new MeshBasicMaterial({ color: 0x18bc9c, side: DoubleSide, transparent: true, opacity: 0.85 })
    );
    hoverMarker.visible = false;
    scene.add(hoverMarker);
    hoverMarkerRef.current = hoverMarker;

    const raycaster = new Raycaster();
    const pointer = new Vector2();

    // Demand-Driven Render Loop
    let renderRequested = false;
    const render = () => {
      renderRequested = false;
      if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return;
      const animating = controls.update();
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      if (animating) {
        requestRender();
      }
    };

    const requestRender = () => {
      if (!renderRequested) {
        renderRequested = true;
        requestAnimationFrame(render);
      }
    };
    requestRenderRef.current = requestRender;

    controls.addEventListener("change", requestRender);

    const resize = () => {
      if (!canvas) return;
      const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
      const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 600;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      requestRender();
    };
    resize();

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    // Throttled Pointer Movement for Picking
    let pointerRafId: number | null = null;
    const onPointerMove = (ev: PointerEvent) => {
      if (pointerRafId !== null) return;
      pointerRafId = requestAnimationFrame(() => {
        pointerRafId = null;
        if (!canvas || !cameraRef.current) return;
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointer, cameraRef.current);
        const meshes = meshVisibleRef.current ? cachedMeshesRef.current : [];
        if (meshes.length === 0) {
          onCoords("—");
          if (hoverMarkerRef.current?.visible) {
            hoverMarkerRef.current.visible = false;
            requestRender();
          }
          return;
        }

        // Non-recursive test against flat cached mesh array for high-FPS picking
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length === 0) {
          onCoords("—");
          if (hoverMarkerRef.current?.visible) {
            hoverMarkerRef.current.visible = false;
            requestRender();
          }
          return;
        }

        const hit = hits[0];
        const p = hit.point;
        const worldP = p.clone().add(modelOffsetRef.current);

        onCoords(`X: ${worldP.x.toFixed(2)}  Y: ${worldP.y.toFixed(2)}  Z: ${worldP.z.toFixed(2)}`);

        if (measuringRef.current && hoverMarkerRef.current) {
          hoverMarkerRef.current.position.copy(p);
          if (hit.face) {
            hoverMarkerRef.current.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), hit.face.normal);
          }
          hoverMarkerRef.current.visible = true;
          requestRender();
        } else if (hoverMarkerRef.current?.visible) {
          hoverMarkerRef.current.visible = false;
          requestRender();
        }
      });
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0 || !measuringRef.current) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const meshes = meshVisibleRef.current ? cachedMeshesRef.current : [];
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return;

      const hit = hits[0];
      const pt = hit.point.clone();
      const picks = picksRef.current;

      const markerGeom = new SphereGeometry(0.25, 16, 16);
      const markerMat = new MeshStandardMaterial({
        color: 0x18bc9c,
        emissive: 0x18bc9c,
        emissiveIntensity: 0.6,
      });
      const marker = new Mesh(markerGeom, markerMat);
      marker.position.copy(pt);
      measures.add(marker);

      if (picks.length > 0) {
        const prev = picks[picks.length - 1];
        const lineGeom = new BufferGeometry().setFromPoints([prev, pt]);
        const lineMat = new LineBasicMaterial({ color: 0x18bc9c, linewidth: 2 });
        measures.add(new Line(lineGeom, lineMat));

        const segDist = prev.distanceTo(pt);
        totalDistRef.current += segDist;

        const offset = modelOffsetRef.current;
        onMeasure({
          distance: totalDistRef.current,
          a: picks[0].clone(),
          b: pt.clone(),
          worldA: picks[0].clone().add(offset),
          worldB: pt.clone().add(offset),
        });
      } else {
        const offset = modelOffsetRef.current;
        onMeasure({
          distance: 0,
          a: pt.clone(),
          b: pt.clone(),
          worldA: pt.clone().add(offset),
          worldB: pt.clone().add(offset),
        });
      }

      picks.push(pt);
      requestRender();
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") {
        doResetCamera();
      } else if (e.key === "Escape") {
        doClearMeasurements();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // WebGL Context Loss Handling
    const onContextLost = (e: Event) => {
      e.preventDefault();
      onLoadError?.("WebGL graphics context lost. Restoring…");
    };
    const onContextRestored = () => {
      requestRender();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    // Initial render
    requestRender();

    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      window.removeEventListener("keydown", onKeyDown);
      ro.disconnect();
      if (pointerRafId !== null) cancelAnimationFrame(pointerRafId);
      controls.removeEventListener("change", requestRender);
      disposeObjectTree(root);
      disposeObjectTree(measures);
      disposeObjectTree(orthoGroup);
      disposeObjectTree(hoverMarker);
      controls.dispose();
      controlsRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [onCoords, onMeasure]);

  // Update cursor style when measuring mode changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = measuring ? "crosshair" : "grab";
    }
    if (!measuring && hoverMarkerRef.current) {
      hoverMarkerRef.current.visible = false;
      requestRenderRef.current();
    }
  }, [measuring]);

  // Update layer visibility
  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.visible = meshVisible;
    }
    updateCachedMeshes();
  }, [meshVisible]);

  // Toggle wireframe on all meshes
  useEffect(() => {
    if (!rootRef.current) return;
    rootRef.current.traverse((o) => {
      if (o instanceof Mesh) {
        if (Array.isArray(o.material)) {
          o.material.forEach((m: any) => {
            if ("wireframe" in m) m.wireframe = wireframe;
          });
        } else if ("wireframe" in o.material) {
          (o.material as any).wireframe = wireframe;
        }
      }
    });
    requestRenderRef.current();
  }, [wireframe]);

  // Orthophoto overlay plane
  useEffect(() => {
    const group = orthoGroupRef.current;
    if (!group) return;
    group.visible = showOrtho;
    disposeObjectTree(group);
    group.clear();
    if (!showOrtho || !orthoUrl || !modelReady) {
      requestRenderRef.current();
      return;
    }
    const loader = new TextureLoader();
    const token = apiTokenSync();
    if (token) loader.setRequestHeader({ Authorization: `Bearer ${token}` });
    let disposed = false;
    loader.load(
      orthoUrl,
      (texture: Texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        const root = rootRef.current;
        const box = root ? new Box3().setFromObject(root) : new Box3();
        const size = box.isEmpty() ? new Vector3(20, 1, 20) : box.getSize(new Vector3());
        const plane = new Mesh(
          new PlaneGeometry(Math.max(size.x, 1), Math.max(size.z, 1)),
          new MeshBasicMaterial({ map: texture, side: DoubleSide, transparent: true, opacity: 0.9 })
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = box.isEmpty() ? -0.05 : box.min.y - 0.05;
        group.add(plane);
        requestRenderRef.current();
      },
      undefined,
      () => {
        // Silent failure for optional raster
      }
    );
    return () => {
      disposed = true;
    };
  }, [showOrtho, orthoUrl, modelReady]);

  // Model Loading with DRACOLoader and Multi-Phase Progress
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const currentLoadId = ++loadIdRef.current;
    disposeObjectTree(root);
    root.clear();
    cachedMeshesRef.current = [];
    if (measuresRef.current) {
      disposeObjectTree(measuresRef.current);
      measuresRef.current.clear();
    }
    picksRef.current = [];
    totalDistRef.current = 0;
    modelOffsetRef.current.set(0, 0, 0);
    onStats?.({ vertices: 0, triangles: 0 });
    requestRenderRef.current();

    if (!modelUrl) {
      onLoadPhase?.("idle");
      return;
    }

    onLoadStart?.();
    onLoadPhase?.("initializing");

    // Initialize GLTFLoader and local offline DRACOLoader
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("draco/");
    dracoLoaderRef.current = dracoLoader;
    loader.setDRACOLoader(dracoLoader);

    const token = apiTokenSync();
    if (token) {
      loader.setRequestHeader({ Authorization: `Bearer ${token}` });
    }

    onLoadPhase?.("fetching", { progress: 0 });

    loader.load(
      modelUrl,
      (gltf) => {
        if (currentLoadId !== loadIdRef.current) {
          disposeObjectTree(gltf.scene);
          dracoLoader.dispose();
          return;
        }

        onLoadPhase?.("parsing");

        let totalVerts = 0;
        let totalTriangles = 0;

        gltf.scene.traverse((obj) => {
          if (obj instanceof Mesh) {
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => {
                  m.side = DoubleSide;
                });
              } else if ("side" in obj.material) {
                obj.material.side = DoubleSide;
              }
            }
            if (obj.geometry) {
              const count = obj.geometry.attributes?.position?.count ?? 0;
              totalVerts += count;
              if (obj.geometry.index) {
                totalTriangles += obj.geometry.index.count / 3;
              } else {
                totalTriangles += count / 3;
              }
            }
          }
        });

        if (totalVerts === 0 || totalTriangles === 0) {
          disposeObjectTree(gltf.scene);
          dracoLoader.dispose();
          onStats?.({ vertices: 0, triangles: 0 });
          const err = "Model contains no usable polygon geometry.";
          onLoadPhase?.("failed", { message: err });
          onLoadError?.(err);
          return;
        }

        onLoadPhase?.("uploading");

        const origBox = new Box3().setFromObject(gltf.scene);
        const center = origBox.getCenter(new Vector3());
        const size = origBox.getSize(new Vector3());

        gltf.scene.position.sub(center);
        modelOffsetRef.current.copy(center);

        root.add(gltf.scene);
        root.visible = meshVisibleRef.current;
        updateCachedMeshes();

        if (onStats) {
          onStats({
            vertices: Math.round(totalVerts),
            triangles: Math.round(totalTriangles),
            bbox: {
              min: { x: origBox.min.x, y: origBox.min.y, z: origBox.min.z },
              max: { x: origBox.max.x, y: origBox.max.y, z: origBox.max.z },
              size: { x: size.x, y: size.y, z: size.z },
            },
          });
        }

        onLoadPhase?.("rendering");
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.compile(sceneRef.current, cameraRef.current);
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }

        onLoadPhase?.("loaded");
        onLoadSuccess?.();
        setTimeout(doResetCamera, 50);
      },
      (xhr) => {
        if (currentLoadId !== loadIdRef.current) return;
        if (xhr.total && xhr.total > 0) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          onLoadProgress?.(pct);
          onLoadPhase?.("fetching", { progress: pct });
        }
      },
      (err: any) => {
        if (currentLoadId !== loadIdRef.current) return;
        let errorMsg = "Failed to load 3D GLB model.";
        if (err instanceof Error) {
          errorMsg = err.message;
        } else if (err?.target?.status) {
          errorMsg = `HTTP ${err.target.status}: ${err.target.statusText || "Unable to retrieve model asset"}`;
        } else if (typeof err === "string") {
          errorMsg = err;
        }
        if (err?.target?.status === 401 || String(errorMsg).includes("401")) {
          errorMsg = "Authentication failed (401 Unauthorized) retrieving model asset.";
        }
        onLoadPhase?.("failed", { message: errorMsg });
        onLoadError?.(errorMsg);
      }
    );

    return () => {
      dracoLoader.dispose();
    };
  }, [modelUrl, onStats, onLoadStart, onLoadSuccess, onLoadError, onLoadProgress, onLoadPhase]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        outline: "none",
      }}
    />
  );
});

export default ThreeViewer;

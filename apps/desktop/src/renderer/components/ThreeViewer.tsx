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
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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

export interface ThreeViewerHandle {
  resetCamera: () => void;
  clearMeasurements: () => void;
}

interface ThreeViewerProps {
  modelUrl: string | null;
  meshVisible: boolean;
  measuring: boolean;
  onCoords: (text: string) => void;
  onMeasure: (result: MeasureResult) => void;
  onStats?: (stats: ModelStats) => void;
  onLoadStart?: () => void;
  onLoadSuccess?: () => void;
  onLoadError?: (error: string) => void;
}

const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(function ThreeViewer(
  {
    modelUrl,
    meshVisible,
    measuring,
    onCoords,
    onMeasure,
    onStats,
    onLoadStart,
    onLoadSuccess,
    onLoadError,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<Group | null>(null);
  const measuresRef = useRef<Group | null>(null);
  const hoverMarkerRef = useRef<Mesh | null>(null);
  const modelOffsetRef = useRef<Vector3>(new Vector3(0, 0, 0));
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const measuringRef = useRef(measuring);
  measuringRef.current = measuring;

  const meshVisibleRef = useRef(meshVisible);
  meshVisibleRef.current = meshVisible;

  const picksRef = useRef<Vector3[]>([]);

  // Expose imperative methods to parent
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
  };

  const doClearMeasurements = () => {
    if (measuresRef.current) {
      measuresRef.current.clear();
    }
    picksRef.current = [];
    onMeasure(null);
  };

  useImperativeHandle(ref, () => ({
    resetCamera: doResetCamera,
    clearMeasurements: doClearMeasurements,
  }));

  // Setup Three.js Scene & Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new Scene();
    scene.background = new Color("#1e272e");

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

    // Ground grid
    const grid = new GridHelper(200, 40, 0x4a5568, 0x2d3748);
    scene.add(grid);

    // Groups
    const root = new Group();
    const measures = new Group();
    rootRef.current = root;
    measuresRef.current = measures;
    scene.add(root, measures);

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

    const resize = () => {
      if (!canvas) return;
      const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
      const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 600;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const getVisibleMeshes = (): Mesh[] => {
      if (!meshVisibleRef.current) return [];
      const out: Mesh[] = [];
      root.traverse((o) => {
        if (o instanceof Mesh && o.visible) out.push(o);
      });
      return out;
    };

    // Pointer move handler
    const onPointerMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const meshes = getVisibleMeshes();
      const hits = raycaster.intersectObjects(meshes, true);

      if (hits.length === 0) {
        onCoords("—");
        if (hoverMarkerRef.current) hoverMarkerRef.current.visible = false;
        return;
      }

      const hit = hits[0];
      const p = hit.point;
      const worldP = p.clone().add(modelOffsetRef.current);

      onCoords(`X: ${worldP.x.toFixed(2)}  Y: ${worldP.y.toFixed(2)}  Z: ${worldP.z.toFixed(2)}`);

      if (measuringRef.current && hoverMarkerRef.current) {
        hoverMarkerRef.current.position.copy(p);
        if (hit.face) {
          hoverMarkerRef.current.quaternion.setFromUnitVectors(
            new Vector3(0, 0, 1),
            hit.face.normal
          );
        }
        hoverMarkerRef.current.visible = true;
      } else if (hoverMarkerRef.current) {
        hoverMarkerRef.current.visible = false;
      }
    };

    // Pointer down handler for point picking in measuring mode
    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0 || !measuringRef.current) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const meshes = getVisibleMeshes();
      const hits = raycaster.intersectObjects(meshes, true);
      if (hits.length === 0) return;

      const hit = hits[0];
      const pt = hit.point.clone();
      const picks = picksRef.current;

      // Add sphere marker
      const markerGeom = new SphereGeometry(0.25, 16, 16);
      const markerMat = new MeshStandardMaterial({
        color: 0x18bc9c,
        emissive: 0x18bc9c,
        emissiveIntensity: 0.6,
      });
      const marker = new Mesh(markerGeom, markerMat);
      marker.position.copy(pt);
      measures.add(marker);

      picks.push(pt);

      if (picks.length === 2) {
        // Draw connection line
        const lineGeom = new BufferGeometry().setFromPoints([picks[0], picks[1]]);
        const lineMat = new LineBasicMaterial({ color: 0x18bc9c, linewidth: 3 });
        measures.add(new Line(lineGeom, lineMat));

        const dist = picks[0].distanceTo(picks[1]);
        const offset = modelOffsetRef.current;
        onMeasure({
          distance: dist,
          a: picks[0].clone(),
          b: picks[1].clone(),
          worldA: picks[0].clone().add(offset),
          worldB: picks[1].clone().add(offset),
        });

        // Reset picks array for subsequent measurements
        picksRef.current = [];
      }
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);

    // Keyboard shortcuts
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") {
        doResetCamera();
      } else if (e.key === "Escape") {
        doClearMeasurements();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Render loop
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      ro.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
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
    }
  }, [measuring]);

  // Update layer visibility
  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.visible = meshVisible;
    }
  }, [meshVisible]);

  // Load Model from URL with robust error handling and bounding normalization
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    root.clear();
    if (measuresRef.current) measuresRef.current.clear();
    picksRef.current = [];
    modelOffsetRef.current.set(0, 0, 0);

    if (!modelUrl) return;

    onLoadStart?.();

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
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

        // Compute original bounding box
        const origBox = new Box3().setFromObject(gltf.scene);
        const center = origBox.getCenter(new Vector3());
        const size = origBox.getSize(new Vector3());

        // Offset geometry to center at (0, 0, 0) to avoid extreme UTM jitter
        gltf.scene.position.sub(center);
        modelOffsetRef.current.copy(center);

        root.add(gltf.scene);
        root.visible = meshVisibleRef.current;

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

        onLoadSuccess?.();
        // Frame camera on the newly loaded centered model
        setTimeout(doResetCamera, 50);
      },
      undefined,
      (err) => {
        const errorMsg = err instanceof Error ? err.message : "Failed to load 3D GLB model.";
        onLoadError?.(errorMsg);
      }
    );
  }, [modelUrl, onStats, onLoadStart, onLoadSuccess, onLoadError]);

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

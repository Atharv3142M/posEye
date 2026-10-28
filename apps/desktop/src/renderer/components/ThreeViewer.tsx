import { useEffect, useRef } from "react";
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
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type MeasureResult = { distance: number; a: Vector3; b: Vector3 } | null;

export default function ThreeViewer({
  modelUrl,
  meshVisible,
  measuring,
  onCoords,
  onMeasure,
  onStats,
}: {
  modelUrl: string | null;
  meshVisible: boolean;
  measuring: boolean;
  onCoords: (text: string) => void;
  onMeasure: (result: MeasureResult) => void;
  onStats?: (stats: { vertices: number; triangles: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<Group | null>(null);
  const measureRef = useRef<Group | null>(null);
  const measuringRef = useRef(measuring);
  measuringRef.current = measuring;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new Scene();
    scene.background = new Color("#1e272e");
    const camera = new PerspectiveCamera(50, 1, 0.1, 100000);
    camera.position.set(40, 30, 40);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const mainLight = new DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(50, 100, 30);
    scene.add(mainLight);

    const fillLight = new DirectionalLight(0xa0c4ff, 0.6);
    fillLight.position.set(-50, -30, -30);
    scene.add(fillLight);

    scene.add(new AmbientLight(0xffffff, 0.6));
    const grid = new GridHelper(200, 40, 0x4a5568, 0x2d3748);
    scene.add(grid);

    const root = new Group();
    const measures = new Group();
    rootRef.current = root;
    measureRef.current = measures;
    scene.add(root, measures);

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const picks: Vector3[] = [];

    function resize() {
      if (!canvas) return;
      const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
      const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 600;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const meshes = () => {
      const out: Mesh[] = [];
      root.traverse((o) => {
        if (o instanceof Mesh) out.push(o);
      });
      return out;
    };

    canvas.onpointermove = (ev) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes(), true)[0];
      if (!hit) {
        onCoords("—");
        return;
      }
      const p = hit.point;
      onCoords(`X ${p.x.toFixed(2)}  Y ${p.y.toFixed(2)}  Z ${p.z.toFixed(2)}`);
    };

    canvas.onpointerdown = (ev) => {
      if (!canvas || !measuringRef.current || ev.button !== 0) return;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes(), true)[0];
      if (!hit) return;
      picks.push(hit.point.clone());
      const m = new Mesh(
        new SphereGeometry(0.3, 16, 16),
        new MeshStandardMaterial({ color: 0x18bc9c, emissive: 0x18bc9c, emissiveIntensity: 0.5 })
      );
      m.position.copy(hit.point);
      measures.add(m);

      if (picks.length === 2) {
        const geom = new BufferGeometry().setFromPoints([picks[0], picks[1]]);
        measures.add(new Line(geom, new LineBasicMaterial({ color: 0x18bc9c, linewidth: 2 })));
        onMeasure({ distance: picks[0].distanceTo(picks[1]), a: picks[0].clone(), b: picks[1].clone() });
        picks.length = 0;
      }
    };

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    const resetCamera = () => {
      const box = new Box3().setFromObject(root);
      if (box.isEmpty()) return;
      const size = box.getSize(new Vector3()).length();
      const center = box.getCenter(new Vector3());
      controls.target.copy(center);
      camera.position.copy(center).add(new Vector3(size * 0.7, size * 0.5, size * 0.7));
      camera.near = Math.max(0.01, size / 1000);
      camera.far = Math.max(1000, size * 50);
      camera.updateProjectionMatrix();
    };

    (canvas as HTMLCanvasElement & { __frame?: () => void }).__frame = resetCamera;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") {
        resetCamera();
      } else if (e.key === "Escape") {
        measures.clear();
        picks.length = 0;
        onMeasure(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      ro.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
    };
  }, [onCoords, onMeasure]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.visible = meshVisible;
  }, [meshVisible]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !modelUrl) return;
    root.clear();
    measureRef.current?.clear();

    void new GLTFLoader().loadAsync(modelUrl).then((gltf) => {
      let totalVerts = 0;
      let totalTriangles = 0;

      gltf.scene.traverse((obj) => {
        if (obj instanceof Mesh) {
          if (obj.material && "side" in obj.material) {
            obj.material.side = DoubleSide;
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

      root.add(gltf.scene);

      if (onStats) {
        onStats({
          vertices: Math.round(totalVerts),
          triangles: Math.round(totalTriangles),
        });
      }

      const canvas = canvasRef.current as (HTMLCanvasElement & { __frame?: () => void }) | null;
      canvas?.__frame?.();
    });
  }, [modelUrl, onStats]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

import * as THREE from 'three';
import { initChrome, reducedMotion } from '../lib/chrome.js';
import { addStudioLighting, createRenderer, hasWebGL, loadGLB, normalizeModel, showStageFallback } from '../lib/models.js';

initChrome();

const LAYERS = {
  desktop: {
    title: 'Desktop Shell & Viewer (apps/desktop)',
    summary: 'Electron 32 wraps the React 18 interface and Three.js GLB viewer inside a custom poseye://app protocol. On startup, main.cjs launches the compiled FastAPI orchestrator, passes a per-session bearer token, and supervises Docker container health.',
    facts: [
      ['Runtime', 'Electron 32 + React 18 + Three.js'],
      ['Origin Isolation', 'Custom poseye://app protocol handler'],
      ['IPC Channel', '127.0.0.1:8765 REST + WebSocket events'],
    ],
  },
  orchestrator: {
    title: 'Spatial Orchestrator API (apps/orchestrator)',
    summary: 'FastAPI server bound strictly to localhost:8765. Persists every job state to disk (job.json), executes Stages 1 to 3 sequentially in a worker thread pool, enforces Zip-Slip path sanitization on archive extraction, and streams stage/percent events over WebSockets.',
    facts: [
      ['Persistence', 'Atomic job.json project manifests'],
      ['API Security', 'Localhost bind + random bearer token'],
      ['Mesh Output', 'Origin-centered Draco GLB via trimesh'],
    ],
  },
  pipeline: {
    title: 'Frame Extraction & Telemetry (apps/pipeline)',
    summary: 'Uses bundled static ffmpeg.exe to probe and extract video stills, applies OpenCV Laplacian variance to reject motion blur, removes redundant hover frames via perceptual dHash, and writes WGS 84 EPSG:4326 GPS EXIF coordinates matched within 1.5 seconds of SRT telemetry.',
    facts: [
      ['Media Binary', 'Bundled static ffmpeg.exe + ffprobe'],
      ['SRT Parsers', 'DJI Parenthesized, CSV, and Key-Value'],
      ['Optional Masking', 'YOLOv8n dynamic object segmentation'],
    ],
  },
  engine: {
    title: 'posEye Construction Engine',
    summary: 'Containerized local photogrammetry engine orchestrated over localhost port 3000. Receives staged geotagged imagery, automatically uses NVIDIA CUDA GPU acceleration when detected or falls back cleanly to CPU threads, and emits meshes, LAZ clouds, and GeoTIFF orthophotos.',
    facts: [
      ['Execution', '100% local Docker container runtime'],
      ['Acceleration', 'CUDA GPU auto-detect + CPU fallback'],
      ['Deliverables', 'OBJ mesh, LAZ point cloud, GeoTIFF map'],
    ],
  },
};

function initLayers() {
  const btns = document.querySelectorAll('[data-layer]');
  const titleEl = document.querySelector('#layer-title');
  const bodyEl = document.querySelector('#layer-body');
  const factsEl = document.querySelector('#layer-facts');
  if (!btns.length) return;

  const selectLayer = (key) => {
    const info = LAYERS[key];
    if (!info) return;
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layer === key)));
    titleEl.textContent = info.title;
    bodyEl.textContent = info.summary;
    factsEl.innerHTML = info.facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  };

  btns.forEach((btn) => btn.addEventListener('click', () => selectLayer(btn.dataset.layer)));
  selectLayer('desktop');
}

async function initArchModel() {
  const canvas = document.querySelector('#arch-canvas');
  if (!canvas) return;
  const frame = canvas.parentElement;

  if (!hasWebGL()) {
    showStageFallback(frame, 'UAV assembly model preview requires WebGL.');
    return;
  }

  const renderer = createRenderer(canvas, { maxPixelRatio: 1.5 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  camera.position.set(3.4, 2.0, 3.8);
  addStudioLighting(scene);

  const resize = () => {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(frame);
  resize();

  let group = null;
  let mixer = null;
  try {
    const gltf = await loadGLB('drone.glb');
    const norm = normalizeModel(gltf.scene, 3.2);
    group = norm.root;
    scene.add(group);
    if (gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(group.children[0]);
      mixer.clipAction(gltf.animations[0]).play();
    }
    document.querySelector('#arch-loader')?.classList.add('done');
  } catch {
    showStageFallback(frame, 'Unable to load UAV model.');
    return;
  }

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (mixer && !reducedMotion) mixer.update(dt);
    if (group && !reducedMotion) group.rotation.y += dt * 0.35;
    camera.lookAt(0, 0.35, 0);
    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
  });
}

initLayers();
initArchModel();

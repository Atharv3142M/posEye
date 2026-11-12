import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { initChrome, reducedMotion } from '../lib/chrome.js';
import {
  addStudioLighting,
  buildVertexPointCloud,
  createRenderer,
  hasWebGL,
  loadGLB,
  normalizeModel,
  showStageFallback,
} from '../lib/models.js';

initChrome();

const MODELS = {
  scan: {
    file: 'poseye-scan.glb',
    title: 'posEye Aerial Scan (test7)',
    source: 'Actual posEye photogrammetry output converted to Draco GLB',
    camera: [4.6, 3.1, 4.9],
  },
  cliff: {
    file: 'coastal-cliff.glb',
    title: 'Coastal Cliff 01 (CC0)',
    source: 'Poly Haven photogrammetry terrain scan (1K WebP + Draco)',
    camera: [4.9, 2.5, 5.2],
  },
  drone: {
    file: 'drone.glb',
    title: 'Survey UAV (CesiumDrone)',
    source: 'Apache-2.0 quadcopter with rotor animation clip',
    camera: [3.6, 2.2, 4.2],
  },
};

function setLoader(pct, done = false) {
  const el = document.querySelector('#viewer-loader');
  if (!el) return;
  el.classList.toggle('done', done);
  const bar = el.querySelector('.stage-bar i');
  const txt = el.querySelector('.loader-text');
  if (bar && Number.isFinite(pct)) bar.style.width = `${pct}%`;
  if (txt && Number.isFinite(pct)) txt.textContent = `Loading GLB (${pct}%)`;
}

async function initViewer() {
  const canvas = document.querySelector('#lab-canvas');
  const stageFrame = document.querySelector('#viewer-stage');
  if (!canvas || !stageFrame) return;

  if (!hasWebGL()) {
    setLoader(100, true);
    showStageFallback(stageFrame, 'WebGL is unavailable in this browser. The desktop app includes the same Three.js GLB inspector.');
    return;
  }

  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.1;
  controls.maxDistance = 18;
  controls.maxPolarAngle = Math.PI * 0.49;

  addStudioLighting(scene);

  const grid = new THREE.GridHelper(10, 20, 0x9e3816, 0x3b4451);
  grid.position.y = -0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  scene.add(grid);

  const measureGroup = new THREE.Group();
  scene.add(measureGroup);

  const contentRoot = new THREE.Group();
  scene.add(contentRoot);

  let activeKey = 'scan';
  let activeMode = 'pbr';
  let darkStage = true;
  let measureMode = false;
  let measurePoints = [];
  let activeMesh = null;
  let activeCloud = null;
  let mixer = null;

  const resize = () => {
    const w = stageFrame.clientWidth;
    const h = stageFrame.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stageFrame);
  resize();

  const updateMeasureUI = (text) => {
    const out = document.querySelector('#measure-readout');
    if (out) out.textContent = text;
  };

  const clearMeasure = () => {
    measurePoints = [];
    while (measureGroup.children.length) {
      const child = measureGroup.children.pop();
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    updateMeasureUI(measureMode ? 'Click two points on the 3D surface' : 'Measurement off');
  };

  const applyRenderMode = () => {
    if (!activeMesh || !activeCloud) return;

    activeMesh.visible = activeMode !== 'cloud';
    activeCloud.visible = activeMode === 'cloud';

    activeMesh.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        m.wireframe = activeMode === 'wireframe';
      });
    });

    if (activeMode === 'ortho') {
      camera.position.set(0.01, 7.6, 0.01);
      controls.target.set(0, 0.2, 0);
      controls.update();
    }
  };

  const resetCamera = () => {
    const cfg = MODELS[activeKey];
    camera.position.set(...cfg.camera);
    controls.target.set(0, 0.5, 0);
    controls.update();
  };

  const loadSelectedModel = async (key) => {
    activeKey = key;
    clearMeasure();
    setLoader(10, false);

    while (contentRoot.children.length) contentRoot.remove(contentRoot.children[0]);
    mixer = null;

    try {
      const gltf = await loadGLB(MODELS[key].file, (pct) => setLoader(pct, false));
      const { root, stats } = normalizeModel(gltf.scene, 5.2);
      activeMesh = root;
      activeCloud = buildVertexPointCloud(root, 32000);
      activeCloud.material.size = 0.036;

      contentRoot.add(activeMesh);
      contentRoot.add(activeCloud);

      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(root.children[0]);
        mixer.clipAction(gltf.animations[0]).play();
      }

      document.querySelector('#stat-verts').textContent = stats.vertices.toLocaleString();
      document.querySelector('#stat-tris').textContent = stats.triangles.toLocaleString();
      document.querySelector('#stat-meshes').textContent = String(stats.meshes);
      document.querySelector('#stat-source').textContent = MODELS[key].source;
      document.querySelector('#hud-model-title').textContent = MODELS[key].title;

      applyRenderMode();
      resetCamera();
      setLoader(100, true);
    } catch {
      setLoader(100, true);
      showStageFallback(stageFrame, `Unable to load ${MODELS[key].file}.`);
    }
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  canvas.addEventListener('click', (e) => {
    if (!measureMode || !activeMesh) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObject(activeMesh, true);
    if (!hits.length) return;
    const pt = hits[0].point.clone();

    if (measurePoints.length >= 2) clearMeasure();
    measurePoints.push(pt);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xea8b69 })
    );
    marker.position.copy(pt);
    measureGroup.add(marker);

    if (measurePoints.length === 2) {
      const dist = measurePoints[0].distanceTo(measurePoints[1]);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(measurePoints);
      const line = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({ color: 0xea8b69 })
      );
      measureGroup.add(line);
      updateMeasureUI(`Measured span: ${dist.toFixed(3)} normalized units`);
    } else {
      updateMeasureUI('Point A locked. Click Point B on the surface.');
    }
  });

  document.querySelectorAll('[data-model]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-model]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      loadSelectedModel(btn.dataset.model);
    });
  });

  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      activeMode = btn.dataset.mode;
      applyRenderMode();
    });
  });

  document.querySelector('#btn-stage-theme')?.addEventListener('click', (e) => {
    darkStage = !darkStage;
    stageFrame.classList.toggle('is-dark', darkStage);
    e.currentTarget.setAttribute('aria-pressed', String(!darkStage));
    e.currentTarget.textContent = darkStage ? 'Switch to Mineral Paper Stage' : 'Switch to Drafting Slate Stage';
  });

  document.querySelector('#btn-measure')?.addEventListener('click', (e) => {
    measureMode = !measureMode;
    e.currentTarget.setAttribute('aria-pressed', String(measureMode));
    e.currentTarget.textContent = measureMode ? 'Disable Surface Measure' : 'Enable Surface Measure';
    clearMeasure();
  });

  document.querySelector('#btn-reset-cam')?.addEventListener('click', resetCamera);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') resetCamera();
  });

  await loadSelectedModel('scan');

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (mixer && !reducedMotion) mixer.update(dt);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
  });
}

initViewer();

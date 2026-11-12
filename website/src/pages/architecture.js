import * as THREE from 'three';
import { initChrome, isWebGLAvailable, showWebGLFallback } from '../lib/ui.js';
import { addTacticalLights, createRenderer } from '../lib/terrain.js';

const { reduced, gsap } = initChrome();

function initCoordinateVisualizer() {
  const canvas = document.querySelector('#arch-canvas');
  if (!canvas) return;
  if (!isWebGLAvailable()) {
    showWebGLFallback(canvas);
    return;
  }

  const renderer = createRenderer(canvas, 1.6);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    80
  );
  camera.position.set(5.2, 4.4, 7.2);
  camera.lookAt(0, 0, 0);

  addTacticalLights(scene);

  // Origin axes
  const axes = new THREE.AxesHelper(3.4);
  scene.add(axes);

  const grid = new THREE.GridHelper(12, 24, 0xff4b0b, 0x1b2029);
  grid.position.y = -1.2;
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  scene.add(grid);

  // Outer datum wireframe sphere
  const datumSphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.8, 2),
    new THREE.MeshBasicMaterial({ color: 0x5cc4ff, wireframe: true, transparent: true, opacity: 0.16 })
  );
  scene.add(datumSphere);

  // Model bounding box cube representing reconstructed scene
  const modelBox = new THREE.Group();
  const coreGeo = new THREE.BoxGeometry(1.7, 0.9, 1.7);
  const coreMesh = new THREE.Mesh(
    coreGeo,
    new THREE.MeshStandardMaterial({
      color: 0x1c222e,
      metalness: 0.45,
      roughness: 0.48,
      transparent: true,
      opacity: 0.85,
    })
  );
  const coreWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(coreGeo),
    new THREE.LineBasicMaterial({ color: 0xff4b0b })
  );
  modelBox.add(coreMesh, coreWire);
  scene.add(modelBox);

  const stateBadge = document.querySelector('#coord-state-readout');
  const setCentered = (centered) => {
    document.querySelectorAll('[data-coord-mode]').forEach((b) =>
      b.classList.toggle('active', (b.dataset.coordMode === 'centered') === centered)
    );
    const tx = centered ? 0 : 2.3;
    const ty = centered ? 0 : 1.4;
    const tz = centered ? 0 : -1.8;
    if (!reduced) {
      gsap.to(modelBox.position, { x: tx, y: ty, z: tz, duration: 0.7, ease: 'expo.out' });
    } else {
      modelBox.position.set(tx, ty, tz);
    }
    if (stateBadge) {
      stateBadge.textContent = centered
        ? 'ORIGIN CENTERED (0, 0, 0) · ZERO FLOAT32 JITTER · UTM OFFSET PRESERVED IN HUD'
        : 'RAW UTM SPACE (E 314820, N 2108450) · LARGE-COORDINATE DEPTH PRECISION LOSS';
    }
  };

  document.querySelectorAll('[data-coord-mode]').forEach((b) =>
    b.addEventListener('click', () => setCentered(b.dataset.coordMode === 'centered'))
  );
  setCentered(true);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    if (!reduced) {
      datumSphere.rotation.y = t * 0.12;
      modelBox.rotation.y = t * 0.25;
    }
    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
  });
}

initCoordinateVisualizer();

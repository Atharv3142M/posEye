import * as THREE from 'three';
import { initSiteChrome, isWebGLAvailable, showWebGLFallback } from '../lib/core.js';
import { addTacticalLights, createRenderer } from '../lib/scene3d.js';

const { reduced } = initSiteChrome();

function initEngineCore3D() {
  const canvas = document.querySelector('#download-canvas');
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
    60
  );
  camera.position.set(0, 3.8, 6.8);
  camera.lookAt(0, 0, 0);

  addTacticalLights(scene);

  const core = new THREE.Group();
  scene.add(core);

  const octa = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.5, 1),
    new THREE.MeshStandardMaterial({
      color: 0x161a24,
      metalness: 0.6,
      roughness: 0.45,
      flatShading: true,
    })
  );
  const wire = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.54, 1),
    new THREE.MeshBasicMaterial({ color: 0xff4b0b, wireframe: true, transparent: true, opacity: 0.5 })
  );
  const ringA = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.02, 12, 72),
    new THREE.MeshBasicMaterial({ color: 0x5cc4ff, transparent: true, opacity: 0.55 })
  );
  ringA.rotation.x = Math.PI / 2.6;
  const ringB = new THREE.Mesh(
    new THREE.TorusGeometry(2.7, 0.015, 12, 72),
    new THREE.MeshBasicMaterial({ color: 0xff4b0b, transparent: true, opacity: 0.4 })
  );
  ringB.rotation.y = Math.PI / 3;

  core.add(octa, wire, ringA, ringB);

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
      core.rotation.y = t * 0.3;
      ringA.rotation.z = t * 0.45;
      ringB.rotation.x = -t * 0.32;
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

initEngineCore3D();

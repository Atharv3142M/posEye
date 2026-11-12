import * as THREE from 'three';
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

const { ScrollTrigger } = initChrome();

function setProgress(selector, pct, done = false) {
  const el = document.querySelector(selector);
  if (!el) return;
  const bar = el.querySelector('.stage-bar i');
  const text = el.querySelector('.loader-text');
  if (bar && Number.isFinite(pct)) bar.style.width = `${pct}%`;
  if (text && Number.isFinite(pct)) text.textContent = `Loading 3D models (${pct}%)`;
  if (done) el.classList.add('done');
}

function createScannerCone() {
  const geo = new THREE.ConeGeometry(0.95, 1.85, 4, 1, true);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, -0.92, 0);
  const edges = new THREE.EdgesGeometry(geo);
  return new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x9e3816, transparent: true, opacity: 0.45 })
  );
}

async function initHeroScene() {
  const canvas = document.querySelector('#world');
  if (!canvas) return;
  const frame = canvas.parentElement;

  if (!hasWebGL()) {
    setProgress('#hero-loader', 100, true);
    showStageFallback(frame, 'WebGL is unavailable in this browser. View pipeline architecture or download the desktop app.');
    return;
  }

  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(5.8, 3.8, 7.0);
  addStudioLighting(scene);

  const stageGroup = new THREE.Group();
  scene.add(stageGroup);

  // Subtle calibrated datum ring beneath the terrain model
  const datumRing = new THREE.Mesh(
    new THREE.RingGeometry(2.68, 2.71, 96),
    new THREE.MeshBasicMaterial({ color: 0x9e3816, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
  );
  datumRing.rotation.x = -Math.PI / 2;
  datumRing.position.y = 0.01;
  stageGroup.add(datumRing);

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

  let mixer = null;
  let dronePivot = null;
  let pointerX = 0;
  let pointerY = 0;
  frame.addEventListener('pointermove', (e) => {
    const r = frame.getBoundingClientRect();
    pointerX = (e.clientX - r.left) / r.width - 0.5;
    pointerY = (e.clientY - r.top) / r.height - 0.5;
  });

  try {
    const [cliffGltf, droneGltf] = await Promise.all([
      loadGLB('coastal-cliff.glb', (p) => setProgress('#hero-loader', Math.round(p * 0.65))),
      loadGLB('drone.glb', (p) => setProgress('#hero-loader', Math.round(65 + p * 0.35))),
    ]);

    const cliff = normalizeModel(cliffGltf.scene, 6.0);
    stageGroup.add(cliff.root);

    const drone = normalizeModel(droneGltf.scene, 1.35);
    dronePivot = new THREE.Group();
    dronePivot.position.set(0, 2.35, 0);
    drone.root.add(createScannerCone());
    dronePivot.add(drone.root);
    stageGroup.add(dronePivot);

    if (droneGltf.animations?.length) {
      mixer = new THREE.AnimationMixer(drone.root.children[0]);
      mixer.clipAction(droneGltf.animations[0]).play();
    }

    setProgress('#hero-loader', 100, true);
  } catch {
    setProgress('#hero-loader', 100, true);
    showStageFallback(frame, 'Could not load 3D scene assets. Ensure WebP and WebGL support are enabled.');
    return;
  }

  const clock = new THREE.Clock();
  let raf = 0;
  let active = true;

  const observer = new IntersectionObserver((entries) => {
    active = entries[0]?.isIntersecting ?? true;
  });
  observer.observe(frame);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!active) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (mixer && !reducedMotion) mixer.update(dt);
    if (dronePivot && !reducedMotion) {
      dronePivot.position.x = Math.cos(t * 0.52) * 1.45;
      dronePivot.position.z = Math.sin(t * 0.52) * 0.95;
      dronePivot.position.y = 2.15 + Math.sin(t * 1.4) * 0.08;
      dronePivot.rotation.y = -t * 0.52;
    }

    const targetRotY = pointerX * 0.32 + (reducedMotion ? 0 : Math.sin(t * 0.16) * 0.18);
    const targetRotX = pointerY * 0.1;
    stageGroup.rotation.y += (targetRotY - stageGroup.rotation.y) * 0.05;
    stageGroup.rotation.x += (targetRotX - stageGroup.rotation.x) * 0.05;

    camera.lookAt(0, 0.72, 0);
    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    ro.disconnect();
    renderer.dispose();
  });
}

async function initStoryScene() {
  const canvas = document.querySelector('#story-canvas');
  if (!canvas) return;
  const frame = canvas.parentElement;

  const storyEl = document.querySelector('.scroll-story');
  const chapters = [...document.querySelectorAll('.story-copy')];
  const stepBtns = [...document.querySelectorAll('.story-step-btn')];
  let progress = 0;

  const setActiveStep = (idx) => {
    chapters.forEach((c, i) => c.classList.toggle('active', i === idx));
    stepBtns.forEach((b, i) => {
      b.classList.toggle('active', i === idx);
      b.setAttribute('aria-pressed', String(i === idx));
    });
  };

  if (storyEl) {
    ScrollTrigger.create({
      trigger: storyEl,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        progress = self.progress;
        const step = Math.min(3, Math.floor(progress * 4));
        setActiveStep(step);
      },
    });
  }

  stepBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      if (!storyEl) return;
      const top = storyEl.offsetTop;
      const maxScroll = Math.max(storyEl.offsetHeight - window.innerHeight, 1);
      window.scrollTo({
        top: top + maxScroll * ((idx + 0.15) / 4),
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    });
  });

  if (!hasWebGL()) {
    setProgress('#story-loader', 100, true);
    showStageFallback(frame, 'Interactive 3D chapter view requires WebGL.');
    return;
  }

  const renderer = createRenderer(canvas, { maxPixelRatio: 1.5 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 4.6, 7.2);

  const hemi = new THREE.HemisphereLight(0xf3f6fa, 0x2c3440, 1.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1e0, 2.0);
  key.position.set(6, 10, 7);
  scene.add(key);

  const scanGroup = new THREE.Group();
  scene.add(scanGroup);

  let solidMeshGroup = null;
  let wireGroup = null;
  let cloudPoints = null;
  let droneGroup = null;
  let mixer = null;

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

  try {
    const [scanGltf, droneGltf, cliffGltf] = await Promise.all([
      loadGLB('poseye-scan.glb', (p) => setProgress('#story-loader', Math.round(p * 0.7))),
      loadGLB('drone.glb'),
      loadGLB('coastal-cliff.glb'),
    ]);

    const scan = normalizeModel(scanGltf.scene, 6.2);
    solidMeshGroup = scan.root;
    scanGroup.add(solidMeshGroup);

    // Clone lightweight wireframe overlay aligned over the real posEye scan
    wireGroup = solidMeshGroup.clone(true);
    wireGroup.traverse((c) => {
      if (!c.isMesh) return;
      c.material = new THREE.MeshBasicMaterial({
        color: 0xea8b69,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      });
    });
    wireGroup.position.y += 0.008;
    scanGroup.add(wireGroup);

    cloudPoints = buildVertexPointCloud(solidMeshGroup, 20000);
    cloudPoints.material.opacity = 0.0;
    cloudPoints.material.transparent = true;
    scanGroup.add(cloudPoints);

    const drone = normalizeModel(droneGltf.scene, 1.15);
    droneGroup = new THREE.Group();
    droneGroup.add(drone.root);
    droneGroup.add(createScannerCone());
    scene.add(droneGroup);

    if (droneGltf.animations?.length) {
      mixer = new THREE.AnimationMixer(drone.root.children[0]);
      mixer.clipAction(droneGltf.animations[0]).play();
    }

    setProgress('#story-loader', 100, true);
    renderOutputThumbnails(scanGltf.scene, cliffGltf.scene);
  } catch {
    setProgress('#story-loader', 100, true);
    showStageFallback(frame, '3D reconstruction model could not be loaded.');
    return;
  }

  const clock = new THREE.Clock();
  let raf = 0;
  let active = false;

  const observer = new IntersectionObserver((entries) => {
    active = entries[0]?.isIntersecting ?? true;
  });
  observer.observe(frame);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!active) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (mixer && !reducedMotion) mixer.update(dt);

    // Synchronize camera path and reconstruction visualization layers to scroll progress (0 -> 1)
    const angle = progress * Math.PI * 1.45 - 0.55;
    const radius = THREE.MathUtils.lerp(7.2, 4.1, progress);
    const height = THREE.MathUtils.lerp(4.4, 2.05, progress);
    camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    camera.lookAt(0, 0.35, 0);

    if (droneGroup) {
      const droneVisibility = 1 - THREE.MathUtils.smoothstep(progress, 0.45, 0.72);
      droneGroup.visible = droneVisibility > 0.02;
      droneGroup.position.set(
        Math.cos(progress * Math.PI * 2) * 1.8,
        2.05 - progress * 0.4,
        Math.sin(progress * Math.PI * 2) * 1.2
      );
      droneGroup.rotation.y = -progress * Math.PI * 2;
    }

    const preparePeak = Math.sin(THREE.MathUtils.clamp((progress - 0.12) / 0.52, 0, 1) * Math.PI);
    if (wireGroup) {
      wireGroup.traverse((c) => {
        if (c.isMesh) c.material.opacity = 0.06 + preparePeak * 0.42;
      });
    }
    if (cloudPoints) {
      cloudPoints.material.opacity = preparePeak * 0.85;
    }

    renderer.render(scene, camera);
  };
  tick();

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    ro.disconnect();
    renderer.dispose();
  });
}

function renderOutputThumbnails(scanScene, cliffScene) {
  const targets = [
    { id: '#thumb-mesh', mode: 'mesh' },
    { id: '#thumb-cloud', mode: 'cloud' },
    { id: '#thumb-ortho', mode: 'ortho' },
  ];
  const canvases = targets.map((t) => ({ ...t, el: document.querySelector(t.id) })).filter((t) => t.el);
  if (!canvases.length || !hasWebGL()) return;

  const width = 640;
  const height = 420;
  const offRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  offRenderer.setSize(width, height, false);
  offRenderer.outputColorSpace = THREE.SRGBColorSpace;
  offRenderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x161b22);
  addStudioLighting(scene);

  const scan = normalizeModel(scanScene, 5.6);
  const cliff = normalizeModel(cliffScene, 5.8);
  const cloud = buildVertexPointCloud(cliff.root, 26000);
  cloud.material.size = 0.055;

  for (const item of canvases) {
    scene.remove(scan.root, cloud);
    const cam = new THREE.PerspectiveCamera(38, width / height, 0.1, 60);

    if (item.mode === 'mesh') {
      scene.add(scan.root);
      cam.position.set(3.8, 2.5, 4.1);
      cam.lookAt(0, 0.25, 0);
    } else if (item.mode === 'cloud') {
      scene.add(cloud);
      cam.position.set(4.1, 2.3, 4.2);
      cam.lookAt(0, 0.55, 0);
    } else {
      scene.add(scan.root);
      cam.position.set(0.01, 6.3, 0.01);
      cam.lookAt(0, 0, 0);
    }

    offRenderer.render(scene, cam);
    item.el.width = width;
    item.el.height = height;
    const ctx = item.el.getContext('2d');
    if (ctx) ctx.drawImage(offRenderer.domElement, 0, 0);
  }

  offRenderer.dispose();
}

initHeroScene();
initStoryScene();
